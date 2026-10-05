package com.maximusflow.os.common.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a use case that changes state (create, update, complete, delete, disable, send). When exposed
 * as an AI tool, the agent cannot execute it directly: the call is parked as a pending action and only
 * runs after the person confirms it in the portal (OWASP LLM06, human approval of actions).
 *
 * <p>Every {@code @Tool} method declares either this or {@link ReadOnlyTool}; the tool registry refuses
 * to start otherwise.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresConfirmation {

	/** Short sentence shown to the person before confirming, e.g. "Desativa o usuário e encerra suas sessões". */
	String value();

	/**
	 * How far the person may waive the confirmation for this action. Undeclared means {@link Risk#HIGH}:
	 * a module opts in to less friction, never out of protection.
	 */
	Risk risk() default Risk.HIGH;

	/**
	 * What the person may choose for an action, from the card in the chat or the assistant's settings.
	 * The confirmation is the last barrier against a prompt injection hidden in portal data, so only
	 * low-risk, reversible actions may run without asking for good.
	 */
	enum Risk {

		/** Light and reversible (create or complete a task): once, for the conversation, or always. */
		LOW,

		/** Removes or overwrites data (delete a task): once, or for the conversation at most. */
		MEDIUM,

		/** Access, accounts and anything sensitive (disable a user): asks every time. */
		HIGH

	}

}
