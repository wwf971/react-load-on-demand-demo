# react-lazy-load

This project demonstrates how to fetch react components from remote server on demand using Module Federation.

## Project Folder Structure

- `example/`: a simple demonstration with a host sub-project, two remote component sub-projects, and a flask-based web server.
- `docker/`: build-service server, templates, and `src/manage-page` (Vite React UI built into `docker/data/manage-page`, copied to `$DATA_ROOT/manage/page/` at launch).

## Technical Details

For more technical discussion, refer to `doc/react-lazy-load.md`.
