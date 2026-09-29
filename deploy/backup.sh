#!/usr/bin/env bash
# Dumps the database to a compressed, encrypted file and prunes old dumps. Run from cron, e.g. daily:
#   0 2 * * * /opt/os/deploy/backup.sh >> /var/log/os-backup.log 2>&1
#
# Encryption uses age (https://age-encryption.org) with the public key in BACKUP_AGE_RECIPIENT; the
# private key stays off this host. A backup without encryption needs BACKUP_PLAINTEXT=yes and is
# only acceptable when the backup directory is itself an encrypted volume.
# BACKUP_UPLOAD_CMD, when set, receives the file path as its argument to copy it off the host, e.g.
#   BACKUP_UPLOAD_CMD="rclone copyto --s3-... " or a script of your own.
# Restore with deploy/restore.sh <file>.
set -euo pipefail
umask 077
cd "$(dirname "$0")"
# Only the BACKUP_* settings are read from .env (values there may contain shell metacharacters).
env_value() { [[ -f .env ]] && sed -n "s/^$1=//p" .env | tail -1 || true; }
BACKUP_DIR="${BACKUP_DIR:-$(env_value BACKUP_DIR)}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-$(env_value BACKUP_KEEP_DAYS)}"
BACKUP_AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-$(env_value BACKUP_AGE_RECIPIENT)}"
BACKUP_PLAINTEXT="${BACKUP_PLAINTEXT:-$(env_value BACKUP_PLAINTEXT)}"
BACKUP_UPLOAD_CMD="${BACKUP_UPLOAD_CMD:-$(env_value BACKUP_UPLOAD_CMD)}"

dir="${BACKUP_DIR:-./backups}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
recipient="${BACKUP_AGE_RECIPIENT:-}"
mkdir -p "$dir"
chmod 700 "$dir"
stamp="$(date +%Y%m%d-%H%M%S)"

if [[ -n "$recipient" ]]; then
  command -v age > /dev/null || { echo "age is not installed (apt install age)" >&2; exit 1; }
  file="$dir/os-$stamp.sql.gz.age"
  docker compose exec -T postgres pg_dump -U os -d os --no-owner --no-privileges | gzip | age -r "$recipient" -o "$file"
elif [[ "${BACKUP_PLAINTEXT:-}" == "yes" ]]; then
  file="$dir/os-$stamp.sql.gz"
  docker compose exec -T postgres pg_dump -U os -d os --no-owner --no-privileges | gzip > "$file"
else
  echo "Set BACKUP_AGE_RECIPIENT (age public key) in deploy/.env, or BACKUP_PLAINTEXT=yes on an encrypted volume" >&2
  exit 1
fi

find "$dir" \( -name 'os-*.sql.gz' -o -name 'os-*.sql.gz.age' \) -mtime +"$keep_days" -delete
if [[ -n "${BACKUP_UPLOAD_CMD:-}" ]]; then
  $BACKUP_UPLOAD_CMD "$file"
fi
echo "$file"
