package com.maximusflow.os.ai.internal.tools;

import com.maximusflow.os.common.error.ConflictException;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.InvalidRequestException;
import com.maximusflow.os.common.error.NotFoundException;

import org.springframework.ai.tool.execution.ToolExecutionException;
import org.springframework.security.access.AccessDeniedException;

/**
 * How a failed tool call is classified and described. Spring AI's {@code MethodToolCallback} wraps
 * whatever the use case throws in a {@link ToolExecutionException}; the audit trail, the security log,
 * the person and the model all need the original exception, so it is unwrapped first.
 */
public final class ToolFailures {

	/** Shown when the failure is not a refusal written for people. Never internals (ASVS 16.5.1). */
	public static final String GENERIC = "erro interno";

	public static final String DENIED = "sem permissão";

	private ToolFailures() {
	}

	/** The use case's own exception, or {@code ex} itself when it was not wrapped by Spring AI. */
	public static RuntimeException unwrap(RuntimeException ex) {
		if (ex instanceof ToolExecutionException wrapped && wrapped.getCause() instanceof RuntimeException cause) {
			return cause;
		}
		return ex;
	}

	/**
	 * Text safe to show to the person and to hand back to the model (OWASP ASVS 5.0 16.5.1, OWASP LLM02
	 * sensitive information disclosure). Domain refusals are written for people and pass as they are;
	 * anything else (SQL, constraint names, driver or library messages) becomes a generic text, and the
	 * class name stays in the security log and the trail.
	 */
	public static String shownReason(Throwable ex) {
		if (ex instanceof AccessDeniedException) {
			return DENIED;
		}
		if ((ex instanceof DomainRuleException || ex instanceof NotFoundException || ex instanceof ConflictException
				|| ex instanceof InvalidRequestException) && ex.getMessage() != null) {
			return ex.getMessage();
		}
		return GENERIC;
	}

}
