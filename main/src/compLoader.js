import { sharedScope } from '../config.js';

/**
 * Step 1 — Load remoteEntry.js dynamically as ES module
 */
async function loadRemoteEntry(remoteName, remoteEntryUrl) {
  if (window[remoteName]) {
    return window[remoteName];
  }

  const remoteModule = await import(/* @vite-ignore */ remoteEntryUrl);
  window[remoteName] = remoteModule;
  return remoteModule;
}

/**
 * Step 2 — Initialize shared scope
 */
async function initFederation(container) {
  if (container.init) {
    await container.init(sharedScope);
  }
}

/**
 * Step 3 — Load exposed module
 */
async function loadRemoteModule(container, exposedModule) {
  if (!container.get) {
    throw new Error('Remote container does not have a get method');
  }

  const factory = await container.get(exposedModule);
  const Module = await factory();
  return Module;
}

/**
 * Step 4 — Put it together
 */
export async function loadFederatedComponent(meta) {
  const { remoteName, remoteEntry, exposedModule } = meta;

  const container = await loadRemoteEntry(remoteName, remoteEntry);
  await initFederation(container);

  const Module = await loadRemoteModule(container, exposedModule);
  return Module.default || Module;
}
