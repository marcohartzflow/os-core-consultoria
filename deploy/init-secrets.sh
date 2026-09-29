#!/usr/bin/env bash
# Creates deploy/secrets/ with the files Compose mounts as secrets. Safe to run again: an existing
# file is never overwritten (a new MFA key would lock everyone out of their second factor, a new
# database password would not match the one the database was created with).
#
#   db_password         generated here
#   mfa_encryption_key  generated here; back it up with the database backups' private key
#   anthropic_api_key   empty: paste the key (printf '%s' 'sk-ant-...' > secrets/anthropic_api_key)
#   mail_password       empty unless SMTP needs a password
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

create db_password "$(openssl rand -base64 32 | tr -d '\n')"
create mfa_encryption_key "$(openssl rand -base64 32 | tr -d '\n')"
create anthropic_api_key ""
create mail_password ""

# The containers run as unprivileged users that are not the owner of these files; the directory
# stays closed to other users of the host.
chmod 644 secrets/*
[[ -s secrets/anthropic_api_key ]] || echo "next: put the Anthropic API key in deploy/secrets/anthropic_api_key"
