package com.maximusflow.os.common.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Declares the permission a use case requires. Placed on the application-service method, never on
 * the controller, so REST endpoints and AI tools share the same authorization check.
 *
 * <p>Permission keys follow {@code module.resource.action}, for example {@code iam.user.create}.
 * The IAM module builds the permission catalog by scanning these annotations at startup.
 */
@Target({ ElementType.METHOD, ElementType.TYPE })
@Retention(RetentionPolicy.RUNTIME)
@Documented
@PreAuthorize("hasAuthority('{value}')")
public @interface RequiresPermission {

	/** Permission key, e.g. {@code iam.user.create}. */
	String value();

	/** Human readable description shown to administrators when assigning roles. */
	String description() default "";

}
