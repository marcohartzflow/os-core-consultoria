package com.maximusflow.os.iam.internal.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.maximusflow.os.common.persistence.AuditableEntity;
import com.maximusflow.os.iam.AccountStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;

import org.jspecify.annotations.Nullable;

@Entity
@Table(name = "users")
public class User extends AuditableEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(nullable = false, unique = true, length = 320)
	private String email;

	@Column(nullable = false, length = 200)
	private String name;

	@Column(name = "password_hash")
	private @Nullable String passwordHash;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private AccountStatus status;

	@Column(name = "failed_login_attempts", nullable = false)
	private int failedLoginAttempts;

	@Column(name = "locked_until")
	private @Nullable Instant lockedUntil;

	@Column(name = "last_login_at")
	private @Nullable Instant lastLoginAt;

	/** Set for accounts whose password was chosen by someone else (bootstrap); cleared when the person sets their own. */
	@Column(name = "password_change_required", nullable = false)
	private boolean passwordChangeRequired;

	@Column(name = "anonymized_at")
	private @Nullable Instant anonymizedAt;

	@ManyToMany
	@JoinTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"),
			inverseJoinColumns = @JoinColumn(name = "role_id"))
	private Set<Role> roles = new HashSet<>();

	protected User() {
	}

	private User(String email, String name, AccountStatus status, Set<Role> roles) {
		this.email = normalizeEmail(email);
		this.name = name.strip();
		this.status = status;
		this.roles = new HashSet<>(roles);
	}

	public static User invite(String email, String name, Set<Role> roles) {
		return new User(email, name, AccountStatus.INVITED, roles);
	}

	/** Creates an already-active account. Only used by the bootstrap of the first administrator. */
	public static User bootstrap(String email, String name, String passwordHash, Set<Role> roles,
			boolean passwordChangeRequired) {
		User user = new User(email, name, AccountStatus.ACTIVE, roles);
		user.passwordHash = passwordHash;
		user.passwordChangeRequired = passwordChangeRequired;
		return user;
	}

	public static String normalizeEmail(String email) {
		return email.strip().toLowerCase(Locale.ROOT);
	}

	public void rename(String name) {
		this.name = name.strip();
	}

	public void replaceRoles(Set<Role> roles) {
		this.roles = new HashSet<>(roles);
	}

	/** Completes an invitation or a password reset. Unlocks the account. */
	public void setPassword(String passwordHash) {
		this.passwordHash = passwordHash;
		this.passwordChangeRequired = false;
		this.failedLoginAttempts = 0;
		this.lockedUntil = null;
		if (this.status == AccountStatus.INVITED) {
			this.status = AccountStatus.ACTIVE;
		}
	}

	/**
	 * LGPD art. 18 VI: replaces every identifying field with placeholders and drops the credential. The
	 * row (and its id, referenced by the audit trail) stays; the person is no longer identifiable.
	 */
	public void anonymize(Instant now) {
		this.email = "anonymized-" + this.id + "@invalid";
		this.name = "Titular removido";
		this.passwordHash = null;
		this.passwordChangeRequired = false;
		this.roles = new HashSet<>();
		this.status = AccountStatus.DISABLED;
		this.anonymizedAt = now;
	}

	public boolean isAnonymized() {
		return this.anonymizedAt != null;
	}

	public @Nullable Instant getAnonymizedAt() {
		return this.anonymizedAt;
	}

	public void disable() {
		this.status = AccountStatus.DISABLED;
	}

	public void enable() {
		this.status = (this.passwordHash != null) ? AccountStatus.ACTIVE : AccountStatus.INVITED;
	}

	public void recordLoginFailure(Instant now, int maxAttempts, Duration lockDuration) {
		this.failedLoginAttempts++;
		if (this.failedLoginAttempts >= maxAttempts) {
			this.lockedUntil = now.plus(lockDuration);
			this.failedLoginAttempts = 0;
		}
	}

	public void recordLoginSuccess(Instant now) {
		this.failedLoginAttempts = 0;
		this.lockedUntil = null;
		this.lastLoginAt = now;
	}

	public boolean isLocked(Instant now) {
		return this.lockedUntil != null && this.lockedUntil.isAfter(now);
	}

	public Set<String> permissions() {
		return this.roles.stream().flatMap((role) -> role.getPermissions().stream()).collect(Collectors.toSet());
	}

	public UUID getId() {
		return this.id;
	}

	public String getEmail() {
		return this.email;
	}

	public String getName() {
		return this.name;
	}

	public @Nullable String getPasswordHash() {
		return this.passwordHash;
	}

	public AccountStatus getStatus() {
		return this.status;
	}

	public @Nullable Instant getLockedUntil() {
		return this.lockedUntil;
	}

	public @Nullable Instant getLastLoginAt() {
		return this.lastLoginAt;
	}

	public boolean isPasswordChangeRequired() {
		return this.passwordChangeRequired;
	}

	public Set<Role> getRoles() {
		return this.roles;
	}

}
