package com.maximusflow.os.iam.internal.application;

import com.maximusflow.os.common.logging.Sanitize;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
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
// Not @ConditionalOnProperty: it treats an empty value as set, and deployments pass SPRING_MAIL_HOST=""
// when there is no mail server. Without a real host the logging fallback must stay in charge.
@ConditionalOnExpression("!'${spring.mail.host:}'.isBlank()")
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

	@Override
	public void sendSecondFactorReset(String email, String name, String link) {
		send(email, "Seu segundo fator foi removido no " + this.portalName, """
				Olá, %s.

				Um administrador do %s removeu o segundo fator da sua conta, a seu pedido (por exemplo, \
				porque você perdeu o celular). Por segurança, a sua senha também deixou de valer e todas \
				as suas sessões foram encerradas.

				Para voltar a entrar, escolha uma nova senha pelo link abaixo e configure o segundo fator \
				de novo. O link vale por tempo limitado e só pode ser usado uma vez.

				%s

				Se você não pediu isso, avise a segurança da sua empresa: alguém pode estar tentando \
				tomar a sua conta.
				""".formatted(name, this.portalName, link));
		log.info("Second-factor reset e-mail sent to {}", Sanitize.forLog(email));
	}

	@Override
	public void sendSecondFactorChanged(String email, String name, String change) {
		send(email, "Mudança na verificação em duas etapas do " + this.portalName, """
				Olá, %s.

				Houve uma mudança na verificação em duas etapas da sua conta no %s:

				%s

				Se foi você, não precisa fazer nada. Se não foi, troque a sua senha e avise a segurança \
				da sua empresa.
				""".formatted(name, this.portalName, change));
		log.info("Second-factor change e-mail sent to {}", Sanitize.forLog(email));
	}

	@Override
	public void sendSecurityNotice(String email, String name, String notice) {
		send(email, "Aviso de segurança da sua conta no " + this.portalName, """
				Olá, %s.

				Houve uma mudança de segurança na sua conta no %s:

				%s

				Se foi você, não precisa fazer nada. Se não foi, redefina a sua senha pela tela de \
				entrada (Esqueci minha senha) e avise a segurança da sua empresa.
				""".formatted(name, this.portalName, notice));
		log.info("Security notice e-mail sent to {}", Sanitize.forLog(email));
	}

	@Override
	public void sendAdministratorGranted(String email, String name, String granteeName, String granteeEmail,
			String grantedByName) {
		send(email, "Novo administrador no " + this.portalName, """
				Olá, %s.

				%s (%s) agora é administrador(a) do %s, com acesso total, incluindo quem acessa o quê. \
				A mudança foi feita por %s.

				Se você não reconhece essa mudança, trate como incidente de segurança: remova o acesso \
				em Administração > Usuários e verifique a trilha de auditoria.
				""".formatted(name, granteeName, granteeEmail, this.portalName, grantedByName));
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
