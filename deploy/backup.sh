#!/usr/bin/env bash
# Dumps the database to a compressed file and prunes old dumps. Run from cron, e.g. daily at 02:00:
#   0 2 * * * /opt/os/deploy/backup.sh >> /var/log/os-backup.log 2>&1
# Copy the backup directory off the host (object storage, another server). Test a restore regularly:
#   gunzip -c backups/os-<data>.sql.gz | docker compose exec -T postgres psql -U os -d os
set -euo pipefail
cd "$(dirname "$0")"
dir="${BACKUP_DIR:-./backups}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$dir"
chmod 700 "$dir"
file="$dir/os-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T postgres pg_dump -U os -d os --no-owner --no-privileges | gzip > "$file"
find "$dir" -name 'os-*.sql.gz' -mtime +"$keep_days" -delete
echo "$file"
