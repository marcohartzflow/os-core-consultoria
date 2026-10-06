#!/usr/bin/env bash
# The only thing the CD workflow's SSH key can run on the server. The deploy user's authorized_keys
# binds the key to this script (OpenSSH forced command, sshd(8) "AUTHORIZED_KEYS FILE FORMAT"):
#
#   restrict,command="/opt/os/deploy/ci-deploy.sh" ssh-ed25519 AAAA... cd
#
# Whatever the client asks for arrives in SSH_ORIGINAL_COMMAND and must be exactly
# "deploy <40-character commit SHA>"; `restrict` turns off forwarding and the terminal. The deploy
# user can run Docker, which is root on the host, so a leaked key must not open a shell: with this
# script it can only deploy a commit that is already on origin/main.
#
# stdin carries two lines, the registry user and token (the workflow's GITHUB_TOKEN, valid until
# the job ends). They go into a private, temporary Docker config that is deleted on exit, failed
# deploys included: no registry credential stays on the host.
set -euo pipefail
umask 077

read -r verb sha extra <<< "${SSH_ORIGINAL_COMMAND:-}" || true
if [[ "${verb:-}" != deploy || ! "${sha:-}" =~ ^[0-9a-f]{40}$ || -n "${extra:-}" ]]; then
  echo "refused: expected 'deploy <40-character commit SHA>'" >&2
  exit 2
fi

cd "$(dirname "$0")/.."

IFS= read -r registry_user || true
IFS= read -r registry_token || true
[[ -n "${registry_user:-}" && -n "${registry_token:-}" ]] || { echo "refused: registry login missing on stdin" >&2; exit 2; }

git fetch --quiet --prune origin
# Only commits already on main are deployed, whatever the workflow that sent the request.
git merge-base --is-ancestor "$sha" origin/main 2> /dev/null || { echo "refused: $sha is not on origin/main" >&2; exit 2; }
git checkout --quiet --force --detach "$sha"

DOCKER_CONFIG="$(mktemp -d)"
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s' "$registry_token" | docker login ghcr.io -u "$registry_user" --password-stdin > /dev/null
unset registry_token

echo "deploying $sha"
deploy/update.sh "$sha"
