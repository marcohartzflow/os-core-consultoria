package com.maximusflow.os.iam.internal.web;

import java.util.List;
import java.util.Map;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.MfaSession;
import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.common.security.SecondFactorGrant;
import com.maximusflow.os.iam.internal.application.PasskeyService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.FactorGrantedAuthority;
import org.springframework.security.web.webauthn.api.AuthenticatorAssertionResponse;
import org.springframework.security.web.webauthn.api.PublicKeyCredential;
import org.springframework.security.web.webauthn.jackson.WebauthnJacksonModule;
import org.springframework.security.web.webauthn.management.RelyingPartyPublicKey;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Passkey registration, management and the login's second step with a passkey. WebAuthn bodies are
 * read and written with Spring Security's own {@link WebauthnJacksonModule}, the way its WebAuthn
 * filters do, so the JSON is exactly what the browser's WebAuthn API produces and expects.
 */
@RestController
class PasskeyController {

	// Password fields: 512 UTF-16 units (4 × 128), so the password policy's 128 code points is the limit.
	record PasswordRequest(@NotBlank @Size(max = 512) String currentPassword) {
	}

	record RegistrationRequest(RelyingPartyPublicKey publicKey) {
	}

	record RecoveryCodes(List<String> recoveryCodes) {
	}

	private static final JsonMapper WEBAUTHN_JSON = JsonMapper.builder().addModule(new WebauthnJacksonModule()).build();

	private final PasskeyService passkeys;

	private final CurrentUser currentUser;

	private final SecondFactorGrant secondFactor;

	private final AuditRecorder audit;

	PasskeyController(PasskeyService passkeys, CurrentUser currentUser, SecondFactorGrant secondFactor,
			AuditRecorder audit) {
		this.passkeys = passkeys;
		this.currentUser = currentUser;
		this.secondFactor = secondFactor;
		this.audit = audit;
	}

	@GetMapping("/api/me/passkeys")
	List<PasskeyService.Passkey> list() {
		return this.passkeys.list(this.currentUser.require().getId());
	}

	@PostMapping(value = "/api/me/passkeys/options", produces = MediaType.APPLICATION_JSON_VALUE)
	String registrationOptions(@Valid @RequestBody PasswordRequest body, HttpServletRequest request,
			HttpServletResponse response) {
		return WEBAUTHN_JSON.writeValueAsString(this.passkeys.registrationOptions(body.currentPassword(), request, response));
	}

	/** Registering the account's first factor in this session also counts as having passed it. */
	@PostMapping(value = "/api/me/passkeys", consumes = MediaType.APPLICATION_JSON_VALUE)
	RecoveryCodes register(@RequestBody String body, HttpServletRequest request, HttpServletResponse response) {
		RegistrationRequest registration = read(body, new TypeReference<RegistrationRequest>() {
		});
		var added = this.passkeys.register(registration.publicKey(), request, response);
		if (added.firstFactor()) {
			this.secondFactor.grant(FactorGrantedAuthority.WEBAUTHN_AUTHORITY, request, response);
		}
		return new RecoveryCodes(added.recoveryCodes());
	}

	@DeleteMapping("/api/me/passkeys/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@PathVariable String id, @Valid @RequestBody PasswordRequest body) {
		this.passkeys.delete(id, body.currentPassword());
	}

	@PostMapping(value = "/api/auth/mfa/passkey/options", produces = MediaType.APPLICATION_JSON_VALUE)
	String authenticationOptions(HttpServletRequest request, HttpServletResponse response) {
		return WEBAUTHN_JSON.writeValueAsString(this.passkeys.authenticationOptions(request, response));
	}

	/** Second step of the login with a passkey; also answers a step-up, like a code does. */
	@PostMapping(value = "/api/auth/mfa/passkey", consumes = MediaType.APPLICATION_JSON_VALUE)
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void verify(@RequestBody String body, HttpServletRequest request, HttpServletResponse response) {
		PublicKeyCredential<AuthenticatorAssertionResponse> credential = read(body,
				new TypeReference<PublicKeyCredential<AuthenticatorAssertionResponse>>() {
				});
		if (!this.passkeys.verify(credential, request, response)) {
			throw new DomainRuleException("Chave de acesso não reconhecida");
		}
		// The code failures counted in this session start over, as when a code is accepted.
		HttpSession session = request.getSession(false);
		if (session != null) {
			session.removeAttribute(MfaSession.FAILURES);
		}
		this.secondFactor.grant(FactorGrantedAuthority.WEBAUTHN_AUTHORITY, request, response);
		OsPrincipal principal = this.currentUser.require();
		this.audit.recordFor(principal.getId(), principal.getEmail(), "auth.mfa.verified", "user",
				principal.getId().toString(), Map.of("factor", "passkey"));
	}

	private static <T> T read(String body, TypeReference<T> type) {
		try {
			return WEBAUTHN_JSON.readValue(body, type);
		}
		catch (RuntimeException ex) {
			throw new DomainRuleException("Resposta da chave de acesso inválida");
		}
	}

}
