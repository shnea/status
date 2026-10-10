#!/bin/sh
# Prepare only allowlisted runtime files. No upload and no server changes.
. "$(dirname -- "$0")/common.sh"
mode="${1-none}"
files=$(setting RUNTIME_FILES)
case "$mode" in
    none) ;;
    plain) select_env prod; validate_env; files="$files .env.prod";;
    sops) files="$files $(setting SOPS_RUNTIME_FILES) .env.prod.sops.env";;
    *) fail 'Usage: export-runtime.sh none|plain|sops';;
esac
for relative in $files; do
    case "$relative" in /*|../*|*/../*|*/..) fail 'Runtime paths must stay within the project.';; esac
    [ -f "$PROJECT_ROOT/$relative" ] || fail "Missing runtime file: $relative"
done
mkdir -p "$PROJECT_ROOT/.runtime"
destination=$(mktemp -d "$PROJECT_ROOT/.runtime/runtime-XXXXXX")
for relative in $files; do
    mkdir -p "$(dirname -- "$destination/$relative")"
    cp "$PROJECT_ROOT/$relative" "$destination/$relative"
done
[ "$mode" != plain ] || chmod 600 "$destination/.env.prod"
printf 'Runtime files prepared (%s): %s\n' "$mode" "$destination"
printf 'No files were sent and no server was changed.\n'
