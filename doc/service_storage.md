# Storage

All persistent data of this service lives in a `storage-obj` service (versioned object storage, refer to its own `/doc/storage-obj.md`). This service holds no database and no persistent files of its own; local disk is only disposable build cache. This is what makes the service serverless: any instance can serve any request, and instances can be killed and restarted freely.

## Space Layout

The service uses a fixed set of spaces inside one storage endpoint. Space names carry a configurable prefix (default `react-lazy-load`), so one storage-obj instance can host several deployments.

```text
space react-lazy-load-service       json: service metadata object, comp index object
space react-lazy-load-comp          json: component records
space react-lazy-load-version       json: version records
space react-lazy-load-file          json: file group manifests
                                    bytes: file group member files
space react-lazy-load-log           text: build logs
space react-lazy-load-task          json: task records
space react-lazy-load-outbox        json: outbox event records
```

Navigation always starts from the comp index object in `react-lazy-load-service`:

```text
comp index  { compId: { objectId } }        -> component record
component record .versionList               -> version records
version record .source / .buildList         -> file groups, build logs
```

The comp index is one JSON object mapping every `compId` to the storage `objectId` of its component record. A single index object is a deliberate choice: it keeps lookup explicit and simple, and component creation is rare enough that contention on one object does not matter.

## Write Ordering Instead of Transactions

storage-obj has a batch transaction api, but this service does not use it: batch bodies treat every `$`-prefixed string as an op reference, so records carrying arbitrary user metadata cannot safely go through it. Instead, multi-object writes rely on ordering:

```text
rule: an object becomes REACHABLE only through the record that points to it,
      and that record is always written AFTER the objects it points to.
```

Example, creating a version: file objects first, then the manifest, then the version record, then the comp record's `versionList` entry (this last write is what makes the version visible). A crash in the middle leaves unreferenced objects behind — invisible garbage, never a half-visible resource. A retry simply creates fresh objects.

Writes that modify one record (comp record, comp index, task record) are serialized per record inside the single service process.

## File Group

A `file group` stores one folder of files (source code, or build output) as:

- one manifest JSON object; its `objectId` is the `fileGroupId`
- one bytes object per file

Manifest shape:

```jsonc
{
  "fileList": [
    {
      "path": "assets/UserCard.js",   // relative path inside the folder; no "..", no absolute path
      "objectId": "...",              // bytes object holding file content
      "sizeBytes": 12345,
      "contentType": "text/javascript"
    }
  ]
}
```

The member file objects are written first and the manifest last, so a file group is referable only when it fully exists (refer to Write Ordering below). A file group is never modified after creation.

Files are stored one object per file, not as one archive. Reason: serving. `GET /comp-file/...` maps a request path to one bytes object through the manifest and streams it directly; no unpack step and no mandatory local cache. An in-memory cache of manifests (and optionally hot files) is a pure optimization the service can drop at any time.

## Immutability Mapping

The semantic model requires: versions frozen, build lists append-only, no editing inside one version. At the storage level:

- every object is created with `editType = 0` (`UPDATE-ONLY`), so any write appends a new storage version; nothing is ever rewritten in place.
- objects that are semantically frozen (source files, build outputs, manifests, finished build logs) are simply never updated after creation.
- objects that are semantically mutable (component record, comp index, task record) or append-only (version record's `buildList`) are updated normally; storage-obj keeps their full history as an audit trail for free.

## Two Version Notions

Do not confuse:

- component version (`versionId` in this service): one frozen snapshot of a component. This is the user-facing concept.
- storage object version (inside storage-obj): history of one stored object. The service treats it only as an audit trail and always reads the current checked-out data.

A component version is NOT represented as a storage object version. It is its own set of storage objects (version record + file groups). This keeps the two systems independent: what storage-obj does with its history never changes component semantics.

## Config

Two-layer config: `config/config.yaml` committed, `config/config.0.yaml` gitignored local override. Real credentials belong only in `config.0.yaml`.

```yaml
server:
  port: 9415
storage_obj:
  url_base: http://127.0.0.1:5107
  storage_endpoint_key: null    # null = use storage-obj runtime default endpoint
  space_prefix: react-lazy-load
build:
  concurrency: 1
  timeout_seconds: 600
```

On first launch, the service ensures its spaces and the service/index objects exist (create-if-missing, never overwrite). Spaces are located by the storage-obj space metadata tag `name`.
