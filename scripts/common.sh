#!/bin/sh
# Project-local helpers; no Python/jq dependency.
set -eu
set -f
umask 077
PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
SETTINGS="$PROJECT_ROOT/scripts/project.conf"
SCRATCH_DIR=$(mktemp -d "${TMPDIR:-/tmp}/project-run.XXXXXX")
TEMP_ENV=
cleanup() {
    [ -z "$TEMP_ENV" ] || rm -f -- "$TEMP_ENV"
    rm -f -- "$SCRATCH_DIR/compose-output" "$SCRATCH_DIR/hash" "$SCRATCH_DIR/sops-output" "$SCRATCH_DIR/secrets"
    rmdir -- "$SCRATCH_DIR"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
fail() { printf '%s\n' "$*" >&2; exit 1; }
# Parse dotenv as data; never source/eval values.
env_read() {
    awk -v wanted="${2-}" -v mode="${3-value}" '
    function invalid(reason) { print reason > "/dev/stderr"; bad=1; exit 1 }
    {
        sub(/\r$/, "")
        if ($0 ~ /^[ \t]*(#|$)/) next
        if ($0 !~ /^[A-Z][A-Z0-9_]*=/) invalid("Unsupported ENV line. Use KEY=value.")
        pos=index($0,"="); name=substr($0,1,pos-1); value=substr($0,pos+1)
        if (seen[name]++) invalid("Duplicate ENV variable: " name)
        sub(/^[ \t]+/,"",value); sub(/[ \t]+$/,"",value)
        quote=substr(value,1,1)
        if (quote=="\047" || quote=="\"") {
            last=0
            for (i=2;i<=length(value);i++) if (substr(value,i,1)==quote) last=i
            if (!last) invalid("Invalid quoted ENV variable: " name)
            tail=substr(value,last+1); sub(/^[ \t]+/,"",tail)
            if (tail!="" && substr(tail,1,1)!="#") invalid("Invalid quoted ENV variable: " name)
            value=substr(value,2,last-2)
            if (quote=="\"" && value ~ /[\\$]/) invalid("Use single quotes for literal backslash or dollar: " name)
        } else {
            sub(/[ \t]+#.*/,"",value); sub(/[ \t]+$/,"",value)
            if (value ~ /\$/) invalid("Use single quotes for literal dollar: " name)
        }
        if (mode=="keys") print name
        if (mode=="value" && name==wanted) print value
    }
    END { if (bad) exit 1 }
    ' "$1"
}
setting() { env_read "$SETTINGS" "$1"; }
value() { env_read "$ENV_FILE" "$1"; }
select_env() {
    ENV_NAME="${1-local}"
    case "$ENV_NAME" in local|dev|prod) ;; *) fail 'Environment must be local, dev or prod.' ;; esac
    ENV_FILE="$PROJECT_ROOT/.env.$ENV_NAME"
}
validate_env() {
    env_read "$ENV_FILE" '' check
    for name in $(env_read "$ENV_FILE" '' keys); do
        awk -v key="$name" 'BEGIN { if (key in ENVIRON) exit 1 }' ||
            fail "Shell variable overrides ENV file: $name"
    done
    required=$(setting REQUIRED_ENV)
    if [ "$ENV_NAME" = prod ]; then required="$required $(setting PROD_REQUIRED_ENV)"
    else required="$required $(setting NONPROD_REQUIRED_ENV)"; fi
    for name in $required; do [ -n "$(value "$name")" ] || fail "Required ENV variable: $name"; done
    [ "$(value APP_ENV)" = "$ENV_NAME" ] || fail 'APP_ENV does not match the selected environment.'
    if [ "$ENV_NAME" = prod ]; then expected=$(setting PROD_PROFILE)
    else expected=$(setting DEV_PROFILE); fi
    [ "$(value COMPOSE_PROFILES)" = "$expected" ] || fail 'COMPOSE_PROFILES does not match APP_ENV.'
    issuer=$(value ADMIN_OIDC_ISSUER); subject=$(value ADMIN_OIDC_SUBJECT)
    if { [ -n "$issuer" ] && [ -z "$subject" ]; } || { [ -z "$issuer" ] && [ -n "$subject" ]; }; then
        fail 'Both ADMIN_OIDC values must be set together.'
    fi
    for name in PLATFORM_PROJECT_ID PLATFORM_ENVIRONMENT_ID; do
        candidate=$(value "$name")
        printf '%s\n' "$candidate" | awk -F- '
            NF!=5 || length($1)!=8 || length($2)!=4 || length($3)!=4 || length($4)!=4 || length($5)!=12 || /[^0-9a-fA-F-]/ { exit 1 }
        ' || fail "Invalid UUID: $name"
    done
    for name in APP_PORT DB_PORT; do
        candidate=$(value "$name")
        case "$candidate" in ''|*[!0-9]*) fail "Invalid port: $name";; esac
        [ "$candidate" -ge 1 ] && [ "$candidate" -le 65535 ] || fail "Invalid port: $name"
    done
    origin=$(value APP_PUBLIC_URL); origin=${origin%/}
    printf '%s\n' "$origin" | awk '/^https?:\/\/[^\/@?#[:space:]]+$/ { ok=1 } END { exit !ok }' ||
        fail 'APP_PUBLIC_URL must be an HTTP/HTTPS origin.'
    [ "$(value PLATFORM_OIDC_REDIRECT_URI)" = "$origin/callback" ] || fail 'Callback must match APP_PUBLIC_URL/callback.'
    logout=$(value OIDC_POST_LOGOUT_REDIRECT_URI)
    [ "${logout%/}" = "$origin" ] || fail 'Logout origin must match APP_PUBLIC_URL.'
    secure=$(value SESSION_COOKIE_SECURE)
    case "$secure" in true|false) ;; *) fail 'Invalid SESSION_COOKIE_SECURE.';; esac
    case "$origin" in https://*) [ "$secure" = true ] || fail 'HTTPS requires secure session cookies.';; esac
    if [ "$ENV_NAME" = prod ]; then
        case "$origin" in https://*) ;; *) fail 'Production requires HTTPS.';; esac
        for name in BACKEND_APP_IMAGE FRONTEND_APP_IMAGE PDF_APP_IMAGE; do
            valid_release_image "$(value "$name")" || fail "Production requires a release registry image: $name"
        done
    fi
    if [ "${1-}" = host ]; then
        directories=$(setting BASE_DIRECTORIES)
        if [ "$ENV_NAME" = prod ]; then directories="$directories $(setting PROD_DIRECTORIES)"
        else directories="$directories $(setting NONPROD_DIRECTORIES)"; fi
        [ -z "$(value BACKUP_DIR)" ] || directories="$directories BACKUP_DIR"
        for name in $directories; do
            directory=$(value "$name")
            case "$directory" in /*) ;; *) fail "Existing absolute directory required: $name";; esac
            [ -d "$directory" ] || fail "Existing absolute directory required: $name"
        done
        if [ -n "$(value BACKUP_DIR)" ]; then
            # PostgreSQL owns its 0700 directory; compare directory identities
            # without requiring the deployment user to enter the DB directory.
            db_path=$(value DB_DATA_DIR)
            backup_path=$(CDPATH= cd -- "$(value BACKUP_DIR)" && pwd -P)
            while :; do
                [ ! "$backup_path" -ef "$db_path" ] || fail 'BACKUP_DIR must be outside DB_DATA_DIR.'
                [ "$backup_path" != / ] || break
                backup_path=$(dirname -- "$backup_path")
            done
        fi
    fi
}
valid_release_image() {
    case "$1" in */*:latest|*/*:local) return 1;; */*@sha256:*) return 0;; */*:*) return 0;; *) return 1;; esac
}
select_services() {
    allowed=$1; shift
    SERVICES="$*"
    [ -n "$SERVICES" ] || SERVICES=$allowed
    for service in $SERVICES; do
        case " $allowed " in *" $service "*) ;; *) fail "Unknown service: $service";; esac
    done
}
compose_run() {
    profile=$1; shift
    if docker compose version > /dev/null 2>&1; then compose_kind=plugin
    elif command -v docker-compose > /dev/null 2>&1 && docker-compose version > /dev/null 2>&1; then compose_kind=standalone
    else fail 'Docker Compose v2 is required.'; fi
    (
        cd "$PROJECT_ROOT"
        if [ -n "$profile" ]; then set -- --profile "$profile" "$@"; fi
        if [ "$compose_kind" = plugin ]; then set -- docker compose --env-file "$ENV_FILE" -f "$(setting COMPOSE_FILE)" "$@"
        else set -- docker-compose --env-file "$ENV_FILE" -f "$(setting COMPOSE_FILE)" "$@"; fi
        "$@" > "$SCRATCH_DIR/compose-output" 2>&1
    ) || fail 'Compose failed. Raw output was withheld to protect ENV values.'
    cat "$SCRATCH_DIR/compose-output"
}
file_hash() {
    if command -v sha256sum > /dev/null 2>&1; then sha256sum "$1" > "$SCRATCH_DIR/hash"
    elif command -v shasum > /dev/null 2>&1; then shasum -a 256 "$1" > "$SCRATCH_DIR/hash"
    else fail 'sha256sum or shasum is required.'; fi
    awk '{print $1}' "$SCRATCH_DIR/hash"
}
mask_logs() {
    : > "$SCRATCH_DIR/secrets"
    for name in $(env_read "$ENV_FILE" '' keys); do
        case "$name" in *PASSWORD*|*SECRET*|*TOKEN*|*API_KEY*|*PRIVATE_KEY*|*SUBJECT*)
            secret=$(value "$name"); [ -z "$secret" ] || printf '%s\n' "$secret" >> "$SCRATCH_DIR/secrets";;
        esac
    done
    awk 'FILENAME==ARGV[1] { if (length($0)) secrets[++count]=$0; next }
        { text=$0; for(i=1;i<=count;i++) {
            result=""; rest=text
            while((at=index(rest,secrets[i]))>0) {
                result=result substr(rest,1,at-1) "[REDACTED]"; rest=substr(rest,at+length(secrets[i]))
            }
            text=result rest
        } print text }
    ' "$SCRATCH_DIR/secrets" "$SCRATCH_DIR/compose-output"
}
