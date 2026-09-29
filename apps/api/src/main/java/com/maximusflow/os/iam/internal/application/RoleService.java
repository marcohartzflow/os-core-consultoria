package com.maximusflow.os.iam.internal.application;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import com.maximusflow.os.common.audit.AuditRecorder;
import com.maximusflow.os.common.error.ConflictException;
import com.maximusflow.os.common.error.DomainRuleException;
import com.maximusflow.os.common.error.NotFoundException;
import com.maximusflow.os.common.security.RequiresPermission;
import com.maximusflow.os.iam.PermissionCatalog;
import com.maximusflow.os.iam.internal.domain.Role;
import com.maximusflow.os.iam.internal.persistence.RoleRepository;
import com.maximusflow.os.iam.internal.persistence.UserRepository;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class RoleService {

	private final RoleRepository roles;

	private final UserRepository users;

	private final PermissionCatalog catalog;

	private final AuditRecorder audit;

	private final GrantGuard grantGuard;

	RoleService(RoleRepository roles, UserRepository users, PermissionCatalog catalog, AuditRecorder audit,
			GrantGuard grantGuard) {
		this.roles = roles;
		this.users = users;
		this.catalog = catalog;
		this.audit = audit;
		this.grantGuard = grantGuard;
	}

	@Tool(name = "iam_list_roles", description = "Lista as roles do portal com suas permissões.")
	@RequiresPermission(value = "iam.role.read", description = "Ver roles")
	@Transactional(readOnly = true)
	public List<RoleSummary> list() {
		return this.roles.findAllByOrderByNameAsc().stream().map(RoleSummary::of).toList();
	}

	@RequiresPermission(value = "iam.role.read", description = "Ver roles")
	@Transactional(readOnly = true)
	public RoleSummary get(UUID id) {
		return RoleSummary.of(load(id));
	}

	@RequiresPermission(value = "iam.role.create", description = "Criar roles")
	public RoleSummary create(String name, @Nullable String description, Set<String> permissions) {
		if (this.roles.findByName(name.strip()).isPresent()) {
			throw new ConflictException("Já existe uma role com este nome");
		}
		Role role = this.roles.save(Role.create(name, description, validated(permissions)));
		this.audit.record("iam.role.created", "role", role.getId().toString(),
				Map.of("name", role.getName(), "permissions", new TreeSet<>(role.getPermissions())));
		return RoleSummary.of(role);
	}

	@RequiresPermission(value = "iam.role.update", description = "Editar roles e suas permissões")
	public RoleSummary update(UUID id, String name, @Nullable String description, Set<String> permissions) {
		Role role = load(id);
		if (role.isSystem()) {
			throw new DomainRuleException("A role de sistema não pode ser editada");
		}
		// Removing permissions is as sensitive as adding them: only someone who holds everything the
		// role grants may reshape it.
		this.grantGuard.assertCanGrantPermissions(role.getPermissions());
		if (this.roles.existsByNameAndIdNot(name.strip(), id)) {
			throw new ConflictException("Já existe uma role com este nome");
		}
		Set<String> before = new TreeSet<>(role.getPermissions());
		role.update(name, description, validated(permissions));
		this.audit.record("iam.role.updated", "role", role.getId().toString(),
				Map.of("permissionsBefore", before, "permissionsAfter", new TreeSet<>(role.getPermissions())));
		return RoleSummary.of(role);
	}

	@RequiresPermission(value = "iam.role.delete", description = "Excluir roles")
	public void delete(UUID id) {
		Role role = load(id);
		if (role.isSystem()) {
			throw new DomainRuleException("A role de sistema não pode ser excluída");
		}
		this.grantGuard.assertCanGrantPermissions(role.getPermissions());
		if (this.users.existsByRolesContaining(role)) {
			throw new ConflictException("Remova a role dos usuários antes de excluí-la");
		}
		this.roles.delete(role);
		this.audit.record("iam.role.deleted", "role", id.toString(), Map.of("name", role.getName()));
	}

	private Role load(UUID id) {
		return this.roles.findById(id).orElseThrow(() -> new NotFoundException("Role não encontrada"));
	}

	private Set<String> validated(Set<String> permissions) {
		for (String permission : permissions) {
			if (!this.catalog.contains(permission)) {
				throw new DomainRuleException("Permissão desconhecida: " + permission);
			}
		}
		this.grantGuard.assertCanGrantPermissions(permissions);
		return permissions;
	}

}
