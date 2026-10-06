#!/usr/bin/env bash
# Updates a running instance.
#
#   deploy/update.sh <tag>   pulls os-api and os-web at <tag> from OS_IMAGE_REPOSITORY (.env or the
#                            environment) and restarts. Used by the CD workflow (deploy/ci-deploy.sh);
#                            rolling back is running it again with an earlier tag.
#   deploy/update.sh         builds the images from the checked-out sources on this host instead
#                            (first install without CI, or a server without registry access).
#
# Steps:
#   1. Backup, unless postgres is not running (first install: there is nothing to back up, and
#      backup.sh needs the database up).
#   2. Images: pull (or build) the new version.
#   3. Migrations: the one-shot migrate service (Flyway, as the schema owner) runs with the new image
#      while the running API keeps serving. Migrations are backward compatible (CONTRIBUTING.md,
#      parallel change), so the old API works on the new schema; a failed migration is rolled back by
#      Flyway's transaction and stops the update here, with the portal still up on the old version.
#   4. Restart: `up --wait` recreates the API and the web on the new images, then brings every other
#      service up to date, and returns only when every service is running and healthy; an API that
#      never becomes healthy makes this script, and the CD job that ran it, fail.
#   5. Only then .env records the new tag (a failed update leaves it naming the version that runs),
#      .deployed-tags gets it appended, and local images of every tag but the last three deployed
#      are removed, so the disk does not fill up with one image set per deploy. Rolling back further
#      pulls the images from the registry again.
set -euo pipefail
cd "$(dirname "$0")"

tag="${1:-}"
# Time for the migrations and the API to start on a small server.
wait_seconds=300
# Deployed versions whose images stay on the host (the running one and the two before it).
keep_deployed=3
trap '[[ $? -eq 0 ]] || { docker compose ps; echo "update failed: docker compose logs migrate api" >&2; }' EXIT

# An assignment, so that a failing `docker compose ps` stops the script (set -e) instead of
# silently skipping the backup.
postgres_running="$(docker compose ps --status running -q postgres)"
if [[ -n "$postgres_running" ]]; then
  ./backup.sh > /dev/null
else
  echo "postgres is not running: no backup before this update (first install)"
fi

if [[ -n "$tag" ]]; then
  [[ -f .env ]] || { echo "deploy/.env not found; copy .env.example first" >&2; exit 1; }
  repository="${OS_IMAGE_REPOSITORY:-$(sed -n 's/^OS_IMAGE_REPOSITORY=//p' .env)}"
  [[ -n "$repository" ]] || { echo "Set OS_IMAGE_REPOSITORY (e.g. ghcr.io/<owner>) in .env or the environment" >&2; exit 1; }
  previous="$(sed -n 's/^OS_IMAGE_TAG=//p' .env)"
  # Variables of the environment win over .env in Compose: the new version is used by the commands
  # below, and written to .env only once it runs.
  export OS_IMAGE_REPOSITORY="$repository" OS_IMAGE_TAG="$tag"
  docker compose pull api web
else
  docker compose pull --ignore-buildable
  docker compose build
fi

docker compose run --rm -T migrate
# The API, then the web, each alone (--no-deps), so the portal is down only while each restarts:
# a plain `up` would run the migrate service again with the API already stopped (the API depends on
# it), and would stop the web together with the API, the web then waiting on requests to the API
# that is gone. Then everything else converges (a new Postgres or Caddy image, a changed setting);
# services already up to date are left running.
docker compose up -d --no-deps --wait --wait-timeout "$wait_seconds" api
docker compose up -d --no-deps --wait --wait-timeout "$wait_seconds" web
docker compose up -d --remove-orphans --wait --wait-timeout "$wait_seconds"

if [[ -n "$tag" ]]; then
  set_var() { grep -q "^$1=" .env && sed -i.bak "s|^$1=.*|$1=$2|" .env || printf '%s=%s\n' "$1" "$2" >> .env; rm -f .env.bak; }
  set_var OS_IMAGE_REPOSITORY "$repository"
  set_var OS_IMAGE_TAG "$tag"
  if [[ -n "$previous" && "$previous" != "$tag" ]]; then
    printf '%s\n' "$previous" > .previous-tag
  fi
  # The order of deploys, not the images' creation dates: two commits can build identical images,
  # and a rollback deploys an old one. A removal that fails (an image still in use) never fails the
  # update: the new version already runs.
  printf '%s\n' "$tag" >> .deployed-tags
  keep="$(tac .deployed-tags | awk '!seen[$0]++' | head -n "$keep_deployed")"
  for name in os-api os-web; do
    docker image ls "$repository/$name" --format '{{.Tag}}' | { grep -vxF "$keep" || true; } \
      | while read -r old; do docker image rm "$repository/$name:$old" > /dev/null || true; done
  done
fi

docker image prune -f > /dev/null
docker compose ps
