package com.maximusflow.os.iam.internal.application;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.domain.UserPasskey;
import com.maximusflow.os.iam.internal.persistence.MfaRecoveryCodeRepository;
import com.maximusflow.os.iam.internal.persistence.UserPasskeyRepository;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.webauthn.api.AuthenticatorAssertionResponse;
import org.springframework.security.web.webauthn.api.Bytes;
import org.springframework.security.web.webauthn.api.CredentialRecord;
import org.springframework.security.web.webauthn.api.ImmutablePublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.api.PublicKeyCredential;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialCreationOptions;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRequestOptions;
import org.springframework.security.web.webauthn.api.PublicKeyCredentialUserEntity;
import org.springframework.security.web.webauthn.authentication.HttpSessionPublicKeyCredentialRequestOptionsRepository;
import org.springframework.security.web.webauthn.authentication.PublicKeyCredentialRequestOptionsRepository;
import org.springframework.security.web.webauthn.management.ImmutablePublicKeyCredentialCreationOptionsRequest;
import org.springframework.security.web.webauthn.management.ImmutablePublicKeyCredentialRequestOptionsRequest;
import org.springframework.security.web.webauthn.management.ImmutableRelyingPartyRegistrationRequest;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.RelyingPartyAuthenticationRequest;
import org.springframework.security.web.webauthn.management.RelyingPartyPublicKey;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations;
import org.springframework.security.web.webauthn.registration.HttpSessionPublicKeyCredentialCreationOptionsRepository;
import org.springframework.security.web.webauthn.registration.PublicKeyCredentialCreationOptionsRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Passkeys as a second factor, with Spring Security's WebAuthn relying party. The steps are the ones
 * of Spring Security's own WebAuthn filters (options kept in the session between the two calls of
 * each ceremony, the same repositories and operations), exposed under {@code /api} so they go through
 * the portal's CSRF protection, session strategy and audit trail like the password login does.
 * A passkey is phishing-resistant: NIST SP 800-63B-4 requires offering one at AAL2.
 */
@Service
@Transactional
public class PasskeyService {

	public record Passkey(String id, String label, @Nullable Instant createdAt, @Nullable Instant lastUsedAt) {
	}

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	private final WebAuthnRelyingPartyOperations relyingParty;

	private final PublicKeyCredentialUserEntityRepository userEntities;

	private final UserCredentialRepository credentials;

	private final UserPasskeyRepository links;

	private final UserRepository users;

	private final MfaService mfa;

	private final MfaRecoveryCodeRepository recoveryCodes;

	private final LoginAttempts attempts;

	private final CurrentUser currentUser;

	private final AuditRecorder audit;

	private final Clock clock;

	private final PublicKeyCredentialCreationOptionsRepository creationOptions = new HttpSessionPublicKeyCredentialCreationOptionsRepository();

	private final PublicKeyCredentialRequestOptionsRepository requestOptions = new HttpSessionPublicKeyCredentialRequestOptionsRepository();

	PasskeyService(WebAuthnRelyingPartyOperations relyingParty, PublicKeyCredentialUserEntityRepository userEntities,
			UserCredentialRepository credentials, UserPasskeyRepository links, UserRepository users, MfaService mfa,
			LoginAttempts attempts, CurrentUser currentUser, AuditRecorder audit, Clock clock,
			MfaRecoveryCodeRepository recoveryCodes) {
		this.recoveryCodes = recoveryCodes;
		this.relyingParty = relyingParty;
		this.userEntities = userEntities;
		this.credentials = credentials;
		this.links = links;
		this.users = users;
		this.mfa = mfa;
		this.attempts = attempts;
		this.currentUser = currentUser;
		this.audit = audit;
		this.clock = clock;
	}

	/**
	 * First call of a registration: the options the browser passes to {@code navigator.credentials.create}.
	 * Whoever registers a factor controls the account from then on, so the password is typed again
	 * (as for the authenticator app): a hijacked session alone cannot bind the attacker's passkey.
	 */
	public PublicKeyCredentialCreationOptions registrationOptions(String currentPassword, HttpServletRequest request,
			HttpServletResponse response) {
		User user = load(this.currentUser.require().getId());
		this.attempts.confirmPassword(user, currentPassword, "Senha atual incorreta");
		// The account's WebAuthn identity: the login e-mail as its name, the person's name for display,
		// a random handle with no personal data in it (WebAuthn: the user handle must not be the e-mail).
		if (this.userEntities.findByUsername(user.getEmail()) == null) {
			this.userEntities.save(ImmutablePublicKeyCredentialUserEntity.builder()
				.id(Bytes.random())
				.name(user.getEmail())
				.displayName(user.getName())
				.build());
		}
		PublicKeyCredentialCreationOptions options = this.relyingParty
			.createPublicKeyCredentialCreationOptions(new ImmutablePublicKeyCredentialCreationOptionsRequest(authentication()));
		this.creationOptions.save(request, response, options);
		return options;
	}

	/**
	 * Second call of a registration: verifies the browser's answer against the options of the first
	 * call and stores the passkey. The first factor of an account also brings its recovery codes,
	 * returned here once.
	 */
	public MfaService.FactorAdded register(RelyingPartyPublicKey publicKey, HttpServletRequest request,
			HttpServletResponse response) {
		UUID userId = this.currentUser.require().getId();
		PublicKeyCredentialCreationOptions options = this.creationOptions.load(request);
		this.creationOptions.save(request, response, null);
		if (options == null) {
			throw new DomainRuleException("Comece o cadastro da chave de acesso de novo");
		}
		this.mfa.lock(userId);
		boolean firstFactor = !this.mfa.status(userId).enabled();
		CredentialRecord credential;
		try {
			credential = this.relyingParty.registerCredential(new ImmutableRelyingPartyRegistrationRequest(options, publicKey));
		}
		catch (RuntimeException ex) {
			security.warn("passkey registration refused user={} reason={}", userId, ex.getClass().getSimpleName());
			throw new DomainRuleException("Não foi possível cadastrar a chave de acesso. Tente de novo");
		}
		String id = Passkeys.id(credential.getCredentialId());
		this.links.save(new UserPasskey(id, userId, this.clock.instant()));
		this.audit.record("iam.passkey.registered", "user", userId.toString(), Map.of("label", credential.getLabel()));
		this.mfa.factorChanged(userId, "Chave de acesso cadastrada: " + credential.getLabel());
		return new MfaService.FactorAdded(firstFactor ? this.mfa.issueRecoveryCodesIfNone(userId) : List.of(),
				firstFactor);
	}

	@Transactional(readOnly = true)
	public List<Passkey> list(UUID userId) {
		return this.links.findByUserId(userId).stream()
			.map((link) -> this.credentials.findByCredentialId(Passkeys.bytes(link.getCredentialId())))
			.filter((credential) -> credential != null)
			.map((credential) -> new Passkey(Passkeys.id(credential.getCredentialId()), credential.getLabel(),
					credential.getCreated(), credential.getLastUsed()))
			.toList();
	}

	/** Removes one of the person's passkeys after re-typing the password; never the last factor policy requires. */
	public void delete(String passkeyId, String currentPassword) {
		User user = load(this.currentUser.require().getId());
		UserPasskey link = this.links.findById(passkeyId)
			.filter((candidate) -> candidate.getUserId().equals(user.getId()))
			.orElseThrow(() -> new NotFoundException("Chave de acesso não encontrada"));
		this.attempts.confirmPassword(user, currentPassword, "Senha atual incorreta");
		// The factors are counted under the row lock (MfaService.lock): two removals in parallel must
		// not both see another factor left.
		this.mfa.lock(user.getId());
		var status = this.mfa.status(user);
		if (status.required() && !status.totp() && status.passkeys() <= 1) {
			throw new DomainRuleException("A política exige segundo fator: cadastre outro antes de remover este");
		}
		this.credentials.delete(Passkeys.bytes(link.getCredentialId()));
		// The last factor gone: its recovery codes go too, and a factor added later brings new ones.
		if (!status.totp() && status.passkeys() <= 1) {
			this.recoveryCodes.deleteByUserId(user.getId());
		}
		this.audit.record("iam.passkey.deleted", "user", user.getId().toString(), null);
		this.mfa.factorChanged(user.getId(), "Chave de acesso removida");
	}

	/** First call of the login's second step with a passkey: options for {@code navigator.credentials.get}. */
	public PublicKeyCredentialRequestOptions authenticationOptions(HttpServletRequest request,
			HttpServletResponse response) {
		PublicKeyCredentialRequestOptions options = this.relyingParty
			.createCredentialRequestOptions(new ImmutablePublicKeyCredentialRequestOptionsRequest(authentication()));
		this.requestOptions.save(request, response, options);
		return options;
	}

	/**
	 * Second call: verifies the signature against the options of the first call (challenge, origin,
	 * relying party, signature counter) and that the passkey belongs to the person logging in.
	 */
	public boolean verify(PublicKeyCredential<AuthenticatorAssertionResponse> credential, HttpServletRequest request,
			HttpServletResponse response) {
		var principal = this.currentUser.require();
		PublicKeyCredentialRequestOptions options = this.requestOptions.load(request);
		this.requestOptions.save(request, response, null);
		// A locked account accepts no factor, as with codes.
		if (options == null || load(principal.getId()).isLocked(this.clock.instant())) {
			return false;
		}
		try {
			PublicKeyCredentialUserEntity owner = this.relyingParty
				.authenticate(new RelyingPartyAuthenticationRequest(options, credential));
			if (owner.getName().equals(principal.getEmail())) {
				this.attempts.succeeded(principal.getId());
				return true;
			}
			security.warn("passkey of another account presented user={}", principal.getId());
		}
		catch (RuntimeException ex) {
			security.warn("passkey verification failed user={} reason={}", principal.getId(),
					ex.getClass().getSimpleName());
		}
		// Counts against the same per-account lockout as passwords and codes (Keycloak counts every
		// factor in one counter too).
		boolean locked = this.attempts.failed(principal.getId());
		this.audit.recordFor(principal.getId(), principal.getEmail(), "iam.mfa.failed", "user",
				principal.getId().toString(), Map.of("factor", "passkey", "locked", locked));
		return false;
	}

	private static Authentication authentication() {
		return SecurityContextHolder.getContext().getAuthentication();
	}

	private User load(UUID id) {
		return this.users.findById(id).orElseThrow(() -> new NotFoundException("Usuário não encontrado"));
	}

}
