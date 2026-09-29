package com.maximusflow.os.iam.internal.application;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mail.javamail.JavaMailSender;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Which notifier delivers links. A deployment without a mail server still passes an empty
 * SPRING_MAIL_HOST; that must mean "no e-mail", or invitation links would silently go nowhere.
 */
class AccountNotifierSelectionTests {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
		.withUserConfiguration(MailAccountNotifier.class, LoggingAccountNotifier.class)
		.withBean(JavaMailSender.class, () -> mock(JavaMailSender.class))
		.withPropertyValues("os.mail.from=OS <no-reply@example.test>");

	@Test
	void noHostOrAnEmptyHostKeepsTheAdministratorHandOver() {
		for (String host : new String[] { null, "", "  " }) {
			var configured = (host != null) ? this.runner.withPropertyValues("spring.mail.host=" + host) : this.runner;
			configured.run((context) -> {
				assertThat(context).hasNotFailed();
				assertThat(context.getBean(AccountNotifier.class)).isInstanceOf(LoggingAccountNotifier.class);
				assertThat(context.getBean(AccountNotifier.class).handsLinksToAdministrator()).isTrue();
			});
		}
	}

	@Test
	void aRealHostSendsByEmailAndKeepsLinksOnTheServer() {
		this.runner.withPropertyValues("spring.mail.host=smtp.example.test").run((context) -> {
			assertThat(context.getBean(AccountNotifier.class)).isInstanceOf(MailAccountNotifier.class);
			assertThat(context.getBean(AccountNotifier.class).handsLinksToAdministrator()).isFalse();
		});
	}

	@Test
	void aHostWithoutASenderFailsAtStartup() {
		new ApplicationContextRunner().withUserConfiguration(MailAccountNotifier.class, LoggingAccountNotifier.class)
			.withBean(JavaMailSender.class, () -> mock(JavaMailSender.class))
			.withPropertyValues("spring.mail.host=smtp.example.test", "os.mail.from=")
			.run((context) -> assertThat(context).hasFailed());
	}

}
