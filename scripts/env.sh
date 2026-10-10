#!/bin/sh
# Usage: sh scripts/env.sh encrypt|decrypt|check local|dev|prod
. "$(dirname -- "$0")/common.sh"
ACTION="${1-}"; select_env "${2-local}"
case "$ACTION" in encrypt|decrypt|check) ;; *) fail 'Usage: env.sh encrypt|decrypt|check local|dev|prod';; esac
if [ "$ACTION" = check ]; then
    validate_env host; compose_run '' config --quiet > /dev/null
    printf 'Validated %s ENV and host paths.\n' "$ENV_NAME"; exit 0
fi
SOPS_BIN="${SOPS_BIN:-sops}"
command -v "$SOPS_BIN" > /dev/null 2>&1 || fail 'SOPS is required. Use PATH or SOPS_BIN.'
if [ -n "${SOPS_AGE_KEY_FILE-}" ]; then
    [ -f "$SOPS_AGE_KEY_FILE" ] && [ ! -L "$SOPS_AGE_KEY_FILE" ] || fail 'Use an existing age private key file outside the project, without a symlink.'
    key_dir=$(CDPATH= cd -- "$(dirname -- "$SOPS_AGE_KEY_FILE")" && pwd -P)
    case "$key_dir/" in "$PROJECT_ROOT/"*) fail 'Keep the age private key outside the project.';; esac
fi
cipher="$ENV_FILE.sops.env"
if [ "$ACTION" = encrypt ]; then source_file=$ENV_FILE; target_file=$cipher; validate_env
else source_file=$cipher; target_file=$ENV_FILE; fi
[ -f "$source_file" ] || fail 'The selected source ENV does not exist.'
before_hash=$(file_hash "$source_file")
TEMP_ENV=$(mktemp "$PROJECT_ROOT/.env.$ENV_NAME.pending-XXXXXX")
(
    cd "$PROJECT_ROOT"
    if [ "$ACTION" = encrypt ]; then
        "$SOPS_BIN" encrypt --input-type dotenv --output-type dotenv --filename-override ".env.$ENV_NAME.sops.env" --output "$TEMP_ENV" "$source_file"
    else
        "$SOPS_BIN" decrypt --input-type dotenv --output-type dotenv --output "$TEMP_ENV" "$source_file"
    fi
) > "$SCRATCH_DIR/sops-output" 2>&1 || fail 'SOPS failed. Existing files were preserved.'
if [ "$ACTION" = decrypt ]; then
    ENV_FILE=$TEMP_ENV; validate_env; ENV_FILE=$target_file
else
    for name in $(env_read "$ENV_FILE" '' keys); do
        [ -z "$(value "$name")" ] || awk -v key="$name" 'index($0,key "=ENC[")==1 { found=1 } END { exit !found }' "$TEMP_ENV" ||
            fail "SOPS did not encrypt ENV variable: $name"
    done
fi
[ "$(file_hash "$source_file")" = "$before_hash" ] || fail 'ENV changed during processing. Existing files were preserved.'
chmod 600 "$TEMP_ENV"
mv -f -- "$TEMP_ENV" "$target_file"
TEMP_ENV=
printf '%s completed for %s.\n' "$ACTION" "$ENV_NAME"
