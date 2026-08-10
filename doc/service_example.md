# Remote Component Project Examples

`docker/comp-demo/` contains two alternative projects for the same `hello-components` remote entry. Each version exposes two React components: `hello-card` and `hello-badge`.

```text
comp-demo/
  comp-source/       # register source code; the service builds it
  comp-prebuilt/     # build locally; register the generated dist/ files
```

Choose one pattern for your own component project. The two folders are not parts of one application.

## The Common Project Shape

Start with this mental model:

```text
your-component/
  comp.jsonc         # describes the remote entry, each exposed component, and what to register
  src/
    entry.jsx        # public module; exports one or more React components
    entry.css        # styles imported by entry.jsx
```

`entry.jsx` is the important source file. One module can export several components:

```jsx
import './entry.css'

function HelloCard({ data }) {
  return <div className="hello-card">{data?.title || 'hello'}</div>
}

function HelloBadge({ text }) {
  return <span className="hello-badge">{text || 'badge'}</span>
}

export default HelloCard
export { HelloBadge }
```

The matching part of `comp.jsonc` tells the service how this module is exposed:

```jsonc
{
  "compName": "hello-components",
  "metadata": {
    "versionName": "0.0.1",
    "exposeDefaultName": "hello-card",
    "federation": {
      "containerName": "helloCardApp",
      "fileEntry": "HelloCard.js"
    },
    "exposeList": [
      {
        "exposeName": "hello-card",
        "description": "card with title and body text",
        "modulePath": "./hello-components",
        "fileEntrySource": "src/entry.jsx",
        "entryExport": "default",
        "props": {
          "data": { "type": "object", "description": "title and text to render" }
        },
        "packages": {
          "react": { "versionRequired": "^19.2.0", "isShared": true }
        }
      },
      {
        "exposeName": "hello-badge",
        "description": "small status badge",
        "modulePath": "./hello-components",
        "fileEntrySource": "src/entry.jsx",
        "entryExport": "HelloBadge",
        "props": {
          "text": { "type": "string", "description": "badge text" }
        },
        "packages": {
          "react": { "versionRequired": "^19.2.0", "isShared": true }
        }
      }
    ]
  }
}
```

The key relationship is:

```text
remote entry HelloCard.js
  -> modulePath "./hello-components"
     -> source module src/entry.jsx
        -> entryExport "default" selects HelloCard
        -> entryExport "HelloBadge" selects HelloBadge
```

`compName` identifies the whole versioned remote entry in the service. `exposeName` identifies one React component available from that entry. Two exposed components may share one `modulePath` and select different exports.

## Pattern 1: Register Source, Service Builds

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

The register script uploads `src/`. The service adds its own Vite and Module Federation build scaffold, uses `metadata.federation` and `metadata.exposeList` as the build configuration, and queues a build task. Your project does not need its own `package.json`, `vite.config.js`, `index.html`, or `main.jsx`.

Register it from the repository root:

```bash
python docker/script/register_comp.py docker/comp-demo/comp-source
```

## Pattern 2: Build Locally, Register `dist/`

Example: `docker/comp-demo/comp-prebuilt/`

```text
comp-prebuilt/
  comp.jsonc          service metadata; output.dir is dist
  package.json        dependencies and build/register commands
  vite.config.js      builds entry.jsx as a federation remote
  index.html          local preview HTML
  register.js         registers this project using comp.jsonc
  src/
    entry.jsx         actual remote module; exports HelloCard and HelloBadge
    entry.css
    main.jsx          local preview entry point only
    main.css           local preview styles only
  dist/               generated build output that gets registered
```

The distinction between the two JSX files is:

- `entry.jsx` is the product. `vite.config.js` exposes this module. Hosts select its default `HelloCard` export or named `HelloBadge` export.
- `main.jsx` is only a local preview wrapper. It imports both components, supplies sample props, and mounts them into `index.html`. A remote host never loads `main.jsx`.

The crucial build configuration is:

```js
federation({
  name: 'helloCardApp',
  filename: 'HelloCard.js',
  exposes: {
    './hello-components': './src/entry.jsx',
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
vite.config.js exposes key             == each exposeList modulePath
vite.config.js exposes source file     == each exposeList fileEntrySource
vite.config.js shared packages         == combined exposeList packages marked isShared
```

Its `comp.jsonc` ends with `"output": { "dir": "dist" }`, so the register script uploads the generated files rather than the source.

Build and register:

```bash
cd docker/comp-demo/comp-prebuilt
pnpm install --ignore-workspace
pnpm run build
pnpm run register
```

`--ignore-workspace` guarantees a standalone install even when the folder sits inside an enclosing pnpm workspace. Skipping it is the most common cause of React error #525 at render time; see [Commonly Seen Error: React #525](#commonly-seen-error-react-525-when-the-host-renders-the-component).

After `pnpm run build`, `dist/` contains `HelloCard.js` (the remote entry) and the component/dependency chunks it loads. These generated files are the deployable component; do not hand-write them.

## Before Registering Either Example

1. Make sure `storage-obj` is reachable (default `http://127.0.0.1:5107`).
2. Make sure this service is ready (default `http://127.0.0.1:9415`). Check `/manage/` or `GET /api/service/status`.
3. Change `service.urlRegistry` in `comp.jsonc` when registering to another registry URL.
4. Change `metadata.versionName` before registering a new version when appropriate.

Both examples use `compName: "hello-components"`. Registering either one creates a version under that same remote entry. Resolve either exposed component with:

```text
GET /api/comp/resolve?compName=hello-components&exposeName=hello-card
GET /api/comp/resolve?compName=hello-components&exposeName=hello-badge
```

## Commonly Seen Error: React #525 When the Host Renders the Component

Symptom: the component version registers fine and its files load fine, but the moment a host page (for example the manage page playground) renders the component, React throws:

```text
Minified React error #525
"A React Element from an older version of React was rendered."
```

### Mechanism

The direct cause is **not** a failed shared-react negotiation. Sharing `react` can succeed completely and this error still happens, because element creation does not go through the shared `react` at all:

```text
build time (component project)
  JSX in entry.jsx compiles to jsx() calls importing "react/jsx-runtime"
  "react/jsx-runtime" is not shared through federation; it is always
  bundled into the expose chunk, copied from whatever react the build
  machine resolved at that moment
    react <= 18 jsx-runtime stamps elements: $$typeof = Symbol.for("react.element")
    react 19    jsx-runtime stamps elements: $$typeof = Symbol.for("react.transitional.element")

render time (host running react 19)
  shared react handoff succeeds ("^19.2.0" is satisfied), component code runs
  but the component returns element objects stamped by the bundled react-18
  jsx-runtime, carrying the legacy "react.element" symbol
  the host react-19 reconciler receives a child with the legacy symbol
  -> throws error #525 and refuses to render it
```

So the react version *frozen into the build output* decides the element format, independent of what react the host hands over at runtime. A version built against the wrong react is permanently broken for react-19 hosts (version output is immutable); the fix is always to rebuild and register a new version.

### Does the Component Need the Registry's React Version?

No. The registry only stores and serves files; it never renders a component. A component built with react 18 registers, builds, and serves exactly as well as one built with react 19.

React versions only matter between the component build and each **host page** that renders it, through two independent interactions:

```text
1. element format (decided at build time, frozen into the version)
   the bundled jsx-runtime stamps every element; host react must recognize
   that stamp. same react major as the host -> safe. crossing the react
   18/19 boundary -> the host rejects the elements (error #525 above).

2. shared react instance (negotiated at load time)
   the host offers its own react through container.init(); if it satisfies
   the component's declared packages.react.versionRequired, the component
   runs on the host's react instance. if not satisfied, the component
   silently falls back to its own bundled react copy: the page then runs
   two react instances, which may render simple output but breaks anything
   crossing the boundary (hooks in shared components, context, portals).
```

The manage page playground is simply one such host: it renders with the react version shown in its header (currently react 19.x). A react-18-built component therefore still serves fine to react-18 host pages; it just cannot render inside the playground. Match the host pages you target, and declare that requirement honestly in `packages.react.versionRequired` — the playground and the Components pages display this declared requirement so mismatches are visible before loading.

### Typical Root Cause: an Enclosing pnpm Workspace

The build resolved a different react than the one declared in `package.json`. The typical way this happens: the component folder sits inside a larger pnpm workspace (with hoisted `node_modules` at the workspace root) and `pnpm install` was run without `--ignore-workspace`. The install then targets the workspace instead of creating a local `node_modules`, and `vite build` resolves react by walking up the directory tree — finding the workspace root's hoisted react (say 18.3.1) instead of the declared `^19.2.0`.

Things to be careful about:

1. Inside a pnpm workspace, always install the component project with `pnpm install --ignore-workspace`, and confirm a local `node_modules/react` exists with the expected version.
2. The react that `vite build` resolves must match the `packages` requirements declared in `comp.jsonc`; the declaration is documentation, nothing verifies it against the build.
3. The service-side pattern-1 build already installs with `--ignore-workspace` for the same reason (its build cache folder can also sit inside a workspace in local test mode).

To check whether a `dist/` (or an already-registered build output) is affected, look at which element symbol the chunks carry:

```bash
grep -roh "react\.transitional\.element\|react\.element" dist/assets/ | sort | uniq -c
```

A healthy react-19 build shows `react.transitional.element` in the expose chunk; an affected build's expose chunk contains only the legacy `react.element`.

For the two registration workflows and full descriptor semantics, see [service_workflow.md](./service_workflow.md) and [service_resource.md](./service_resource.md#metadata-standards).
