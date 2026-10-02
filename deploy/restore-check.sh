#!/usr/bin/env bash
# Proves that the database dump restores: run from cron, monthly (the Ansible playbook schedules it).
#
# Takes a dump with the same options as backup.sh, loads it into a throwaway PostgreSQL container
# (same image as the instance, no network, data in memory) in one transaction that stops at the
# first error, and compares the restored database with the live one: same tables, same applied
# migration and same number of users. Exits non-zero, with the reason, if anything differs.
#
# What it does not cover: decrypting a real backup. The age private key never lives on this server
# (backup.sh); restoring an encrypted backup with it stays a quarterly drill by whoever holds the key
# (docs/deploy.md, "Backup e restauração").
set -euo pipefail
umask 077
cd "$(dirname "$0")"

image="$(docker compose config --images | grep -m1 '^postgres')"
name="os-restore-check-$$"
trap 'docker rm -f "$name" > /dev/null 2>&1 || true' EXIT

docker run -d --name "$name" --network none --tmpfs /var/lib/postgresql \
  -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" -e POSTGRES_DB=os "$image" > /dev/null
for _ in $(seq 1 60); do
  # Over TCP, as compose.yaml's check: the image's temporary init server listens only on the socket.
  docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d os > /dev/null 2>&1 && break
  sleep 1
done
docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d os > /dev/null

docker compose exec -T postgres pg_dump -U os_owner -d os --no-owner --no-privileges \
    --exclude-table-data=spring_session --exclude-table-data=spring_session_attributes \
  | docker exec -i "$name" psql -q -U postgres -d os -v ON_ERROR_STOP=1 --single-transaction > /dev/null

facts="SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'),
  (SELECT max(version::int) FROM flyway_schema_history WHERE success),
  (SELECT count(*) FROM users)"
live="$(docker compose exec -T postgres psql -U os_owner -d os -tAc "$facts")"
restored="$(docker exec "$name" psql -U postgres -d os -tAc "$facts")"
if [[ "$live" != "$restored" ]]; then
  echo "restore check FAILED: live (tables|migration|users) $live, restored $restored" >&2
  exit 1
fi
echo "restore check ok: tables|migration|users $restored"
