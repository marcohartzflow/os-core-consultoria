package com.maximusflow.os.common.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Declares that an AI tool only reads: it changes nothing, so the agent may call it without asking
 * the person. Anything that writes, however small, is {@link RequiresConfirmation} instead.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface ReadOnlyTool {

}
