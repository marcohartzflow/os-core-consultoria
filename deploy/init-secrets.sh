#!/usr/bin/env bash
# Creates deploy/secrets/ with the files Compose mounts as secrets. Safe to run again: an existing
# file is never overwritten (a new MFA key would lock everyone out of their second factor, a new
# database password would not match the one the database was created with).
#
#   db_superuser_password     generated here; Postgres superuser (postgres), administration only
#   db_owner_password         generated here; os_owner, owner of the schema, used by the migrate service
#   db_app_password           generated here; os_app, the API's role (table privileges only)
#   bootstrap_admin_password  generated here; first administrator's password, to be replaced at the
#                             first login. Empty the file afterwards (: > secrets/bootstrap_admin_password)
#   mfa_encryption_key        generated here; back it up with the database backups' private key
#   anthropic_api_key         empty: paste the key (printf '%s' 'sk-ant-...' > secrets/anthropic_api_key)
#   openai_api_key            empty: optional; with a key the OpenAI models of os.ai.models are offered
#   mail_password             empty unless SMTP needs a password
set -euo pipefail
umask 077
cd "$(dirname "$0")"
mkdir -p secrets
chmod 700 secrets

create() {
  local file="secrets/$1"
  if [[ -e "$file" ]]; then
    echo "kept      $file"
    return
  fi
  printf '%s' "$2" > "$file"
  echo "created   $file"
}

create db_superuser_password "$(openssl rand -base64 32 | tr -d '\n')"
create db_owner_password "$(openssl rand -base64 32 | tr -d '\n')"
create db_app_password "$(openssl rand -base64 32 | tr -d '\n')"
create bootstrap_admin_password "$(openssl rand -base64 32 | tr -d '\n')"
create mfa_encryption_key "$(openssl rand -base64 32 | tr -d '\n')"
create anthropic_api_key ""
create openai_api_key ""
create mail_password ""

# 0644, not 0600: Compose mounts file secrets as bind mounts with the host's owner and mode
# ("uid, gid and mode ... are silently ignored" for file secrets,
# https://docs.docker.com/reference/compose-file/services/#secrets), and the readers are not the
# owner of these files: the postgres user (uid 999) runs postgres-roles.sh, the API and migrate run
# as uid 1001. A group would not help either: the deploy user can only give the files a group it
# belongs to, and the postgres entrypoint (gosu) drops supplementary groups added by Compose. What
# keeps other host users out is the directory, 0700; inside each container only its own user runs.
chmod 644 secrets/*
[[ -s secrets/anthropic_api_key ]] || echo "next: put the Anthropic API key in deploy/secrets/anthropic_api_key"
