package com.maximusflow.os.iam.internal.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
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
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;

import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.UuidGenerator;
import org.jspecify.annotations.Nullable;

/**
 * Updates write only the columns that changed: a login (counters, last login) running at the same
 * time as an administrator's change (status, password) must not write the old values back.
 */
@Entity
@Table(name = "users")
@DynamicUpdate
public class User extends AuditableEntity {

	@Id
	// Time-ordered (v7): new rows land at the end of the primary key index instead of on random
	// pages, which keeps inserts cheap and the index compact as the table grows.
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
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

	@Column(name = "last_failed_login_at")
	private @Nullable Instant lastFailedLoginAt;

	@Column(name = "locked_permanently", nullable = false)
	private boolean lockedPermanently;

	@Column(name = "last_login_at")
	private @Nullable Instant lastLoginAt;

	/** Set for accounts whose password was chosen by someone else (bootstrap); cleared when the person sets their own. */
	@Column(name = "password_change_required", nullable = false)
	private boolean passwordChangeRequired;

	@Column(name = "anonymized_at")
	private @Nullable Instant anonymizedAt;

	/**
	 * Optional second address for security notices (NIST SP 800-63B-4: at least two notification
	 * addresses per account). Links never go here, only to the login e-mail.
	 */
	@Column(name = "notification_email", length = 320)
	private @Nullable String notificationEmail;

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

	/** Same password, stronger hash (algorithm or parameters upgraded at login). */
	public void upgradePasswordHash(String passwordHash) {
		this.passwordHash = passwordHash;
	}

	/**
	 * The password stops working (second factor reset by an administrator): the person proves the
	 * e-mail again through a reset link before choosing a new one.
	 */
	public void revokePassword() {
		this.passwordHash = null;
	}

	/** Completes an invitation or a password reset. Unlocks the account. */
	public void setPassword(String passwordHash) {
		this.passwordHash = passwordHash;
		this.passwordChangeRequired = false;
		clearLockout();
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
		this.notificationEmail = null;
		this.passwordHash = null;
		this.passwordChangeRequired = false;
		this.roles = new HashSet<>();
		this.status = AccountStatus.DISABLED;
		this.anonymizedAt = now;
	}

	/** Sets (normalized) or clears the second notification address; the caller checks it is not the login e-mail. */
	public void changeNotificationEmail(@Nullable String email) {
		this.notificationEmail = (email != null) ? normalizeEmail(email) : null;
	}

	public @Nullable String getNotificationEmail() {
		return this.notificationEmail;
	}

	/** Where security notices go: the login e-mail, then the second address when there is one. */
	public List<String> noticeAddresses() {
		return (this.notificationEmail != null) ? List.of(this.email, this.notificationEmail) : List.of(this.email);
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

	/** Re-enabling is an administrator's decision about the account, so it lifts any lockout too. */
	public void enable() {
		clearLockout();
		this.status = (this.passwordHash != null) ? AccountStatus.ACTIVE : AccountStatus.INVITED;
	}

	/**
	 * Counts one failed login, following Keycloak's brute-force detection ("by multiples"): every
	 * {@code policy.maxAttempts()} consecutive failures lock the account for a wait that grows by
	 * {@code policy.waitIncrement()} each time, up to {@code policy.maxWait()}. The count survives the
	 * locks and starts over only after a success or {@code policy.failureReset()} without failures.
	 * At {@code policy.permanentAfter()} consecutive failures (NIST SP 800-63B-4 allows at most 100)
	 * the account stays locked until the password is reset or an administrator re-enables it.
	 */
	public void recordLoginFailure(Instant now, LockoutPolicy policy) {
		if (this.lastFailedLoginAt != null
				&& Duration.between(this.lastFailedLoginAt, now).compareTo(policy.failureReset()) > 0) {
			this.failedLoginAttempts = 0;
		}
		this.failedLoginAttempts++;
		this.lastFailedLoginAt = now;
		if (this.failedLoginAttempts >= policy.permanentAfter()) {
			this.lockedPermanently = true;
		}
		else if (this.failedLoginAttempts % policy.maxAttempts() == 0) {
			Duration wait = policy.waitIncrement().multipliedBy(this.failedLoginAttempts / policy.maxAttempts());
			this.lockedUntil = now.plus((wait.compareTo(policy.maxWait()) > 0) ? policy.maxWait() : wait);
		}
	}

	public void recordLoginSuccess(Instant now) {
		clearLockout();
		this.lastLoginAt = now;
	}

	private void clearLockout() {
		this.failedLoginAttempts = 0;
		this.lastFailedLoginAt = null;
		this.lockedUntil = null;
		this.lockedPermanently = false;
	}

	public boolean isLocked(Instant now) {
		return this.lockedPermanently || (this.lockedUntil != null && this.lockedUntil.isAfter(now));
	}

	public boolean isLockedPermanently() {
		return this.lockedPermanently;
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
