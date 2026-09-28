#!/usr/bin/env bash
# Updates a running instance to the checked-out revision: backup, rebuild images, restart, prune.
# Used by the CD workflow over SSH and by hand: cd /opt/os && deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")"
./backup.sh
docker compose pull --ignore-buildable
docker compose up -d --build --remove-orphans
docker image prune -f > /dev/null
docker compose ps
