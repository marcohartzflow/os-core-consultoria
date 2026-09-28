package com.maximusflow.os.common.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a use case whose effect is hard to undo or reaches outside the system (delete, disable,
 * pay, send, bulk change). When exposed as an AI tool, the agent cannot execute it directly: the
 * call is parked as a pending action and only runs after the person confirms it in the portal.
 * When in doubt, mark it.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Destructive {

	/** Short sentence shown to the person before confirming, e.g. "Desativa o usuário e encerra suas sessões". */
	String value() default "";

}
