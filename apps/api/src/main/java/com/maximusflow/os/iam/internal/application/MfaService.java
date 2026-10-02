package com.maximusflow.os.iam.internal.application;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import javax.crypto.spec.SecretKeySpec;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.RequiresPermission;
import com.maximusflow.os.iam.MfaStatus;
import com.maximusflow.os.iam.PasswordChanged;
import com.maximusflow.os.iam.internal.IamProperties;
import com.maximusflow.os.iam.internal.domain.MfaRecoveryCode;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.domain.UserMfa;
import com.maximusflow.os.iam.internal.persistence.MfaRecoveryCodeRepository;
import com.maximusflow.os.iam.internal.persistence.UserMfaRepository;
import com.maximusflow.os.iam.internal.persistence.UserPasskeyRepository;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.encrypt.AesGcmBytesEncryptor;
import org.springframework.security.crypto.encrypt.BytesEncryptor;
import org.springframework.security.crypto.keygen.KeyGenerators;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * Enrolment, verification and administration of the second factor (TOTP + recovery codes). The
 * TOTP secret is stored encrypted with AES-GCM under {@code os.iam.mfa.encryption-key}, the key's
 * only use. Recovery codes are single use and stored like passwords (salted Argon2id).
 */
@Service
@Transactional
public class MfaService {

	public record Setup(String secret, String otpauthUri) {
	}

	/**
	 * A factor just added. {@code firstFactor}: the account had none before, so this session has now
	 * proved it; adding another factor does not make an older session any fresher.
	 */
	public record FactorAdded(List<String> recoveryCodes, boolean firstFactor) {
	}

	static final int RECOVERY_CODES = 10;

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	private static final SecureRandom RANDOM = new SecureRandom();

	/** 31 symbols with no look-alikes (no i, l, o, 0, 1). */
	private static final String RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

	/**
	 * 15 symbols of 31: about 74 bits. NIST SP 800-63B-4, saved recovery codes: "The recovery code
	 * SHALL include at least 64 bits from an approved random bit generator". Shown in three groups of
	 * five ({@code xxxxx-xxxxx-xxxxx}).
	 */
	static final int RECOVERY_CODE_LENGTH = 15;

	private static final int RECOVERY_GROUP = 5;

	/** Shape of a recovery code once spaces and the dashes are removed. */
	private static final Pattern RECOVERY_CODE = Pattern
		.compile("[" + RECOVERY_ALPHABET + "]{" + RECOVERY_CODE_LENGTH + "}");

	private final UserMfaRepository enrolments;

	private final MfaRecoveryCodeRepository recoveryCodes;

	private final UserRepository users;

	private final LoginAttempts attempts;

	private final IamProperties properties;

	private final AuditRecorder audit;

	private final CurrentUser currentUser;

	private final GrantGuard grantGuard;

	private final Clock clock;

	private final BytesEncryptor encryptor;

	private final PasswordEncoder codeEncoder;

	private final ApplicationEventPublisher events;

	private final UserPasskeyRepository passkeyLinks;

	private final UserCredentialRepository passkeyCredentials;

	MfaService(UserMfaRepository enrolments, MfaRecoveryCodeRepository recoveryCodes, UserRepository users,
			LoginAttempts attempts, IamProperties properties, AuditRecorder audit, CurrentUser currentUser,
			GrantGuard grantGuard, Clock clock, PasswordEncoder codeEncoder, ApplicationEventPublisher events,
			UserPasskeyRepository passkeyLinks, UserCredentialRepository passkeyCredentials) {
		this.passkeyLinks = passkeyLinks;
		this.passkeyCredentials = passkeyCredentials;
		this.events = events;
		this.enrolments = enrolments;
		this.recoveryCodes = recoveryCodes;
		this.users = users;
		this.attempts = attempts;
		this.properties = properties;
		this.audit = audit;
		this.currentUser = currentUser;
		this.grantGuard = grantGuard;
		this.clock = clock;
		this.encryptor = encryptor(properties.mfa().encryptionKey());
		this.codeEncoder = codeEncoder;
	}

	private static BytesEncryptor encryptor(String base64Key) {
		byte[] key;
		try {
			key = StringUtils.hasText(base64Key) ? Base64.getDecoder().decode(base64Key) : new byte[0];
		}
		catch (IllegalArgumentException ex) {
			key = new byte[0];
		}
		if (key.length != 32) {
			throw new IllegalStateException(
					"os.iam.mfa.encryption-key (OS_MFA_ENCRYPTION_KEY) must be 32 random bytes in Base64: openssl rand -base64 32");
		}
		return AesGcmBytesEncryptor.withSecretKey(new SecretKeySpec(key, "AES"))
			.ivGenerator(KeyGenerators.secureRandom(12))
			.build();
	}

	@Transactional(readOnly = true)
	public MfaStatus status(UUID userId) {
		return status(load(userId));
	}

	/** Same as {@link #status(UUID)} for a user already loaded (the per-request principal refresh). */
	@Transactional(readOnly = true)
	public MfaStatus status(User user) {
		UUID userId = user.getId();
		boolean totp = this.enrolments.existsByUserIdAndEnabledAtIsNotNull(userId);
		int passkeys = this.passkeyLinks.countByUserId(userId);
		return new MfaStatus(totp || passkeys > 0, required(user), this.recoveryCodes.countByUserIdAndUsedAtIsNull(userId),
				totp, passkeys);
	}

	/** Policy: administrators (system role) always; everybody when {@code require-for-all} is on. */
	@Transactional(readOnly = true)
	public boolean required(User user) {
		var mfa = this.properties.mfa();
		return mfa.requireForAll() || (mfa.requireForSystemRole() && user.getRoles().stream().anyMatch(Role::isSystem));
	}

	/** Starts (or restarts) enrolment for the current user with a fresh secret, after re-typing the password. */
	public Setup beginSetup(String currentPassword) {
		User user = load(this.currentUser.require().getId());
		if (this.enrolments.existsByUserIdAndEnabledAtIsNotNull(user.getId())) {
			throw new DomainRuleException("O aplicativo autenticador já está ativo. Desative-o antes de configurar de novo");
		}
		// Whoever enrols the factor controls the account from then on: a hijacked session alone must
		// not be enough to bind the attacker's authenticator.
		this.attempts.confirmPassword(user, currentPassword, "Senha atual incorreta");
		lock(user.getId());
		if (this.enrolments.existsByUserIdAndEnabledAtIsNotNull(user.getId())) {
			throw new DomainRuleException("O aplicativo autenticador já está ativo. Desative-o antes de configurar de novo");
		}
		byte[] secret = Totp.generateSecret();
		String encrypted = Base64.getEncoder().encodeToString(this.encryptor.encrypt(secret));
		this.enrolments.findById(user.getId()).ifPresentOrElse((existing) -> existing.replaceSecret(encrypted),
				() -> this.enrolments.save(new UserMfa(user.getId(), encrypted)));
		return new Setup(Totp.base32(secret), Totp.otpauthUri(this.properties.mfa().issuer(), user.getEmail(), secret));
	}

	/** Turns the pending enrolment on after one valid code and returns the recovery codes, once. */
	public FactorAdded confirmSetup(String code) {
		UUID userId = this.currentUser.require().getId();
		lock(userId);
		boolean firstFactor = !status(userId).enabled();
		UserMfa enrolment = this.enrolments.findById(userId)
			.orElseThrow(() -> new DomainRuleException("Inicie a configuração do segundo fator primeiro"));
		if (enrolment.isEnabled()) {
			throw new DomainRuleException("O segundo fator já está ativo");
		}
		long step = Totp.matchingStep(secretOf(enrolment), code, this.clock.instant(), Long.MIN_VALUE);
		if (step < 0) {
			security.warn("mfa enrolment code refused user={}", userId);
			throw new DomainRuleException("Código inválido. Confira o relógio do celular e tente de novo");
		}
		enrolment.enable(this.clock.instant(), step);
		List<String> codes = issueRecoveryCodesIfNone(userId);
		this.audit.record("iam.mfa.enabled", "user", userId.toString(), null);
		factorChanged(userId, "Aplicativo autenticador configurado");
		return new FactorAdded(codes, firstFactor);
	}

	/**
	 * The person turns the authenticator app off with the password. The second factor is proved by
	 * the session itself: the security configuration requires one passed in the last minutes. Not
	 * allowed when policy requires a second factor and no passkey is left to be it.
	 */
	public void disable(String currentPassword) {
		User user = load(this.currentUser.require().getId());
		if (required(user) && this.passkeyLinks.countByUserId(user.getId()) == 0) {
			throw new DomainRuleException("A política exige segundo fator para a sua conta");
		}
		this.attempts.confirmPassword(user, currentPassword, "Senha atual incorreta");
		// Counted again under the row lock: a passkey removed at the same time must not leave an
		// account the policy requires a factor for with none.
		lock(user.getId());
		boolean passkeysLeft = this.passkeyLinks.countByUserId(user.getId()) > 0;
		if (required(user) && !passkeysLeft) {
			throw new DomainRuleException("A política exige segundo fator para a sua conta");
		}
		this.enrolments.deleteById(user.getId());
		if (!passkeysLeft) {
			this.recoveryCodes.deleteByUserId(user.getId());
		}
		factorChanged(user.getId(), "Aplicativo autenticador removido");
		this.audit.record("iam.mfa.disabled", "user", user.getId().toString(), null);
	}

	/**
	 * An administrator removes someone's second factor (lost phone). Recovery must prove as much as
	 * enrolment did (OWASP ASVS 5.0 6.4.4: the e-mail, through the invitation link, and the password),
	 * or whoever knows the password and convinces an administrator would enrol their own factor. So the
	 * password stops working too, every session ends, and the person gets an e-mail with a reset link:
	 * choosing a new password proves the e-mail again, and enrolment follows at the next login. The
	 * e-mail also warns the real owner if the request was not theirs. The administrator must have
	 * passed their own second factor in the last minutes (step-up, see the security configuration).
	 */
	@RequiresPermission(value = "iam.user.mfa.reset", description = "Redefinir o segundo fator de usuários", reserved = true)
	public void reset(UUID userId) {
		if (userId.equals(this.currentUser.require().getId())) {
			throw new DomainRuleException("Use a sua própria tela de conta para gerenciar o seu segundo fator");
		}
		lock(userId);
		User user = load(userId);
		this.grantGuard.assertCanManage(user);
		remove(userId);
		Passkeys.removeAll(userId, this.passkeyLinks, this.passkeyCredentials);
		user.revokePassword();
		this.events.publishEvent(new PasswordChanged(userId));
		this.events.publishEvent(new AccountLinkMailer.SecondFactorReset(userId));
		this.audit.record("iam.mfa.reset", "user", userId.toString(), Map.of("password", "revoked"));
	}

	/**
	 * Checks a TOTP code or a recovery code. A TOTP step is accepted once; a recovery code is
	 * consumed. Returns false for anything else, including an account without enrolment.
	 */
	public boolean verify(UUID userId, String code) {
		String normalized = (code != null) ? code.strip().toLowerCase().replace(" ", "").replace("-", "") : "";
		UserMfa enrolment = this.enrolments.findById(userId).filter(UserMfa::isEnabled).orElse(null);
		// A passkey-only account still has recovery codes: only an account with no factor has no code.
		if (enrolment == null && this.passkeyLinks.countByUserId(userId) == 0) {
			return false;
		}
		// Failed codes count against the same per-account lockout as passwords, so guessing the
		// second factor from many addresses or sessions locks the account instead of the session.
		User user = load(userId);
		Instant now = this.clock.instant();
		if (user.isLocked(now)) {
			return false;
		}
		long step = -1;
		if (enrolment != null) {
			long last = (enrolment.getLastUsedStep() != null) ? enrolment.getLastUsedStep() : Long.MIN_VALUE;
			step = Totp.matchingStep(secretOf(enrolment), normalized, now, last);
		}
		if (enrolment != null && step >= 0 && this.enrolments.claimStep(userId, step) == 1) {
			enrolment.markUsed(step);
			this.attempts.succeeded(userId);
			return true;
		}
		MfaRecoveryCode recovery = matchingRecoveryCode(userId, normalized);
		if (recovery != null && this.recoveryCodes.markUsed(recovery.getId(), now) == 1) {
			recovery.use(now);
			int left = this.recoveryCodes.countByUserIdAndUsedAtIsNull(userId);
			this.attempts.succeeded(userId);
			this.audit.recordFor(userId, user.getEmail(), "iam.mfa.recovery_code_used", "user", userId.toString(),
					Map.of("left", left));
			security.warn("mfa recovery code used user={} left={}", userId, left);
			// Account recovery: NIST SP 800-63B-4 asks for a notification to the subscriber.
			this.events.publishEvent(new AccountLinkMailer.SecurityNotice(userId,
					"Um código de recuperação foi usado para confirmar o segundo fator. Restam " + left
							+ " código(s) de recuperação."));
			return true;
		}
		boolean locked = this.attempts.failed(userId);
		this.audit.recordFor(userId, user.getEmail(), "iam.mfa.failed", "user", userId.toString(),
				Map.of("locked", locked));
		return false;
	}

	/**
	 * New recovery codes replace the old ones (all of them, used or not), after re-typing the password,
	 * in a session that passed the second factor. For when they ran out or may have been seen.
	 */
	public List<String> regenerateRecoveryCodes(String currentPassword) {
		User user = load(this.currentUser.require().getId());
		if (!status(user).enabled()) {
			throw new DomainRuleException("Configure um segundo fator antes de gerar códigos de recuperação");
		}
		this.attempts.confirmPassword(user, currentPassword, "Senha atual incorreta");
		lock(user.getId());
		this.recoveryCodes.deleteByUserId(user.getId());
		List<String> codes = issueRecoveryCodesIfNone(user.getId());
		this.audit.record("iam.mfa.recovery_codes_regenerated", "user", user.getId().toString(), null);
		factorChanged(user.getId(), "Novos códigos de recuperação gerados (os anteriores deixaram de valer)");
		return codes;
	}

	/**
	 * NIST SP 800-63B-4 asks to notify the person, by a channel independent of the session, whenever
	 * an authenticator is bound or removed: an e-mail after commit ({@link AccountLinkMailer}).
	 */
	void factorChanged(UUID userId, String change) {
		this.events.publishEvent(new AccountLinkMailer.FactorChanged(userId, change));
	}

	/**
	 * The account's first second factor brings ten recovery codes, shown once; a second factor added
	 * later keeps the codes the person already has.
	 */
	List<String> issueRecoveryCodesIfNone(UUID userId) {
		if (this.recoveryCodes.countByUserIdAndUsedAtIsNull(userId) > 0) {
			return List.of();
		}
		this.recoveryCodes.deleteByUserId(userId);
		List<String> plain = new ArrayList<>(RECOVERY_CODES);
		for (int i = 0; i < RECOVERY_CODES; i++) {
			String code = randomCode();
			plain.add(formatted(code));
			this.recoveryCodes.save(new MfaRecoveryCode(userId, this.codeEncoder.encode(code), this.clock.instant()));
		}
		return plain;
	}

	private void remove(UUID userId) {
		this.recoveryCodes.deleteByUserId(userId);
		this.enrolments.deleteById(userId);
	}

	private byte[] secretOf(UserMfa enrolment) {
		return this.encryptor.decrypt(Base64.getDecoder().decode(enrolment.getSecret()));
	}

	/**
	 * Every change to the account's factors runs with the user row locked (SELECT … FOR UPDATE), so
	 * two of them in parallel cannot both read "another factor is left" and remove the last one.
	 * Taken after the password check: a wrong password is counted in a transaction of its own, which
	 * locks the same row.
	 */
	void lock(UUID userId) {
		this.users.lockById(userId).orElseThrow(() -> new NotFoundException("Usuário não encontrado"));
	}

	private User load(UUID id) {
		return this.users.findWithRolesById(id).orElseThrow(() -> new NotFoundException("Usuário não encontrado"));
	}

	/**
	 * Salted hashes cannot be looked up, so each unused code of the account is checked in turn (as
	 * devise-two-factor does for GitLab and Mastodon). Only input shaped like a recovery code gets
	 * there: a mistyped six-digit TOTP code does not cost ten Argon2 runs.
	 */
	private @Nullable MfaRecoveryCode matchingRecoveryCode(UUID userId, String normalized) {
		if (!RECOVERY_CODE.matcher(normalized).matches()) {
			return null;
		}
		for (MfaRecoveryCode candidate : this.recoveryCodes.findByUserIdAndUsedAtIsNull(userId)) {
			if (this.codeEncoder.matches(normalized, candidate.getCodeHash())) {
				return candidate;
			}
		}
		return null;
	}

	/** {@code xxxxx-xxxxx-xxxxx}: easier to copy by hand; the dashes are ignored when typed back. */
	static String formatted(String code) {
		StringBuilder sb = new StringBuilder(code.length() + code.length() / RECOVERY_GROUP);
		for (int i = 0; i < code.length(); i += RECOVERY_GROUP) {
			if (i > 0) {
				sb.append('-');
			}
			sb.append(code, i, Math.min(i + RECOVERY_GROUP, code.length()));
		}
		return sb.toString();
	}

	private static String randomCode() {
		StringBuilder sb = new StringBuilder(RECOVERY_CODE_LENGTH);
		for (int i = 0; i < RECOVERY_CODE_LENGTH; i++) {
			sb.append(RECOVERY_ALPHABET.charAt(RANDOM.nextInt(RECOVERY_ALPHABET.length())));
		}
		return sb.toString();
	}

}
