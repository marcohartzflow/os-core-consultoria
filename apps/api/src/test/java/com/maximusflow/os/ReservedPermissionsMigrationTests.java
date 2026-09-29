package com.maximusflow.os;

import java.util.List;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * V11 on a database that already has custom roles holding what became reserved: the permissions
 * are removed from custom roles only, the rest stays, and every change is in the audit trail.
 */
class ReservedPermissionsMigrationTests {

	@Test
	void customRolesLoseReservedPermissionsAndTheSystemRoleKeepsThem() {
		try (var postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:18"))) {
			postgres.start();
			var dataSource = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(),
					postgres.getPassword());
			var jdbc = new JdbcTemplate(dataSource);
			Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").target("10").load().migrate();

			UUID system = role(jdbc, "Administrador", true, "iam.role.create", "iam.user.anonymize", "tasks.task.read");
			UUID helpdesk = role(jdbc, "Helpdesk", false, "iam.user.read", "iam.user.mfa.reset", "iam.user.update");
			UUID roleAdmins = role(jdbc, "Gestor de roles", false, "iam.role.create", "iam.role.update",
					"iam.role.delete", "iam.role.read");
			UUID readers = role(jdbc, "Leitura", false, "tasks.task.read");

			Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate();

			assertThat(permissions(jdbc, system)).containsExactly("iam.role.create", "iam.user.anonymize",
					"tasks.task.read");
			assertThat(permissions(jdbc, helpdesk)).containsExactly("iam.user.read", "iam.user.update");
			assertThat(permissions(jdbc, roleAdmins)).containsExactly("iam.role.read");
			assertThat(permissions(jdbc, readers)).containsExactly("tasks.task.read");

			List<String> audited = jdbc.queryForList(
					"SELECT entity_id || ' ' || (details->'removed')::text FROM audit_event"
							+ " WHERE action = 'iam.role.reserved_permissions_removed' ORDER BY details->>'name'",
					String.class);
			assertThat(audited).containsExactly(
					roleAdmins + " [\"iam.role.create\", \"iam.role.delete\", \"iam.role.update\"]",
					helpdesk + " [\"iam.user.mfa.reset\"]");
		}
	}

	private static UUID role(JdbcTemplate jdbc, String name, boolean system, String... permissions) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO roles (id, name, is_system, created_at, updated_at) VALUES (?, ?, ?, now(), now())", id,
				name, system);
		for (String permission : permissions) {
			jdbc.update("INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)", id, permission);
		}
		return id;
	}

	private static List<String> permissions(JdbcTemplate jdbc, UUID role) {
		return jdbc.queryForList("SELECT permission FROM role_permissions WHERE role_id = ? ORDER BY permission",
				String.class, role);
	}

}
