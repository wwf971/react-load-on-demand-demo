// Load a remote component (Module Federation) from this registry service,
// using the info returned by GET /api/comp/resolve.
// Only storePlayground calls this; render components never do.

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as mobx from 'mobx'

const sharedEntryMake = (mod, version) => ({
  [version]: {
    get: () => Promise.resolve(() => mod),
    loaded: true,
    from: 'host',
    version,
  },
})

// packages handed over to the remote container, so the remote reuses the
// host's react/react-dom/mobx instead of loading its own copy
const sharedPackages = {
  react: sharedEntryMake(React, React.version),
  'react-dom': sharedEntryMake(ReactDOM, ReactDOM.version),
  mobx: sharedEntryMake(mobx, '6.15.0'),
}

// federation containers keyed by entry url; urls are immutable per build,
// so one container never needs re-fetching
const containerByUrlEntry = new Map()

export async function loadRemoteComp({ urlEntry, modulePath, entryExport }) {
  let container = containerByUrlEntry.get(urlEntry)
  if (!container) {
    container = await import(/* @vite-ignore */ urlEntry)
    if (typeof container.init === 'function') {
      await container.init(sharedPackages)
    }
    containerByUrlEntry.set(urlEntry, container)
  }

  if (typeof container.get !== 'function') {
    throw new Error('remote container has no get(); the entry file is not a federation container')
  }
  const factory = await container.get(modulePath)
  const Module = await factory()

  const exportName = entryExport || 'default'
  const Comp = Module[exportName]
  if (!Comp) {
    throw new Error(`export "${exportName}" not found in remote module ${modulePath}`)
  }
  return Comp
}
