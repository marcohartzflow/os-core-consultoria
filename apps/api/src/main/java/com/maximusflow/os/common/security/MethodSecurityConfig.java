package com.maximusflow.os.common.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.annotation.AnnotationTemplateExpressionDefaults;

/**
 * Enables {@code @PreAuthorize} on beans and the template support that makes
 * {@link RequiresPermission} expand {@code {value}} into the permission key.
 */
@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
class MethodSecurityConfig {

	@Bean
	static AnnotationTemplateExpressionDefaults templateExpressionDefaults() {
		return new AnnotationTemplateExpressionDefaults();
	}

}
