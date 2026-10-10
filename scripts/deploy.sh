#!/bin/sh
# Server-only Pull/Up. ENV mode is explicit; no build or SSH transfer.
set -eu
scripts_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
environment="${1-}"; mode="${2-}"
[ "$environment" = prod ] || { echo 'Usage: deploy.sh prod plain|sops' >&2; exit 1; }
case "$mode" in
    sops) sh "$scripts_dir/env.sh" decrypt prod;;
    plain) ;;
    *) echo 'Select ENV mode: plain or sops.' >&2; exit 1;;
esac
sh "$scripts_dir/docker.sh" validate prod
sh "$scripts_dir/docker.sh" pull prod
sh "$scripts_dir/docker.sh" up prod
