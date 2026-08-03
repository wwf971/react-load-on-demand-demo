import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

// Keep this config consistent with metadata.federation and metadata.packages
// in ./comp.jsonc; for prebuilt upload the uploader owns that consistency.
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'helloCardApp',
      filename: 'HelloCard.js',
      exposes: {
        './hello-card': './src/entry.jsx',
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^19.2.0',
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^19.2.0',
        },
      },
    }),
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
})
