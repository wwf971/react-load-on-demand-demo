# Dynamic React Component Loading via Module Federation: An Example

A demo of Module Federation: dynamically loading React components from a remote server at runtime, with no knowledge of available components that can be fetched at build time.

## Architecture

- **main**: Host project. The main React app that users see first
- **lazy** and **lazy-2**: Remote projects. Each project provides a React component that loads on-demand
- **run_server.py**: Flask server that serves both apps and provides federation metadata

```
react-lazy-load/
├── main/                                  # main page
│   ├── src/
│   │   ├── App.jsx                        # two buttons for two components
│   │   ├── compLoader.js                  # handles @xxx/xxx modules
│   │   └── App.css                        # orange & green theme
│   └── dist/
├── lazy/                                  # first lazy component (@lazy/component)
│   ├── src/
│   │   ├── LazyComponent.jsx              # orange themed
│   │   └── LazyComponent.css
│   ├── vite.config.js                     # filename: 'LazyComponent.js'
│   └── dist/assets/LazyComponent.js       # .js to be loaded on demand
├── lazy-2/                                # second lazy component (@lazy2/feature)
│   ├── src/
│   │   ├── SpecialFeature.jsx             # green themed
│   │   └── SpecialFeature.css
│   ├── vite.config.js                     # filename: 'SpecialFeature.js'
│   └── dist/assets/SpecialFeature.js      # .js to be loaded on demand
└── run_server.py                          # centralized COMPONENTS_METADATA
```


## How the Host Project Loads Remote Component

To load a specific remote component, the host only needs to know 3 things:

- `remoteName`: the container name declared in remote federation config. Example: `lazyApp`.
- `remoteEntry`: URL of the remote entry JavaScript file that host imports at runtime. Example: `http://localhost:5000/get-component-file/lazy/assets/LazyComponent.js`.
- `exposedModule`: module key used in `container.get(...)`. Example: `./@lazy/component`.

The module loading is handled by `main/src/compLoader.js` in host project in 4 steps:

**Step 1 - Load Remote Entry:**
```javascript
// main/src/compLoader.js
const remoteModule = await import(/* @vite-ignore */ remoteEntryUrl);
window[remoteName] = remoteModule;
```

**Step 2 - Initialize Shared Scope:**
```javascript
// main/config.js — declares which host modules to expose to remotes
export const sharedScope = {
  react: makeEntry(React, '19.2.0'),
  'react-dom': makeEntry(ReactDOM, '19.2.0'),
  mobx: makeEntry(mobx, '6.15.0'),
};
```
```javascript
// main/src/compLoader.js — passes the host's loaded instances to the remote container
import { sharedScope } from '../config.js';
await container.init(sharedScope);
```
This ensures the remote component uses the same instances as the host instead of fetching its own copies.

**Step 3 - Load Exposed Module:**
```javascript
// main/src/compLoader.js
const factory = await container.get(exposedModule); // e.g., './@lazy/component'
const Module = await factory();
```

**Step 4 - Return Component:**
```javascript
// main/src/compLoader.js
return Module.default || Module;
```

The remote entry URL and module path come from the server's centralized `COMPONENTS_METADATA` configuration, giving the server full control over what gets loaded.

## How to Build a Remote Component

This section introduces what must be true for a component to be loadable by the host,  `lazy` and `lazy-2`

### Build output

The final load target is a built JavaScript file (remote entry), plus optional chunk and css assets:

- One remote entry `.js` file (for example `dist/assets/LazyComponent.js`)
- Extra JS chunks that remote entry imports
- Optional CSS files


### `vite.config.js` of remote component project

For each remote component project:

- Configure module federation with a unique `name` (this must match `remoteName` returned by server metadata API)
- Expose one module path (for example `./@lazy/component`)
- Set `shared` for libraries that must be singleton with host (`react`, `react-dom`, `mobx`)
- Keep output deterministic enough that server can reference the remote entry URL

Example (simplified):

```javascript
federation({
  name: 'lazyApp',
  filename: 'LazyComponent.js',
  exposes: {
    './@lazy/component': './src/LazyComponent.jsx',
  },
  shared: {
    react: { singleton: true, requiredVersion: '^19.2.0' },
    'react-dom': { singleton: true, requiredVersion: '^19.2.0' },
    mobx: { singleton: true, requiredVersion: '^6.0.0' },
  },
})
```

### Code organization limits and recommendations

- Export a clear entry component as default export from the exposed module.
- Do not assume access to host internals by relative paths; communicate via props/context only.
- Keep side effects minimal at module top-level (no global mutation on import).
- Keep peer dependency expectations explicit (React/MobX versions must be compatible with host).
- Use local CSS or scoped class names to avoid global style collisions.

### Runtime contract checklist

A remote component is considered valid if:

- `remoteName` in server metadata matches federation `name`
- `remoteEntry` URL is reachable and serves JS module content
- `exposedModule` in metadata exists in federation `exposes`
- exported module resolves to a React component (`default` or module itself)


## How this demo works

1. User clicks "Load @lazy/component" or "Load @lazy2/feature" button
2. Main app fetches metadata from `/get-component-metadata/<component-name>`
3. Server responds with:
   ```json
   {
     "remoteName": "lazyApp",
     "remoteEntry": "http://localhost:5000/get-component-file/lazy/assets/LazyComponent.js",
     "exposedModule": "./@lazy/component"
   }
   ```
4. `compLoader.js` dynamically loads the component using Module Federation
5. Component renders with shared React context


## How to run this demo

### 1. Install Dependencies & Build

The `dist/` directories are not committed. You must build before running.

```bash
# Install Python dependencies
pip install -r requirements.txt

# Build main app
cd main && pnpm install && pnpm run build && cd ..

# Build lazy component
cd lazy && pnpm install && pnpm run build && cd ..

# Build lazy-2 component
cd lazy-2 && pnpm install && pnpm run build && cd ..
```

### 2. Start the Server

```bash
python run_server.py
```

### 3. Test

run `python run_server.py`, and then navigate to: http://localhost:5000

## Shared Dependencies: Avoiding Duplicate Fetches

When a lazy component is fetched, it would normally include all its dependencies (e.g. React, MobX) bundled inside — meaning they get downloaded again even though the host already has them.

To avoid fetching packages that already exist on the page, two conditions must be ensured: 1. the remote bundle does not include the package at build time, and 2. the host provides its already-loaded instance to the remote at runtime. Module Federation solves this with two coordinated steps:

**Condition 1 — Build time, remote project's `vite.config.js` (`./lazy/vite.config.js`, `./lazy-2/vite.config.js`)**: declaring a dependency as `shared` tells Vite not to bundle it into the remote JS file. The remote only contains a reference to it, satisfying condition 1.

```js
shared: {
  react: { singleton: true, requiredVersion: '^19.2.0' },
  mobx: { singleton: true, requiredVersion: '^6.0.0' },
}
```

**Condition 2 — Runtime, host project's `config.js` + `compLoader.js` (`./main/config.js`, `./main/src/compLoader.js`)**: `container.init(sharedScope)` hands the host's already-loaded instances to the remote, so the remote resolves its references from there instead of making a network request, satisfying condition 2.

The `sharedScope` in `config.js` (`./main/config.js`) declares which host modules to expose:

```js
export const sharedScope = {
  react: makeEntry(React, '19.2.0'),
  'react-dom': makeEntry(ReactDOM, '19.2.0'),
  mobx: makeEntry(mobx, '6.15.0'),
};
```

`singleton: true` is critical for libraries like React and MobX that break if two instances coexist on the same page.

## Discussion

### Sharing Packages Across Host and Remote

In module federation, host and remote may both depend on the same package. If that package is loaded twice (one copy from host, one copy from remote), runtime behavior can break, especially for stateful or singleton-oriented libraries. The general rule is:

- mark shared packages as `shared` and usually `singleton: true` in remote build config
- provide host-side instances through `container.init(sharedScope)`
- pass runtime objects explicitly via props or context, rather than relying on shared globals across bundles

For example, if using a global state management library like MobX, Jotai, or Zustand, and if host and remote each load their own instance, store subscriptions will break across the bundle boundary.

### Version Compatibility

Host and remote do not need the exact same version, but they must be compatible. When `container.init(sharedScope)` is called, the remote checks whether the host's provided version satisfies its `requiredVersion`. If it does, the host's instance is reused. If not, the remote falls back to loading its own bundled copy — which puts two MobX instances on the page and breaks store subscriptions across the boundary.

As long as versions are compatible (e.g. host has `6.15.0`, remote requires `^6.0.0`), it works. A major version mismatch (e.g. host on `6.x`, remote requires `^7.0.0`) will cause the fallback. The safest practice is to keep both on the same major version and use a loose `requiredVersion` such as `^6.0.0`.

### Comparison with SSR

SSR (Server Side Rendering) and Module Federation solve different problems and are not interchangeable for this use case.

SSR renders components to HTML on the server before sending to the browser. It improves initial load performance, but all components must be known at build time — the server needs to import and render them. It cannot fetch and mount a component from a remote URL at runtime after the page is already loaded.

Module Federation is about runtime extensibility — components are resolved and mounted dynamically on demand, without a full page reload, from sources that were not known when the app was built.

They are complementary: SSR can handle the initial host page load, while Module Federation handles lazily loading remote components afterward.