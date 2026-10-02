package com.maximusflow.os.auth.internal;

import java.util.ArrayList;
import java.util.List;

import java.util.function.Supplier;

import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.UserDirectory;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.FactorGrantedAuthority;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.DeferredSecurityContext;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpRequestResponseHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.util.function.SingletonSupplier;

/**
 * Loads the {@link SecurityContext} from the session and refreshes the principal from the IAM module
 * on every request. Permission changes take effect on the next request, a disabled account is
 * treated as unauthenticated immediately, and the session never holds stale authorities.
 */
class RefreshingSecurityContextRepository implements SecurityContextRepository {

	private final HttpSessionSecurityContextRepository delegate = new HttpSessionSecurityContextRepository();

	private final UserDirectory userDirectory;

	private final OsUserDetailsService userDetailsService;

	RefreshingSecurityContextRepository(UserDirectory userDirectory, OsUserDetailsService userDetailsService) {
		this.userDirectory = userDirectory;
		this.userDetailsService = userDetailsService;
	}

	@Override
	public DeferredSecurityContext loadDeferredContext(HttpServletRequest request) {
		DeferredSecurityContext deferred = this.delegate.loadDeferredContext(request);
		// Once per request: the refresh reads the account from the database.
		Supplier<SecurityContext> refreshed = SingletonSupplier.of(() -> refresh(deferred.get()));
		return new DeferredSecurityContext() {
			@Override
			public SecurityContext get() {
				return refreshed.get();
			}

			@Override
			public boolean isGenerated() {
				return deferred.isGenerated();
			}
		};
	}

	@Override
	@SuppressWarnings("deprecation")
	public SecurityContext loadContext(HttpRequestResponseHolder requestResponseHolder) {
		return refresh(this.delegate.loadContext(requestResponseHolder));
	}

	@Override
	public void saveContext(SecurityContext context, HttpServletRequest request, HttpServletResponse response) {
		this.delegate.saveContext(context, request, response);
	}

	@Override
	public boolean containsContext(HttpServletRequest request) {
		return this.delegate.containsContext(request);
	}

	private SecurityContext refresh(SecurityContext context) {
		Authentication authentication = context.getAuthentication();
		if (authentication == null || !(authentication.getPrincipal() instanceof OsPrincipal stale)) {
			return context;
		}
		return this.userDirectory.findById(stale.getId())
			.filter((account) -> account.status() == AccountStatus.ACTIVE)
			.map(this.userDetailsService::principalOf)
			// Not enabled: no password any more (an administrator reset the second factor, which revokes
			// it). The session ends at once instead of when the asynchronous listener deletes it (OWASP
			// ASVS 5.0 7.4.1, 7.4.3). Invited accounts never have a session to get here.
			.filter(OsPrincipal::isEnabled)
			.map((fresh) -> {
				fresh.eraseCredentials();
				// Permissions come fresh from the account; the factors passed in this session (Spring
				// Security FactorGrantedAuthority, with the time each was issued) are kept as they are.
				List<GrantedAuthority> authorities = new ArrayList<>(fresh.getAuthorities());
				authentication.getAuthorities().stream()
					.filter(FactorGrantedAuthority.class::isInstance)
					.forEach(authorities::add);
				SecurityContext refreshed = SecurityContextHolder.createEmptyContext();
				refreshed.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(fresh, null, authorities));
				return refreshed;
			})
			.orElseGet(SecurityContextHolder::createEmptyContext);
	}

}
