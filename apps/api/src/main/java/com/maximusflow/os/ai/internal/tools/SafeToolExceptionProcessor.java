package com.maximusflow.os.ai.internal.tools;

import org.springframework.ai.tool.execution.ToolExecutionException;
import org.springframework.ai.tool.execution.ToolExecutionExceptionProcessor;

/**
 * Decides what the model reads when a tool call fails. Spring AI's default
 * ({@code DefaultToolExecutionExceptionProcessor}) returns the exception message as the tool result,
 * which for an unexpected failure can carry SQL, constraint names or driver text into the model's
 * context and from there into its answer (OWASP LLM02). This one returns only
 * {@link ToolFailures#shownReason}: the message of a domain refusal, "sem permissão" for an
 * authorization failure, "erro interno" for anything else. The full failure is already in the security
 * log and the trail ({@link AuditedToolCallback}).
 *
 * <p>Registered as a bean in {@code AiConfig}; {@code ToolCallingAutoConfiguration} declares its own
 * processor {@code @ConditionalOnMissingBean} and feeds whichever exists to the
 * {@code ToolCallingManager}. An {@link Error} is not a tool outcome and still ends the turn.
 */
public final class SafeToolExceptionProcessor implements ToolExecutionExceptionProcessor {

	@Override
	public String process(ToolExecutionException exception) {
		if (exception.getCause() instanceof Error error) {
			throw error;
		}
		return ToolFailures.shownReason(ToolFailures.unwrap(exception));
	}

}
