# react-lazy-load

This project demonstrates how to fetch react components from remote server on demand using Module Federation.

## Folders

- `example/`: a simple demonstration with a host sub-project, two remote component sub-projects, and a flask-based web server.
- `docker/`: implementation of the Docker container that provides a microservice of building components that can be fetched dynamically using module federation.

## Discussion

### Sharing Packages Across Host and Remote

In module federation, host and remote may both depend on the same package. If that package is loaded twice (one copy from host, one copy from remote), runtime behavior can break, especially for stateful or singleton-oriented libraries. The general rule is:

- mark shared packages as `shared` and usually `singleton: true` in remote build config
- provide host-side instances through `container.init(sharedScope)`
- pass runtime objects explicitly via props or context, rather than relying on shared globals across bundles

For example, if using a global state management library like MobX, Jotai, or Zustand, and if host and remote each load their own instance, store subscriptions will break across the bundle boundary.

### Version Compatibility

Host and remote do not need the exact same version, but they must be compatible. When `container.init(sharedScope)` is called, the remote checks whether the host's provided version satisfies its `requiredVersion`. If it does, the host's instance is reused. If not, the remote falls back to loading its own bundled copy, which puts two MobX instances on the page and breaks store subscriptions across the boundary.

As long as versions are compatible (for example host has `6.15.0`, remote requires `^6.0.0`), it works. A major version mismatch (for example host on `6.x`, remote requires `^7.0.0`) will cause the fallback. The safest practice is to keep both on the same major version and use a loose `requiredVersion` such as `^6.0.0`.

### Comparison with SSR

SSR (Server Side Rendering) and Module Federation solve different problems and are not interchangeable for this use case.

SSR renders components to HTML on the server before sending to the browser. It improves initial load performance, but all components must be known at build time. The server needs to import and render them. It cannot fetch and mount a component from a remote URL at runtime after the page is already loaded.

Module Federation is about runtime extensibility. Components are resolved and mounted dynamically on demand, without a full page reload, from sources that were not known when the app was built.

They are complementary: SSR can handle the initial host page load, while Module Federation handles lazily loading remote components afterward.


