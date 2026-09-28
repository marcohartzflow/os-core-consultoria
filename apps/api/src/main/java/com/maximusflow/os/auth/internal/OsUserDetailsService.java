package com.maximusflow.os.auth.internal;

import java.time.Clock;

import com.maximusflow.os.common.security.OsPrincipal;
import com.maximusflow.os.iam.AccountSnapshot;
import com.maximusflow.os.iam.AccountStatus;
import com.maximusflow.os.iam.UserDirectory;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/** Adapts the IAM module's accounts to Spring Security. */
@Service
class OsUserDetailsService implements UserDetailsService {

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

	OsPrincipal principalOf(AccountSnapshot account) {
		boolean enabled = account.status() == AccountStatus.ACTIVE && account.passwordHash() != null;
		// Disabled accounts fail the pre-authentication check before any password comparison, so a
		// placeholder hash is never compared.
		String password = (account.passwordHash() != null) ? account.passwordHash() : "{disabled}";
		return new OsPrincipal(account.id(), account.email(), account.name(), password, enabled,
				!account.isLocked(this.clock.instant()), account.permissions());
	}

}
