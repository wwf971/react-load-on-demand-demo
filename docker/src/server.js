import path from 'node:path'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import Fastify from 'fastify'
import { loadConfig } from './backend/config.js'
import { StorageObjClient } from './storage.js'
import { ResourceService, buildHeadOf, isSafeRelativePath } from './backend/resource.js'
import { TaskService, TASK_TYPE_VERSION_BUILD, TASK_STATUS_UNDERGOING } from './backend/task.js'
import { TaskRunner } from './backend/taskRunner.js'
import { WsHub } from './backend/wsHub.js'
import { newIdMs48 } from './backend/id.js'
import { timeNow } from './backend/time.js'

const config = loadConfig()
const app = Fastify({ logger: true })

const manageStaticRoot = path.join(config.roots.dataRoot, 'manage', 'page')

app.get('/', async (request, reply) => reply.redirect('/manage/', 302))
app.get('/manage', async (request, reply) => reply.redirect('/manage/', 302))

await app.register(fastifyStatic, {
  root: manageStaticRoot,
  prefix: '/manage/',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store')
  },
})
await app.register(fastifyWebsocket)

const client = new StorageObjClient({
  urlBase: config.storage_obj.url_base,
  storageEndpointKey: config.storage_obj.storage_endpoint_key,
})
const wsHub = new WsHub()
const resource = new ResourceService({ client, spacePrefix: config.storage_obj.space_prefix })
const tasks = new TaskService({ client, resource, wsHub })
const runner = new TaskRunner({ config, resource, tasks })

const serviceState = { isReady: false, initError: '' }
const serviceNotReadyMessage = () => {
  const storageUrl = config.storage_obj.url_base
  const reason = serviceState.initError || 'initializing'
  return `service not ready: waiting for storage-obj at ${storageUrl}: ${reason}`
}

// ---- helpers ----

const ok = (data, message = '') => ({ code: 0, data, message })

// wraps a handler into the {code, data, message} contract
const wrap = (handler) => async (request, reply) => {
  if (!serviceState.isReady) {
    reply.status(503)
    return { code: -1, data: null, message: serviceNotReadyMessage() }
  }
  try {
    return await handler(request, reply)
  } catch (error) {
    reply.status(400)
    return { code: -1, data: null, message: error instanceof Error ? error.message : String(error) }
  }
}

const requireField = (value, name) => {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${name} is required`)
  }
  return value
}

const validateFileList = (fileList, name) => {
  if (!Array.isArray(fileList) || fileList.length === 0) {
    throw new Error(`${name} should be a non-empty array`)
  }
  for (const file of fileList) {
    if (!isSafeRelativePath(file.path)) throw new Error(`invalid path in ${name}: ${file.path}`)
    if (file.contentBase64 === undefined && file.contentText === undefined) {
      throw new Error(`${name} entry needs contentBase64 or contentText: ${file.path}`)
    }
  }
}

const validateVersionMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') throw new Error('metadata is required')
  const federation = metadata.federation
  if (!federation?.containerName || !federation?.fileEntry || !federation?.modulePath) {
    throw new Error('metadata.federation needs containerName, fileEntry, modulePath')
  }
}

// ---- service ----

app.get('/api/health/ping', async () => ok({ status: 'ok' }))

// Available even when storage-obj init has not finished, so the manage page
// can show readiness instead of sticking on loading.
app.get('/api/service/status', async () => {
  let isStorageReachable = false
  try {
    await client.healthPing()
    isStorageReachable = true
  } catch {
    isStorageReachable = false
  }

  if (!serviceState.isReady) {
    return ok({
      isReady: false,
      initError: serviceState.initError || 'initializing',
      serviceMetadata: null,
      compCount: 0,
      versionCount: 0,
      taskCount: 0,
      taskCountUndergoing: 0,
      storage: {
        urlBase: config.storage_obj.url_base,
        spacePrefix: config.storage_obj.space_prefix,
        isReachable: isStorageReachable,
      },
      timeNow: timeNow(),
    })
  }

  try {
    const serviceMetadata = await resource.serviceMetadataGet()
    let versionCount = 0
    const compIds = Object.keys(resource.compIndex.compById)
    for (const compId of compIds) {
      const found = await resource.compRecordGet(compId)
      versionCount += found?.record.versionList?.length || 0
    }
    const taskRecords = tasks.taskList()
    return ok({
      isReady: true,
      initError: '',
      serviceMetadata,
      compCount: compIds.length,
      versionCount,
      taskCount: taskRecords.length,
      taskCountUndergoing: taskRecords.filter((t) => t.taskStatus === TASK_STATUS_UNDERGOING).length,
      storage: {
        urlBase: config.storage_obj.url_base,
        spacePrefix: config.storage_obj.space_prefix,
        isReachable: isStorageReachable,
      },
      timeNow: timeNow(),
    })
  } catch (error) {
    return {
      code: -1,
      data: null,
      message: error instanceof Error ? error.message : String(error),
    }
  }
})

// ---- component ----

app.get(
  '/api/comp/list',
  wrap(async (request) => {
    const { name = '', tag = '' } = request.query
    const records = await resource.compList({ name, tag })
    return ok({ comps: records, compCount: records.length })
  }),
)

app.get(
  '/api/comp/get',
  wrap(async (request) => {
    const compId = requireField(request.query.compId, 'compId')
    const found = await resource.compRecordGet(compId)
    if (!found) throw new Error(`component not found: ${compId}`)
    return ok(found.record)
  }),
)

app.get(
  '/api/comp/find-by-name',
  wrap(async (request) => {
    const compName = requireField(request.query.compName, 'compName')
    const record = await resource.compFindByName(compName)
    if (!record) throw new Error(`component not found by name: ${compName}`)
    return ok(record)
  }),
)

app.post(
  '/api/comp/create',
  wrap(async (request) => {
    const body = request.body || {}
    requireField(body.compName, 'compName')
    const record = await resource.compCreate({ compName: body.compName, metadata: body.metadata })
    return ok({ compId: record.compId })
  }),
)

app.post(
  '/api/comp/update',
  wrap(async (request) => {
    const body = request.body || {}
    requireField(body.compId, 'compId')
    const record = await resource.compUpdate({
      compId: body.compId,
      compName: body.compName,
      metadata: body.metadata,
    })
    return ok(record)
  }),
)

app.post(
  '/api/comp/delete',
  wrap(async (request) => {
    const body = request.body || {}
    requireField(body.compId, 'compId')
    await resource.compDelete(body.compId)
    return ok({ compId: body.compId })
  }),
)

// ---- version ----

app.get(
  '/api/comp/version/list',
  wrap(async (request) => {
    const compId = requireField(request.query.compId, 'compId')
    const records = await resource.versionList(compId)
    return ok({ versions: records, versionCount: records.length })
  }),
)

app.get(
  '/api/comp/version/get',
  wrap(async (request) => {
    const compId = requireField(request.query.compId, 'compId')
    const versionId = requireField(request.query.versionId, 'versionId')
    const found = await resource.versionGet(compId, versionId, { isFresh: true })
    if (!found) throw new Error(`version not found: ${versionId}`)
    return ok(found.record)
  }),
)

// One endpoint serves both upsert patterns. Refer to /doc/service_api.md.
app.post(
  '/api/comp/version/create',
  wrap(async (request) => {
    const body = request.body || {}
    const compId = requireField(body.compId, 'compId')
    validateVersionMetadata(body.metadata)
    const federation = body.metadata.federation

    if (body.outputFileList) {
      // pattern 2: upload prebuilt; the version is servable immediately
      validateFileList(body.outputFileList, 'outputFileList')
      const isEntryFound = body.outputFileList.some(
        (f) => path.posix.basename(f.path) === federation.fileEntry,
      )
      if (!isEntryFound) {
        throw new Error(`entry file not found in outputFileList: ${federation.fileEntry}`)
      }
      let source = null
      if (body.sourceFileList) {
        validateFileList(body.sourceFileList, 'sourceFileList')
        const sourceGroup = await resource.fileGroupCreate(body.sourceFileList)
        source = { fileGroupId: sourceGroup.fileGroupId }
      }
      const outputGroup = await resource.fileGroupCreate(body.outputFileList)
      const buildId = newIdMs48()
      const record = await resource.versionCreate({
        compId,
        metadata: body.metadata,
        source,
        buildList: [
          {
            buildId,
            buildType: 'upload-prebuilt',
            buildStatus: 2,
            taskId: null,
            logObjectId: null,
            output: { fileGroupId: outputGroup.fileGroupId },
            createdAt: timeNow(),
            finishedAt: timeNow(),
          },
        ],
      })
      return ok({ versionId: record.versionId, buildId })
    }

    // pattern 1: service builds through a backend task
    validateFileList(body.sourceFileList, 'sourceFileList')
    if (!federation.fileEntrySource) {
      throw new Error('metadata.federation.fileEntrySource is required for service build')
    }
    const isEntrySourceFound = body.sourceFileList.some((f) => f.path === federation.fileEntrySource)
    if (!isEntrySourceFound) {
      throw new Error(`fileEntrySource not in sourceFileList: ${federation.fileEntrySource}`)
    }
    const sourceGroup = await resource.fileGroupCreate(body.sourceFileList)
    const record = await resource.versionCreate({
      compId,
      metadata: body.metadata,
      source: { fileGroupId: sourceGroup.fileGroupId },
      buildList: [],
    })
    const task = await tasks.taskCreate({
      taskType: TASK_TYPE_VERSION_BUILD,
      operationInfo: { compId, versionId: record.versionId, buildId: newIdMs48() },
    })
    return ok({ versionId: record.versionId, taskId: task.taskId })
  }),
)

// queue a (re)build task for an existing version; always a fresh task + build record
app.post(
  '/api/comp/version/build',
  wrap(async (request) => {
    const body = request.body || {}
    const compId = requireField(body.compId, 'compId')
    const versionId = requireField(body.versionId, 'versionId')
    const found = await resource.versionGet(compId, versionId, { isFresh: true })
    if (!found) throw new Error(`version not found: ${versionId}`)
    if (!found.record.source?.fileGroupId) {
      throw new Error('version has no source; it was created from prebuilt upload')
    }
    const task = await tasks.taskCreate({
      taskType: TASK_TYPE_VERSION_BUILD,
      operationInfo: { compId, versionId, buildId: newIdMs48() },
    })
    return ok({ taskId: task.taskId })
  }),
)

// ---- build ----

app.get(
  '/api/comp/build/list',
  wrap(async (request) => {
    const compId = requireField(request.query.compId, 'compId')
    const versionId = requireField(request.query.versionId, 'versionId')
    const found = await resource.versionGet(compId, versionId, { isFresh: true })
    if (!found) throw new Error(`version not found: ${versionId}`)
    const buildHead = buildHeadOf(found.record)
    return ok({
      builds: found.record.buildList,
      buildIdHead: buildHead ? buildHead.buildId : null,
    })
  }),
)

// output file list of one build, from its file group manifest
app.get(
  '/api/comp/build/files',
  wrap(async (request) => {
    const compId = requireField(request.query.compId, 'compId')
    const versionId = requireField(request.query.versionId, 'versionId')
    const buildId = requireField(request.query.buildId, 'buildId')
    const found = await resource.versionGet(compId, versionId, { isFresh: true })
    if (!found) throw new Error(`version not found: ${versionId}`)
    const build = found.record.buildList.find((b) => b.buildId === buildId)
    if (!build) throw new Error(`build not found: ${buildId}`)
    if (!build.output?.fileGroupId) return ok({ files: [] }, 'this build has no output')
    const manifest = await resource.fileGroupManifestGet(build.output.fileGroupId)
    const files = (manifest?.fileList || []).map((f) => ({
      path: f.path,
      sizeBytes: f.sizeBytes,
      contentType: f.contentType,
      url: `/comp-file/${compId}/${versionId}/${f.path}`,
    }))
    return ok({ files })
  }),
)

app.get(
  '/api/comp/build/log',
  wrap(async (request) => {
    const compId = requireField(request.query.compId, 'compId')
    const versionId = requireField(request.query.versionId, 'versionId')
    const buildId = requireField(request.query.buildId, 'buildId')
    const found = await resource.versionGet(compId, versionId, { isFresh: true })
    if (!found) throw new Error(`version not found: ${versionId}`)
    const build = found.record.buildList.find((b) => b.buildId === buildId)
    if (!build) throw new Error(`build not found: ${buildId}`)
    if (!build.logObjectId) return ok({ logText: '' }, 'this build has no log')
    const logText = await resource.buildLogGet(build.logObjectId)
    return ok({ logText: logText ?? '' })
  }),
)

// ---- resolve (for host pages) ----

app.get(
  '/api/comp/resolve',
  wrap(async (request) => {
    const { compId = '', compName = '', versionId = '' } = request.query
    if (!compId && !compName) throw new Error('compId or compName is required')
    const data = await resource.resolve({ compId, compName, versionId })
    return ok(data)
  }),
)

// ---- component file serving ----
// plain-url exception: browsers and the federation runtime fetch these directly

app.get('/comp-file/:compId/:versionId/*', async (request, reply) => {
  if (!serviceState.isReady) {
    return reply.status(503).send(serviceNotReadyMessage())
  }
  const { compId, versionId } = request.params
  const filePath = request.params['*']
  try {
    const found = await resource.compFileGet(compId, versionId, filePath)
    if (!found) return reply.status(404).send('not found')
    reply.header('Content-Type', found.contentType)
    // urls are immutable: a version's build HEAD changes only when a rebuild succeeds
    reply.header('Cache-Control', 'public, max-age=3600')
    return reply.send(found.contentBuffer)
  } catch (error) {
    return reply.status(500).send(error instanceof Error ? error.message : 'error')
  }
})

// ---- task ----

app.get(
  '/api/task/list',
  wrap(async (request) => {
    const { taskStatus = '', compId = '' } = request.query
    const records = tasks.taskList({
      taskStatus: taskStatus === '' ? null : Number(taskStatus),
      compId,
    })
    return ok({ tasks: records, taskCount: records.length })
  }),
)

app.get(
  '/api/task/get',
  wrap(async (request) => {
    const taskId = requireField(request.query.taskId, 'taskId')
    const record = tasks.taskGet(taskId)
    if (!record) throw new Error(`task not found: ${taskId}`)
    return ok(record)
  }),
)

app.post(
  '/api/task/cancel',
  wrap(async (request) => {
    const body = request.body || {}
    const taskId = requireField(body.taskId, 'taskId')
    await tasks.taskCancelRequest(taskId)
    return ok({ taskId })
  }),
)

app.register(async (scope) => {
  scope.get('/api/ws/task', { websocket: true }, (socket) => {
    wsHub.register(socket)
  })
})

// ---- startup ----

const initStorage = async () => {
  for (;;) {
    try {
      await resource.init()
      await tasks.init()
      serviceState.isReady = true
      serviceState.initError = ''
      app.log.info('storage-obj initialized, service ready')
      await runner.start()
      return
    } catch (error) {
      serviceState.initError = error instanceof Error ? error.message : String(error)
      app.log.error(`storage-obj init failed at ${config.storage_obj.url_base}, retrying in 5s: ${serviceState.initError}`)
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}

const start = async () => {
  await app.listen({ host: config.server.host, port: config.server.port })
  initStorage()
}

start().catch(async (error) => {
  app.log.error(error)
  await app.close()
  process.exit(1)
})
