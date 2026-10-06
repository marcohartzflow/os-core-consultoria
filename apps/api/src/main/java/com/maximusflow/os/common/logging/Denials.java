package com.maximusflow.os.common.logging;

import java.util.stream.Collectors;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorityAuthorizationDecision;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.authorization.ExpressionAuthorizationDecision;
import org.springframework.security.core.GrantedAuthority;

/**
 * What a denied access was checked against, for the security log (OWASP ASVS 5.0 16.3.2: log failed
 * authorization with enough to investigate it). Method security ({@code @RequiresPermission}, a
 * {@code @PreAuthorize} template) throws {@link AuthorizationDeniedException} carrying the decision;
 * its expression names the permission, e.g. {@code hasAuthority('tasks.task.delete')}. A plain
 * {@link AccessDeniedException} thrown by our own code (reserved actions, grant guard) carries a
 * message written by a developer, never user input. The result is sanitized either way.
 */
public final class Denials {

	private Denials() {
	}

	public static String rule(AccessDeniedException ex) {
		if (ex instanceof AuthorizationDeniedException denied) {
			AuthorizationResult result = denied.getAuthorizationResult();
			if (result instanceof ExpressionAuthorizationDecision expression) {
				return Sanitize.forLog(expression.getExpression().getExpressionString());
			}
			if (result instanceof AuthorityAuthorizationDecision authority) {
				return Sanitize.forLog(authority.getAuthorities().stream().map(GrantedAuthority::getAuthority)
					.collect(Collectors.joining(",", "anyOf[", "]")));
			}
			return Sanitize.forLog(String.valueOf(result));
		}
		return Sanitize.forLog(ex.getMessage());
	}

}
