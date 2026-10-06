package com.maximusflow.os.common.persistence;

import java.util.UUID;

import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.OsPrincipal;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@Configuration(proxyBeanMethods = false)
@EnableJpaAuditing(auditorAwareRef = "auditorAware")
class JpaAuditingConfig {

	@Bean
	AuditorAware<UUID> auditorAware(CurrentUser currentUser) {
		return () -> currentUser.get().map(OsPrincipal::getId);
	}

}
