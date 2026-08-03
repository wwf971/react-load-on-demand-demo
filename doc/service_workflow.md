# Common Workflows

## Create a Component

```text
POST /api/comp/create {compName, metadata}
  -> comp record written, then comp index entry (visibility order)
  <- {compId}
```

Component-level metadata (description, tags, document) stays editable later through `POST /api/comp/update`. Only versions are frozen.

## Pattern 1: Upload Source, Service Builds

```text
POST /api/comp/version/create {compId, metadata, sourceFileList}
  -> source file group -> version record -> comp record entry -> task + outbox event
  <- {versionId, taskId}
subscribe WS /api/ws/task with taskId              watch progress in real time
task runner builds and deploys                     refer to service_task.md
GET /api/task/get?taskId=...                       final result; build log via /api/comp/build/log
```

If the build fails, the version stays (source is already frozen and stored). Fix is either:

- rebuild the same source: `POST /api/comp/version/build` (for example after a transient failure), or
- fix the source locally and create a new version.

## Pattern 2: Upload Prebuilt Files

```text
build locally (template project below)
POST /api/comp/version/create {compId, metadata, outputFileList}
  -> service validates files against metadata.federation
  -> output file group -> version record (with the successful upload-prebuilt
     build record already inside) -> comp record entry
  <- {versionId, buildId}
```

No task, no websocket; the version is servable immediately.

## Submit Script

Both patterns can be driven from a local project folder by a submit script, so creating a new version is one command. The folder holds a `comp.jsonc` descriptor:

```jsonc
{
  "service": { "urlSubmit": "http://127.0.0.1:9415" },
  "compName": "user-card",          // resolved to compId via /api/comp/find-by-name;
                                    // component is created first when missing
  "metadata": { /* version metadata, refer to service_resource.md */ },
  "source": { "dir": "src" },       // pattern 1: folder submitted as sourceFileList
  "output": { "dir": "dist" }       // pattern 2: folder submitted as outputFileList
}
```

```text
submit script
  -> read comp.jsonc
  -> resolve compName -> compId (create component if missing)
  -> collect files under source.dir or output.dir (relative paths kept)
  -> POST /api/comp/version/create
  -> pattern 1: subscribe websocket, print progress until terminal
  -> print {versionId, resolve url}
```

The script exists in two equal flavors, use whichever fits the local toolchain:

- python: `script/submit_comp.py <folder>` (works for both patterns)
- node (pnpm): `pnpm run submit` in the `comp-prebuilt/` template project

## Example Component Projects

Two examples under `docker/comp-demo/`, matching the two patterns:

```text
comp-demo/
  comp-source/       pattern 1 authoring: source folder + comp.jsonc; submit script sends source
  comp-prebuilt/     pattern 2 authoring: full Vite + federation project that builds locally
```

How to run each example (commands, prerequisites, resolve check): [service_example.md](./service_example.md).

For pattern 2 the uploader owns consistency: `metadata.federation` (containerName, fileEntry, modulePath) and `metadata.packages` in `comp.jsonc` must match `vite.config.js`.

## Consume from Another Service

```text
search:   GET /api/comp/list?name=card&tag=dashboard
resolve:  GET /api/comp/resolve?compName=user-card          latest servable version
load:     import(urlEntry) -> container.init(sharedPackages) -> container.get(modulePath)
```

Hosts should pin `versionId` when reproducibility matters (file urls are immutable), or omit it to follow the latest version.
