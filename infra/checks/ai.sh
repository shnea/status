#!/bin/sh
set -eu
tar -C /source --exclude=node_modules --exclude=.next --exclude=test-results --exclude=playwright-report --exclude='*.tsbuildinfo' -cf - . | tar -C /work -xf -
npm ci --no-audit --no-fund --ignore-scripts
mkdir -p /artifacts/ai
cp /scripts/ai-check.mjs /work/ai-check.mjs
node /work/ai-check.mjs
