package com.maximusflow.os.iam.internal.application;

import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.iam.internal.IamProperties;

import org.springframework.security.authentication.password.CompromisedPasswordChecker;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.password.HaveIBeenPwnedRestApiPasswordChecker;
import org.springframework.stereotype.Component;

/**
 * Validates and hashes passwords. The compromised-password check runs only when a password is set
 * or changed, never at login, so logins do not depend on an external service.
 */
@Component
public class PasswordPolicy {

	private static final org.slf4j.Logger security = org.slf4j.LoggerFactory.getLogger("SECURITY");

	private final IamProperties.Password properties;

	private final PasswordEncoder encoder;

	private final CompromisedPasswordChecker compromisedChecker;

	PasswordPolicy(IamProperties properties, PasswordEncoder encoder) {
		this.properties = properties.password();
		this.encoder = encoder;
		this.compromisedChecker = new HaveIBeenPwnedRestApiPasswordChecker();
	}

	/** Validates the raw password against the policy and returns its hash. */
	public String validateAndHash(String rawPassword) {
		if (rawPassword.length() < this.properties.minLength()) {
			throw new DomainRuleException(
					"A senha precisa ter no mínimo " + this.properties.minLength() + " caracteres");
		}
		if (rawPassword.length() > this.properties.maxLength()) {
			throw new DomainRuleException(
					"A senha pode ter no máximo " + this.properties.maxLength() + " caracteres");
		}
		if (this.properties.checkCompromised() && isCompromised(rawPassword)) {
			throw new DomainRuleException("Esta senha apareceu em vazamentos de dados. Escolha outra");
		}
		return this.encoder.encode(rawPassword);
	}

	/**
	 * Fails closed: while the breach check is unreachable no password is accepted, with a message
	 * that says so instead of a 500. Accepting unchecked passwords would silently weaken the policy.
	 */
	private boolean isCompromised(String rawPassword) {
		try {
			return this.compromisedChecker.check(rawPassword).isCompromised();
		}
		catch (RuntimeException ex) {
			security.warn("compromised-password check unavailable reason={}", ex.getClass().getSimpleName());
			throw new DomainRuleException("A verificação de senha vazada está indisponível. Tente de novo em instantes");
		}
	}

	public boolean matches(String rawPassword, String hash) {
		return this.encoder.matches(rawPassword, hash);
	}

}
