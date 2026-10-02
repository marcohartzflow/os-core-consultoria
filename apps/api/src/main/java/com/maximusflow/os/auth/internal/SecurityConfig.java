package com.maximusflow.os.auth.internal;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;

import tools.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;

import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.common.security.SecondFactor;
import com.maximusflow.os.iam.UserDirectory;

import org.jspecify.annotations.Nullable;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.security.authorization.AllRequiredFactorsAuthorizationManager;
import org.springframework.security.authorization.AuthenticatedAuthorizationManager;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthorizationManagerFactory;
import org.springframework.security.authorization.AuthorizationManagers;
import org.springframework.security.authorization.DefaultAuthorizationManagerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AccountStatusUserDetailsChecker;
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
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfTokenRepository;
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
 * <li>CSRF with the SPA recipe: cookie {@code __Host-XSRF-TOKEN} ({@code XSRF-TOKEN} over plain HTTP),
 * header {@code X-XSRF-TOKEN}.</li>
 * <li>Session fixation protection, concurrent session limit, absolute lifetime.</li>
 * <li>Argon2id password hashing behind a {@link DelegatingPasswordEncoder} so the algorithm can be
 * rotated without a data migration.</li>
 * <li>401/403 as RFC 9457 problem details, never redirects.</li>
 * </ul>
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
class SecurityConfig {

	/**
	 * Cookie names. Over HTTPS they carry the {@code __Host-} prefix (OWASP ASVS 5.0 3.3.1, 3.3.3): the
	 * browser then accepts them only with Secure, Path=/ and no Domain, so no sibling subdomain can
	 * set or overwrite them. Plain-HTTP development cannot use the prefix and keeps the bare names.
	 */
	static String sessionCookie(boolean secure) {
		return secure ? "__Host-OS_SESSION" : "OS_SESSION";
	}

	static String csrfCookie(boolean secure) {
		return secure ? "__Host-XSRF-TOKEN" : "XSRF-TOKEN";
	}

	/** How recent the second factor must be for actions that take security away from someone. */
	static final Duration STEP_UP_WINDOW = Duration.ofMinutes(15);

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityContextRepository securityContextRepository,
			SessionAuthenticationStrategy sessionAuthenticationStrategy, SessionRegistry sessionRegistry,
			AuthProperties properties, Clock clock, CsrfTokenRepository csrfTokenRepository,
			AuthorizationManager<Object> secondFactor,
			@Qualifier("handlerExceptionResolver") HandlerExceptionResolver exceptionResolver, ObjectMapper json)
			throws Exception {
		var problemHandlers = new ProblemDetailSecurityHandlers(exceptionResolver, json);
		AuthorizationManager<RequestAuthorizationContext> signedIn = AuthenticatedAuthorizationManager.authenticated();
		AuthorizationManager<RequestAuthorizationContext> enrolment = (authentication, request) -> {
			Authentication current = authentication.get();
			boolean enrolled = current != null && current.getPrincipal() instanceof OsPrincipal principal
					&& principal.isMfaEnabled();
			return enrolled ? secondFactor.authorize(authentication, request) : signedIn.authorize(authentication, request);
		};
		AuthorizationManager<RequestAuthorizationContext> recentSecondFactor = AuthorizationManagers.allOf(signedIn,
				secondFactor(clock, STEP_UP_WINDOW));
		// OWASP ASVS 5.0 7.5.1 and 7.5.2: changing how the account authenticates or ending sessions
		// needs full re-authentication. With a second factor: the password typed in the request plus a
		// factor passed in the last minutes (step-up). Before the first factor exists, the password.
		AuthorizationManager<RequestAuthorizationContext> reauthenticated = (authentication, request) -> {
			Authentication current = authentication.get();
			boolean enrolled = current != null && current.getPrincipal() instanceof OsPrincipal principal
					&& principal.isMfaEnabled();
			return enrolled ? recentSecondFactor.authorize(authentication, request)
					: signedIn.authorize(authentication, request);
		};
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
			.addFilterAfter(new PasswordChangeGateFilter(json), AuthorizationFilter.class)
			.csrf((csrf) -> csrf.spa().csrfTokenRepository(csrfTokenRepository))
			.authorizeHttpRequests((authorize) -> authorize
				.requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/iam/invitations/accept").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/iam/password-reset/request").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/iam/password-reset/confirm").permitAll()
				.requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
				// Between the password and the second factor only the second step and the profile are
				// reachable (and logout, which runs before authorization). These rules come from
				// AuthenticatedAuthorizationManager directly, not from the factory, which would add the
				// second-factor requirement they exist to lift.
				.requestMatchers(HttpMethod.POST, "/api/auth/mfa", "/api/auth/mfa/passkey/options", "/api/auth/mfa/passkey")
				.access(signedIn)
				// The profile and the factors the account has (which the second step offers).
				.requestMatchers(HttpMethod.GET, "/api/me", "/api/me/mfa").access(signedIn)
				// Enrolment, and the password change it may come with, before the second factor only
				// while the account has none; once it has one, they need a recent one.
				.requestMatchers(HttpMethod.GET, "/api/me/passkeys").access(enrolment)
				.requestMatchers(HttpMethod.POST, "/api/me/mfa/setup", "/api/me/mfa/confirm", "/api/me/passkeys/options",
						"/api/me/passkeys", "/api/me/password")
				.access(reauthenticated)
				.requestMatchers(HttpMethod.POST, "/api/me/mfa/disable", "/api/me/mfa/recovery-codes")
				.access(reauthenticated)
				// Where the security notices go: redirecting them is a change to account recovery.
				.requestMatchers(HttpMethod.PUT, "/api/me/notification-email").access(reauthenticated)
				.requestMatchers(HttpMethod.DELETE, "/api/me/passkeys/*", "/api/me/sessions", "/api/me/sessions/*")
				.access(reauthenticated)
				// Step-up: taking someone's second factor away needs one passed in the last minutes.
				.requestMatchers(HttpMethod.POST, "/api/iam/users/*/mfa/reset").access(recentSecondFactor)
				// Everything else, OpenAPI docs included (the API surface is not public information):
				// authenticated, plus the second factor through the AuthorizationManagerFactory below.
				.anyRequest().authenticated())
			.exceptionHandling((exceptions) -> exceptions
				.authenticationEntryPoint(problemHandlers)
				.accessDeniedHandler(problemHandlers))
			.logout((logout) -> logout
				.logoutUrl("/api/auth/logout")
				.logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT))
				.deleteCookies(sessionCookie(properties.session().cookieSecure()))
				// Storage too: what the portal keeps in the browser (assistant preferences) must not be
				// left for the next person on a shared computer (OWASP HTML5 Security Cheat Sheet).
				.addLogoutHandler(new HeaderWriterLogoutHandler(
						new ClearSiteDataHeaderWriter(Directive.CACHE, Directive.COOKIES, Directive.STORAGE))))
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
		serializer.setCookieName(sessionCookie(properties.session().cookieSecure()));
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

	/**
	 * Runs at the password step. The concurrent-session limit belongs to a completed login, so it runs
	 * here only for accounts without a second factor; for the others {@link #completedLoginStrategy}
	 * applies it once the factor is passed. Someone who knows only the password cannot end the
	 * person's verified sessions.
	 */
	@Bean
	@Primary
	SessionAuthenticationStrategy sessionAuthenticationStrategy(SessionRegistry sessionRegistry,
			ConcurrentSessionControlAuthenticationStrategy concurrency, CsrfTokenRepository csrfTokenRepository) {
		SessionAuthenticationStrategy limitWhenComplete = (authentication, request, response) -> {
			if (!SecondFactor.required(authentication)) {
				concurrency.onAuthentication(authentication, request, response);
			}
		};
		// The CSRF token is replaced at login too: one planted before it (a cookie set from a sibling
		// subdomain) must not keep working for the authenticated session.
		return new CompositeSessionAuthenticationStrategy(List.of(limitWhenComplete,
				new ChangeSessionIdAuthenticationStrategy(), new CsrfAuthenticationStrategy(csrfTokenRepository),
				new RegisterSessionAuthenticationStrategy(sessionRegistry)));
	}

	/**
	 * Runs when the second factor is passed (the session gains privilege, as Spring Security's own
	 * multi-factor filters treat every factor): the concurrent-session limit, a new session id and a
	 * new CSRF token.
	 */
	@Bean
	SessionAuthenticationStrategy completedLoginStrategy(ConcurrentSessionControlAuthenticationStrategy concurrency,
			CsrfTokenRepository csrfTokenRepository) {
		return new CompositeSessionAuthenticationStrategy(List.of(concurrency,
				new ChangeSessionIdAuthenticationStrategy(), new CsrfAuthenticationStrategy(csrfTokenRepository)));
	}

	/** Counts only sessions whose login is complete ({@link CompleteLoginSessionRegistry}). */
	@Bean
	@SuppressWarnings({ "unchecked", "rawtypes" })
	ConcurrentSessionControlAuthenticationStrategy concurrentSessionControl(SessionRegistry sessionRegistry,
			FindByIndexNameSessionRepository<? extends Session> sessions, AuthProperties properties, Clock clock) {
		var concurrency = new ConcurrentSessionControlAuthenticationStrategy(new CompleteLoginSessionRegistry(
				sessionRegistry, sessions, properties.session().absoluteTimeout(), clock));
		concurrency.setMaximumSessions(properties.session().maxConcurrent());
		concurrency.setExceptionIfMaximumExceeded(false);
		return concurrency;
	}

	/**
	 * Spring Security multi-factor authentication: every rule built by the factory (every
	 * {@code authenticated()} above) also requires a second factor when the account needs one
	 * ({@link SecondFactor#required}): password and TOTP, or password and passkey.
	 */
	@Bean
	AuthorizationManagerFactory<Object> authorizationManagerFactory(AuthorizationManager<Object> secondFactor) {
		var factory = new DefaultAuthorizationManagerFactory<Object>();
		factory.setAdditionalAuthorization((authentication, object) -> SecondFactor.required(authentication.get())
				? secondFactor.authorize(authentication, object) : new AuthorizationDecision(true));
		return factory;
	}

	@Bean
	AuthorizationManager<Object> secondFactor(Clock clock) {
		return secondFactor(clock, null);
	}

	/** Password plus any second factor, the second one issued within {@code validFor} when given. */
	private static <T> AuthorizationManager<T> secondFactor(Clock clock, @Nullable Duration validFor) {
		List<AllRequiredFactorsAuthorizationManager<T>> options = new ArrayList<>();
		for (String factor : SecondFactor.AUTHORITIES) {
			AllRequiredFactorsAuthorizationManager<T> option = AllRequiredFactorsAuthorizationManager.<T>builder()
				.requireFactor((required) -> required.passwordAuthority())
				.requireFactor((required) -> {
					required.authority(factor);
					if (validFor != null) {
						required.validDuration(validFor);
					}
				})
				.build();
			option.setClock(clock);
			options.add(option);
		}
		return AllRequiredFactorsAuthorizationManager.anyOf(options.toArray(AllRequiredFactorsAuthorizationManager[]::new));
	}

	/** The cookie repository {@code csrf.spa()} uses, shared with the login's session strategy. */
	@Bean
	CsrfTokenRepository csrfTokenRepository(AuthProperties properties) {
		boolean secure = properties.session().cookieSecure();
		CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
		repository.setCookieName(csrfCookie(secure));
		repository.setCookiePath("/");
		repository.setCookieCustomizer((cookie) -> cookie.secure(secure).sameSite("Lax"));
		return repository;
	}

	@Bean
	AuthenticationManager authenticationManager(OsUserDetailsService userDetailsService,
			PasswordEncoder passwordEncoder, ApplicationEventPublisher eventPublisher) {
		var provider = new DaoAuthenticationProvider(userDetailsService);
		provider.setPasswordEncoder(passwordEncoder);
		provider.setUserDetailsPasswordService(userDetailsService);
		// Account state (locked, disabled, invited) is checked after the password, not before: the
		// default order answers those accounts without hashing, and the shorter response time would
		// tell an attacker the account exists. Every attempt now pays the same Argon2 cost.
		provider.setPreAuthenticationChecks((user) -> {
		});
		provider.setPostAuthenticationChecks(new AccountStatusUserDetailsChecker());
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
