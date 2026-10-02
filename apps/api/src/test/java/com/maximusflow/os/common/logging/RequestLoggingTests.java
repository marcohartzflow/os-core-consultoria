package com.maximusflow.os.common.logging;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorityAuthorizationDecision;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.security.authorization.ExpressionAuthorizationDecision;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.assertj.core.api.Assertions.assertThat;

/** Request id and client IP in every log line of a request; what a denial is logged with. */
class RequestLoggingTests {

	@Test
	void theRequestIdAndClientIpAreInTheMdcOnlyWhileTheRequestRuns() throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/tasks");
		request.setRemoteAddr("203.0.113.7");
		// A client-chosen id is ignored: it could forge another request's log lines.
		request.addHeader(RequestLoggingContextFilter.HEADER, "forged\r\nid");
		MockHttpServletResponse response = new MockHttpServletResponse();
		Map<String, String> seen = new HashMap<>();
		MockFilterChain chain = new MockFilterChain() {
			@Override
			public void doFilter(jakarta.servlet.ServletRequest req, jakarta.servlet.ServletResponse res) {
				seen.putAll(MDC.getCopyOfContextMap());
			}
		};

		new RequestLoggingContextFilter().doFilter(request, response, chain);

		String id = response.getHeader(RequestLoggingContextFilter.HEADER);
		assertThat(id).isNotBlank().isNotEqualTo("forged\r\nid").matches("[0-9a-f-]{36}");
		assertThat(seen).containsEntry(RequestLoggingContextFilter.MDC_REQUEST_ID, id)
			.containsEntry(RequestLoggingContextFilter.MDC_CLIENT_IP, "203.0.113.7");
		assertThat(RequestLoggingContextFilter.requestId(request)).isEqualTo(id);
		assertThat(MDC.get(RequestLoggingContextFilter.MDC_REQUEST_ID)).isNull();
		assertThat(MDC.get(RequestLoggingContextFilter.MDC_CLIENT_IP)).isNull();
	}

	@Test
	void aDenialIsLoggedWithTheRuleThatRefusedIt() {
		var expression = new SpelExpressionParser().parseExpression("hasAuthority('tasks.task.delete')");
		assertThat(Denials.rule(new AuthorizationDeniedException("Access Denied",
				new ExpressionAuthorizationDecision(false, expression))))
			.isEqualTo("hasAuthority('tasks.task.delete')");
		assertThat(Denials.rule(new AuthorizationDeniedException("Access Denied",
				new AuthorityAuthorizationDecision(false, List.of(new SimpleGrantedAuthority("audit.event.read"))))))
			.isEqualTo("anyOf[audit.event.read]");
		assertThat(Denials.rule(new AccessDeniedException("Assigning roles is reserved\nto the administrator")))
			.isEqualTo("Assigning roles is reserved_to the administrator");
	}

}
