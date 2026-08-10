# Manage Page

Vite + React + MobX frontend, built and served by the service (served under `/manage/`). Frontend layout follows the same style as the `storage-obj` and `file-access-smb` manage pages, and actively uses components from the `react-comp-misc` package (imported from package root only, e.g. `import { Icon, MetadataKeyValues } from '@wwf971/react-comp-misc'`).

## Layout

The page uses draggable top tabs. Every tab has its own virtual path:

```text
tabs: [Components] [hello-components] [versionId] [Tasks]

active tab:
  hello-components(compId) / versionId / buildId /
  -------------------------------------------------
  content for exactly that path
```

Component paths:

```text
/                                             list all components
compName(compId) /                            component metadata + all versions
compName(compId) / versionId /                frozen version metadata + all builds
compName(compId) / versionId / buildId /      build metadata + log + output files
```

Selecting a component, version or build changes the path in the current tab. Clicking a path segment returns to that exact parent level. `Ctrl+click` or `Cmd+click` on a path segment opens the target path in a new tab and focuses it.

Tabs may have duplicate paths. They remain separate views with separate operation state, but they observe the same resource records.

Other paths:

```text
Playground /        place registered components live, edit their props
Tasks /             task list, live-updating over websocket
Tasks / taskId /    task progress, result and cancel action
Config /            service status, backend connectivity, required space and structure checks
```

Layout rules (from project frontend rules): hierarchy shown by title size and divider lines, not card-in-card nesting; single edit/refresh icons sit next to the related title text; button groups occupy their own row, aligned left; log/json areas use non-serif font and selectable text.

## MobX Stores

The page is fully data-driven: MobX stores are the source of truth for both resource data and ui state. Render components receive `data` / `config` / `onEvent` props and never call the server themselves.

```text
storeComp       comp records keyed by compId; versions keyed by compId/versionId;
                build log/files keyed by compId/versionId/buildId;
                fetch/create/update/build actions shared by every tab
storeTask       task records keyed by taskId; owns the websocket connection;
                applies pushed progress into records in place (observers re-render)
storeService    service status data
storeUi         ordered tab ids, active tab id, path and operation state per tab
storePlayground playground picker state keyed by tabId; placed instances keyed by
                instanceId (prop values, load status, render error text)
```

Semantic records are shared:

```text
tab A at component/version
tab B at the same component/version
  -> both read the same observable version record in storeComp
  -> one store update changes both views automatically
```

Operation state is not shared accidentally. Metadata-row selection, inline confirmation and create-editor pending state live under each `tabId` in `storeUi`.

## Editing

Only editable resources get edit ui: `compName` and comp metadata (via `MetadataKeyValues`-style key/value rows). In-place text edit switches the element's `contenteditable` value instead of swapping in an `<input>`. Version metadata, source, builds are displayed read-only.

Change flow:

```text
render component --onEvent(change attempt)--> store
  store sends POST /api/comp/update
    -> accepted: update record in place
    -> rejected: keep old value, set message state for the editor
```

Destructive actions (delete component, cancel task) use an inline confirm ui, never `window.confirm()`.

## Task Progress over Websocket

```text
page opens Tasks section
  -> storeTask fetches /api/task/list
  -> storeTask connects /api/ws/task, subscribes "*"
  -> each push updates the task record in place
  -> on reconnect: re-fetch list, re-subscribe
```

Queuing a rebuild from the manage page (rebuild button on a version) goes through `storeComp`, which then asks `storeTask` to subscribe to the returned `taskId`.

## Playground

The Playground section renders registered components live inside the manage page. A picker lists component / version / exposed component (selection auto-fills the newest servable version and its default exposed component); "add to playground" resolves the selection through `GET /api/comp/resolve`, loads the federation entry with the page's own react/react-dom/mobx as shared packages (`src/compLoader.js`), and appends one instance to the playground area.

The playground is itself a host page, so react versions matter (refer to [service_example.md](./service_example.md#does-the-component-need-the-registrys-react-version)). The header states which react version the page renders with, and every exposed component's declared react requirement appears as a badge in the picker and on each placed instance — highlighted as a mismatch when its major differs from the page's react. The same requirement badge also appears in the Components section (version list and exposed-component table).

Each placed instance shows:

```text
prop editor          PropEditor rows built from the exposed component's declared
                     props; string/number/bool props get typed editors, object or
                     unknown types are edited as JSON text; every accepted change
                     immediately re-renders the component with the new prop values
rendered output      the remote component, mounted inside an error boundary
```

Failures never break the page: resolve/import errors show as a load error block, and exceptions thrown while rendering are caught by the error boundary and printed (message + stack + component stack) in a selectable block with a retry action. All of this state lives in `storePlayground`, keyed by instance id.
