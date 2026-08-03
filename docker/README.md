# react-lazy-load service

Serverless service that stores, builds, and serves versioned remote React components. All persistent data lives in a `storage-obj` service; local disk is only disposable build cache.

The semantic model and full design live in the project docs — start at `/doc/react-lazy-load_service.md`.

## Folder Layout

```text
docker/
  config/
    config.yaml            service config (config.0.yaml = gitignored local override)
  script/
    launch.sh              launcher for both local test mode and docker mode
    submit_comp.py         submit a local component folder as one new version
  src/
    server.js              HTTP api + comp file serving + websocket
    storage.js             storage-obj HTTP client
    backend/               config, ids, time, resource layer, task layer, task runner
      build-comp/          Vite scaffold the task runner copies into each pattern-1 build
    manage-page/           Vite + React + MobX manage frontend (built into docker/data/manage-page)
  comp-demo/
    comp-source/           authoring template for pattern 1 (service builds)
    comp-prebuilt/         authoring template for pattern 2 (upload prebuilt)
```

## Run

```bash
# local test mode (roots simulated under docker/test-data/)
./script/launch.sh

# docker mode (roots at /app, /data, /cache)
./script/launch.sh --mode=docker

# reset local test data roots
./script/launch.sh --clear-dir
```

`launch.sh` installs dependencies, builds the manage page into `docker/data/manage-page`, copies it to `$DATA_ROOT/manage/page/`, and starts `src/server.js`. A reachable `storage-obj` service (configured in `config/config.yaml`) is required before the service reports ready.

## Filesystem Roots

- `APP_ROOT` (`/app`): reserved app root for deploy layout (local test mode uses `test-data/app`)
- `DATA_ROOT` (`/data`): served manage page assets
- `CACHE_ROOT` (`/cache`): pnpm store and per-build work folders `build/{time}_{buildId}/` (disposable; kept for inspection, refer to `/doc/service_task.md#build-work-folder`)

Pattern-1 builds use `src/backend/build-comp/` next to the task runner (not under `APP_ROOT`). Authoring examples under `comp-demo/` are for local submit only; see `/doc/service_example.md`.
