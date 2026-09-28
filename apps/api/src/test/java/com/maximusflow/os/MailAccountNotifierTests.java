package com.maximusflow.os;

import com.maximusflow.os.iam.internal.application.AccountNotifier;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

/** With an SMTP host configured, the e-mail notifier replaces the logging fallback. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = { "spring.mail.host=smtp.example.test", "os.mail.from=OS <no-reply@example.test>",
		"os.mail.portal-name=Portal Exemplo" })
class MailAccountNotifierTests {

	@Autowired
	AccountNotifier notifier;

	@MockitoBean
	JavaMailSender mailSender;

	@Test
	void invitationGoesOutAsPlainTextWithTheLink() {
		this.notifier.sendInvitation("ana@example.test", "Ana", "https://os.example.test/invite/abc");

		ArgumentCaptor<SimpleMailMessage> sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
		verify(this.mailSender).send(sent.capture());
		assertThat(sent.getValue().getFrom()).isEqualTo("OS <no-reply@example.test>");
		assertThat(sent.getValue().getTo()).containsExactly("ana@example.test");
		assertThat(sent.getValue().getSubject()).isEqualTo("Convite para o Portal Exemplo");
		assertThat(sent.getValue().getText()).contains("Olá, Ana.").contains("https://os.example.test/invite/abc");
	}

}
