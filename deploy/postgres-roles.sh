#!/usr/bin/env bash
# Database roles, created once when the Postgres volume is empty (the image runs every script in
# /docker-entrypoint-initdb.d only then: https://hub.docker.com/_/postgres, "Initialization scripts").
#
#   postgres  superuser created by the image (POSTGRES_USER default); administration only.
#   os_owner  owns the database "os" and therefore its public schema (pg_database_owner) and every
#             object the migrations create. Used only by the one-shot migrate service (Flyway).
#   os_app    the API. Owns nothing: it cannot alter or drop tables, disable the append-only
#             triggers of audit_event or create objects (not even temporary tables); its table
#             privileges come from the Flyway callback db/migration/afterMigrate.sql, applied after
#             every migration. Connects only to the database "os".
#
# Checked against a real PostgreSQL by apps/api/src/test/java/com/maximusflow/os/DatabaseRolesTests.
# The image runs this as the postgres user, so the secret files must be readable by it
# (init-secrets.sh).
#
# Passwords come from the secret files and reach psql through \set with backquotes, so they never
# appear in a process argument list.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v db="$POSTGRES_DB" <<-'EOSQL'
	\set owner_password `cat /run/secrets/db_owner_password`
	\set app_password `cat /run/secrets/db_app_password`
	CREATE ROLE os_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'owner_password';
	CREATE ROLE os_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
	-- The database owner may create trusted extensions such as pg_trgm (V12).
	ALTER DATABASE :"db" OWNER TO os_owner;
	-- Every database grants CONNECT and TEMPORARY to PUBLIC by default
	-- (https://www.postgresql.org/docs/current/ddl-priv.html). Only os_owner (the owner, all
	-- privileges) and os_app connect to this one, and nobody but the superuser to the others.
	REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
	GRANT CONNECT ON DATABASE :"db" TO os_app;
	REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
	REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
EOSQL
