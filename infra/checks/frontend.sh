#!/bin/sh
set -eu
mkdir -p /work
tar -C /source --exclude=node_modules --exclude=.next --exclude=test-results --exclude=playwright-report --exclude='*.tsbuildinfo' -cf - . | tar -C /work -xf -
cd /work
npm ci --no-audit --no-fund
case "${CHECK_MODE:-build}" in
  build)
    npm run lint
    npm run typecheck
    npm run format:check
    npm run build
    ;;
  browser)
    sh /scripts/media-fixtures.sh
    npm test
    ;;
  *)
    echo "Unsupported CHECK_MODE" >&2
    exit 1
    ;;
esac
