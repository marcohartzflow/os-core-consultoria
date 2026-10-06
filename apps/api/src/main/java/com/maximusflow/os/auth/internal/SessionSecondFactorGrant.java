package com.maximusflow.os.auth.internal;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

import com.maximusflow.os.common.security.SecondFactor;
import com.maximusflow.os.common.security.SecondFactorGrant;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.FactorGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;
import org.springframework.util.Assert;

/**
 * Adds a second factor to the session's authentication, the way Spring Security's multi-factor
 * filters do: the existing authentication keeps its authorities and gains a
 * {@link FactorGrantedAuthority} stamped with the time it was issued (which step-up rules read).
 * The login is complete from here, so the session strategy that belongs to a completed login runs
 * now: new session id, new CSRF token and the concurrent-session limit.
 */
@Component
class SessionSecondFactorGrant implements SecondFactorGrant {

	private final SecurityContextHolderStrategy holder = SecurityContextHolder.getContextHolderStrategy();

	private final SecurityContextRepository repository;

	private final SessionAuthenticationStrategy completedLogin;

	private final Clock clock;

	SessionSecondFactorGrant(SecurityContextRepository repository,
			@Qualifier("completedLoginStrategy") SessionAuthenticationStrategy completedLogin, Clock clock) {
		this.repository = repository;
		this.completedLogin = completedLogin;
		this.clock = clock;
	}

	@Override
	public void grant(String factorAuthority, HttpServletRequest request, HttpServletResponse response) {
		Assert.isTrue(SecondFactor.AUTHORITIES.contains(factorAuthority), "Not a second factor: " + factorAuthority);
		Authentication current = this.holder.getContext().getAuthentication();
		Assert.state(current != null && current.isAuthenticated(), "A second factor needs a first one");
		List<GrantedAuthority> authorities = new ArrayList<>(current.getAuthorities().stream()
			.filter((authority) -> !factorAuthority.equals(authority.getAuthority()))
			.toList());
		authorities.add(FactorGrantedAuthority.withAuthority(factorAuthority).issuedAt(this.clock.instant()).build());
		Authentication completed = UsernamePasswordAuthenticationToken.authenticated(current.getPrincipal(), null,
				authorities);
		this.completedLogin.onAuthentication(completed, request, response);
		SecurityContext context = this.holder.createEmptyContext();
		context.setAuthentication(completed);
		this.holder.setContext(context);
		this.repository.saveContext(context, request, response);
	}

}
