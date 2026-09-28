package com.maximusflow.os.common.security;

import java.util.Optional;

import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/** Access to the user of the current request (or of the current AI tool execution). */
@Component
public class CurrentUser {

	public Optional<OsPrincipal> get() {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication != null && authentication.getPrincipal() instanceof OsPrincipal principal) {
			return Optional.of(principal);
		}
		return Optional.empty();
	}

	public OsPrincipal require() {
		return get().orElseThrow(() -> new AuthenticationCredentialsNotFoundException("Usuário não autenticado"));
	}

}
