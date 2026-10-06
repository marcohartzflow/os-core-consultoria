package com.maximusflow.os.common.logging;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

@Configuration(proxyBeanMethods = false)
class LoggingConfig {

	/** Early in the chain, before Spring Security (-100), so every log line of the request is tagged. */
	@Bean
	FilterRegistrationBean<RequestLoggingContextFilter> requestLoggingContextFilter() {
		FilterRegistrationBean<RequestLoggingContextFilter> registration = new FilterRegistrationBean<>(
				new RequestLoggingContextFilter());
		registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
		return registration;
	}

}
