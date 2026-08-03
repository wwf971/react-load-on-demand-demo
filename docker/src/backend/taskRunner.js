// Task runner: claims pending outbox events and executes version build tasks.
// Refer to /doc/service_task.md.
//
// One runner loop per deployment (storage-obj has no compare-and-set claim).
// Each build runs in its own timestamped work folder under CACHE_ROOT/build/,
// with context copies (comp record, version record, task record, source files).
// The folder is kept afterwards as disposable, inspectable cache.

import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  TASK_STATUS_SUCCESS,
  TASK_STATUS_FAIL,
  TASK_STATUS_CANCEL,
  TASK_STATUS_UNDERGOING,
} from './task.js'
import { timeNow } from './time.js'
import { isSafeRelativePath } from './resource.js'

const POLL_INTERVAL_MS = 2000
const BUILD_COMP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'build-comp')

export class TaskRunner {
  constructor({ config, resource, tasks }) {
    this.config = config
    this.resource = resource
    this.tasks = tasks
    this.eventIdsInFlight = new Set()
    this.runningCount = 0
    this.isStopped = false
  }

  async start() {
    await this.recover()
    this.loop()
  }

  stop() {
    this.isStopped = true
  }

  async loop() {
    while (!this.isStopped) {
      try {
        await this.pollOnce()
      } catch (error) {
        console.error('[taskRunner] poll error:', error.message)
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }

  async pollOnce() {
    if (this.runningCount >= this.config.build.concurrency) return
    const events = await this.tasks.outboxEventListPending()
    for (const pending of events) {
      if (this.runningCount >= this.config.build.concurrency) break
      if (this.eventIdsInFlight.has(pending.event.eventId)) continue
      this.eventIdsInFlight.add(pending.event.eventId)
      this.runningCount += 1
      this.handleEvent(pending)
        .catch((error) => console.error('[taskRunner] event error:', error.message))
        .finally(() => {
          this.eventIdsInFlight.delete(pending.event.eventId)
          this.runningCount -= 1
        })
    }
  }

  async handleEvent({ objectId, event }) {
    const taskRecord = this.tasks.taskGet(event.taskId)
    if (!taskRecord || taskRecord.taskStatus !== TASK_STATUS_UNDERGOING) {
      await this.tasks.outboxEventDone(objectId)
      return
    }
    if (taskRecord.isCancelRequested) {
      // cancelled before any build work started: no build record is created
      await this.tasks.taskFinish(taskRecord.taskId, TASK_STATUS_CANCEL, {
        message: 'cancelled before build start',
      })
      await this.tasks.outboxEventDone(objectId)
      return
    }
    await this.runBuild(taskRecord)
    await this.tasks.outboxEventDone(objectId)
  }

  // On boot: reconcile events whose worker died with the process.
  async recover() {
    const events = await this.tasks.outboxEventListPending()
    for (const { objectId, event } of events) {
      const taskRecord = this.tasks.taskGet(event.taskId)
      if (!taskRecord || taskRecord.taskStatus !== TASK_STATUS_UNDERGOING) {
        await this.tasks.outboxEventDone(objectId)
        continue
      }
      if (!taskRecord.startedAt) continue // never started: normal pending event, loop takes it

      const { compId, versionId, buildId } = taskRecord.operationInfo
      const version = await this.resource.versionGet(compId, versionId, { isFresh: true })
      const buildRecord = version?.record.buildList.find((b) => b.buildId === buildId)
      if (buildRecord) {
        // crash happened between build-record append and task terminal update
        await this.tasks.taskFinish(taskRecord.taskId, buildRecord.buildStatus, {
          message: 'finalized after restart',
        })
        await this.tasks.outboxEventDone(objectId)
      } else if (this.config.build.is_requeue_on_restart) {
        await this.tasks.progressAppend(taskRecord.taskId, 're-queued after restart')
      } else {
        await this.tasks.taskFinish(taskRecord.taskId, TASK_STATUS_FAIL, {
          message: 'runner restarted',
        })
        await this.tasks.outboxEventDone(objectId)
      }
    }
  }

  // ---- build execution ----

  async runBuild(taskRecord) {
    const { taskId } = taskRecord
    const { compId, versionId, buildId } = taskRecord.operationInfo

    const workDir = path.join(
      this.config.roots.cacheRoot,
      'build',
      `${timeNow()}_${buildId}`,
    )
    const logPath = path.join(workDir, 'build.log')
    const logLines = []
    const log = async (text) => {
      const line = `[${timeNow()}] ${text}`
      logLines.push(line)
      await fs.appendFile(logPath, `${line}\n`, 'utf-8')
    }
    const logRaw = async (text) => {
      logLines.push(text)
      await fs.appendFile(logPath, text, 'utf-8')
    }

    const buildCreatedAt = timeNow()
    let buildStatus = TASK_STATUS_FAIL
    let failMessage = ''
    let outputFileGroupId = null
    let outputFileCount = 0
    let outputSizeBytesTotal = 0

    try {
      await fs.mkdir(workDir, { recursive: true })
      await this.tasks.taskStart(taskId)
      await log(`build ${buildId} for comp ${compId} version ${versionId}`)

      // read everything the build depends on
      const comp = await this.resource.compRecordGet(compId)
      const version = await this.resource.versionGet(compId, versionId, { isFresh: true })
      if (!comp || !version) throw new Error('component or version not found')
      if (!version.record.source?.fileGroupId) throw new Error('version has no source')
      const metadata = version.record.metadata || {}
      const federation = metadata.federation || {}
      if (!federation.containerName || !federation.fileEntry || !federation.modulePath) {
        throw new Error('version metadata.federation is incomplete')
      }
      if (!federation.fileEntrySource) {
        throw new Error('metadata.federation.fileEntrySource is required for service build')
      }
      const sourceFiles = await this.resource.fileGroupFilesGet(version.record.source.fileGroupId)

      // context copies: make this folder inspectable and reproducible on its own
      const contextDir = path.join(workDir, 'context')
      await fs.mkdir(path.join(contextDir, 'source'), { recursive: true })
      await fs.writeFile(path.join(contextDir, 'comp.json'), JSON.stringify(comp.record, null, 2))
      await fs.writeFile(path.join(contextDir, 'version.json'), JSON.stringify(version.record, null, 2))
      await fs.writeFile(path.join(contextDir, 'task.json'), JSON.stringify(taskRecord, null, 2))
      for (const file of sourceFiles) {
        const target = path.join(contextDir, 'source', file.path)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, file.contentBuffer)
      }

      // build project: build-comp scaffold + source + generated config
      const projectDir = path.join(workDir, 'project')
      await fs.cp(BUILD_COMP_DIR, projectDir, { recursive: true })
      let isEntrySourceFound = false
      for (const file of sourceFiles) {
        if (!isSafeRelativePath(file.path)) throw new Error(`invalid source path: ${file.path}`)
        if (file.path === federation.fileEntrySource) isEntrySourceFound = true
        const target = path.join(projectDir, file.path)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, file.contentBuffer)
      }
      if (!isEntrySourceFound) {
        throw new Error(`fileEntrySource not in source files: ${federation.fileEntrySource}`)
      }
      await this.generateBuildConfig(projectDir, metadata)
      await log('project prepared from build-comp')

      // install + build
      const deadline = Date.now() + this.config.build.timeout_seconds * 1000
      const isCancelled = () => this.tasks.taskGet(taskId)?.isCancelRequested === true

      await this.tasks.progressAppend(taskId, 'pnpm install')
      await log('$ pnpm install')
      const installArgs = ['install', '--no-frozen-lockfile']
      if (process.env.PNPM_STORE_DIR) {
        installArgs.push('--store-dir', process.env.PNPM_STORE_DIR)
      }
      await this.runChild('pnpm', installArgs, { cwd: projectDir, logRaw, deadline, isCancelled })

      await this.tasks.progressAppend(taskId, 'vite build')
      await log('$ pnpm run build')
      await this.runChild('pnpm', ['run', 'build'], { cwd: projectDir, logRaw, deadline, isCancelled })

      // collect and validate output
      const distDir = path.join(projectDir, 'dist')
      const outputFiles = await this.collectFiles(distDir)
      if (outputFiles.length === 0) throw new Error('build produced no output files')
      const isEntryFound = outputFiles.some(
        (f) => path.posix.basename(f.path) === federation.fileEntry,
      )
      if (!isEntryFound) {
        throw new Error(`entry file not found in build output: ${federation.fileEntry}`)
      }

      await this.tasks.progressAppend(taskId, 'uploading build output')
      const group = await this.resource.fileGroupCreate(outputFiles)
      outputFileGroupId = group.fileGroupId
      outputFileCount = group.manifest.fileList.length
      outputSizeBytesTotal = group.manifest.fileList.reduce((sum, f) => sum + f.sizeBytes, 0)
      await log(`uploaded ${outputFileCount} output files (${outputSizeBytesTotal} bytes)`)
      buildStatus = TASK_STATUS_SUCCESS
    } catch (error) {
      buildStatus = error?.killReason === 'cancel' ? TASK_STATUS_CANCEL : TASK_STATUS_FAIL
      failMessage = error?.message || String(error)
      try {
        await log(`build ${buildStatus === TASK_STATUS_CANCEL ? 'cancelled' : 'failed'}: ${failMessage}`)
      } catch {
        // work folder may not exist when the failure happened before mkdir
      }
    }

    // terminal writes, in visibility order: log -> build record -> task -> (event, by caller)
    let logObjectId = null
    try {
      logObjectId = await this.resource.buildLogCreate(logLines.join('\n'))
    } catch (error) {
      console.error('[taskRunner] build log upload failed:', error.message)
    }
    try {
      await this.resource.versionBuildAppend(compId, versionId, {
        buildId,
        buildType: 'service-build',
        buildStatus,
        taskId,
        logObjectId,
        output: outputFileGroupId ? { fileGroupId: outputFileGroupId } : null,
        createdAt: buildCreatedAt,
        finishedAt: timeNow(),
      })
    } catch (error) {
      console.error('[taskRunner] build record append failed:', error.message)
      buildStatus = TASK_STATUS_FAIL
      failMessage = `build record append failed: ${error.message}`
    }
    await this.tasks.taskFinish(taskId, buildStatus, {
      message: failMessage || 'build finished',
      resultInfo:
        buildStatus === TASK_STATUS_SUCCESS
          ? { fileGroupId: outputFileGroupId, fileCount: outputFileCount, sizeBytesTotal: outputSizeBytesTotal }
          : null,
    })
  }

  // write federation.config.json and merge metadata.packages into package.json
  async generateBuildConfig(projectDir, metadata) {
    const federation = metadata.federation
    const packages = metadata.packages || {}

    const shared = {}
    for (const [name, info] of Object.entries(packages)) {
      if (info.isShared) {
        shared[name] = { singleton: true, requiredVersion: info.versionRequired }
      }
    }
    await fs.writeFile(
      path.join(projectDir, 'federation.config.json'),
      JSON.stringify(
        {
          containerName: federation.containerName,
          fileEntry: federation.fileEntry,
          fileEntrySource: federation.fileEntrySource,
          modulePath: federation.modulePath,
          shared,
        },
        null,
        2,
      ),
    )

    const packageJsonPath = path.join(projectDir, 'package.json')
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    for (const [name, info] of Object.entries(packages)) {
      packageJson.dependencies[name] = info.versionRequired
    }
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))
  }

  runChild(command, args, { cwd, logRaw, deadline, isCancelled }) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, env: process.env })
      let killReason = null

      const watcher = setInterval(() => {
        if (isCancelled()) {
          killReason = 'cancel'
          child.kill('SIGKILL')
        } else if (Date.now() > deadline) {
          killReason = 'timeout'
          child.kill('SIGKILL')
        }
      }, 1000)

      child.stdout.on('data', (data) => logRaw(data.toString()))
      child.stderr.on('data', (data) => logRaw(data.toString()))
      child.on('error', (error) => {
        clearInterval(watcher)
        reject(error)
      })
      child.on('close', (exitCode) => {
        clearInterval(watcher)
        if (killReason) {
          const error = new Error(
            killReason === 'cancel' ? 'build cancelled' : 'build timed out',
          )
          error.killReason = killReason
          reject(error)
        } else if (exitCode !== 0) {
          reject(new Error(`${command} ${args[0]} exited with code ${exitCode}`))
        } else {
          resolve()
        }
      })
    })
  }

  // walk a folder into [{ path (posix, relative), contentBase64 }]
  async collectFiles(dirAbs) {
    const files = []
    const walk = async (currentAbs, relPrefix) => {
      const entries = await fs.readdir(currentAbs, { withFileTypes: true })
      for (const entry of entries) {
        const entryAbs = path.join(currentAbs, entry.name)
        const entryRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          await walk(entryAbs, entryRel)
        } else if (entry.isFile()) {
          const content = await fs.readFile(entryAbs)
          files.push({ path: entryRel, contentBase64: content.toString('base64') })
        }
      }
    }
    await walk(dirAbs, '')
    return files
  }
}
