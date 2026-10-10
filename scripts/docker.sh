#!/bin/sh
# Usage: sh scripts/docker.sh pull|up|logs|status|validate ENV [service ...]
. "$(dirname -- "$0")/common.sh"
ACTION="${1-}"; select_env "${2-local}"
case "$ACTION" in pull|up|logs|status|validate) ;; *) fail 'Usage: docker.sh pull|up|logs|status|validate local|dev|prod [service ...]';; esac
if [ "$#" -ge 2 ]; then shift 2; else set --; fi
case "$ACTION" in up|validate) validate_env host;; *) validate_env;; esac
if [ "$ENV_NAME" = prod ]; then select_services "$(setting PROD_SERVICES)" "$@"
else select_services "$(setting DEV_SERVICES)" "$@"; fi
compose_run '' config --quiet > /dev/null
case "$ACTION" in
    pull) compose_run '' pull $SERVICES > /dev/null;;
    up) compose_run '' up -d --no-build --wait $SERVICES > /dev/null;;
    status) compose_run '' ps $SERVICES;;
    logs) compose_run '' logs --tail 200 --no-color $SERVICES > /dev/null; mask_logs;;
esac
case "$ACTION" in logs|status) ;; *) printf '%s completed for %s.\n' "$ACTION" "$ENV_NAME";; esac
