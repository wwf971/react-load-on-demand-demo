# Remote Component Project Examples

`docker/comp-demo/` contains two alternative examples of the same `hello-card` remote component:

```text
comp-demo/
  comp-source/       # submit source code; the service builds it
  comp-prebuilt/     # build locally; submit the generated dist/ files
```

Choose one pattern for your own component project. The two folders are not parts of one application.

## The Common Project Shape

Start with this mental model:

```text
your-component/
  comp.jsonc         # describes the component, its public module, and what to submit
  src/
    entry.jsx        # the public module loaded by the host; exports the React component using `export default CompName;`
    entry.css        # styles imported by entry.jsx
```

`entry.jsx` is the important source file. It receives props and exports the component that a host will render:

```jsx
import './entry.css'

function HelloCard({ data }) {
  return <div className="hello-card">{data?.title || 'hello'}</div>
}

export default HelloCard
```

The matching part of `comp.jsonc` tells the service how this module is exposed:

```jsonc
{
  "compName": "hello-card",
  "metadata": {
    "props": {
      "data": { "type": "object", "description": "content to render" }
    },
    "packages": {
      "react": { "versionRequired": "^19.2.0", "isShared": true },
      "react-dom": { "versionRequired": "^19.2.0", "isShared": true }
    },
    "federation": {
      "containerName": "helloCardApp",
      "fileEntry": "HelloCard.js",
      "fileEntrySource": "src/entry.jsx",
      "modulePath": "./hello-card",
      "entryExport": "default"
    }
  }
}
```

The key relationship is:

```text
modulePath "./hello-card"
  -> exposes src/entry.jsx as a remotely loadable module
  -> entryExport "default"
  -> selects `export default HelloCard`
```

`compName` identifies the versioned component in the service. `modulePath` identifies a module inside its federation container.

## Pattern 1: Submit Source, Service Builds

Example: `docker/comp-demo/comp-source/`

```text
comp-source/
  comp.jsonc
  src/
    entry.jsx
    entry.css
```

This is the smallest project shape. Its `comp.jsonc` ends with:

```jsonc
"source": { "dir": "src" }
```

The submit script uploads `src/`. The service adds its own Vite and Module Federation build scaffold, uses `metadata.federation` as the build configuration, and queues a build task. Your project does not need its own `package.json`, `vite.config.js`, `index.html`, or `main.jsx`.

Submit it from the repository root:

```bash
python docker/script/submit_comp.py docker/comp-demo/comp-source
```

## Pattern 2: Build Locally, Submit `dist/`

Example: `docker/comp-demo/comp-prebuilt/`

```text
comp-prebuilt/
  comp.jsonc          service metadata; output.dir is dist
  package.json        dependencies and build/submit commands
  vite.config.js      builds entry.jsx as a federation remote
  index.html          local preview HTML
  submit.js           submits this project using comp.jsonc
  src/
    entry.jsx         actual remote component module
    entry.css
    main.jsx          local preview entry point only
  dist/               generated build output that gets submitted
```

The distinction between the two JSX files is:

- `entry.jsx` is the product. `vite.config.js` exposes it, and remote hosts load its default export.
- `main.jsx` is only a local preview wrapper. It imports `entry.jsx`, supplies sample props, and mounts it into `index.html`. A remote host never loads `main.jsx`.

The crucial build configuration is:

```js
federation({
  name: 'helloCardApp',
  filename: 'HelloCard.js',
  exposes: {
    './hello-card': './src/entry.jsx',
  },
  shared: {
    react: { singleton: true, requiredVersion: '^19.2.0' },
    'react-dom': { singleton: true, requiredVersion: '^19.2.0' },
  },
})
```

For a prebuilt project, these values must agree:

```text
vite.config.js name                    == comp.jsonc containerName
vite.config.js filename                == comp.jsonc fileEntry
vite.config.js exposes key             == comp.jsonc modulePath
vite.config.js exposes source file     == comp.jsonc fileEntrySource
vite.config.js shared packages         == comp.jsonc packages marked isShared
```

Its `comp.jsonc` ends with `"output": { "dir": "dist" }`, so the submit script uploads the generated files rather than the source.

Build and submit:

```bash
cd docker/comp-demo/comp-prebuilt
pnpm install
pnpm run build
pnpm run submit
```

After `pnpm run build`, `dist/` contains `HelloCard.js` (the remote entry) and the component/dependency chunks it loads. These generated files are the deployable component; do not hand-write them.

## Before Submitting Either Example

1. Make sure `storage-obj` is reachable (default `http://127.0.0.1:5107`).
2. Make sure this service is ready (default `http://127.0.0.1:9415`). Check `/manage/` or `GET /api/service/status`.
3. Change `service.urlSubmit` in `comp.jsonc` when submitting to another service URL.
4. Change `metadata.versionName` before submitting a new version when appropriate.

Both examples use `compName: "hello-card"`. Submitting either one creates a version under that same component. After success, resolve it with:

```text
GET /api/comp/resolve?compName=hello-card
```

For the two submission workflows and full descriptor semantics, see [service_workflow.md](./service_workflow.md) and [service_resource.md](./service_resource.md#metadata-standards).
