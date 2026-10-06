package com.maximusflow.os.iam.internal.application;

import java.util.List;

import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.iam.internal.IamProperties;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.security.crypto.password.NoOpPasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Length in code points and context-specific words (NIST SP 800-63B-4, OWASP ASVS 5.0 6.2.11). */
class PasswordPolicyTests {

	private final PasswordPolicy policy = new PasswordPolicy(defaults(), NoOpPasswordEncoder.getInstance(), "Portal Acme");

	@Test
	void passwordsWithTheServiceNameOrTheUsernameAreRefused() {
		for (String password : List.of("my-portal acme-pass", "Maria.Silva-2026!x", "x-maria.silva@acme.com-x")) {
			assertThatThrownBy(() -> this.policy.validateAndHash(password, "maria.silva@acme.com"))
				.isInstanceOf(DomainRuleException.class);
		}
		assertThat(this.policy.validateAndHash("correct horse battery", "maria.silva@acme.com")).isNotBlank();
	}

	@Test
	void lengthCountsCodePointsNotUtf16Units() {
		// Six emoji are six characters for the person, but twelve UTF-16 units.
		String sixEmoji = "😀".repeat(6);
		assertThatThrownBy(() -> this.policy.validateAndHash(sixEmoji + "abcde", "ana@example.com"))
			.isInstanceOf(DomainRuleException.class);
	}

	private static IamProperties defaults() {
		return new Binder(new MapConfigurationPropertySource()).bindOrCreate("os.iam", Bindable.of(IamProperties.class));
	}

}
