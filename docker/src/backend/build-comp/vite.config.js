import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

// federation.config.json is overwritten by the task runner from version metadata
// (metadata.federation + metadata.packages), so metadata and build output cannot disagree.
const cfg = JSON.parse(
  fs.readFileSync(new URL('./federation.config.json', import.meta.url), 'utf-8'),
)

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: cfg.containerName,
      filename: cfg.fileEntry,
      exposes: {
        [cfg.modulePath]: `./${cfg.fileEntrySource}`,
      },
      shared: cfg.shared,
    }),
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
})
