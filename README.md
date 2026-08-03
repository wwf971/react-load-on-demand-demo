# react-lazy-load

This project demonstrates how to fetch react components from remote server on demand using Module Federation.

## Project Folder Structure

- `example/`: a simple demonstration with a host sub-project, two remote component sub-projects, and a flask-based web server.
- `docker/`: remote-component service. Folder layout: `docker/README.md`.
- `doc/`: service design docs; start at `doc/react-lazy-load_service.md`.

## Technical Details

- `doc/react-lazy-load.md`: how Module Federation runtime loading works (the `example/` demo).
- `doc/react-lazy-load_service.md`: semantic model and design of the remote component service.
