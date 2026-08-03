// Component / version / build data, keyed by id. Source of truth for the
// Components section. Refer to /doc/service_manage_page.md.

import { makeAutoObservable, observable, runInAction } from 'mobx'
import { apiGet, apiPost } from './api.js'
import { storeUi } from './store.js'

export const buildKeyOf = (compId, versionId, buildId) => `${compId}/${versionId}/${buildId}`

// newest successful build; mirrors backend buildHeadOf
export const buildHeadOf = (versionRecord) => {
  let head = null
  for (const build of versionRecord.buildList || []) {
    if (build.buildStatus !== 2) continue
    if (!head || build.buildId > head.buildId) head = build
  }
  return head
}

class StoreComp {
  compById = observable.map()
  compIds = []
  isCompsLoading = false

  versionListByCompId = observable.map() // compId -> version record array (newest first)
  isVersionsLoadingByCompId = observable.map()

  buildLogByKey = observable.map() // buildKey -> { isLoading, logText }
  buildFilesByKey = observable.map() // buildKey -> { isLoading, files }

  constructor() {
    makeAutoObservable(this)
  }

  async fetchComps() {
    this.isCompsLoading = true
    const result = await apiGet('/api/comp/list')
    runInAction(() => {
      this.isCompsLoading = false
      if (result.code !== 0) {
        storeUi.setMessage('error', result.message || 'failed to load components')
        return
      }
      this.compIds = result.data.comps.map((c) => c.compId)
      for (const record of result.data.comps) {
        this.compById.set(record.compId, record)
      }
    })
  }

  async fetchVersions(compId) {
    this.isVersionsLoadingByCompId.set(compId, true)
    const result = await apiGet(`/api/comp/version/list?compId=${encodeURIComponent(compId)}`)
    runInAction(() => {
      this.isVersionsLoadingByCompId.set(compId, false)
      if (result.code !== 0) {
        storeUi.setMessage('error', result.message || 'failed to load versions')
        return
      }
      this.versionListByCompId.set(compId, result.data.versions)
    })
  }

  async compCreate(compName) {
    const result = await apiPost('/api/comp/create', {
      compName,
      metadata: { schemaVersion: 1, description: '', tags: [] },
    })
    if (result.code !== 0) {
      storeUi.setMessage('error', result.message || 'create failed')
      return result
    }
    await this.fetchComps()
    storeUi.setMessage('success', `component created: ${compName}`)
    return result
  }

  // change attempt from EditableValueComp / MetadataKeyValues; returns {code, message}
  async compUpdate(compId, { compName, metadata }) {
    const result = await apiPost('/api/comp/update', { compId, compName, metadata })
    if (result.code === 0) {
      runInAction(() => {
        this.compById.set(compId, result.data)
      })
    }
    return { code: result.code, message: result.message || (result.code === 0 ? 'updated' : 'update failed') }
  }

  async compDelete(compId) {
    const result = await apiPost('/api/comp/delete', { compId })
    if (result.code !== 0) {
      storeUi.setMessage('error', result.message || 'delete failed')
      return
    }
    storeUi.selectComp('')
    await this.fetchComps()
    storeUi.setMessage('success', 'component deleted')
  }

  // queue a rebuild; returns taskId or null
  async versionBuild(compId, versionId) {
    const result = await apiPost('/api/comp/version/build', { compId, versionId })
    if (result.code !== 0) {
      storeUi.setMessage('error', result.message || 'build request failed')
      return null
    }
    storeUi.setMessage('success', `build task queued: ${result.data.taskId}`)
    return result.data.taskId
  }

  async fetchBuildLog(compId, versionId, buildId) {
    const key = buildKeyOf(compId, versionId, buildId)
    this.buildLogByKey.set(key, { isLoading: true, logText: '' })
    const result = await apiGet(
      `/api/comp/build/log?compId=${encodeURIComponent(compId)}&versionId=${encodeURIComponent(versionId)}&buildId=${encodeURIComponent(buildId)}`,
    )
    runInAction(() => {
      this.buildLogByKey.set(key, {
        isLoading: false,
        logText: result.code === 0 ? result.data.logText : `failed to load log: ${result.message}`,
      })
    })
  }

  async fetchBuildFiles(compId, versionId, buildId) {
    const key = buildKeyOf(compId, versionId, buildId)
    this.buildFilesByKey.set(key, { isLoading: true, files: [] })
    const result = await apiGet(
      `/api/comp/build/files?compId=${encodeURIComponent(compId)}&versionId=${encodeURIComponent(versionId)}&buildId=${encodeURIComponent(buildId)}`,
    )
    runInAction(() => {
      this.buildFilesByKey.set(key, {
        isLoading: false,
        files: result.code === 0 ? result.data.files : [],
      })
      if (result.code !== 0) storeUi.setMessage('error', result.message || 'failed to load files')
    })
  }
}

export const storeComp = new StoreComp()
