# Dynamic React Component Loading via Module Federation: An Example

An demo showing how to load react component on demand from a general-purposed net server such as flask.

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
const remoteModule = await import(/* @vite-ignore */ remoteEntryUrl);
window[remoteName] = remoteModule; // Cache for reuse
```

**Step 2 - Initialize Shared Scope:**
```javascript
const sharedScope = {
  react: { '19.2.0': { get: () => Promise.resolve(() => React), ... } },
  'react-dom': { '19.2.0': { get: () => Promise.resolve(() => ReactDOM), ... } }
};
await container.init(sharedScope);
```
This ensures the remote component uses the same React instance as the host.

**Step 3 - Load Exposed Module:**
```javascript
const factory = await container.get(exposedModule); // e.g., './@lazy/component'
const Module = await factory();
```

**Step 4 - Return Component:**
```javascript
return Module.default || Module;
```

The remote entry URL and module path come from the server's centralized `COMPONENTS_METADATA` configuration, giving the server full control over what gets loaded.

## Setup & Run

### 1. Install Dependencies

Both React projects are already built and ready to run.

If you need to rebuild:

```bash
# Install Python dependencies
pip install -r requirements.txt

# Build lazy component
cd ../lazy && pnpm install && pnpm run build

# Build lazy-2 component
cd ../lazy-2 && pnpm install && pnpm run build
```

### 2. Start the Server

```bash
python run_server.py
```

### 3. Test

run `python run_server.py`, and then navigate to: http://localhost:5000