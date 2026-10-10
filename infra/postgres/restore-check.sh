#!/bin/sh
set -eu
umask 077
case "${BACKUP_FILE-}" in
  status-*.dump) ;;
  *) echo 'BACKUP_FILE must be the basename printed by db-backup.' >&2; exit 1 ;;
esac
case "$BACKUP_FILE" in
  *[!a-zA-Z0-9._-]*) echo 'Invalid backup basename.' >&2; exit 1 ;;
esac
[ "$POSTGRES_DB" = status_restore_check ] && [ "$POSTGRES_USER" = restore_check ] || exit 1
[ -f "/backups/$BACKUP_FILE" ] && [ -f "/backups/$BACKUP_FILE.sha256" ] || { echo 'Archive and checksum are required.' >&2; exit 1; }
# Validate the digest directly, never trust a checksum file to name another path.
expected=$(awk 'NR == 1 {print $1}' "/backups/$BACKUP_FILE.sha256")
case "$expected" in *[!a-f0-9]*|'') echo 'Invalid backup checksum.' >&2; exit 1 ;; esac
[ "${#expected}" -eq 64 ] || { echo 'Invalid backup checksum.' >&2; exit 1; }
actual=$(sha256sum "/backups/$BACKUP_FILE")
[ "${actual%% *}" = "$expected" ] || { echo 'Backup checksum mismatch.' >&2; exit 1; }

/usr/local/bin/docker-entrypoint.sh postgres >/tmp/restore-postgres.log 2>&1 &
database_pid=$!
stop_database() {
  kill -TERM "$database_pid" 2>/dev/null || true
  wait "$database_pid" 2>/dev/null || true
}
trap stop_database EXIT
trap 'exit 1' HUP INT TERM
attempt=0
until pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -gt 60 ] || ! kill -0 "$database_pid" 2>/dev/null; then
    echo 'Isolated restore database failed to start.' >&2
    exit 1
  fi
  sleep 1
done
pg_restore --exit-on-error --single-transaction --no-owner --no-acl \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" "/backups/$BACKUP_FILE"
psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM flyway_schema_history WHERE NOT success) THEN
    RAISE EXCEPTION 'Failed migration in restored database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM flyway_schema_history WHERE version = '10' AND success) THEN
    RAISE EXCEPTION 'Expected application migrations are missing';
  END IF;
  IF EXISTS (SELECT 1 FROM portfolios p LEFT JOIN members m ON m.id = p.member_id WHERE m.id IS NULL) THEN
    RAISE EXCEPTION 'Portfolio owner is missing';
  END IF;
  IF EXISTS (SELECT member_id FROM portfolios GROUP BY member_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'An account has more than one portfolio';
  END IF;
  IF (SELECT count(*) FROM template_settings WHERE implemented) <> 5 THEN
    RAISE EXCEPTION 'Implemented template registry is incomplete';
  END IF;
END $$;
SELECT (SELECT count(*) FROM members) AS members,
       (SELECT count(*) FROM portfolios) AS portfolios,
       (SELECT count(*) FROM uploaded_files) AS files,
       (SELECT count(*) FROM flyway_schema_history WHERE success) AS migrations;
SQL
# The offline test harness can assert its synthetic fixture without changing the runbook command.
if [ -f /checks/restore-fixture.sql ]; then
  psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /checks/restore-fixture.sql
fi
echo 'Backup restored and checked in an offline temporary database.'
