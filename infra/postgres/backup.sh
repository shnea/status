#!/bin/sh
set -eu
umask 077
[ "${BACKUP_CONFIGURED-}" = true ] || { echo 'Set BACKUP_DIR before creating a backup.' >&2; exit 1; }
: "${PGHOST:?PGHOST required}" "${PGDATABASE:?PGDATABASE required}" "${PGUSER:?PGUSER required}" "${PGPASSWORD:?PGPASSWORD required}"
[ -d /backups ] && [ -w /backups ] || { echo 'The backup directory must exist and be writable.' >&2; exit 1; }
pending=$(mktemp -d /backups/.pending-XXXXXX)
trap 'rm -f "$pending/archive.dump" "$pending/archive.sha256"; rmdir "$pending"' EXIT
trap 'exit 1' HUP INT TERM
suffix=${pending##*.pending-}
name="status-$(date -u +%Y%m%dT%H%M%SZ)-$suffix.dump"
pg_dump --format=custom --no-owner --no-acl --file="$pending/archive.dump"
# Publish only a finished archive. A missing checksum is refused by restore-check.
digest=$(sha256sum "$pending/archive.dump")
printf '%s  %s\n' "${digest%% *}" "$name" > "$pending/archive.sha256"
chmod 600 "$pending/archive.dump" "$pending/archive.sha256"
mv "$pending/archive.dump" "/backups/$name"
mv "$pending/archive.sha256" "/backups/$name.sha256"
printf 'Backup created: %s\n' "$name"
