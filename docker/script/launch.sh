#!/bin/sh

# Usage (local):  ./launch.sh [--clear-dir]
# Usage (docker): ./launch.sh --mode=docker

set -eu

CLEAR_DIR=0
# Parse optional flags:
# --mode=local|docker and --clear-dir.
for arg in "$@"; do
  case "$arg" in
    --clear-dir) CLEAR_DIR=1 ;;
    --mode=*) MODE="${arg#--mode=}" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_ROOT="$DOCKER_DIR/test-data"

MODE="${MODE:-local}"

# Resolve filesystem roots by mode:
# - docker mode defaults to container paths under /
# - local mode defaults to docker/test-data to simulate container layout
if [ "$MODE" = "docker" ]; then
  ROOT_DIR="${ROOT_DIR:-/}"
  export APP_ROOT="${APP_ROOT:-$ROOT_DIR/app}"
  export DATA_ROOT="${DATA_ROOT:-$ROOT_DIR/data}"
  export CACHE_ROOT="${CACHE_ROOT:-$ROOT_DIR/cache}"
  export PNPM_STORE_DIR="${PNPM_STORE_DIR:-$CACHE_ROOT/pnpm/store}"
else
  ROOT_DIR="${ROOT_DIR:-$LOCAL_ROOT}"
  export APP_ROOT="${APP_ROOT:-$ROOT_DIR/app}"
  export DATA_ROOT="${DATA_ROOT:-$ROOT_DIR/data}"
  export CACHE_ROOT="${CACHE_ROOT:-$ROOT_DIR/cache}"
  USE_GLOBAL_PNPM_STORE="${USE_GLOBAL_PNPM_STORE:-1}"
  # Local mode can reuse global pnpm cache for speed.
  if [ "$USE_GLOBAL_PNPM_STORE" = "1" ]; then
    export PNPM_STORE_DIR="${PNPM_STORE_DIR:-$(pnpm store path)}"
  else
    export PNPM_STORE_DIR="${PNPM_STORE_DIR:-$CACHE_ROOT/pnpm/store}"
  fi
fi

if [ "$CLEAR_DIR" = "1" ]; then
  # Helper mode to reset test data roots.
  echo "Clearing ROOT_DIR: $ROOT_DIR"
  find "$ROOT_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  echo "Done."
  exit 0
fi

mkdir -p "$APP_ROOT" "$DATA_ROOT" "$CACHE_ROOT" "$CACHE_ROOT/build"
if [ "$MODE" = "docker" ]; then
  # Ensure container-local pnpm store path exists.
  mkdir -p "$CACHE_ROOT/pnpm/store"
fi

MANAGE_BUILD_SRC="$DOCKER_DIR/data/manage-page"
MANAGE_RUNTIME_DIR="$DATA_ROOT/manage/page"

sync_manage_page_assets() {
  mkdir -p "$MANAGE_RUNTIME_DIR"
  if [ ! -d "$MANAGE_BUILD_SRC" ]; then
    return
  fi
  has_manage_page_files=0
  for _f in "$MANAGE_BUILD_SRC"/*; do
    if [ -e "$_f" ]; then
      has_manage_page_files=1
      break
    fi
  done
  if [ "$has_manage_page_files" = "1" ]; then
    rm -rf "$MANAGE_RUNTIME_DIR"
    mkdir -p "$MANAGE_RUNTIME_DIR"
    cp -R "$MANAGE_BUILD_SRC/." "$MANAGE_RUNTIME_DIR/"
  fi
}

echo "mode=$MODE"
echo "APP_ROOT=$APP_ROOT"
echo "DATA_ROOT=$DATA_ROOT"
echo "CACHE_ROOT=$CACHE_ROOT"
echo "PNPM_STORE_DIR=$PNPM_STORE_DIR"

cd "$DOCKER_DIR"

WORKSPACE_ROOT=""
_dir="$DOCKER_DIR"
# Detect whether this project is inside a pnpm workspace.
while [ "$_dir" != "/" ]; do
  if [ -f "$_dir/pnpm-workspace.yaml" ] || [ -f "$_dir/pnpm-workspace.yml" ]; then
    WORKSPACE_ROOT="$_dir"
    break
  fi
  _dir=$(dirname "$_dir")
done

if [ -n "$WORKSPACE_ROOT" ]; then
  # Workspace mode: install this package via workspace filter.
  if [ "$MODE" = "docker" ]; then
    pnpm install --frozen-lockfile --filter react-lazy-load-docker...
  else
    # Local workspace runs should not fail on unrelated root lock drift.
    pnpm install --no-frozen-lockfile --filter react-lazy-load-docker...
  fi
else
  # Standalone mode: install only from docker/package.json and local lockfile.
  if [ "$MODE" = "docker" ]; then
    pnpm install --frozen-lockfile --ignore-workspace
  else
    pnpm install --ignore-workspace
  fi
fi

pnpm --dir "$DOCKER_DIR/src/manage-page" run build
sync_manage_page_assets

exec node ./src/server.js
