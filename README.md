# Dynamic React Component Loading via Module Federation: An Example

A demo showing how to load react component on demand from a general-purposed net server such as flask.

## Architecture

- **main**: The main React app that users see first
- **lazy**: A remote React component that loads on-demand
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

## How It Works

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

## Core Loading Implementation (`compLoader.js`)

The module loading is handled by `main/src/compLoader.js` in 4 steps:

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

## Setup & Run

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

### Sharing a MobX Store

To ensure a fetched component can access and subscribe to the same MobX store as the host, MobX must be declared as a shared singleton so both sides use the same runtime. The store itself must then be passed explicitly, either as a prop or via React Context.

### Version Compatibility

Host and remote do not need the exact same version, but they must be compatible. When `container.init(sharedScope)` is called, the remote checks whether the host's provided version satisfies its `requiredVersion`. If it does, the host's instance is reused. If not, the remote falls back to loading its own bundled copy — which puts two MobX instances on the page and breaks store subscriptions across the boundary.

As long as versions are compatible (e.g. host has `6.15.0`, remote requires `^6.0.0`), it works. A major version mismatch (e.g. host on `6.x`, remote requires `^7.0.0`) will cause the fallback. The safest practice is to keep both on the same major version and use a loose `requiredVersion` such as `^6.0.0`.
