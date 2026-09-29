package com.maximusflow.os.auth.internal;

import java.time.Clock;

import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.AccountSnapshot;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.UserDirectory;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsPasswordService;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/**
 * Adapts the IAM module's accounts to Spring Security. Also upgrades stored hashes: after a
 * successful login with a hash made by an older algorithm (bcrypt imported from a legacy system) or
 * weaker Argon2 parameters, {@code DaoAuthenticationProvider} hands the freshly encoded password here.
 */
@Service
class OsUserDetailsService implements UserDetailsService, UserDetailsPasswordService {

	private final UserDirectory userDirectory;

	private final Clock clock;

	OsUserDetailsService(UserDirectory userDirectory, Clock clock) {
		this.userDirectory = userDirectory;
		this.clock = clock;
	}

	@Override
	public UserDetails loadUserByUsername(String email) {
		AccountSnapshot account = this.userDirectory.findByEmail(email)
			.orElseThrow(() -> new UsernameNotFoundException("Unknown account"));
		return principalOf(account);
	}

	@Override
	public UserDetails updatePassword(UserDetails user, @Nullable String newPassword) {
		OsPrincipal principal = (OsPrincipal) user;
		if (newPassword != null) {
			this.userDirectory.upgradePasswordHash(principal.getId(), newPassword);
		}
		return this.userDirectory.findById(principal.getId()).<UserDetails>map(this::principalOf).orElse(user);
	}

	OsPrincipal principalOf(AccountSnapshot account) {
		boolean enabled = account.status() == AccountStatus.ACTIVE && account.passwordHash() != null;
		// Disabled accounts fail the pre-authentication check before any password comparison, so a
		// placeholder hash is never compared.
		String password = (account.passwordHash() != null) ? account.passwordHash() : "{disabled}";
		return new OsPrincipal(account.id(), account.email(), account.name(), password, enabled,
				!account.isLocked(this.clock.instant()), account.permissions(), account.passwordChangeRequired(),
				account.mfaEnabled(), account.mfaRequired());
	}

}
