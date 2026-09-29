package com.maximusflow.os.iam.internal.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.crypto.spec.SecretKeySpec;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.security.CurrentUser;
import com.maximusflow.os.common.security.RequiresPermission;
import com.maximusflow.os.iam.MfaStatus;
import com.maximusflow.os.iam.internal.IamProperties;
import com.maximusflow.os.iam.internal.domain.MfaRecoveryCode;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.domain.User;
import com.maximusflow.os.iam.internal.domain.UserMfa;
import com.maximusflow.os.iam.internal.persistence.MfaRecoveryCodeRepository;
import com.maximusflow.os.iam.internal.persistence.UserMfaRepository;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.encrypt.AesBytesEncryptor;
import org.springframework.security.crypto.encrypt.BytesEncryptor;
import org.springframework.security.crypto.keygen.KeyGenerators;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * Enrolment, verification and administration of the second factor (TOTP + recovery codes). The
 * TOTP secret is stored encrypted with AES-GCM under {@code os.iam.mfa.encryption-key}; recovery
 * codes are stored as SHA-256 hashes and are single use.
 */
@Service
@Transactional
public class MfaService {

	public record Setup(String secret, String otpauthUri) {
	}

	static final int RECOVERY_CODES = 10;

	private static final Logger security = LoggerFactory.getLogger("SECURITY");

	private static final SecureRandom RANDOM = new SecureRandom();

	private static final String RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

	private final UserMfaRepository enrolments;

	private final MfaRecoveryCodeRepository recoveryCodes;

	private final UserRepository users;

	private final PasswordPolicy passwordPolicy;

	private final IamProperties properties;

	private final AuditRecorder audit;

	private final CurrentUser currentUser;

	private final GrantGuard grantGuard;

	private final Clock clock;

	private final BytesEncryptor encryptor;

	MfaService(UserMfaRepository enrolments, MfaRecoveryCodeRepository recoveryCodes, UserRepository users,
			PasswordPolicy passwordPolicy, IamProperties properties, AuditRecorder audit, CurrentUser currentUser,
			GrantGuard grantGuard, Clock clock) {
		this.enrolments = enrolments;
		this.recoveryCodes = recoveryCodes;
		this.users = users;
		this.passwordPolicy = passwordPolicy;
		this.properties = properties;
		this.audit = audit;
		this.currentUser = currentUser;
		this.grantGuard = grantGuard;
		this.clock = clock;
		this.encryptor = encryptor(properties.mfa().encryptionKey());
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
		return new AesBytesEncryptor(new SecretKeySpec(key, "AES"), KeyGenerators.secureRandom(12),
				AesBytesEncryptor.CipherAlgorithm.GCM);
	}

	@Transactional(readOnly = true)
	public MfaStatus status(UUID userId) {
		User user = load(userId);
		boolean enabled = this.enrolments.existsByUserIdAndEnabledAtIsNotNull(userId);
		return new MfaStatus(enabled, required(user), this.recoveryCodes.countByUserIdAndUsedAtIsNull(userId));
	}

	/** Policy: administrators (system role) always; everybody when {@code require-for-all} is on. */
	@Transactional(readOnly = true)
	public boolean required(User user) {
		var mfa = this.properties.mfa();
		return mfa.requireForAll() || (mfa.requireForSystemRole() && user.getRoles().stream().anyMatch(Role::isSystem));
	}

	/** Starts (or restarts) enrolment for the current user with a fresh secret. */
	public Setup beginSetup() {
		User user = load(this.currentUser.require().getId());
		if (this.enrolments.existsByUserIdAndEnabledAtIsNotNull(user.getId())) {
			throw new DomainRuleException("O segundo fator já está ativo. Desative-o antes de configurar de novo");
		}
		byte[] secret = Totp.generateSecret();
		String encrypted = Base64.getEncoder().encodeToString(this.encryptor.encrypt(secret));
		this.enrolments.findById(user.getId()).ifPresentOrElse((existing) -> existing.replaceSecret(encrypted),
				() -> this.enrolments.save(new UserMfa(user.getId(), encrypted)));
		return new Setup(Totp.base32(secret), Totp.otpauthUri(this.properties.mfa().issuer(), user.getEmail(), secret));
	}

	/** Turns the pending enrolment on after one valid code and returns the recovery codes, once. */
	public List<String> confirmSetup(String code) {
		UUID userId = this.currentUser.require().getId();
		UserMfa enrolment = this.enrolments.findById(userId)
			.orElseThrow(() -> new DomainRuleException("Inicie a configuração do segundo fator primeiro"));
		if (enrolment.isEnabled()) {
			throw new DomainRuleException("O segundo fator já está ativo");
		}
		long step = Totp.matchingStep(secretOf(enrolment), code, this.clock.instant(), Long.MIN_VALUE);
		if (step < 0) {
			throw new DomainRuleException("Código inválido. Confira o relógio do celular e tente de novo");
		}
		enrolment.enable(this.clock.instant(), step);
		List<String> codes = issueRecoveryCodes(userId);
		this.audit.record("iam.mfa.enabled", "user", userId.toString(), null);
		return codes;
	}

	/** The person turns the second factor off with password and a current code; not allowed when policy requires it. */
	public void disable(String currentPassword, String code) {
		User user = load(this.currentUser.require().getId());
		if (required(user)) {
			throw new DomainRuleException("A política exige segundo fator para a sua conta");
		}
		String hash = user.getPasswordHash();
		if (hash == null || !this.passwordPolicy.matches(currentPassword, hash)) {
			throw new DomainRuleException("Senha atual incorreta");
		}
		if (!verify(user.getId(), code)) {
			throw new DomainRuleException("Código inválido");
		}
		remove(user.getId());
		this.audit.record("iam.mfa.disabled", "user", user.getId().toString(), null);
	}

	/** Administrator removes someone's second factor (lost phone). The person enrols again on next login if required. */
	@RequiresPermission(value = "iam.user.mfa.reset", description = "Redefinir o segundo fator de usuários")
	public void reset(UUID userId) {
		if (userId.equals(this.currentUser.require().getId())) {
			throw new DomainRuleException("Use a sua própria tela de conta para gerenciar o seu segundo fator");
		}
		this.grantGuard.assertCanManage(load(userId));
		remove(userId);
		this.audit.record("iam.mfa.reset", "user", userId.toString(), null);
	}

	/**
	 * Checks a TOTP code or a recovery code. A TOTP step is accepted once; a recovery code is
	 * consumed. Returns false for anything else, including an account without enrolment.
	 */
	public boolean verify(UUID userId, String code) {
		String normalized = (code != null) ? code.strip().toLowerCase().replace(" ", "") : "";
		UserMfa enrolment = this.enrolments.findById(userId).filter(UserMfa::isEnabled).orElse(null);
		if (enrolment == null) {
			return false;
		}
		// Failed codes count against the same per-account lockout as passwords, so guessing the
		// second factor from many addresses or sessions locks the account instead of the session.
		User user = load(userId);
		Instant now = this.clock.instant();
		if (user.isLocked(now)) {
			return false;
		}
		long last = (enrolment.getLastUsedStep() != null) ? enrolment.getLastUsedStep() : Long.MIN_VALUE;
		long step = Totp.matchingStep(secretOf(enrolment), normalized, now, last);
		if (step >= 0) {
			enrolment.markUsed(step);
			user.recordLoginSuccess(now);
			return true;
		}
		MfaRecoveryCode recovery = this.recoveryCodes.findByUserIdAndCodeHash(userId, sha256(normalized)).orElse(null);
		if (recovery != null && recovery.use(now)) {
			int left = this.recoveryCodes.countByUserIdAndUsedAtIsNull(userId);
			user.recordLoginSuccess(now);
			this.audit.recordFor(userId, user.getEmail(), "iam.mfa.recovery_code_used", "user", userId.toString(),
					Map.of("left", left));
			security.warn("mfa recovery code used user={} left={}", userId, left);
			return true;
		}
		var lockout = this.properties.lockout();
		user.recordLoginFailure(now, lockout.maxAttempts(), lockout.duration());
		this.audit.recordFor(userId, user.getEmail(), "iam.mfa.failed", "user", userId.toString(),
				Map.of("locked", user.isLocked(now)));
		return false;
	}

	private List<String> issueRecoveryCodes(UUID userId) {
		this.recoveryCodes.deleteByUserId(userId);
		List<String> plain = new ArrayList<>(RECOVERY_CODES);
		for (int i = 0; i < RECOVERY_CODES; i++) {
			String code = randomCode();
			plain.add(code);
			this.recoveryCodes.save(new MfaRecoveryCode(userId, sha256(code), this.clock.instant()));
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

	private User load(UUID id) {
		return this.users.findWithRolesById(id).orElseThrow(() -> new NotFoundException("Usuário não encontrado"));
	}

	private static String randomCode() {
		StringBuilder sb = new StringBuilder(11);
		for (int i = 0; i < 10; i++) {
			if (i == 5) {
				sb.append('-');
			}
			sb.append(RECOVERY_ALPHABET.charAt(RANDOM.nextInt(RECOVERY_ALPHABET.length())));
		}
		return sb.toString();
	}

	static String sha256(String value) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}

}
