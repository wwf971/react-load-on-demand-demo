import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'lazyApp',
      filename: 'LazyComp.js',
      exposes: {
        './@lazy/component': './src/LazyComp.jsx',
      },
      shared: { 
        react: {
          singleton: true, // important for remote and host to use same react package
          requiredVersion: '^19.2.0'
        },
        'react-dom': {
          singleton: true, // important for remote and host to use same react-dom package
          requiredVersion: '^19.2.0'
        }
      }
    })
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false
  }
})
