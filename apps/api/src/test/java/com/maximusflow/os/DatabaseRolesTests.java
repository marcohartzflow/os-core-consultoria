package com.maximusflow.os;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Map;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.ExecConfig;
import org.testcontainers.images.builder.Transferable;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * The database roles of the reference deploy, on a real PostgreSQL: runs deploy/postgres-roles.sh
 * itself (as the image runs it, the postgres user reading the secret files), migrates as os_owner
 * like the migrate service, then checks that os_app, the API's role, has exactly the privileges
 * docs/deploy.md promises. Failures must be privilege errors (SQLSTATE 42501), not the append-only
 * triggers of audit_event: the role itself must be unable to try.
 */
class DatabaseRolesTests {

	private static final String INSUFFICIENT_PRIVILEGE = "42501";

	private static final String OWNER_PASSWORD = "owner-test-password";

	private static final String APP_PASSWORD = "app-test-password";

	private static final PostgreSQLContainer postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:18"))
		.withDatabaseName("os");

	@BeforeAll
	static void createRolesAndMigrate() throws Exception {
		postgres.start();
		postgres.copyFileToContainer(Transferable.of(OWNER_PASSWORD), "/run/secrets/db_owner_password");
		postgres.copyFileToContainer(Transferable.of(APP_PASSWORD), "/run/secrets/db_app_password");
		postgres.copyFileToContainer(MountableFile.forHostPath(Path.of("../../deploy/postgres-roles.sh")),
				"/docker-entrypoint-initdb.d/postgres-roles.sh");
		var roles = postgres.execInContainer(ExecConfig.builder()
			.user("postgres")
			.command(new String[] { "bash", "/docker-entrypoint-initdb.d/postgres-roles.sh" })
			.build());
		assertThat(roles.getExitCode()).as(roles.getStderr()).isZero();

		// Same locations as the migrate service (afterMigrate.sql grants os_app its privileges). The
		// CONCURRENTLY index builds need Flyway's transactional lock off, as in application.yml.
		Flyway.configure()
			.configuration(Map.of("flyway.postgresql.transactional.lock", "false"))
			.dataSource(postgres.getJdbcUrl(), "os_owner", OWNER_PASSWORD)
			.locations("classpath:db/migration")
			.load()
			.migrate();
	}

	@AfterAll
	static void stop() {
		postgres.stop();
	}

	@Test
	void appCanAppendToTheAuditTrailAndUseItsTables() throws SQLException {
		try (Connection app = app(); var statement = app.createStatement()) {
			statement.executeUpdate("INSERT INTO audit_event (id, occurred_at, origin, action)"
					+ " VALUES (gen_random_uuid(), now(), 'SYSTEM', 'test.roles')");
			statement.executeQuery("SELECT count(*) FROM users").close();
		}
	}

	@Test
	void appCannotRewriteTheAuditTrail() {
		assertDenied("UPDATE audit_event SET action = 'x'");
		assertDenied("DELETE FROM audit_event");
		assertDenied("TRUNCATE audit_event");
		assertDenied("ALTER TABLE audit_event DISABLE TRIGGER audit_event_no_update_delete");
		assertDenied("SET session_replication_role = replica");
	}

	@Test
	void appCannotCreateObjectsOrReadTheMigrationHistory() {
		assertDenied("CREATE TABLE intruder (id int)");
		assertDenied("CREATE TEMPORARY TABLE intruder (id int)");
		assertDenied("SELECT * FROM flyway_schema_history");
	}

	@Test
	void appConnectsOnlyToItsOwnDatabase() {
		String url = "jdbc:postgresql://" + postgres.getHost() + ":" + postgres.getMappedPort(5432) + "/postgres";
		assertThatExceptionOfType(SQLException.class).isThrownBy(() -> DriverManager.getConnection(url, "os_app", APP_PASSWORD).close())
			.satisfies((ex) -> assertThat(ex.getSQLState()).isEqualTo(INSUFFICIENT_PRIVILEGE));
	}

	private static Connection app() throws SQLException {
		return DriverManager.getConnection(postgres.getJdbcUrl(), "os_app", APP_PASSWORD);
	}

	private static void assertDenied(String sql) {
		assertThatExceptionOfType(SQLException.class).as(sql).isThrownBy(() -> {
			try (Connection app = app(); var statement = app.createStatement()) {
				statement.execute(sql);
			}
		}).satisfies((ex) -> assertThat(ex.getSQLState()).as(sql + ": " + ex.getMessage()).isEqualTo(INSUFFICIENT_PRIVILEGE));
	}

}
