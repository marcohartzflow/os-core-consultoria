#!/usr/bin/env bash
# Restores a backup made by backup.sh into an EMPTY database:
#   docker compose down && docker volume rm os_postgres-data && docker compose up -d postgres
#   deploy/restore.sh backups/os-<stamp>.sql.gz.age     (needs the age private key: BACKUP_AGE_IDENTITY=<file>)
#   docker compose up -d
# The new volume gets its roles from postgres-roles.sh (same secrets/ files). The dump is loaded as
# os_owner, so it owns every object again; `up` runs the migrate service, whose Flyway callback
# (afterMigrate.sql) grants os_app its privileges before the api starts. Sessions are not in the
# backup: everyone logs in again.
#
# The backup is first decrypted and decompressed into a private temporary directory (mktemp -d,
# under $TMPDIR; it needs room for the uncompressed dump and holds personal data in clear text until
# the script exits, when it is deleted). It is loaded only if every step of that pipeline succeeded
# (pipefail) and the file ends with pg_dump's trailer, "-- PostgreSQL database dump complete"
# (followed by a \unrestrict line in recent versions, pg_dump 18 among them): age and gunzip write
# out what they decoded before they notice a truncated or corrupted file, and psql reading a stream
# would take the early end of input as the end of the dump and commit it. psql then loads the whole
# file in one transaction and stops at the first error (--single-transaction with ON_ERROR_STOP,
# https://www.postgresql.org/docs/current/app-psql.html): a failed restore leaves the database
# empty, never half loaded.
#
# LGPD: erasures (anonymizations) made after the backup was taken are not in it. Re-apply them after
# a restore: docs/deploy.md, "Backup e restauração".
set -euo pipefail
umask 077
cd "$(dirname "$0")"
file="${1:?usage: restore.sh <backup file>}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
sql="$work/dump.sql"
case "$file" in
  *.age)
    identity="${BACKUP_AGE_IDENTITY:?set BACKUP_AGE_IDENTITY to the age private key file}"
    age -d -i "$identity" "$file" | gunzip -c > "$sql"
    ;;
  *.gz)
    gunzip -c "$file" > "$sql"
    ;;
  *)
    echo "unknown backup format: $file" >&2
    exit 1
    ;;
esac
if ! tail -n 6 "$sql" | grep -qxF -- '-- PostgreSQL database dump complete'; then
  echo "not restored: $file does not end with pg_dump's trailer (truncated or not a pg_dump file)" >&2
  exit 1
fi
docker compose exec -T postgres psql -U os_owner -d os -v ON_ERROR_STOP=1 --single-transaction -q < "$sql"
echo "restored $file"
