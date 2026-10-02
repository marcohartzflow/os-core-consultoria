package com.maximusflow.os.iam.internal.application;

import java.time.Duration;
import java.util.Locale;
import java.util.stream.Stream;

import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.iam.internal.IamProperties;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.authentication.password.CompromisedPasswordChecker;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.password.HaveIBeenPwnedRestApiPasswordChecker;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

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

	private final String serviceName;

	PasswordPolicy(IamProperties properties, PasswordEncoder encoder,
			@Value("${os.mail.portal-name:OS}") String serviceName) {
		this.properties = properties.password();
		this.encoder = encoder;
		this.serviceName = serviceName;
		// Bounded waits: the check runs inside a transaction (a consumed invitation link holds a row
		// lock), and a slow breach service must not pin database connections. A timeout fails closed.
		var requests = new SimpleClientHttpRequestFactory();
		requests.setConnectTimeout(Duration.ofSeconds(3));
		requests.setReadTimeout(Duration.ofSeconds(5));
		var checker = new HaveIBeenPwnedRestApiPasswordChecker();
		checker.setRestClient(
				RestClient.builder().baseUrl("https://api.pwnedpasswords.com/range/").requestFactory(requests).build());
		this.compromisedChecker = checker;
	}

	/**
	 * Validates the raw password of the account {@code email} against the policy and returns its
	 * hash. Length counts Unicode code points, as NIST SP 800-63B-4 requires.
	 */
	public String validateAndHash(String rawPassword, String email) {
		int length = rawPassword.codePointCount(0, rawPassword.length());
		if (length < this.properties.minLength()) {
			throw new DomainRuleException(
					"A senha precisa ter no mínimo " + this.properties.minLength() + " caracteres");
		}
		if (length > this.properties.maxLength()) {
			throw new DomainRuleException(
					"A senha pode ter no máximo " + this.properties.maxLength() + " caracteres");
		}
		if (containsContextWord(rawPassword, email)) {
			throw new DomainRuleException("A senha não pode conter o seu e-mail nem o nome do portal");
		}
		if (this.properties.checkCompromised() && isCompromised(rawPassword)) {
			throw new DomainRuleException("Esta senha apareceu em vazamentos de dados. Escolha outra");
		}
		return this.encoder.encode(rawPassword);
	}

	/**
	 * Context-specific words (NIST SP 800-63B-4: "the name of the service, the username, and
	 * derivatives thereof"; OWASP ASVS 5.0 6.2.11): the portal name and the e-mail, whole or its part
	 * before the @. Parts shorter than four characters are ignored; they would reject innocent passwords.
	 */
	private boolean containsContextWord(String rawPassword, String email) {
		String password = rawPassword.toLowerCase(Locale.ROOT);
		String address = email.strip().toLowerCase(Locale.ROOT);
		int at = address.indexOf('@');
		return Stream.of(this.serviceName.strip().toLowerCase(Locale.ROOT), address,
				(at > 0) ? address.substring(0, at) : address)
			.filter((word) -> word.length() >= 4)
			.anyMatch(password::contains);
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
