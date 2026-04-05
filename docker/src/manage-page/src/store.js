import { makeAutoObservable, observable, runInAction } from 'mobx'

export function taskVersionStoreKey(taskId, taskVersionId) {
  return `${taskId}\u0000${taskVersionId}`
}

export function taskBuildStoreKey(taskId, taskBuildId) {
  return `${taskId}\u0000${taskBuildId}`
}

function buildLogsKey(taskId, taskBuildId) {
  return `${taskId}\u0000${taskBuildId}`
}

export function normalizeBuildPhase(status) {
  if (status === 'success') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'fail'
  return 'running'
}

export class ManagePageStore {
  baseUrl = ''

  tasksByTaskId = observable.map()

  taskVersionsById = observable.map()

  taskBuildsById = observable.map()

  taskVersionIdsByTaskId = observable.map()

  taskBuildIdsByTaskId = observable.map()

  taskBuildLogsById = observable.map()

  tasksListLoaded = false

  taskBuildsLoadedByTaskId = observable.map()

  buildLogsLoadedByKey = observable.map()

  inFlight = new Set()

  lastErrorByKey = observable.map()

  serverStatus = 'idle'

  serverStatusMessage = ''

  serverStatusCheckedAt = 0

  constructor(options = {}) {
    if (typeof options.baseUrl === 'string') {
      this.baseUrl = options.baseUrl.replace(/\/$/, '')
    }
    makeAutoObservable(this, {
      tasksByTaskId: false,
      taskVersionsById: false,
      taskBuildsById: false,
      taskVersionIdsByTaskId: false,
      taskBuildIdsByTaskId: false,
      taskBuildLogsById: false,
      taskBuildsLoadedByTaskId: false,
      buildLogsLoadedByKey: false,
      lastErrorByKey: false,
      inFlight: false,
    })
  }

  clearError(key) {
    this.lastErrorByKey.delete(key)
  }

  getTask(taskId) {
    return this.tasksByTaskId.get(taskId)
  }

  getTaskVersion(taskId, taskVersionId) {
    return this.taskVersionsById.get(taskVersionStoreKey(taskId, taskVersionId))
  }

  getTaskBuild(taskId, taskBuildId) {
    return this.taskBuildsById.get(taskBuildStoreKey(taskId, taskBuildId))
  }

  getTaskVersionIdsForTask(taskId) {
    return this.taskVersionIdsByTaskId.get(taskId) ?? []
  }

  getTaskBuildIdsForTask(taskId) {
    return this.taskBuildIdsByTaskId.get(taskId) ?? []
  }

  getMostRecentTaskBuild(taskId) {
    const ids = this.getTaskBuildIdsForTask(taskId)
    let best = null
    let bestTime = -1
    for (const taskBuildId of ids) {
      const row = this.getTaskBuild(taskId, taskBuildId)
      if (!row) continue
      const t = Number(row.finishedAt ?? row.startedAt ?? 0)
      if (t >= bestTime) {
        bestTime = t
        best = row
      }
    }
    return best
  }

  async ensureMostRecentTaskBuild(taskId, options = {}) {
    await this.ensureTaskBuildsForTask(taskId, options)
    return this.getMostRecentTaskBuild(taskId)
  }

  getBuildLogs(taskId, taskBuildId) {
    return this.taskBuildLogsById.get(buildLogsKey(taskId, taskBuildId))
  }

  _setError(key, message) {
    runInAction(() => {
      this.lastErrorByKey.set(key, message)
    })
  }

  async _getJson(path) {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    const response = await fetch(url)
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        body && typeof body.message === 'string'
          ? body.message
          : `HTTP ${response.status}`
      throw new Error(message)
    }
    if (!body || typeof body !== 'object' || body.code !== 0) {
      const message =
        body && typeof body.message === 'string' ? body.message : 'API error'
      throw new Error(message)
    }
    return body.data
  }

  async _postJson(path, payload = {}) {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        body && typeof body.message === 'string'
          ? body.message
          : `HTTP ${response.status}`
      throw new Error(message)
    }
    if (!body || typeof body !== 'object' || body.code !== 0) {
      const message =
        body && typeof body.message === 'string' ? body.message : 'API error'
      throw new Error(message)
    }
    return body.data
  }

  async _getText(path) {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.text()
  }

  _mergeTasksFromServer(list) {
    if (!Array.isArray(list)) return
    runInAction(() => {
      for (const row of list) {
        if (row && typeof row.taskId === 'string' && row.taskId) {
          this.tasksByTaskId.set(row.taskId, row)
        }
      }
      this.tasksListLoaded = true
    })
  }

  _ensureTaskVersionStub(taskId, taskVersionId) {
    if (!taskVersionId) return
    const key = taskVersionStoreKey(taskId, taskVersionId)
    if (this.taskVersionsById.has(key)) return
    runInAction(() => {
      this.taskVersionsById.set(key, {
        taskId,
        taskVersionId,
        detailFromServer: null,
      })
    })
  }

  _mergeBuildRecord(taskId, record) {
    if (!record || typeof record.buildVersion !== 'string' || !record.buildVersion) {
      return
    }
    const taskBuildId = record.buildVersion
    const key = taskBuildStoreKey(taskId, taskBuildId)
    const phase = normalizeBuildPhase(record.status)
    const normalized = { ...record, taskId, taskBuildId, phase }
    runInAction(() => {
      this.taskBuildsById.set(key, normalized)
    })
    if (record.taskVersion) {
      this._ensureTaskVersionStub(taskId, record.taskVersion)
    }
  }

  _reindexVersionsAndBuildsForTask(taskId, buildsArray) {
    const versionSet = new Set(this.getTaskVersionIdsForTask(taskId))
    const buildIds = []
    for (const b of buildsArray) {
      if (b && typeof b.buildVersion === 'string' && b.buildVersion) {
        buildIds.push(b.buildVersion)
      }
      if (b && b.taskVersion) {
        versionSet.add(b.taskVersion)
      }
    }
    runInAction(() => {
      this.taskBuildIdsByTaskId.set(taskId, buildIds)
      this.taskVersionIdsByTaskId.set(taskId, [...versionSet].sort())
    })
  }

  async fetchAllTasksFromServer() {
    const data = await this._getJson('/task/getAll')
    this._mergeTasksFromServer(data)
    return data
  }

  async ensureAllTasks(options = {}) {
    const force = Boolean(options.refresh)
    if (this.tasksListLoaded && !force) {
      return this.getTaskListSnapshot()
    }
    const flightKey = 'tasks:all'
    if (this.inFlight.has(flightKey)) {
      await this._waitFlight(flightKey)
      return this.getTaskListSnapshot()
    }
    this.inFlight.add(flightKey)
    this.clearError(flightKey)
    try {
      await this.fetchAllTasksFromServer()
    } catch (e) {
      this._setError(flightKey, e instanceof Error ? e.message : 'fetch failed')
      throw e
    } finally {
      this.inFlight.delete(flightKey)
    }
    return this.getTaskListSnapshot()
  }

  async _waitFlight(flightKey) {
    const start = Date.now()
    while (this.inFlight.has(flightKey) && Date.now() - start < 60000) {
      await new Promise((r) => setTimeout(r, 30))
    }
  }

  getTaskListSnapshot() {
    return [...this.tasksByTaskId.values()]
  }

  async createEmptyTask() {
    const data = await this._postJson('/task/create', {})
    await this.ensureAllTasks({ refresh: true })
    return data
  }

  getServerStatusSnapshot() {
    return {
      status: this.serverStatus,
      message: this.serverStatusMessage,
      checkedAt: this.serverStatusCheckedAt,
    }
  }

  async fetchServerStatusFromServer() {
    const data = await this._getJson('/health')
    const statusValue =
      data && typeof data === 'object' && typeof data.status === 'string' ? data.status : 'ok'
    runInAction(() => {
      this.serverStatus = 'online'
      this.serverStatusMessage = statusValue
      this.serverStatusCheckedAt = Date.now()
    })
    return this.getServerStatusSnapshot()
  }

  async ensureServerStatus(options = {}) {
    const force = Boolean(options.refresh)
    const staleAfterMs =
      Number.isFinite(options.staleAfterMs) && Number(options.staleAfterMs) >= 0
        ? Number(options.staleAfterMs)
        : 5000
    if (!force && this.serverStatusCheckedAt > 0 && Date.now() - this.serverStatusCheckedAt < staleAfterMs) {
      return this.getServerStatusSnapshot()
    }

    const flightKey = 'server:health'
    if (this.inFlight.has(flightKey)) {
      await this._waitFlight(flightKey)
      return this.getServerStatusSnapshot()
    }

    this.inFlight.add(flightKey)
    this.clearError(flightKey)
    runInAction(() => {
      this.serverStatus = 'checking'
      this.serverStatusMessage = this.serverStatusMessage || 'checking'
    })
    try {
      await this.fetchServerStatusFromServer()
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'connection failed'
      runInAction(() => {
        this.serverStatus = 'offline'
        this.serverStatusMessage = errorMessage
        this.serverStatusCheckedAt = Date.now()
      })
      this._setError(flightKey, errorMessage)
      throw e
    } finally {
      this.inFlight.delete(flightKey)
    }
    return this.getServerStatusSnapshot()
  }

  async ensureTask(taskId, options = {}) {
    const force = Boolean(options.refresh)
    if (!taskId) throw new Error('taskId is required')
    if (!force && this.tasksByTaskId.has(taskId)) {
      return this.getTask(taskId)
    }
    await this.ensureAllTasks({ refresh: force })
    return this.getTask(taskId)
  }

  async fetchTaskBuildsFromServer(taskId) {
    const q = new URLSearchParams({ taskId })
    const data = await this._getJson(`/task/getAllVersions?${q}`)
    if (!Array.isArray(data)) return []
    for (const row of data) {
      this._mergeBuildRecord(taskId, row)
    }
    this._reindexVersionsAndBuildsForTask(taskId, data)
    runInAction(() => {
      this.taskBuildsLoadedByTaskId.set(taskId, true)
    })
    return data
  }

  async ensureTaskBuildsForTask(taskId, options = {}) {
    const force = Boolean(options.refresh)
    if (!taskId) throw new Error('taskId is required')
    if (this.taskBuildsLoadedByTaskId.get(taskId) && !force) {
      return this.getTaskBuildIdsForTask(taskId).map((id) => this.getTaskBuild(taskId, id))
    }
    const flightKey = `builds:${taskId}`
    if (this.inFlight.has(flightKey)) {
      await this._waitFlight(flightKey)
      return this.getTaskBuildIdsForTask(taskId).map((bid) => this.getTaskBuild(taskId, bid))
    }
    this.inFlight.add(flightKey)
    this.clearError(flightKey)
    try {
      await this.fetchTaskBuildsFromServer(taskId)
    } catch (e) {
      this._setError(flightKey, e instanceof Error ? e.message : 'fetch failed')
      throw e
    } finally {
      this.inFlight.delete(flightKey)
    }
    return this.getTaskBuildIdsForTask(taskId).map((bid) => this.getTaskBuild(taskId, bid))
  }

  async ensureTaskVersionIndexForTask(taskId, options = {}) {
    const force = Boolean(options.refresh)
    if (!taskId) throw new Error('taskId is required')
    if (this.taskBuildsLoadedByTaskId.get(taskId) && !force) {
      return this.getTaskVersionIdsForTask(taskId)
    }
    await this.ensureTaskBuildsForTask(taskId, { refresh: force })
    return this.getTaskVersionIdsForTask(taskId)
  }

  async ensureTaskVersionRecord(taskId, taskVersionId, options = {}) {
    if (!taskId || !taskVersionId) throw new Error('taskId and taskVersionId are required')
    const key = taskVersionStoreKey(taskId, taskVersionId)
    if (this.taskVersionsById.has(key) && !options.refresh) {
      return this.getTaskVersion(taskId, taskVersionId)
    }
    await this.ensureTaskBuildsForTask(taskId, { refresh: Boolean(options.refresh) })
    this._ensureTaskVersionStub(taskId, taskVersionId)
    return this.getTaskVersion(taskId, taskVersionId)
  }

  async fetchBuildLogsFromServer(taskId, taskBuildId) {
    const q = new URLSearchParams({ taskId, buildVersion: taskBuildId })
    const text = await this._getText(`/task/logs?${q}`)
    const key = buildLogsKey(taskId, taskBuildId)
    runInAction(() => {
      this.taskBuildLogsById.set(key, text)
      this.buildLogsLoadedByKey.set(key, true)
    })
    return text
  }

  async ensureBuildLogs(taskId, taskBuildId, options = {}) {
    const force = Boolean(options.refresh)
    if (!taskId || !taskBuildId) throw new Error('taskId and taskBuildId are required')
    const key = buildLogsKey(taskId, taskBuildId)
    if (this.buildLogsLoadedByKey.get(key) && !force) {
      return this.taskBuildLogsById.get(key) ?? ''
    }
    const flightKey = `logs:${taskId}:${taskBuildId}`
    if (this.inFlight.has(flightKey)) {
      await this._waitFlight(flightKey)
      return this.taskBuildLogsById.get(key) ?? ''
    }
    this.inFlight.add(flightKey)
    this.clearError(flightKey)
    try {
      await this.fetchBuildLogsFromServer(taskId, taskBuildId)
    } catch (e) {
      this._setError(flightKey, e instanceof Error ? e.message : 'fetch failed')
      throw e
    } finally {
      this.inFlight.delete(flightKey)
    }
    return this.taskBuildLogsById.get(key) ?? ''
  }
}

export function createManagePageStore(options) {
  return new ManagePageStore(options)
}
