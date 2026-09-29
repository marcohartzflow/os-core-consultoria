#!/usr/bin/env bash
# Restores a backup made by backup.sh into an EMPTY database:
#   docker compose down && docker volume rm os_postgres-data && docker compose up -d postgres
#   deploy/restore.sh backups/os-<stamp>.sql.gz.age     (needs the age private key: BACKUP_AGE_IDENTITY=<file>)
#   docker compose up -d
set -euo pipefail
cd "$(dirname "$0")"
file="${1:?usage: restore.sh <backup file>}"
case "$file" in
  *.age)
    identity="${BACKUP_AGE_IDENTITY:?set BACKUP_AGE_IDENTITY to the age private key file}"
    age -d -i "$identity" "$file" | gunzip -c | docker compose exec -T postgres psql -U os -d os -v ON_ERROR_STOP=1 -q
    ;;
  *.gz)
    gunzip -c "$file" | docker compose exec -T postgres psql -U os -d os -v ON_ERROR_STOP=1 -q
    ;;
  *)
    echo "unknown backup format: $file" >&2
    exit 1
    ;;
esac
echo "restored $file"
