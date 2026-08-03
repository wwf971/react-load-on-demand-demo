import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const reactPkgRoot = path.dirname(require.resolve('react/package.json'))
const reactDomPkgRoot = path.dirname(require.resolve('react-dom/package.json'))

function resolveReactCompMiscRoot() {
  try {
    return path.dirname(
      require.resolve('@wwf971/react-comp-misc/package.json'),
    )
  } catch {
    return path.resolve(__dirname, '../../../../../2025/react-comp-misc')
  }
}

const reactCompMiscRoot = resolveReactCompMiscRoot()

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: reactPkgRoot,
      'react-dom': reactDomPkgRoot,
      '@wwf971/react-comp-misc': path.join(reactCompMiscRoot, 'src/index.js'),
    },
  },
  base: '/manage/',
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9415',
        ws: true,
      },
      '/comp-file': 'http://127.0.0.1:9415',
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../../data/manage-page'),
    emptyOutDir: true,
  },
})
