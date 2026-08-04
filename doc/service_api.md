# HTTP API

## JSON Response Contract

All `/api/...` endpoints return:

```jsonc
{
  "code": 0,
  "data": {},
  "message": ""
}
```

- `code = 0` means success, `code < 0` means failure.
- `data` and `message` are optional; include them only when useful.
- IDs are passed through query params (`GET`) or request body (`POST`), not URL path variables. The only exception is component file serving (`/comp-file/...`), which must be plain URLs so that browsers and the federation runtime can fetch them directly.

## Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health/ping` | lightweight liveness check |
| GET | `/api/service/status` | service metadata + counters (comp count, version count, undergoing task count, recent build stats) + storage-obj reachability |

## Component

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/comp/list` | list components; filters: `name` (substring), `tag`; paging |
| GET | `/api/comp/get` | one component record by `compId` |
| GET | `/api/comp/find-by-name` | one component record by exact `compName` |
| POST | `/api/comp/create` | create component: `{compName, metadata}`; returns `compId` |
| POST | `/api/comp/update` | update editable fields: `{compId, compName?, metadata?}` |
| POST | `/api/comp/delete` | soft delete: `{compId}`; versions stay readable, resolve stops serving |

`/api/comp/list` is the search entry for other services.

## Version

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/comp/version/list` | version records of one component by `compId` |
| GET | `/api/comp/version/get` | one version record by `compId`, `versionId` |
| POST | `/api/comp/version/create` | create a new version (see below) |
| POST | `/api/comp/version/build` | queue a (re)build task: `{compId, versionId}`; returns `taskId` |

### `/api/comp/version/create`

One endpoint serves both upsert patterns:

```jsonc
{
  "compId": "a1b2c3d4e5f6",
  "metadata": { /* version metadata, refer to service_resource.md */ },

  // pattern 1: service builds. sourceFileList present, outputFileList absent.
  "sourceFileList": [
    { "path": "src/entry.jsx", "contentText": "..." },
    { "path": "src/entry.css", "contentBase64": "..." }
  ],

  // pattern 2: upload prebuilt. outputFileList present, sourceFileList optional (kept for reference).
  "outputFileList": [
    { "path": "UserCard.js", "contentBase64": "..." }
  ]
}
```

- pattern 1 response: `{versionId, taskId}`. The build task runs in background; progress over websocket.
- pattern 2 response: `{versionId, buildId}`. The service validates the files against `metadata.federation` (entry file exists, etc.) and appends one successful `upload-prebuilt` build record. No task.
- `path` entries are relative; absolute paths and `..` are rejected.
- creation writes in visibility order (refer to [service_storage.md](./service_storage.md#write-ordering-instead-of-transactions)): the version becomes visible only after everything it references exists.

## Build

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/comp/build/list` | build records of one version by `compId`, `versionId`; includes `buildIdHead` |
| GET | `/api/comp/build/log` | build log text by `compId`, `versionId`, `buildId` |
| GET | `/api/comp/build/files` | output file list (path, size, url) of one build |

## Resolve (for host pages)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/comp/resolve` | load info by `compName` or `compId`; optional `versionId` and `exposeName` |

Resolve serves from the build HEAD of the picked version (newest successful build, refer to [service_resource.md](./service_resource.md#build-head)). Without `versionId`, versions whose HEAD is null are skipped. Without `exposeName`, the version's `exposeDefaultName` is selected, or the first exposed component when no default is set.

Response `data`:

```jsonc
{
  "compId": "a1b2c3d4e5f6",
  "compName": "user-components",
  "versionId": "m3kfj29a0x1",
  "versionName": "1.2.0",
  "containerName": "userCardApp",
  "urlEntry": "/comp-file/a1b2c3d4e5f6/m3kfj29a0x1/UserCard.js",
  "exposeName": "user-card",
  "modulePath": "./user-components",
  "entryExport": "default",
  "description": "display one user",
  "props": {
    "data": { "type": "object", "description": "user data to render" }
  },
  "packages": {
    "react": { "versionRequired": "^19.2.0", "isShared": true }
  },
  "exposeList": [
    {
      "exposeName": "user-card",
      "modulePath": "./user-components",
      "entryExport": "default",
      "description": "display one user",
      "props": {},
      "packages": {}
    },
    {
      "exposeName": "user-avatar",
      "modulePath": "./user-components",
      "entryExport": "UserAvatar",
      "description": "display the user's avatar",
      "props": {},
      "packages": {}
    }
  ]
}
```

The selected component fields are repeated at the top level so a host can load it directly. `exposeList` lets the host discover the other components available from the same remote entry and version.

Typical requests:

```text
GET /api/comp/resolve?compName=user-components
  -> resolve default exposed component from latest servable version

GET /api/comp/resolve?compName=user-components&exposeName=user-avatar
  -> resolve user-avatar from latest servable version

GET /api/comp/resolve?compId=...&versionId=...&exposeName=user-avatar
  -> resolve one exact exposed component from one exact version
```

This is everything a host needs: `import(urlEntry)`, `container.init(sharedPackages)`, `container.get(modulePath)`, then select `Module[entryExport]`. `packages` tells the host what the selected component expects.

## Component File Serving

```text
GET /comp-file/{compId}/{versionId}/{filePath}
```

Serves one file from the build HEAD output of that version:

```text
serveCompFile(compId, versionId, filePath)
  -> read version record (via comp index)
  -> pick build HEAD (newest build with buildStatus = 2); null -> 404
  -> look up filePath in its output file group manifest
  -> stream the bytes object from storage-obj, with manifest contentType
```

Because a version's build HEAD changes only when a rebuild succeeds (rare), responses carry long cache lifetimes; manifests are cached in memory.

## Task

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/task/list` | task records, newest first, paging; filter by `taskStatus`, `compId` |
| GET | `/api/task/get` | full task record by `taskId` |
| POST | `/api/task/cancel` | cancel an undergoing task: `{taskId}` |
| WS | `/api/ws/task` | real-time task progress, refer to [service_task.md](./service_task.md#websocket) |
