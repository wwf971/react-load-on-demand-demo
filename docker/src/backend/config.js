import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DOCKER_DIR = path.resolve(__dirname, '../..')

const CONFIG_DEFAULT = {
  server: {
    port: 9415,
    host: '0.0.0.0',
  },
  storage_obj: {
    url_base: 'http://127.0.0.1:5107',
    storage_endpoint_key: null, // null = storage-obj runtime default endpoint
    space_name: 'react-lazy-load',
  },
  build: {
    concurrency: 1,
    timeout_seconds: 600,
    // whether the runner re-queues a task found undergoing after a restart.
    // default false: leave it in failed state; retry is an explicit api call.
    is_requeue_on_restart: false,
  },
}

const mergeDeep = (base, override) => {
  if (override === null || override === undefined) return base
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return override
  if (typeof override !== 'object' || Array.isArray(override)) return override
  const result = { ...base }
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in base ? mergeDeep(base[key], value) : value
  }
  return result
}

const readYamlIfExists = (filePath) => {
  if (!fs.existsSync(filePath)) return null
  return parseYaml(fs.readFileSync(filePath, 'utf-8'))
}

export const loadConfig = () => {
  const configDir = process.env.CONFIG_DIR || path.join(DOCKER_DIR, 'config')
  let config = CONFIG_DEFAULT
  config = mergeDeep(config, readYamlIfExists(path.join(configDir, 'config.yaml')))
  config = mergeDeep(config, readYamlIfExists(path.join(configDir, 'config.0.yaml')))

  if (process.env.PORT) config.server.port = Number(process.env.PORT)
  if (process.env.HOST) config.server.host = process.env.HOST
  if (process.env.STORAGE_OBJ_URL_BASE) config.storage_obj.url_base = process.env.STORAGE_OBJ_URL_BASE

  config.roots = {
    appRoot: process.env.APP_ROOT || '/app',
    dataRoot: process.env.DATA_ROOT || '/data',
    cacheRoot: process.env.CACHE_ROOT || '/cache',
  }
  return config
}
