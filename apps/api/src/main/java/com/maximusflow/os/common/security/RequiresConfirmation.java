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

}
