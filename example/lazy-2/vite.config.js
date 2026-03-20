import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'lazy2App',
      filename: 'SpecialFeature.js',
      exposes: {
        './@lazy2/feature': './src/SpecialFeature.jsx',
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^19.2.0'
        },
        'react-dom': {
          singleton: true,
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
