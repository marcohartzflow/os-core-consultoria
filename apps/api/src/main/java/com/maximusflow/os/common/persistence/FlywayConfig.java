package com.maximusflow.os.common.persistence;

import java.sql.SQLException;

import javax.sql.DataSource;

import com.zaxxer.hikari.HikariDataSource;

import org.springframework.boot.LazyInitializationExcludeFilter;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationInitializer;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
class FlywayConfig {

	/**
	 * Profile of the one-shot migrate service of the reference deploy (deploy/compose.yaml): it
	 * connects as the schema owner, migrates and exits; the API itself runs with Flyway disabled
	 * and a role that owns nothing. application-prod.yml makes every other bean lazy and drops the
	 * web server under this profile.
	 */
	static final String MIGRATE_PROFILE = "migrate";

	/**
	 * Migrations borrow connections from the application's pool and change their session settings
	 * ({@code spring.flyway.init-sqls} turns the statement timeout off; a script may set a lock
	 * timeout). Flyway does not undo them, and the pool would hand those connections to requests
	 * for up to half an hour. Retiring them after the migration gives every request a fresh
	 * connection with the pool's own settings.
	 * <p>
	 * Under the {@value #MIGRATE_PROFILE} profile the process ends right after a successful
	 * migration, before the rest of the application is created: Spring Boot has no "migrate and
	 * exit" mode, and starting the whole application would need every secret of the API (the MFA
	 * key, the Anthropic key) in a container that only needs the owner's password. A failed
	 * migration throws as usual and the process exits with an error status.
	 */
	@Bean
	FlywayMigrationStrategy migrateWithCleanConnections(DataSource dataSource, Environment environment) {
		boolean migrateOnly = environment.matchesProfiles(MIGRATE_PROFILE);
		return (flyway) -> {
			flyway.migrate();
			if (migrateOnly) {
				System.exit(0);
			}
			try {
				if (dataSource.isWrapperFor(HikariDataSource.class)) {
					var pool = dataSource.unwrap(HikariDataSource.class).getHikariPoolMXBean();
					if (pool != null) {
						pool.softEvictConnections();
					}
				}
			}
			catch (SQLException ex) {
				throw new IllegalStateException("Could not retire the connections used by the migration", ex);
			}
		};
	}

	/**
	 * With {@code spring.main.lazy-initialization} (set by the {@value #MIGRATE_PROFILE} profile),
	 * the migration itself must still run at startup.
	 */
	@Bean
	@Profile(MIGRATE_PROFILE)
	static LazyInitializationExcludeFilter migrateEagerly() {
		return LazyInitializationExcludeFilter.forBeanTypes(FlywayMigrationInitializer.class);
	}

}
