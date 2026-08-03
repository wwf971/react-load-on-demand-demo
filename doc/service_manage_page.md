# Manage Page

Vite + React + MobX frontend, built and served by the service (served under `/manage/`). Frontend layout follows the same style as the `storage-obj` and `file-access-smb` manage pages, and actively uses components from the `react-comp-misc` package (imported from package root only, e.g. `import { Icon, MetadataKeyValues } from '@wwf971/react-comp-misc'`).

## Layout

Left navigation + main panel:

```text
+------------+---------------------------------------------+
| Components | main panel of the selected section          |
| Tasks      |                                             |
| Status     |                                             |
+------------+---------------------------------------------+
```

- Components section:

```text
component list (table: compName, description, tags, version count)
  -> select one component
      component detail
        comp metadata (editable key/values)
        version list (versionId, versionName, servable or not, build count)
          -> select one version
              version detail
                version metadata (read-only; versions are frozen)
                build list (buildId, buildType, buildStatus)
                  -> view build log
                file list of newest successful output (path, size, url)
```

- Tasks section: task table (taskId, comp/version, taskStatus, latest message), live-updating over websocket; select one task to see full `progressList` and result/exit info; cancel button for undergoing tasks.
- Status section: service metadata, counters from `/api/service/status`, storage-obj reachability.

Layout rules (from project frontend rules): hierarchy shown by title size and divider lines, not card-in-card nesting; single edit/refresh icons sit next to the related title text; button groups occupy their own row, aligned left; log/json areas use non-serif font and selectable text.

## MobX Stores

The page is fully data-driven: MobX stores are the source of truth for both resource data and ui state. Render components receive `data` / `config` / `onEvent` props and never call the server themselves.

```text
storeComp       comp records keyed by compId; version records keyed by versionId;
                fetch/create/update actions
storeTask       task records keyed by taskId; owns the websocket connection;
                applies pushed progress into records in place (observers re-render)
storeService    service status data
storeUi         ui state keyed by component instance id:
                selected compId / versionId / taskId, active section,
                expanded rows, edit mode and pending state of editors
```

Ui state examples that must live in `storeUi`, not in local component state: which table row is selected, whether comp metadata is in edit mode, whether a change request is pending server confirmation.

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

Submitting a build from the manage page (rebuild button on a version) goes through `storeComp`, which then asks `storeTask` to subscribe to the returned `taskId`.
