#!/bin/sh
set -eu
case "${APP_ENV:?APP_ENV required}" in
  local|dev) ;;
  *) echo 'The test database is only available in local/dev.' >&2; exit 1 ;;
esac
# Run on every development start, including a previously initialized data directory.
if [ "$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname = 'status_test'")" != 1 ]; then
  createdb status_test
fi
echo 'Development test database is ready.'
