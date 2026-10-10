#!/bin/sh
# Local source checkout only; excluded from the server bundle.
. "$(dirname -- "$0")/common.sh"
ACTION="${1-}"; select_env "${2-local}"
case "$ACTION" in build|push|build-push) ;; *) fail 'Usage: build.sh build|push|build-push local|dev|prod [service ...]';; esac
if [ "$#" -ge 2 ]; then shift 2; else set --; fi
for relative in $(setting BUILD_SOURCES); do
    [ -f "$PROJECT_ROOT/$relative" ] || fail 'Build/Push requires the local source checkout.'
done
validate_env
select_services "$(setting BUILD_SERVICES)" "$@"
profile=$(setting BUILD_PROFILE)
case "$ACTION" in push|build-push)
    for service in $SERVICES; do
        image=$(compose_run "$profile" config --images "$service")
        valid_release_image "$image" || fail "Push requires a release registry image: $service"
    done;;
esac
case "$ACTION" in build|build-push) compose_run "$profile" build $SERVICES > /dev/null;; esac
case "$ACTION" in push|build-push) compose_run "$profile" push $SERVICES > /dev/null;; esac
printf '%s completed. No server was changed.\n' "$ACTION"
