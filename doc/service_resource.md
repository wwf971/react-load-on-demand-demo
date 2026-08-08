# Resource Records

This document defines the exact shape of the three resource records (component, version, build) and the metadata standards. For where these records physically live, refer to [service_storage.md](./service_storage.md).

## Record Hierarchy at a Glance

```text
component record
  compId + compName + editable component metadata
  versionList
    -> version record
       versionId + frozen version metadata + frozen source
       exposeList in metadata
         -> one definition for each exposed React component
       buildList
         -> build record
            buildId + status + log + output
```

The component is the stable remote-entry identity. A version is one frozen release of it. A build is one attempt to turn that exact version into files. Exposed React components are definitions inside version metadata; they are not separate component records.

## Id Formats

- `compId`: random string of `0-9 a-z`, no semantic prefix or suffix.
- `versionId`, `buildId`, `taskId`, `eventId`: `ms_48` format. 64-bit id whose high 48 bits are the unix stamp in milliseconds and low 16 bits are a random offset. Displayed as base36 string (`0-9 a-z`).

`ms_48` ids sort by creation time, which gives versions and builds their natural order. "Updating can only be done by increasing version" is realized by this: a new version always gets a larger `versionId`.

## Time Format

Every timestamp in this project (record fields, api responses, progress entries, build folder names) uses the project time format: `20260520_23250530+09`. Precision is 10 milliseconds (two digits after seconds); timezone precision is one hour.

Note there are two unrelated "version" notions in this system. `versionId` here is the component version, a service-level concept. `storage-obj` also has object versions internally; the service does not use them to represent component versions (refer to [service_storage.md](./service_storage.md#two-version-notions)).

## Component Record

One JSON object per component:

```jsonc
{
  "objectKind": "component",
  "schemaVersion": 1,
  "compId": "a1b2c3d4e5f6",
  "compName": "user-card",              // unique inside the service, editable
  "metadata": { /* comp metadata */ },  // editable
  "versionList": [                      // append-only
    { "versionId": "m3kfj29a0x1", "objectId": "..." }   // objectId of the version record
  ],
  "isDeleted": false,
  "createdAt": "20260802_23050000+09",
  "updatedAt": "20260802_23050000+09"
}
```

`versionList` only lists version ids (plus the storage `objectId` of each version record, following the navigation rule that records point to the objects they own); version content lives in version records. The latest version is the entry with the largest `versionId`.

## Version Record

One JSON object per component version:

```jsonc
{
  "objectKind": "version",
  "schemaVersion": 1,
  "compId": "a1b2c3d4e5f6",
  "versionId": "m3kfj29a0x1",
  "metadata": { /* version metadata */ },   // frozen at creation
  "source": {                               // frozen at creation; null for pattern 2 (upload-prebuilt)
    "fileGroupId": "..."                    // file group holding the source files
  },
  "buildList": [                            // append-only
    { /* build record, see below */ }
  ],
  "createdAt": "20260802_23050000+09"
}
```

## Build Record

One entry inside `version.buildList`:

```jsonc
{
  "buildId": "m3kfj2b7qz8",
  "buildType": "service-build",     // "service-build" | "upload-prebuilt"
  "buildStatus": 2,                 // 2 success, 3 fail, 4 cancel (same integers as task status)
  "taskId": "m3kfj2b7qz9",          // null for upload-prebuilt
  "logObjectId": "...",             // text object holding build log; null for upload-prebuilt
  "output": {                       // null unless buildStatus = 2
    "fileGroupId": "..."
  },
  "createdAt": "20260802_23050000+09",
  "finishedAt": "20260802_23052000+09"
}
```

- `service-build`: the service built the source through a backend task. Refer to [service_task.md](./service_task.md).
- `upload-prebuilt`: user uploaded already-built files; the record is created directly as `buildStatus = 2` after manifest validation.

A build record is appended to `buildList` only when the build is finished, so every stored record is frozen from the start; an ongoing build is visible as an undergoing task, not as a build record. A build retry is always a NEW build record; an existing record is never reused. Whether the backend retries automatically after a failure or a restart is backend policy config, independent from the record semantics: a build can simply be left in failed state.

## Build HEAD

For one version, the build HEAD is the build record that gets served:

```text
buildHead(version) = the newest build record with buildStatus = 2
                     null when no build succeeded yet
```

- `GET /api/comp/resolve` and `/comp-file/...` serve from the build HEAD.
- when HEAD is null, the version is not servable: resolve skips it (or fails when the version was pinned), file fetch fails.
- HEAD is derived from `buildList` on read; it is not a stored pointer, so no record write is needed when a new successful build lands.

When several builds succeeded (source is identical, but a rebuild may pick up newer compatible dependency patches), the newest one is the HEAD.

## Metadata Standards

Metadata at every level is one JSON object. Standard entries have fixed names and formats; extra user entries are allowed and ignored by the service.

### Version Metadata

```jsonc
{
  "schemaVersion": 1,
  "versionName": "1.2.0",           // optional display label; versionId stays the real order
  "description": "this release of the user component collection",
  "document": "## markdown text",   // optional detailed document, markdown string
  "exposeDefaultName": "user-card",
  "federation": {                   // settings shared by the whole remote entry
    "containerName": "userCardApp",
    "fileEntry": "UserCard.js"
  },
  "exposeList": [
    {
      "exposeName": "user-card",
      "description": "display one user",
      "document": "## markdown text",       // optional component-specific document
      "modulePath": "./user-components",
      "fileEntrySource": "src/entry.jsx",   // required when the service builds source
      "entryExport": "default",
      "props": {
        "data": { "type": "object", "description": "user data to render" },
        "config": { "type": "object", "description": "operation state; optional" },
        "onEvent": { "type": "function", "description": "change-attempt callback; optional" }
      },
      "packages": {
        "react": { "versionRequired": "^19.2.0", "isShared": true },
        "mobx": { "versionRequired": "^6.0.0", "isShared": true },
        "dayjs": { "versionRequired": "^1.11.13", "isShared": false }
      }
    },
    {
      "exposeName": "user-avatar",
      "description": "display the user's avatar",
      "modulePath": "./user-components",
      "fileEntrySource": "src/entry.jsx",
      "entryExport": "UserAvatar",
      "props": {
        "url": { "type": "string", "description": "image URL" }
      },
      "packages": {
        "react": { "versionRequired": "^19.2.0", "isShared": true }
      }
    }
  ]
}
```

Entry semantics:

- `exposeDefaultName`: exposed component selected when `/api/comp/resolve` does not receive `exposeName`. When omitted, the first item is the default.
- `federation`: names the one remote entry generated for the version. `containerName` is the Module Federation container name. `fileEntry` is its generated entry file.
- `exposeList`: one item per React component that hosts can select. `exposeName` must be unique.
- `modulePath`: module registered in the remote entry. Several exposed components may use the same module path.
- `entryExport`: export selected from that module. Use `default` or a named export such as `UserAvatar`.
- `fileEntrySource`: source module registered as `modulePath` during a service build. When two items share a module path, they must name the same source file.
- `props`: informal input shape for humans and tools. It is documentation, not runtime validation. Each prop normally has `type`, `description`, and optional nested `props`.
- `packages`: requirements of this exact exposed component. `versionRequired` is a semver range. `isShared: true` asks the host to provide the package through `container.init(...)`; `isShared: false` bundles it into the remote build.

The service combines package requirements from all items when it builds the remote entry. If two exposed components use the same package, their `versionRequired` and `isShared` values must match. This explicit rule avoids an unclear container-level package requirement.

For pattern 1 (service builds), `exposeList` and `federation` generate the build config. For pattern 2 (upload-prebuilt), the uploader must keep them consistent with the uploaded build.

Older records with one component under `metadata.federation.modulePath` remain readable as one legacy exposed component.

### Component Metadata

```jsonc
{
  "schemaVersion": 1,
  "description": "one-line summary of the component",
  "tags": ["chart", "dashboard"],   // used by comp list/search filters
  "document": "## markdown text"    // optional
}
```

### Service Metadata

```jsonc
{
  "schemaVersion": 1,
  "serviceName": "react-lazy-load",
  "description": "remote react component service"
}
```

Counters (component count, version count, task stats) are not stored here; they are computed by `GET /api/service/status`.
