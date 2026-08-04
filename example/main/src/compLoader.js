import { sharedPackages } from '../config.js';
// the sharedPackages contains entries of packages like react, react-dom, mobx, etc
// the sharedPackages is to be shared to the components fetched from remote

// this function will be called by App.jsx, to load the remote component
export async function loadFederatedComp(compMetadata) {
  // compMetadata is simply fetched by requesting /get-comp-metadata/${compName} from the demo server.
    // compMetadata.compName: federation container name, matching the remote vite.config.js name.
    // compMetadata.compUrl: URL of the generated federation entry JS file.
    // compMetadata.modulePath: module path registered in the remote vite.config.js exposes map.
    // compMetadata.entryExport: component export to select from the loaded module.

  // IMPORTANT: the module instance is still not fetched now.
  // container: federation container instance.
  const container = await loadRemoteEntry(compMetadata.compName, compMetadata.compUrl);
  await initFederation(container);

  const Module = await loadRemoteModule(container, compMetadata.modulePath);
  const entryExport = compMetadata.entryExport || 'default';
  return Module[entryExport] || Module.default || Module;
}


// below are the functions utilized by loadFederatedComp

/*
how is the remote component loaded?

import(compUrl) @ loadRemoteEntry
  fetches LazyComp.js, the remote entry/container

container.get(modulePath) @ loadRemoteModule
  fetches the actual exposed component chunk if it was split into a separate file

*/

/**
 * Step 1 — Load the remote entry file (compUrl) dynamically as ES module
 */
async function loadRemoteEntry(compName, compUrl) {
  if (window[compName]) {
    return window[compName];
  }

  // remoteModule is just the federation container instance
  const remoteModule = await import(/* @vite-ignore */ compUrl);
  window[compName] = remoteModule;
  return remoteModule;
}

/**
 * Step 2 — Initialize shared scope
 */
async function initFederation(container) {
  // container.init gives it host-side shared packages
  if (container.init) {
    await container.init(sharedPackages);
  }
}

/**
 * Step 3 — Load exposed module
 */
async function loadRemoteModule(container, modulePath) {
  if (!container.get) {
    throw new Error('Remote container does not have a get method');
  }

  const factory = await container.get(modulePath);
  const Module = await factory();
  return Module;
}

