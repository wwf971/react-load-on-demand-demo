# Docker Build Service Design

## Core Concepts

- **Task id** (`taskId`): unique id of a component build target. One running system holds many tasks, each keyed by its task id.
- **Task version id** (`taskVersion` in API payloads and on disk): unique id of one submitted definition snapshot for a given task. One task id has many task version ids over time.
- **Task build id** (`buildVersion` in API payloads and on disk): unique id of one build attempt for a given task. One task id can have many task build ids. Each build is tied to a specific task version id at submission time.

Relationship:

- One task id has many task version ids.
- One task version id can be built many times; each attempt has its own task build id.
- Each build is exactly one `(taskId, taskVersion, task build id)` record.

## Container Filesystem Layout

Use a fixed layout inside the container:

```text
/app/
  service/                     # HTTP server source code
  templates/
    react-remote-vite/         # base project template for each build task
      package.json
      pnpm-lock.yaml
      vite.config.js
      src/
        bootstrap.jsx
        entry.jsx
/data/                         # external mounted volume (persistent task metadata)
  task/
    <taskId>/
      metadata.yaml
      versions/
        <taskVersionId>/
          taskDescription.yaml
/cache/
  build/
    <taskId>/
      <taskBuildId>/
        project/               # copied template + task file overrides
        logs/
          build.log
        result.json
/data/build/
  <taskId>/
    <taskBuildId>/             # persisted build output for this build
      manifest.json
      compUrl.js
      assets/
/cache/pnpm/
  store/                       # shared pnpm store cache for all tasks in this container
```

Runtime settings:

- `pnpm config set store-dir /cache/pnpm/store`
- Service process user must have write permissions for `/data`, `/cache/build`, and `/cache/pnpm/store`.

## Launch Script

Use `script/launch.sh` for both Docker and local testing.

- If a parent directory has `pnpm-workspace.yaml`, install runs as that workspace package (`react-lazy-load-docker`). Otherwise install runs only in `docker/` using this folder `pnpm-lock.yaml`.
- Manage UI: build outputs to `docker/data/manage-page/` (`pnpm --filter react-lazy-load-manage-page run build` from the monorepo root, or `pnpm build` inside `docker/src/manage-page`). `launch.sh` copies that tree into `$DATA_ROOT/manage/page/` so `/` redirects to `/manage/` and static files are served there (container: `/data/manage/page/`).
- Docker mode (auto-detected if `/app`, `/data`, `/cache` exist):
  - `APP_ROOT=/app`
  - `DATA_ROOT=/data`
  - `CACHE_ROOT=/cache`
  - `PNPM_STORE_DIR=/cache/pnpm/store`
- Local mode (default if Docker paths do not exist):
  - Root mapping uses `docker/test-data` as simulated `/`
  - `APP_ROOT=<docker>/test-data/app`
  - `DATA_ROOT=<docker>/test-data/data`
  - `CACHE_ROOT=<docker>/test-data/cache`
  - `PNPM_STORE_DIR` defaults to global store path from `pnpm store path`

Examples:

```bash
# Local test (default)
./script/launch.sh

# Force local mode with local pnpm store under test-data/cache
MODE=local USE_GLOBAL_PNPM_STORE=0 ./script/launch.sh

# Force docker mode
MODE=docker ./script/launch.sh
```

## Template Project Structure

Do not scaffold a new React project for each task. Copy from the base template.

Template responsibilities:

- Includes all base build tooling and scripts.
- Exposes one default module path for host loading, for example `./CardComponent`.
- Allows controlled config override fields from task request.
- Keeps dependency list stable to maximize `pnpm` cache reuse.

Example template files:

```text
react-remote-vite/
  package.json
  pnpm-lock.yaml
  vite.config.js
  src/
    entry.jsx                  # default exposed component file (generic)
    index.css
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/task/create` | Create a task without queuing a build |
| POST | `/task/build` | Create a task and queue a build |
| GET | `/task/getAll` | List all tasks |
| GET | `/task/build?taskId={taskId}` | Latest task build status for that task id (uses newest task build id on the server) |
| GET | `/task/getAllVersions?taskId={taskId}` | All task build records for that task id (JSON bodies use `buildVersion` as the task build id) |
| GET | `/task/logs?taskId={taskId}&buildVersion={taskBuildId}` | Build log text for a given task id and task build id |
| POST | `/task/cancel?taskId={taskId}&buildVersion={taskBuildId}` | Cancel a task build |
| POST | `/task/delete?taskId={taskId}` | Delete a task id and all related data |
| POST | `/task/deleteVersion?taskId={taskId}&taskVersion={taskVersionId}` | Delete a task version id under that task id |
| POST | `/task/deleteBuild?taskId={taskId}&buildVersion={taskBuildId}` | Delete cache and publish data for that task build id |

### Build Task Request Body

```json
{
  "componentType": "component_type_a",
  "version": "2026.03.20",
  "taskVersion": "v1",
  "buildVersion": "b1",
  "template": "react-remote-vite",
  "entryModule": "./CardComponent",
  "entryFile": "src/entry.jsx",
  "files": [
    {
      "path": "src/entry.jsx",
      "content": "import React from 'react'\nexport default function Card(){ return <div>hello</div> }\n"
    },
    {
      "path": "src/entry.css",
      "content": ".card-root { padding: 4px; }\n"
    }
  ],
  "configOverrides": {
    "federation.compName": "remote_component_type_a",
    "build.outDir": "dist"
  },
  "dependencies": {
    "runtime": {
      "dayjs": "^1.11.13"
    }
  }
}
```

Notes:

- JSON fields stay as `taskVersion` and `buildVersion`; they carry the **task version id** and **task build id** strings.
- `taskId` is optional. If omitted, server generates a random id containing only `0-9` and `a-z`.
- If `taskId` is provided, it must match `[0-9a-z]+`.
- `files[].path` is relative to task project root only.
- Absolute paths and `..` traversal are rejected.
- `configOverrides` only supports an allowlist of keys.
- `dependencies` should be optional and controlled by allowlist.

### Query Task Status Response Example

Response example:

```json
{
  "taskId": "task_20260315_001",
  "status": "success",
  "startedAt": 1760000000000,
  "finishedAt": 1760000005321,
  "artifactBaseUrl": "https://artifact.example.com/build/task_20260315_001/b1/",
  "manifestUrl": "https://artifact.example.com/build/task_20260315_001/b1/manifest.json"
}
```

Status values:

- `queued`
- `running`
- `success`
- `failed`

### Fetch Build Logs

Returns plain text log from `/cache/build/<taskId>/<taskBuildId>/logs/build.log`.

### Cancel Task

Cancels queued or running task.

## Build Execution Steps

For each task:

1. Validate payload and reserve `taskId`.
2. Create `/data/task/<taskId>/metadata.yaml` if absent.
3. Save request as `/data/task/<taskId>/versions/<taskVersionId>/taskDescription.yaml`.
4. Create `/cache/build/<taskId>/<taskBuildId>/project`.
5. Copy `/app/templates/<template>` to build project folder.
6. Apply `files[]` writes.
7. Apply allowed `configOverrides`.
8. Apply allowed dependency updates.
9. Run `pnpm install --frozen-lockfile` (or controlled lockfile refresh mode).
10. Run `pnpm run build`.
11. Validate output contains expected remote entry and manifest.
12. Publish output to `/data/build/<taskId>/<taskBuildId>/`.
13. Save `result.json` and mark task as `success` or `failed`.
14. Optional cleanup of old build cache folders after retention period.

## Process Model

Recommended runtime model:

- One Node.js HTTP API process receives requests and manages task state.
- One in-process job queue executes build workers with limited concurrency.
- Each worker runs `pnpm` and build commands in a child process inside `/cache/build/<taskId>/<taskBuildId>/project`.

Why this is the default:

- Single service process is simpler to deploy and debug.
- In-process queue is enough for one container and moderate throughput.
- Worker concurrency can be tuned without adding another service.

When to split into multiple processes:

- If you need high parallel build throughput across many containers.
- If API latency must be isolated from heavy build execution.
- If you need distributed scheduling and retry semantics.

Then use:

- API process only for HTTP and metadata updates.
- Separate worker process(es) polling a durable queue.

## Output Artifact Contract

Every successful task must publish:

- `manifest.json`
- `compUrl.js` or named federation entry file
- referenced assets

`manifest.json` example:

```json
{
  "componentType": "component_type_a",
  "version": "2026.03.20",
  "compName": "remote_component_type_a",
  "compUrl": "compUrl.js",
  "modulePath": "./CompEntry",
  "entryExport": "default",
  "files": [
    "compUrl.js",
    "assets/main-abc123.js",
    "assets/main-def456.css"
  ]
}
```

## Task Description

Each task is stored as a folder under `DATA_ROOT/task/{taskId}/`. The folder contains a `metadata.yaml` file that only holds **stable identity and timestamps** for that task id. Anything like “latest task version id” or “latest task build id” is **not** stored there; it is **derived** when needed (see below).

### `metadata.yaml` format

```yaml
taskId: abc123def456
createdAt: 1742400000000
updatedAt: 1742401234567
```

Fields:

- `taskId` - unique task id, lowercase alphanumeric, auto-generated if not provided
- `createdAt` - unix timestamp (ms) when the task was first created
- `updatedAt` - unix timestamp (ms) of the last metadata-related update (for example a new task version snapshot saved)

Older deployments may still have `latestTaskVersion` / `latestBuildVersion` keys in this file; they are **ignored**. New writes only persist the three fields above.

### Deriving “latest” without storing it

- **Latest task build id (for a given task id):** scan `CACHE_ROOT/build/{taskId}/<taskBuildId>/result.json`, parse each file, and take the build whose `finishedAt` (or `startedAt` if unfinished) is greatest. That is how “current” build status is obtained; there is no separate canonical pointer in `metadata.yaml`.
- **Latest task version id (for a given task id):** each snapshot under `DATA_ROOT/task/{taskId}/versions/{taskVersionId}/taskDescription.yaml` includes a **`createdAt`** (unix ms) set on first write and kept on later overwrites of the same version id. The task version id with the largest `createdAt` is the natural “newest version” ordering. (If you need tie-breaks, use lexical order of `taskVersionId` as a secondary key.)

### Task version ids

Each build submission may carry a `taskVersion` field (the task version id), for example `v1`, `v2`. That snapshot is stored under `DATA_ROOT/task/{taskId}/versions/{taskVersionId}/taskDescription.yaml`, including **`createdAt`** as above.

## Minimal Security Rules

- Reject path traversal in task file writes.
- Run builds as non-root user.
- Restrict allowed override keys and dependency packages.
- Limit task CPU, memory, and timeout.
- Keep build outputs immutable by `(taskId, task build id)`.
- Do not allow overwriting published versions.

## Recommended Implementation Language

Use Node.js for this service:

- Native compatibility with `pnpm`, Vite, and package metadata.
- Easier process control for JS build tools.
- Easy integration with JSON schema validation.

Python is possible, but Node.js generally reduces integration friction for frontend build pipelines.
