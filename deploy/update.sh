#!/usr/bin/env bash
# Updates a running instance.
#
#   deploy/update.sh <tag>   pulls os-api and os-web at <tag> from OS_IMAGE_REPOSITORY (.env or the
#                            environment) and restarts. Used by the CD workflow; also how you roll
#                            back: run it again with the previous tag (kept in .previous-tag).
#   deploy/update.sh         builds the images from the checked-out sources on this host instead
#                            (first install without CI, or a server without registry access).
#
# Either way a backup is taken first and Flyway applies migrations when the API boots.
set -euo pipefail
cd "$(dirname "$0")"

tag="${1:-}"
./backup.sh > /dev/null

if [[ -n "$tag" ]]; then
  [[ -f .env ]] || { echo "deploy/.env not found; copy .env.example first" >&2; exit 1; }
  repository="${OS_IMAGE_REPOSITORY:-$(sed -n 's/^OS_IMAGE_REPOSITORY=//p' .env)}"
  [[ -n "$repository" ]] || { echo "Set OS_IMAGE_REPOSITORY (e.g. ghcr.io/<owner>) in .env or the environment" >&2; exit 1; }
  previous="$(sed -n 's/^OS_IMAGE_TAG=//p' .env)"
  [[ -n "$previous" && "$previous" != "$tag" ]] && printf '%s\n' "$previous" > .previous-tag
  set_var() { grep -q "^$1=" .env && sed -i.bak "s|^$1=.*|$1=$2|" .env || printf '%s=%s\n' "$1" "$2" >> .env; rm -f .env.bak; }
  set_var OS_IMAGE_REPOSITORY "$repository"
  set_var OS_IMAGE_TAG "$tag"
  docker compose pull api web
  docker compose up -d --remove-orphans
else
  docker compose pull --ignore-buildable
  docker compose up -d --build --remove-orphans
fi

docker image prune -f > /dev/null
docker compose ps
