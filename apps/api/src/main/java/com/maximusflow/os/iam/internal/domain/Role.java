package com.maximusflow.os.iam.internal.domain;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import com.maximusflow.os.common.persistence.AuditableEntity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import org.jspecify.annotations.Nullable;

@Entity
@Table(name = "roles")
public class Role extends AuditableEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(nullable = false, unique = true, length = 100)
	private String name;

	@Column(length = 500)
	private @Nullable String description;

	/** System roles are created by the application, cannot be deleted and always hold every permission. */
	@Column(name = "is_system", nullable = false)
	private boolean system;

	@ElementCollection(fetch = FetchType.EAGER)
	@CollectionTable(name = "role_permissions", joinColumns = @JoinColumn(name = "role_id"))
	@Column(name = "permission", nullable = false, length = 150)
	private Set<String> permissions = new HashSet<>();

	protected Role() {
	}

	private Role(String name, @Nullable String description, boolean system, Set<String> permissions) {
		this.name = name.strip();
		this.description = description;
		this.system = system;
		this.permissions = new HashSet<>(permissions);
	}

	public static Role create(String name, @Nullable String description, Set<String> permissions) {
		return new Role(name, description, false, permissions);
	}

	public static Role system(String name, String description, Set<String> permissions) {
		return new Role(name, description, true, permissions);
	}

	public void update(String name, @Nullable String description, Set<String> permissions) {
		this.name = name.strip();
		this.description = description;
		this.permissions = new HashSet<>(permissions);
	}

	public void grantAll(Set<String> permissions) {
		this.permissions.addAll(permissions);
	}

	public UUID getId() {
		return this.id;
	}

	public String getName() {
		return this.name;
	}

	public @Nullable String getDescription() {
		return this.description;
	}

	public boolean isSystem() {
		return this.system;
	}

	public Set<String> getPermissions() {
		return this.permissions;
	}

}
