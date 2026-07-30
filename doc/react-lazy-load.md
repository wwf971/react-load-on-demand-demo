# react-lazy-load

This project demonstrates fetching React components from a remote server **on demand, at runtime**, using Module Federation. The host page is built and shipped without knowing which components it may load later.

This document explains how the demo under `example/` works, and clears up the points that are confusing at first glance. For build/run steps and the remote-component authoring checklist, refer to `../example/README.md`.

## The Three Players

The demo consists of three independent parts:

```text
example/main/       the HOST: the React app the user opens first
example/lazy/       a REMOTE: provides one component (@lazy/component)
example/lazy-2/     a REMOTE: provides one component (@lazy2/feature)
example/run_server.py   the SERVER: serves all built files + metadata API
```

Host and remotes are **separate Vite projects, built separately**. The host's build knows nothing about the remotes. The only link between them is created at runtime, by the server telling the host where the remote files are.

## Core Concepts

### Remote entry (a generated file, easy to miss)

Each remote project is built with the plugin `@originjs/vite-plugin-federation`. Looking at the remote project `example/lazy/`, its `vite.config.js` says:

```js
federation({
  name: 'lazyApp',                              // container name
  filename: 'LazyComp.js',                      // remote entry file name
  exposes: { './@lazy/component': './src/LazyComp.jsx' },
  shared: { react: {...}, 'react-dom': {...} },
})
```

Building this project generates `example/lazy/dist/assets/LazyComp.js`. This generated file is called the **remote entry**.

Confusion warning: you cannot find `LazyComp.js` in the source tree. It only exists in `dist/` after building, and `dist/` is gitignored.

The remote entry is small. It does NOT contain the component code itself. It contains a table like "if someone asks for `./@lazy/component`, fetch this chunk file", plus two functions: `init` and `get`.

### Container (not a Vite built-in)

When the host does `import(compUrl)`, the object it gets back is called the **container**. "Container" is just Module Federation's name for the loaded remote entry module. It has:

```text
container.init(sharedPackages)        accept the host's shared packages
container.get(modulePath)             load one exposed module
```

These functions are generated into the remote entry by the federation plugin at build time. Nothing here is a Vite or browser built-in.

### Exposed module path (the name you ask the container for)

`modulePath` (e.g. `./@lazy/component`) is a **registered module path**: a key in the `exposes` map of the remote's `vite.config.js`. Registering it at build time is what makes the module loadable from outside. At runtime, the host passes exactly this string to `container.get(...)`.

Before going further, some basics, for readers not familiar with Vite/webpack. Module and component are two different levels — a module is a file, a component is a function inside that file:

- A **module** is just a `.js` file that `export`s things. Nothing React-specific about the word.
- A **React component** is just a JS function. Look at the remote source file `example/lazy/src/LazyComp.jsx`: the component is the function literally declared there as `function LazyComp() {...}`, and the file's last line `export default LazyComp` marks that function as the module's default export.
- So strictly speaking: the **file** `LazyComp.jsx` is the module. The **function** `LazyComp` is the component, living inside it. A component never becomes a module; it stays a function that the module exports.

That was the source world. But federation happens **after building**, so the real question is: what do module and component look like then? Answer: the same two levels survive, almost unchanged.

Before building, in `example/lazy/src/`:

```text
LazyComp.jsx                  the module  (a source file)
  function LazyComp() {...}   the component: a plain JS function
  export default LazyComp     that function is the default export
```

After building, in `example/lazy/dist/assets/`, the module becomes one generated `.js` file with a hashed name. Opening it shows (trimmed):

```js
// dist/assets/__federation_expose_@lazyComponent-<hash>.js
const { useState } = await importShared('react');    // react now comes from the shared scope

function LazyComp() {
  const [count, setCount] = useState(0);
  return jsxRuntimeExports.jsxs("div", { className: "lazy-component", children: [/*...*/] });
}

export { LazyComp as default };
```

What stayed the same:

- The module is still one `.js` file — just a generated one, with a hashed name.
- The component is still a plain function inside it, and still the default export. It even keeps the name `LazyComp`, because this demo builds with `minify: false`; a minifying build could rename the function to something like `t`, and nothing would break — the host never uses the function's name, it takes `Module.default`.
- Props are untouched. Props were never a build-time thing: they are simply the object the caller passes as the function's argument when rendering. The host's React calls this function at runtime the same way it calls any local component.

What the build changed, inside the function body:

- JSX like `<div className="...">` cannot run in the browser, so it was rewritten into plain function calls: `jsxRuntimeExports.jsx("div", {...})`.
- `import { useState } from 'react'` became `importShared('react')`. Because react is declared `shared` in `vite.config.js`, the build replaced the normal import with "ask the shared scope at runtime" — the shared scope that `container.init(sharedPackages)` fills in.

With that, the full containment hierarchy of one remote project:

```text
one remote Vite project (example/lazy/)
  builds into ONE container                     named by compName: "lazyApp"
    which exposes ONE OR MANY modules           each named by a registered modulePath
      modulePath "./@lazy/component"  ->  the FILE ./src/LazyComp.jsx  (= one module;
                                          after build: dist/assets/__federation_expose_...js)
      (this demo registers only one, but the exposes map can hold many)
        each module exports ONE OR MANY values
          here: the FUNCTION LazyComp, exported as default  (= the component)
```

Note the `exposes` entry maps a public path to a **file**, not to a component. To finally reach the component, the host loads that module and picks an export from it (`Module.default` in this demo).

This answers several natural questions:

**"Does one Vite project expose one module?"** No — one remote project builds into one container, and that container can expose many modules. Each entry in the `exposes` map is one more module. This demo just happens to expose a single module per remote.

**"If the module already gives us the component, why do we still need `compName`?"** Because `modulePath` is only meaningful *inside* one container. Two different remote projects could both register a path called `./component`; the host must first say *which container* (`lazyApp`), then which module inside it. Practically, in `example/main/src/compLoader.js` the host also uses `compName` as a cache key (`window[compName]`), so the same remote entry is not fetched twice. Note `compName` does NOT name a component — it names the whole container. This demo calls it `compName` only because each remote project here happens to provide exactly one component.

**"Can one module hold several components?"** Yes. A component is a function declared at the top level of the module file and marked `export`. When the host receives the loaded module, every export is a property on the module object: `Module.default`, `Module.CompA`, `Module.CompB`, and so on. So one module could carry several components. This demo keeps it simple: the exposed module default-exports one component (`LazyComp`), and the host loader takes `Module.default`.

One more trap: the path string `./@lazy/component` has no special meaning. It is just this demo's naming style; the string could be anything, as long as the server metadata and the `exposes` map agree.

### Shared scope (avoid two copies of React)

Both host and remote depend on React. If the remote bundled its own React, the page would run two React instances and break. So:

- Build time, remote side: `shared` in `example/lazy/vite.config.js` tells the build to replace normal react/react-dom imports with federation shared lookups. The build may still emit local fallback chunks, but they are only used when the host cannot provide a compatible package.
- Runtime, host side: the host hands its own already-loaded instances to the remote via `container.init(sharedPackages)`.

The host's `sharedPackages` object lives in `example/main/config.js`. It wraps host modules into the format the container expects (the `makeEntry` helper there is local code of this demo, not a library API).

For version compatibility rules and deeper discussion, refer to `../README.md#Discussion`.

## The Whole Flow, Step by Step

Now we look at the host project. `example/main/src/App.jsx` has the buttons; clicking one runs `handleLoadComp`, which does two things: fetch metadata, then call `loadFederatedComp` in `example/main/src/compLoader.js`.

```text
[browser, App.jsx]
  click "Load @lazy/component"
  -> GET /get-comp-metadata/lazy            (JSON only, no component code yet)
     <- { compName: "lazyApp",
          compUrl: "http://.../assets/LazyComp.js",
          modulePath: "./@lazy/component" }

[browser, compLoader.js: loadFederatedComp(compMetadata)]
  -> import(compUrl)                        NETWORK FETCH #1: remote entry
       returns the container (init/get)
  -> container.init(sharedPackages)         hand over host's react, react-dom, mobx
  -> container.get("./@lazy/component")     NETWORK FETCH #2: the component chunk
       returns a factory
  -> factory()                              returns the module
  -> Module.default is the React component
  -> render it
```

Where the metadata comes from: the server `example/run_server.py` keeps a table `COMPONENTS_METADATA` mapping component name to `compName` / `compUrl` / `modulePath`. The server is the single source of truth for what can be loaded; the host hardcodes nothing about remotes.

## Common Confusions

**"Does the metadata request already fetch the component?"** No. `/get-comp-metadata/lazy` returns only a small JSON telling the host where things are. Component code transfers later, in fetch #1 and #2 above.

**"Why two fetches for one component?"** The remote entry (fetch #1) is a lightweight lookup table shared by all components of that remote project. The real component body sits in a separate chunk file (fetch #2, a file like `__federation_expose_...js` in the remote's `dist/assets/`), fetched only when `container.get` asks for it. Note this split depends on build output; some builds may inline the component into the remote entry.

**"Where do `container` and `makeEntry` come from?"** `container` is simply the result of `import(compUrl)` in `compLoader.js`; its `init`/`get` were generated by the federation plugin when the remote was built. `makeEntry` is a small local helper defined in `example/main/config.js`.

**"Is the exposed module path a component name?"** No — it names one JS module inside a container, and components are exports inside that module. See "Exposed module path" in Core Concepts above.

**"Which name must match which?"** Three matchings must hold, all mediated by the server metadata:

```text
metadata.compName    == `name` in remote vite.config.js               (e.g. lazyApp)
metadata.compUrl     -> `filename` in remote vite.config.js           (e.g. LazyComp.js)
metadata.modulePath  == a key in `exposes` of remote vite.config.js   (e.g. ./@lazy/component)
```

Do not confuse two different "component names": `lazy` (the key in the server's `COMPONENTS_METADATA`, used in URLs like `/get-comp-metadata/lazy`) and `lazyApp` (the federation container name, `compName`). The server key exists only between browser and server; the container name exists only between host and remote build.

**"I can't find the files being fetched."** They are build outputs under each remote's `dist/`, which is gitignored. Build the remote projects first (see `../example/README.md#How-to-run-this-demo`).


### Sharing Packages Across Host and Remote

In module federation, host and remote may both depend on the same package. If that package is loaded twice (one copy from host, one copy from remote), runtime behavior can break, especially for stateful or singleton-oriented libraries. The general rule is:

- for remote component(component that gets fetched) project, mark shared packages as `shared` and usually `singleton: true` in remote build config(`vite.config.js` if using vite.js)

example:

```javascript
//vite.config.js
federation({
  name: 'lazyApp',
  filename: 'LazyComp.js',
  exposes: {
    './@lazy/component': './src/LazyComp.jsx',
  },
  shared: {
    react: {
      singleton: true,
      requiredVersion: '^19.2.0'
    },
    'react-dom': {
      singleton: true,
      requiredVersion: '^19.2.0'
    }
  }
})
```

- for host project(webpage that fetches component from remote), provide host-side instances through `container.init(sharedPackages)`

- pass runtime objects explicitly via props or context, rather than relying on shared globals across bundles

For example, if using a global state management library like MobX, Jotai, or Zustand, and if host and remote each load their own instance, store subscriptions will break across the bundle boundary.

### Package Version Compatibility

The packages that host provides and remote components require do not need to be the exact same version, but they must be compatible. When `container.init(sharedPackages)` is called, the remote's generated federation runtime checks whether the version of the package provided by host satisfies its `requiredVersion`. If it does, the host's instance is reused. If not, the remote falls back to loading its own bundled copy, which puts two MobX instances on the page and breaks store subscriptions across the boundary.

As long as package versions that host provides and that remote component requires are compatible (for example host has `6.15.0`, remote requires `^6.0.0`), it works. A major version mismatch (for example host on `6.x`, remote requires `^7.0.0`) will cause the fallback. The safest practice is to keep both on the same major version and use a loose `requiredVersion` such as `^6.0.0`.

#### When and where does version check logic take place?

But who exactly does the version checking, and when and where does it take place? Basically, Vite/Webpack federation plugin will generate this checking logic for us. Taking the demo in `/example/` as example, at the host side, the host provides the packages along with their versions in `example/main/config.js`:

```javascript
export const sharedPackages = {
  react: makeEntry(React, '19.2.0'),
  'react-dom': makeEntry(ReactDOM, '19.2.0'),
  mobx: makeEntry(mobx, '6.15.0'),
};
```

And at the remote component side, in its own project's `vite.config.js`, what package it relies on and which version is needed is declared in this way:

```javascript
shared: {
  react: {
    singleton: true,
    requiredVersion: '^19.2.0'
  },
  'react-dom': {
    singleton: true,
    requiredVersion: '^19.2.0'
  }
}
```


When the host calls `container.init(sharedPackages)`, the generated federation runtime in the remote entry compares these two pieces of information. If the host-provided version satisfies `requiredVersion`, the remote uses the host's package instance.

If you are really curious where exactly this package check logic lies in, build the remote component project, then check the generated files under `example/lazy/dist/assets/`. In this demo, `@originjs/vite-plugin-federation` generates a helper file like `__federation_fn_import-C4H9mTFE.js`. Inside that file, there is a `moduleMap` which records both the local fallback file and the required version:

```javascript
const moduleMap = {
  'react': {
    get: () => () => __federation_import(new URL('__federation_shared_react-BjdAhW7f.js', import.meta.url).href),
    import: true,
    requiredVersion: '^19.2.0'
  },
  'react-dom': {
    get: () => () => __federation_import(new URL('__federation_shared_react-dom-BEaDVk2S.js', import.meta.url).href),
    import: true,
    requiredVersion: '^19.2.0'
  }
};
```

And the checking logic is also there. First it tries to get the package from `globalThis.__federation_shared__`, which is filled by `container.init(sharedPackages)`. If the host-provided version satisfies `requiredVersion`, it uses that host-provided package. If not, it falls back to `getSharedFromLocal(name)`:

```javascript
async function importShared(name, shareScope = 'default') {
  return moduleCache[name]
    ? new Promise((r) => r(moduleCache[name]))
    : (await getSharedFromRuntime(name, shareScope)) || getSharedFromLocal(name)
}
```


#### One necessary condition: remote component must be built as multiple files

Have you realized that things actually would be meaningless, if the remote component is bundled as one whole file? Because this means all the packages it relies on would definitely be bundled into this single file(of course the component's own logic is also in it). If so, when fetching the remote component, the packages will always be fetched. Even if the intelligent check logic in the component detects that the host provides needed packages, and does not actually use the packages bundled along with the remote component, the packages are fetched, adding meaninglessly to the data volume transferred over network, and increasing delay and browser tab memory consumption.

So basically, to really benefit from package sharing. it would definitely require the built form of component to be separate parts that can be fetched on demand. Let us see exactly how this is done. After building `example/lazy`, the remote component is not one single inseparable file. It becomes files like:

```text
LazyComp.js                                             remote entry / container
__federation_expose_@lazyComponent-Bl_rhJoi.js          exposed component module
__federation_fn_import-C4H9mTFE.js                      generated package sharing helper
__federation_shared_react-BjdAhW7f.js                   local fallback wrapper for react
__federation_shared_react-dom-BEaDVk2S.js               local fallback wrapper for react-dom
index-MCx4YXC7.js / index-XYqIZRee.js                   actual bundled dependency code
```

`LazyComp.js` is the remote entry. It does not directly contain the component function. Instead, it maps `./@lazy/component` to another generated file. This part only explains how the component chunk is fetched:

```javascript
// LazyComp.js
let moduleMap = {
  "./@lazy/component": () => {
    dynamicLoadingCss(["style-DnlLr0F8.css"], false, './@lazy/component');
    return __federation_import('./__federation_expose_@lazyComponent-Bl_rhJoi.js')
      .then(module => Object.keys(module).every(item => exportSet.has(item)) ? () => module.default : () => module)
  },
};
```

Then, inside `__federation_expose_@lazyComponent-Bl_rhJoi.js`, the component module asks for React through the generated sharing helper:

```javascript
// __federation_expose_@lazyComponent-Bl_rhJoi.js
import { importShared } from './__federation_fn_import-C4H9mTFE.js';

const {useState} = await importShared('react');
function LazyComp() {
  // component logic...
}
```

Later you will see two `__federation_import(...)` calls. But do not get confused: they are just wrapper functions, defined in the same generated script where they are used. Their content is:

```javascript
// LazyComp.js or __federation_fn_import-C4H9mTFE.js
async function __federation_import(name) {
  currentImports[name] ??= import(name);
  return currentImports[name]
}
```

As you can see, what they do is no more than call native dynamic `import(...)` and cache the promise, so the same generated file is not imported twice. They ARE NOT the version checking logic.

The important part is inside `__federation_fn_import-C4H9mTFE.js`. For React, the generated helper records where the remote's own fallback React file is:

```javascript
// __federation_fn_import-C4H9mTFE.js
const moduleMap = {
  'react': {
    get: () => () => __federation_import(new URL('__federation_shared_react-BjdAhW7f.js', import.meta.url).href),
    import: true,
    requiredVersion: '^19.2.0'
  }
};
```

But this fallback file is not fetched immediately. The result of `getSharedFromRuntime(...)` is decided by what `container.init(sharedPackages)` put into `globalThis.__federation_shared__` earlier. In `LazyComp.js`, `container.init(...)` is generated like this:

```javascript
// LazyComp.js
const init = (shareScope) => {
  globalThis.__federation_shared__ = globalThis.__federation_shared__ || {};
  Object.entries(shareScope).forEach(([key, value]) => {
    for (const [versionKey, versionValue] of Object.entries(value)) {
      const scope = versionValue.scope || 'default';
      globalThis.__federation_shared__[scope] = globalThis.__federation_shared__[scope] || {};
      const shared = globalThis.__federation_shared__[scope];
      (shared[key] = shared[key] || {})[versionKey] = versionValue;
    }
  });
};
```

So when host calls `container.init(sharedPackages)`, host's React becomes something like:

```text
globalThis.__federation_shared__.default.react["19.2.0"] = hostReactEntry
```

Later, when the component chunk calls `importShared('react')`, `getSharedFromRuntime(...)` checks exactly this global shared object. If it finds a version that satisfies `requiredVersion`, it returns the host package:

```javascript
// __federation_fn_import-C4H9mTFE.js
async function getSharedFromRuntime(name, shareScope) {
  if (globalThis?.__federation_shared__?.[shareScope]?.[name]) {
    const versionObj = globalThis.__federation_shared__[shareScope][name];
    const requiredVersion = moduleMap[name]?.requiredVersion;
    const versionKey = Object.keys(versionObj).find((version) =>
      satisfy(version, requiredVersion)
    );
    if (versionKey) {
      const versionValue = versionObj[versionKey];
      return await (await versionValue.get())();
    }
  }
}
```

Only if `getSharedFromRuntime(...)` returns nothing does `importShared('react')` call `getSharedFromLocal(name)`, which imports the fallback file recorded above:

```javascript
// __federation_fn_import-C4H9mTFE.js
async function importShared(name, shareScope = 'default') {
  return moduleCache[name]
    ? new Promise((r) => r(moduleCache[name]))
    : (await getSharedFromRuntime(name, shareScope)) || getSharedFromLocal(name)
}
```

The first usage is in `LazyComp.js`, to fetch the exposed component chunk:

```javascript
// LazyComp.js
__federation_import('./__federation_expose_@lazyComponent-Bl_rhJoi.js')
```

The second usage is in `__federation_fn_import-C4H9mTFE.js`, to fetch the remote's local fallback package file, but only after host sharing fails:

```javascript
// __federation_fn_import-C4H9mTFE.js
__federation_import(new URL('__federation_shared_react-BjdAhW7f.js', import.meta.url).href)
```

So the reflected logic is this:

```text
component chunk needs react
  -> importShared('react')
     -> try host-provided react from container.init(sharedPackages)
        -> if compatible, use host's react, do not fetch __federation_shared_react-...
        -> if not compatible, fetch __federation_shared_react-... as remote's local fallback
```

So the package files may exist in the remote build output, but they are not necessarily fetched every time. If host provides a compatible package version, the generated helper uses the host package. Only when host does not provide a compatible package version does the helper import the remote's local fallback file.

### Comparison with SSR

SSR (Server Side Rendering) and Module Federation solve different problems and are not interchangeable for this use case.

SSR renders components to HTML on the server before sending to the browser. It improves initial load performance, but all components must be known at build time. The server needs to import and render them. It cannot fetch and mount a component from a remote URL at runtime after the page is already loaded.

Module Federation is about runtime extensibility. Components are resolved and mounted dynamically on demand, without a full page reload, from sources that were not known when the app was built.

They are complementary: SSR can handle the initial host page load, while Module Federation handles lazily loading remote components afterward.


