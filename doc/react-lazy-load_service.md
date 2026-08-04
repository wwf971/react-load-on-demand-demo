# react-lazy-load service

The service stores, builds, and serves versioned remote React components. A host page fetches a component at runtime through Module Federation, without knowing the component at its own build time. For how runtime loading itself works, refer to `./react-lazy-load.md`.

The service is serverless: the service process keeps no persistent local state. All persistent data lives in a `storage-obj` service (versioned object storage). Local disk is used only as disposable build cache. The service process can be restarted at any time without data loss.

## Core Model

One service component is one named remote entry that changes through versions. One exact version can expose several React components.

```text
component: hello-components (compId)
  editable identity metadata
  version: 1.0.0 (versionId)
    frozen source and version metadata
    exposed component: hello-card
      description, props, package requirements, module path and export
    exposed component: hello-badge
      description, props, package requirements, module path and export
    build (buildId)
      one build attempt, log, status and output files
    build (buildId)
      a later retry of the same frozen version
```

The levels have different jobs:

- **component**: the stable identity users search for. It has `compId`, editable `compName`, editable description/tags/document, and an append-only version list.
- **version**: one frozen release of that component. It has `versionId`, optional `versionName`, source files, version description, remote-entry settings, exposed-component definitions, and a build list.
- **exposed component**: one React component available from that version. Each item has its own public `exposeName`, description, props, package requirements, module path and export name.
- **build**: one attempt to produce servable files from a version. It has `buildId`, type, status, task reference, log reference, output file group, and timestamps.

The remote entry file belongs to the version build, not to one exposed React component. Several exposed components can share the same `modulePath` and select different exports from the same source module.

Immutability rules:

```text
comp level       compName, comp metadata      editable
version level    source, version metadata     frozen at creation
build list       builds under one version     append-only; one build is frozen once it finishes
```

What a host page loads:

```text
(compId or compName, optional versionId, optional exposeName)
  -> choose one version
  -> choose exposeName, or the version's default exposed component
  -> use the version's newest successful build
  -> return remote-entry URL + selected modulePath + selected entryExport
```

Because a version and its finished builds never change, served file URLs are immutable and can be cached aggressively.

Refer to [service_resource.md](./service_resource.md) for exact record shapes.

## Metadata by Level

Metadata exists at all three levels, as JSON objects with standardized entries:

- service metadata: service description, counters and health.
- component metadata: description, tags and document for the stable identity.
- version metadata: version name/description/document, default exposed component, remote-entry settings and `exposeList`.
- exposed-component metadata: description, props, package requirements and exact runtime load information.
- build record: build type/status, task, log, output and timestamps. Finished build records are frozen.

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

Both patterns can be driven from a local project folder by a submit script, using a `comp.jsonc` descriptor. The two example projects show the minimal service-built shape and the full locally-built shape. Workflow semantics: [service_workflow.md](./service_workflow.md). Project examples: [service_example.md](./service_example.md).

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
host -> GET /api/comp/resolve?compName=...&exposeName=...
     <- { compId, versionId, containerName, exposeName, modulePath,
          entryExport, urlEntry, props, packages, exposeList }
host -> import(urlEntry)                              fetch remote entry
     -> container.init(sharedPackages)                hand over host's react/mobx
     -> container.get(modulePath)                     fetch component chunk
     -> Module[entryExport]                           select the React component
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
- [service_workflow.md](./service_workflow.md): common workflows, submit script, example projects
- [service_example.md](./service_example.md): project shape and two submission examples
- [service_manage_page.md](./service_manage_page.md): manage page frontend
- [react-lazy-load.md](./react-lazy-load.md): how Module Federation runtime loading works (demo doc)
