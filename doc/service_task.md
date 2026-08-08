# Backend Task

Building a version (pattern 1) is a backend task. The API request only records the task durably and returns; a task runner executes it later. Task records and outbox events live in the service's single storage-obj space as types 8 and 9, so task history survives restarts and is visible to every instance.

## Task Record

One type-8 JSON object per task. `taskId` uses `ms_48` format.

```jsonc
{
  "objectKind": "task",
  "schemaVersion": 1,
  "taskId": "m3kfj2b7qz9",
  "taskType": 1,                 // 1 = version build
  "taskStatus": 1,               // 1 undergoing, 2 success, 3 fail, 4 cancel
  "taskStatusText": "running",
  "operationInfo": {
    "compId": "a1b2c3d4e5f6",
    "versionId": "m3kfj29a0x1",
    "buildId": "m3kfj2b7qz8"     // build record this task will fill
  },
  "taskProgress": {
    "progressList": [
      { "taskStatus": 1, "taskStatusMessage": "build queued", "updateAt": "20260802_23050000+09" }
    ]
  },
  "resultInfo": null,            // on success: { "fileGroupId": "...", "fileCount": 7, "sizeBytesTotal": 123456 }
  "exitInfo": null,              // on fail/cancel: { "exitType": 3, "exitMessage": "...", "exitAt": "..." }
  "isCancelRequested": false,
  "createdAt": "20260802_23050000+09",
  "startedAt": null,
  "finishedAt": null
}
```

All timestamps use the project time format (`20260520_23250530+09`), refer to [service_resource.md](./service_resource.md#time-format).

Status rules:

- new task starts as `1`; terminal statuses are `2`, `3`, `4`; `finishedAt` is set only for terminal statuses.
- `progressList` is append-only; `taskStatusText` mirrors the latest entry.
- `POST /api/task/cancel` only sets `isCancelRequested = true`; the runner checks it between steps and marks status `4`.

## Outbox Event

One type-9 JSON object per event:

```jsonc
{
  "objectKind": "outbox-event",
  "schemaVersion": 1,
  "eventId": "m3kfj2b7qza",
  "taskId": "m3kfj2b7qz9",
  "eventType": "task-created",
  "createdAt": "20260802_23050000+09"
}
```

An event object exists while pending. Marking it done is a soft delete of the event object (storage-obj keeps its history, so handled events remain auditable). Polling for pending events is just listing the non-deleted objects of the outbox space.

Why an outbox, even with a single service process: it splits "task durably accepted" from "runner picked it up". The API handler writes task record then outbox event before responding; if the process dies right after, the pending event is still there and a restarted runner picks it up. Without it, an accepted-but-not-started task would silently vanish.

Claiming has no compare-and-set in storage-obj, so exactly one task runner loop runs per deployment (build concurrency is handled inside that loop, bounded by config `build.concurrency`). This is a stated limitation, acceptable for this service's throughput.

## Task Runner

```text
taskRunner()                              one loop per deployment
  -> poll type-9 outbox objects for pending events, oldest first
  -> for each event
      -> read task record; if terminal already -> mark event done, continue
      -> runBuild(task)
      -> mark event done

runBuild(task)
  -> set taskStatus running, startedAt          [+ websocket push]
  -> read comp record, version record, source file group from storage-obj
  -> prepare work folder (see Build Work Folder below)
      -> copy context information into context/
      -> copy src/backend/build-comp into project/, write source files into it
      -> generate federation config from version metadata (packages, federation entries)
  -> pnpm install                                [progress + websocket push]
  -> pnpm run build                              [progress + websocket push]
  -> on success, write in visibility order:
      1. upload build log + build output file group
      2. append build record to version.buildList (buildStatus 2, output)
      3. task terminal success
      4. event done
  -> on fail/cancel/timeout: same order, build record gets buildStatus 3 or 4, output null
```

The build record is appended to `version.buildList` only when the build reaches terminal state. So `buildList` holds finished builds only; an ongoing build is visible as an undergoing task. A retry is always a new task producing a new build record; existing records are never reused (refer to [service_resource.md](./service_resource.md#build-record)).

Restart recovery: on boot, the runner scans pending outbox events as usual. For an event whose task is undergoing but has no live worker (previous process died mid-build), the runner first checks whether the build record for `operationInfo.buildId` already landed in `version.buildList` (the crash happened between steps 2 and 3 above): if yes, the task is finalized with that build's status; if no, the task is marked fail with `exitMessage: "runner restarted"`. What happens after a failure is backend policy config, independent from record semantics: default is to simply leave the build in failed state; a retry can be triggered any time through `POST /api/comp/version/build`, which creates a fresh task for the same frozen source.

## Build Work Folder

Each build runs in its own folder under the disposable cache root, named by creation time (project time format) plus `buildId`:

```text
CACHE_ROOT/build/20260803_01130500+09_m3kfj2b7qz8/
  context/                    snapshot of everything the build depends on
    comp.json                 comp record (component-level metadata)
    version.json              version record (version-level metadata)
    task.json                 task record at start time
    source/                   source files from the source file group
  project/                    build-comp scaffold + source + generated federation config
  build.log
```

The folder is kept after the build finishes: the context copies make a finished (especially a failed) build inspectable and reproducible on their own. It is still cache: deleting it loses nothing durable (log and output live in storage-obj), and old folders can be cleaned at any time.

## Websocket

Endpoint: `WS /api/ws/task`.

Client -> server messages:

```jsonc
{ "action": "subscribe", "taskId": "m3kfj2b7qz9" }   // or "taskId": "*" for all tasks
{ "action": "unsubscribe", "taskId": "m3kfj2b7qz9" }
```

Server -> client message, pushed on every task update:

```jsonc
{
  "taskId": "m3kfj2b7qz9",
  "taskStatus": 1,
  "taskStatusText": "pnpm install",
  "progressEntry": { "taskStatus": 1, "taskStatusMessage": "pnpm install", "updateAt": "20260802_23050500+09" }
}
```

The push carries only the latest state; full history stays in the task record, fetched through `GET /api/task/get`. A client that reconnects re-fetches the record and re-subscribes; no message replay is needed.
