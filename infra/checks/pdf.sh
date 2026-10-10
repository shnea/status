#!/bin/sh
set -eu
mkdir -p /work /artifacts/pdf
tar -C /source --exclude=node_modules --exclude=.next --exclude=test-results --exclude=playwright-report --exclude='*.tsbuildinfo' -cf - . | tar -C /work -xf -
cd /work
npm ci --no-audit --no-fund
cp /pdf-source/server.mjs /work/pdf-worker.mjs
cp /scripts/pdf-check.mjs /work/pdf-check.mjs
node /work/pdf-check.mjs
for template in swiss hud google-flat modern-flat premium-dark; do
  python3 /scripts/check-pdf.py "/artifacts/pdf/portfolio-$template.pdf"
  pdftoppm -scale-to 1400 -png "/artifacts/pdf/portfolio-$template.pdf" "/artifacts/pdf/$template-page"
done
