package com.maximusflow.os.iam.internal.application;

import com.maximusflow.os.common.logging.Sanitize;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * Sends invitation and password-reset links by e-mail through the SMTP server configured under
 * {@code spring.mail.*}. Active as soon as {@code spring.mail.host} is set; {@code os.mail.from} is
 * then mandatory. Messages are plain text on purpose: no HTML to spoof, no tracking, nothing to
 * render. Only the address is logged, never the link.
 */
@Component
@ConditionalOnProperty("spring.mail.host")
class MailAccountNotifier implements AccountNotifier {

	private static final Logger log = LoggerFactory.getLogger(MailAccountNotifier.class);

	private final JavaMailSender mailSender;

	private final String from;

	private final String portalName;

	MailAccountNotifier(JavaMailSender mailSender, @Value("${os.mail.from}") String from,
			@Value("${os.mail.portal-name:OS}") String portalName) {
		if (from.isBlank()) {
			throw new IllegalStateException("OS_MAIL_FROM is required when SPRING_MAIL_HOST is set");
		}
		this.mailSender = mailSender;
		this.from = from;
		this.portalName = portalName;
	}

	@Override
	public void sendInvitation(String email, String name, String link) {
		send(email, "Convite para o " + this.portalName, """
				Olá, %s.

				Você foi convidado(a) para o %s. Para definir sua senha e entrar, abra o link abaixo. \
				Ele vale por tempo limitado e só pode ser usado uma vez.

				%s

				Se você não esperava este convite, ignore esta mensagem.
				""".formatted(name, this.portalName, link));
		log.info("Invitation e-mail sent to {}", Sanitize.forLog(email));
	}

	@Override
	public void sendPasswordReset(String email, String name, String link) {
		send(email, "Redefinição de senha do " + this.portalName, """
				Olá, %s.

				Recebemos um pedido para redefinir a sua senha no %s. Para escolher uma nova senha, abra o \
				link abaixo. Ele vale por tempo limitado e só pode ser usado uma vez.

				%s

				Se você não pediu isso, ignore esta mensagem: sua senha continua a mesma.
				""".formatted(name, this.portalName, link));
		log.info("Password reset e-mail sent to {}", Sanitize.forLog(email));
	}

	private void send(String to, String subject, String text) {
		SimpleMailMessage message = new SimpleMailMessage();
		message.setFrom(this.from);
		message.setTo(to);
		message.setSubject(subject);
		message.setText(text);
		this.mailSender.send(message);
	}

}
