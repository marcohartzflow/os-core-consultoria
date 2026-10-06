package com.maximusflow.os.iam.internal.application;

import java.net.URI;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.iam.internal.persistence.UserPasskeyRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.security.web.webauthn.api.Bytes;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRpEntity;
import org.springframework.security.web.webauthn.management.JdbcPublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.JdbcUserCredentialRepository;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations;
import org.springframework.security.web.webauthn.management.Webauthn4JRelyingPartyOperations;

/**
 * Spring Security's WebAuthn relying party (WebAuthn4J underneath) with its JDBC repositories, as
 * the passkeys reference documentation configures them. The relying party is the portal: its id is
 * the host of {@code os.app.base-url} and the only allowed origin is that URL, so a passkey made for
 * the portal is never offered to, nor accepted from, any other site.
 */
@Configuration(proxyBeanMethods = false)
class Passkeys {

	@Bean
	PublicKeyCredentialUserEntityRepository passkeyUserEntities(JdbcOperations jdbc) {
		return new JdbcPublicKeyCredentialUserEntityRepository(jdbc);
	}

	@Bean
	UserCredentialRepository passkeyCredentials(JdbcOperations jdbc) {
		return new JdbcUserCredentialRepository(jdbc);
	}

	@Bean
	WebAuthnRelyingPartyOperations relyingParty(PublicKeyCredentialUserEntityRepository userEntities,
			UserCredentialRepository credentials, @Value("${os.app.base-url}") String baseUrl,
			@Value("${os.mail.portal-name:OS}") String portalName) {
		URI portal = URI.create(baseUrl);
		String origin = portal.getScheme() + "://" + portal.getAuthority();
		return new Webauthn4JRelyingPartyOperations(userEntities, credentials,
				PublicKeyCredentialRpEntity.builder().id(portal.getHost()).name(portalName).build(), Set.of(origin));
	}

	/** Credential ids as Spring Security stores them (Base64url, no padding) and as the portal names them. */
	static String id(Bytes credentialId) {
		return credentialId.toBase64UrlString();
	}

	static Bytes bytes(String credentialId) {
		return Bytes.fromBase64(credentialId);
	}

	/** Deletes every passkey of the account, through Spring Security's repository (the links cascade). */
	static void removeAll(UUID userId, UserPasskeyRepository links, UserCredentialRepository credentials) {
		List<String> ids = links.findByUserId(userId).stream().map((link) -> link.getCredentialId()).toList();
		ids.forEach((id) -> credentials.delete(bytes(id)));
	}

}
