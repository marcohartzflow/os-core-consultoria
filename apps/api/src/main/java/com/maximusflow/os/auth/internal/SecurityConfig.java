package com.maximusflow.os.auth.internal;

import java.time.Clock;

import tools.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;

import com.maximusflow.os.iam.UserDirectory;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.DefaultAuthenticationEventPublisher;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.web.authentication.logout.HeaderWriterLogoutHandler;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.ConcurrentSessionControlAuthenticationStrategy;
import org.springframework.security.web.authentication.session.RegisterSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.session.ConcurrentSessionFilter;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.header.writers.ClearSiteDataHeaderWriter;
import org.springframework.security.web.header.writers.ClearSiteDataHeaderWriter.Directive;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.session.security.SpringSessionBackedSessionRegistry;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * Session-based security for a single-page application on the same origin.
 *
 * <ul>
 * <li>Deny by default: only login, invitation acceptance, password reset and health are public.</li>
 * <li>CSRF with the SPA recipe: cookie {@code XSRF-TOKEN}, header {@code X-XSRF-TOKEN}.</li>
 * <li>Session fixation protection, concurrent session limit, absolute lifetime.</li>
 * <li>Argon2id password hashing behind a {@link DelegatingPasswordEncoder} so the algorithm can be
 * rotated without a data migration.</li>
 * <li>401/403 as RFC 9457 problem details, never redirects.</li>
 * </ul>
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
class SecurityConfig {

	static final String SESSION_COOKIE = "OS_SESSION";

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityContextRepository securityContextRepository,
			SessionAuthenticationStrategy sessionAuthenticationStrategy, SessionRegistry sessionRegistry,
			AuthProperties properties, Clock clock,
			@Qualifier("handlerExceptionResolver") HandlerExceptionResolver exceptionResolver, ObjectMapper json)
			throws Exception {
		var problemHandlers = new ProblemDetailSecurityHandlers(exceptionResolver);
		http
			.securityContext((context) -> context.securityContextRepository(securityContextRepository))
			.sessionManagement((session) -> session.sessionAuthenticationStrategy(sessionAuthenticationStrategy))
			.addFilterBefore(new RateLimitFilter(properties.rateLimit(), clock, exceptionResolver),
					SecurityContextHolderFilter.class)
			.addFilterBefore(new AbsoluteSessionTimeoutFilter(properties.session().absoluteTimeout(), clock),
					SecurityContextHolderFilter.class)
			// The concurrency strategy only marks the oldest session as expired; this filter is what
			// refuses it on its next request (401, same as any other lost session).
			.addFilter(new ConcurrentSessionFilter(sessionRegistry, (event) -> problemHandlers.commence(
					event.getRequest(), event.getResponse(),
					new InsufficientAuthenticationException("Session ended by a newer login"))))
			.addFilterAfter(new MfaGateFilter(json), AuthorizationFilter.class)
			.addFilterAfter(new PasswordChangeGateFilter(json), MfaGateFilter.class)
			.csrf((csrf) -> csrf.spa())
			.authorizeHttpRequests((authorize) -> authorize
				.requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/iam/invitations/accept").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/iam/password-reset/request").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/iam/password-reset/confirm").permitAll()
				.requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
				// OpenAPI docs (when enabled) require a session: the API surface is not public information.
				.anyRequest().authenticated())
			.exceptionHandling((exceptions) -> exceptions
				.authenticationEntryPoint(problemHandlers)
				.accessDeniedHandler(problemHandlers))
			.logout((logout) -> logout
				.logoutUrl("/api/auth/logout")
				.logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT))
				.deleteCookies(SESSION_COOKIE)
				.addLogoutHandler(new HeaderWriterLogoutHandler(
						new ClearSiteDataHeaderWriter(Directive.CACHE, Directive.COOKIES))))
			.headers((headers) -> headers
				.contentSecurityPolicy((csp) -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'"))
				.referrerPolicy((referrer) -> referrer.policy(ReferrerPolicy.SAME_ORIGIN))
				.permissionsPolicyHeader((permissions) -> permissions
					.policy("camera=(), microphone=(), geolocation=(), payment=()"))
				.httpStrictTransportSecurity((hsts) -> hsts.includeSubDomains(true).maxAgeInSeconds(31_536_000)));
		return http.build();
	}

	/**
	 * Session cookie attributes, declared explicitly rather than through
	 * {@code server.servlet.session.cookie.*}: those are only applied by Spring Boot when an embedded
	 * server is running, and cookie flags must not depend on the runtime.
	 */
	@Bean
	CookieSerializer cookieSerializer(AuthProperties properties) {
		var serializer = new DefaultCookieSerializer();
		serializer.setCookieName(SESSION_COOKIE);
		serializer.setCookiePath("/");
		serializer.setUseHttpOnlyCookie(true);
		serializer.setUseSecureCookie(properties.session().cookieSecure());
		serializer.setSameSite("Lax");
		return serializer;
	}

	@Bean
	SecurityContextRepository securityContextRepository(UserDirectory userDirectory,
			OsUserDetailsService userDetailsService) {
		return new RefreshingSecurityContextRepository(userDirectory, userDetailsService);
	}

	@Bean
	@SuppressWarnings({ "unchecked", "rawtypes" })
	SessionRegistry sessionRegistry(FindByIndexNameSessionRepository<? extends Session> sessions) {
		return new SpringSessionBackedSessionRegistry((FindByIndexNameSessionRepository) sessions);
	}

	@Bean
	SessionAuthenticationStrategy sessionAuthenticationStrategy(SessionRegistry sessionRegistry,
			AuthProperties properties) {
		var concurrency = new ConcurrentSessionControlAuthenticationStrategy(sessionRegistry);
		concurrency.setMaximumSessions(properties.session().maxConcurrent());
		concurrency.setExceptionIfMaximumExceeded(false);
		return new CompositeSessionAuthenticationStrategy(List.of(concurrency,
				new ChangeSessionIdAuthenticationStrategy(), new RegisterSessionAuthenticationStrategy(sessionRegistry)));
	}

	@Bean
	AuthenticationManager authenticationManager(OsUserDetailsService userDetailsService,
			PasswordEncoder passwordEncoder, ApplicationEventPublisher eventPublisher) {
		var provider = new DaoAuthenticationProvider(userDetailsService);
		provider.setPasswordEncoder(passwordEncoder);
		provider.setUserDetailsPasswordService(userDetailsService);
		var manager = new ProviderManager(provider);
		manager.setAuthenticationEventPublisher(new DefaultAuthenticationEventPublisher(eventPublisher));
		return manager;
	}

	/**
	 * Argon2id with parameters at or above the OWASP minimum (19 MiB, 2 iterations, parallelism 1).
	 * bcrypt stays registered so hashes imported from a legacy system can still be verified; they are
	 * replaced by Argon2id at the next successful login ({@link OsUserDetailsService#updatePassword}).
	 */
	@Bean
	PasswordEncoder passwordEncoder() {
		var argon2 = new Argon2PasswordEncoder(16, 32, 1, 19_456, 2);
		return new DelegatingPasswordEncoder("argon2", Map.of("argon2", argon2, "bcrypt", new BCryptPasswordEncoder()));
	}

}
