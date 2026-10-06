package com.maximusflow.os.auth.internal;

import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.SessionIdGenerator;
import org.springframework.session.config.SessionRepositoryCustomizer;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;

/**
 * Session ids with 256 bits from a CSPRNG. Spring Session's default is a random UUID, which carries
 * 122 random bits; OWASP ASVS 5.0 asks for at least 128 (7.2.3) and says UUIDs do not meet that
 * (11.5.1). Installed through Spring Session's own customization hook for the JDBC repository.
 */
@Configuration(proxyBeanMethods = false)
class SessionIds {

	private static final SecureRandom RANDOM = new SecureRandom();

	static String generate() {
		byte[] bytes = new byte[32];
		RANDOM.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	@Bean
	SessionRepositoryCustomizer<JdbcIndexedSessionRepository> sessionIdGenerator() {
		SessionIdGenerator generator = SessionIds::generate;
		return (repository) -> repository.setSessionIdGenerator(generator);
	}

}
