# Docker Build Service Design

## Core Concepts

- `Task`: logical identity of a component build target, identified by `taskId`.
- `Task Version`: a submitted definition snapshot of that task. One task can have many task versions.
- `Build`: one build trial for a specific `(taskId, taskVersion)`.
- `Build Version`: identity of one build attempt, identified by `buildVersion`.

Relationship:

- One `Task` has many `Task Version`.
- One `Task Version` can have many `Build`.
- Each `Build` has one `Build Version`.

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
        <taskVersion>/
          taskDescription.yaml
/cache/
  build/
    <taskId>/
      <buildVersion>/
        project/               # copied template + task file overrides
        logs/
          build.log
        result.json
/data/build/
  <taskId>/
    <buildVersion>/            # persisted build output for this build
      manifest.json
      remoteEntry.js
      assets/
/cache/pnpm/
  store/                       # shared pnpm store cache for all tasks in this container
```

Runtime settings:

- `pnpm config set store-dir /cache/pnpm/store`
- Service process user must have write permissions for `/data`, `/cache/build`, and `/cache/pnpm/store`.

## Launch Script

Use `script/launch.sh` for both Docker and local testing.

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
| GET | `/task/build?taskId={taskId}&version=latest` | Get latest build status of a task |
| GET | `/task/getAllVersions?taskId={taskId}` | Get all build versions of a task |
| GET | `/task/logs?taskId={taskId}&buildVersion={buildVersion}` | Get build logs of a specific version |
| POST | `/task/cancel?taskId={taskId}&buildVersion={buildVersion}` | Cancel a build version |
| POST | `/task/delete?taskId={taskId}` | Delete a task and all its data |
| POST | `/task/deleteVersion?taskId={taskId}&taskVersion={taskVersion}` | Delete a specific task version |
| POST | `/task/deleteBuild?taskId={taskId}&buildVersion={buildVersion}` | Delete a specific build version |

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
    "federation.remoteName": "remote_component_type_a",
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

Returns plain text log from `/cache/build/<taskId>/<buildVersion>/logs/build.log`.

### Cancel Task

Cancels queued or running task.

## Build Execution Steps

For each task:

1. Validate payload and reserve `taskId`.
2. Create `/data/task/<taskId>/metadata.yaml` if absent.
3. Save request as `/data/task/<taskId>/versions/<taskVersion>/taskDescription.yaml`.
4. Create `/cache/build/<taskId>/<buildVersion>/project`.
5. Copy `/app/templates/<template>` to build project folder.
6. Apply `files[]` writes.
7. Apply allowed `configOverrides`.
8. Apply allowed dependency updates.
9. Run `pnpm install --frozen-lockfile` (or controlled lockfile refresh mode).
10. Run `pnpm run build`.
11. Validate output contains expected remote entry and manifest.
12. Publish output to `/data/build/<taskId>/<buildVersion>/`.
13. Save `result.json` and mark task as `success` or `failed`.
14. Optional cleanup of old build cache folders after retention period.

## Process Model

Recommended runtime model:

- One Node.js HTTP API process receives requests and manages task state.
- One in-process job queue executes build workers with limited concurrency.
- Each worker runs `pnpm` and build commands in a child process inside `/cache/build/<taskId>/<buildVersion>/project`.

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
- `remoteEntry.js` or named federation entry file
- referenced assets

`manifest.json` example:

```json
{
  "componentType": "component_type_a",
  "version": "2026.03.20",
  "remoteName": "remote_component_type_a",
  "remoteEntry": "remoteEntry.js",
  "exposedModule": "./ComponentEntry",
  "entryExport": "default",
  "files": [
    "remoteEntry.js",
    "assets/main-abc123.js",
    "assets/main-def456.css"
  ]
}
```

## Task Description

Each task is stored as a folder under `DATA_ROOT/task/{taskId}/`. The folder contains a `metadata.yaml` file that describes the task identity and its latest state.

### `metadata.yaml` format

```yaml
taskId: abc123def456
createdAt: 1742400000000
updatedAt: 1742401234567
latestTaskVersion: v3
latestBuildVersion: 2026.03.20-1
```

Fields:

- `taskId` - unique identifier, lowercase alphanumeric, auto-generated if not provided
- `createdAt` - unix timestamp (ms) when the task was first created
- `updatedAt` - unix timestamp (ms) of the last update
- `latestTaskVersion` - the task version string from the most recent build submission. Empty if the task was created but never built.
- `latestBuildVersion` - the build version string from the most recent build submission. Empty if never built.

### Task versions

Each build submission may carry a `taskVersion`, which represents a logical version of the task definition (for example `v1`, `v2`). Task version data is stored under `DATA_ROOT/task/{taskId}/versions/{taskVersion}/taskDescription.yaml`.

## Minimal Security Rules

- Reject path traversal in task file writes.
- Run builds as non-root user.
- Restrict allowed override keys and dependency packages.
- Limit task CPU, memory, and timeout.
- Keep build outputs immutable by `(taskId, buildVersion)`.
- Do not allow overwriting published versions.

## Recommended Implementation Language

Use Node.js for this service:

- Native compatibility with `pnpm`, Vite, and package metadata.
- Easier process control for JS build tools.
- Easy integration with JSON schema validation.

Python is possible, but Node.js generally reduces integration friction for frontend build pipelines.
