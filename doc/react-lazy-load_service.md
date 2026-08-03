# react-lazy-load service

The service stores, builds, and serves versioned remote React components. A host page fetches a component at runtime through Module Federation, without knowing the component at its own build time. For how runtime loading itself works, refer to `./react-lazy-load.md`.

The service is serverless: the service process keeps no persistent local state. All persistent data lives in a `storage-obj` service (versioned object storage). Local disk is used only as disposable build cache. The service process can be restarted at any time without data loss.

## Core Concepts

Three resource levels:

```text
service                        service metadata, status api
  -> component                 (compId, compName, comp metadata)
      -> version               (versionId, source, version metadata, build list)
          -> build             (buildId, build log, build output)
```

- component: one identity across all its versions. `compName` and comp metadata are editable.
- version: one frozen snapshot of the component: source code + version metadata. A version is never edited. Updating a component means creating a new version.
- build: one attempt to turn the version source into servable files. One version can hold many builds (for example, retry after a failed build). Build output is null when the build fails.

Immutability rules:

```text
comp level       compName, comp metadata      editable
version level    source, version metadata     frozen at creation
build list       builds under one version     append-only; one build is frozen once it finishes
```

What a host page receives when it loads `(compId, versionId)`: the output files of the version's build HEAD, which is the newest successful build of that version (null when no build succeeded yet; then the version is not servable). Because a version and its finished builds never change, the served file urls are immutable and can be cached aggressively.

Refer to [service_resource.md](./service_resource.md) for exact record shapes.

## Metadata

Metadata exists at all three levels, as JSON objects with standardized entries:

- version metadata: description of what this version does, input prop shape, packages with required version ranges (marking which packages are expected to be shared with the host, so the host's react/mobx instance is reused instead of re-fetched), detailed document, and federation load info.
- comp metadata: description, tags, document. Describes the component identity, not one version.
- service metadata: service description, plus counters and health presented by the status api.

Refer to [service_resource.md](./service_resource.md#metadata-standards) for entry semantics and data formats.

## Storage

All resource records and files are stored in `storage-obj`. The service maps its resources onto a fixed set of spaces, and stores multi-file payloads (source code, build output) as `file group`s: one manifest object plus one bytes object per file.

All objects are created in `UPDATE-ONLY` edit mode, so even record updates (which only happen where the semantic model allows, for example appending to a build list) never rewrite an existing storage version.

Refer to [service_storage.md](./service_storage.md).

## Updating component from local

This service support two patterns of upserting a remote component:

1. upload source code(along with metadata, etc), the service builds and deploys it.
2. upload already bundled component(along with metadata, etc), the service directly deploys it.

Pattern 1 creates a version with source, then a backend build task builds it. Pattern 2 creates a version whose build list directly gets one successful entry of type `upload-prebuilt`; no build task runs.

Both patterns can be driven from a local project folder by a submit script, using a `comp.jsonc` descriptor. For pattern 2, a template project is provided that builds a local folder into the directly-uploadable format. Workflow semantics: [service_workflow.md](./service_workflow.md). How to run the two template examples: [service_example.md](./service_example.md).

## Backend Build Task

Building is a backend task, not part of the request/response cycle:

```text
POST /api/comp/version/create (pattern 1)
  -> write to storage-obj, in visibility order:
       source file group -> version record -> comp record entry -> task + outbox event
  <- {versionId, taskId}                       request returns immediately

task runner (in service process)
  -> claim pending outbox event
  -> build in its own timestamped cache folder (context copies + template + source,
     pnpm install, vite build)
  -> push progress to subscribed clients over websocket
  -> store build log + build output file group
  -> append build record to version; mark task terminal; mark event done
```

The outbox event makes "request durably accepted" and "worker picked it up" two separate facts, so a service restart between them loses nothing. Refer to [service_task.md](./service_task.md) for task record shape, outbox rules, and websocket protocol.

## Fetching Components from a Host Page

```text
host -> GET /api/comp/resolve?compName=...            (or compId, optional versionId)
     <- { compId, versionId, containerName, modulePath, entryExport,
          urlEntry, packages }
host -> import(urlEntry)                              fetch remote entry
     -> container.init(sharedPackages)                hand over host's react/mobx
     -> container.get(modulePath)                     fetch component chunk
```

Other services search components through `GET /api/comp/list` with name/tag filters. File urls have the form `/comp-file/{compId}/{versionId}/{filePath}` and always point at the newest successful build of that version. Refer to [service_api.md](./service_api.md).

## Manage Page

The manage page is a Vite + React + MobX frontend for browsing components, versions, builds and tasks, watching task progress in real time over websocket, and viewing service status. Refer to [service_manage_page.md](./service_manage_page.md).

## Config

Two-layer config: `config/config.yaml` plus local override `config/config.0.yaml` (gitignored; real credentials belong only there). Main entries: server port, `storage-obj` base url and storage endpoint key, space name prefix, build concurrency and timeout. Refer to [service_storage.md](./service_storage.md#config).

## Documents

- [service_resource.md](./service_resource.md): resource records, metadata standards, id formats
- [service_storage.md](./service_storage.md): mapping onto storage-obj, file group, config
- [service_api.md](./service_api.md): HTTP API and file serving
- [service_task.md](./service_task.md): build task, outbox event, websocket
- [service_workflow.md](./service_workflow.md): common workflows, submit script, templates
- [service_example.md](./service_example.md): how to run the two template examples
- [service_manage_page.md](./service_manage_page.md): manage page frontend
- [react-lazy-load.md](./react-lazy-load.md): how Module Federation runtime loading works (demo doc)
