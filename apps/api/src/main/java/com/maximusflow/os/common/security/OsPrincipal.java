package com.maximusflow.os.common.security;

import java.io.Serial;
import java.io.Serializable;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/**
 * Authenticated user as stored in the HTTP session. Authorities are the user's effective permission
 * keys. The password hash is erased right after authentication and never leaves the JVM.
 */
public final class OsPrincipal implements UserDetails, CredentialsContainer, Serializable {

	@Serial
	private static final long serialVersionUID = 1L;

	private final UUID id;

	private final String email;

	private final String name;

	private @Nullable String password;

	private final boolean enabled;

	private final boolean accountNonLocked;

	private final List<GrantedAuthority> authorities;

	private final boolean passwordChangeRequired;

	public OsPrincipal(UUID id, String email, String name, @Nullable String password, boolean enabled,
			boolean accountNonLocked, Set<String> permissions) {
		this(id, email, name, password, enabled, accountNonLocked, permissions, false);
	}

	public OsPrincipal(UUID id, String email, String name, @Nullable String password, boolean enabled,
			boolean accountNonLocked, Set<String> permissions, boolean passwordChangeRequired) {
		this.id = id;
		this.email = email;
		this.name = name;
		this.password = password;
		this.enabled = enabled;
		this.accountNonLocked = accountNonLocked;
		this.authorities = permissions.stream().sorted().map(SimpleGrantedAuthority::new)
			.map(GrantedAuthority.class::cast).toList();
		this.passwordChangeRequired = passwordChangeRequired;
	}

	/** True until the person replaces a password someone else chose for them. */
	public boolean isPasswordChangeRequired() {
		return this.passwordChangeRequired;
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

	public boolean hasPermission(String permission) {
		return this.authorities.stream().anyMatch((a) -> a.getAuthority().equals(permission));
	}

	@Override
	public Collection<? extends GrantedAuthority> getAuthorities() {
		return this.authorities;
	}

	@Override
	public @Nullable String getPassword() {
		return this.password;
	}

	@Override
	public String getUsername() {
		return this.email;
	}

	@Override
	public boolean isEnabled() {
		return this.enabled;
	}

	@Override
	public boolean isAccountNonLocked() {
		return this.accountNonLocked;
	}

	@Override
	public void eraseCredentials() {
		this.password = null;
	}

	@Override
	public boolean equals(Object o) {
		return o instanceof OsPrincipal other && this.id.equals(other.id);
	}

	@Override
	public int hashCode() {
		return Objects.hash(this.id);
	}

	@Override
	public String toString() {
		return "OsPrincipal[" + this.id + ", " + this.email + "]";
	}

}
