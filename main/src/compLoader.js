/**
 * Step 1 — Load remoteEntry.js dynamically as ES module
 */
async function loadRemoteEntry(remoteName, remoteEntryUrl) {
  // Check if already loaded
  if (window[remoteName]) {
    return window[remoteName];
  }

  // Import the remote entry as an ES module
  const remoteModule = await import(/* @vite-ignore */ remoteEntryUrl);
  
  // Store it globally for future reference
  window[remoteName] = remoteModule;
  
  return remoteModule;
}

/**
 * Step 2 — Initialize shared scope (simplified for Vite)
 */
async function initFederation(container) {
  // Initialize with shared React dependencies
  if (container.init) {
    // Import React and ReactDOM from the host
    const React = await import('react');
    const ReactDOM = await import('react-dom');
    
    // Create shared scope in the format expected by @originjs/vite-plugin-federation
    const sharedScope = {
      react: {
        '19.2.0': {
          get: () => Promise.resolve(() => React),
          loaded: true,
          from: 'host',
          version: '19.2.0'
        }
      },
      'react-dom': {
        '19.2.0': {
          get: () => Promise.resolve(() => ReactDOM),
          loaded: true,
          from: 'host',
          version: '19.2.0'
        }
      }
    };
    
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

  console.log('Loading federated component:', meta);

  const container = await loadRemoteEntry(remoteName, remoteEntry);
  await initFederation(container);

  const Module = await loadRemoteModule(container, exposedModule);
  return Module.default || Module;
}
