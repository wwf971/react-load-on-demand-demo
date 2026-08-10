// Playground state: which remote components are placed in each playground
// tab, their prop values, and their load/render error state. Source of truth
// for the Playground section; render components never call the server.

import { makeAutoObservable, observable, runInAction } from 'mobx'
import { apiGet } from './api.js'
import { storeUi } from './store.js'
import { storeComp, buildHeadOf } from './storeComp.js'
import { loadRemoteComp } from './compLoader.js'

// loaded React components are plain refs, not observable state
const compRefByInstanceId = new Map()

export const instanceCompRefGet = (instanceId) => compRefByInstanceId.get(instanceId) || null

const tabStateCreate = () => ({
  compSelectedId: '',
  versionSelectedId: '',
  exposeSelectedName: '',
  isAddPending: false,
  instanceIds: [],
})

const exposeDefaultNameOf = (versionRecord) => {
  const metadata = versionRecord?.metadata || {}
  const exposeList = metadata.exposeList || []
  if (metadata.exposeDefaultName) return metadata.exposeDefaultName
  return exposeList[0]?.exposeName || ''
}

// one editable prop entry derived from the declared prop type in the
// version metadata; types without a direct editor are edited as JSON text
const propEntryCreate = (propName, propDecl) => {
  const typeText = String(propDecl?.type || '').toLowerCase()
  if (typeText === 'number' || typeText === 'int' || typeText === 'integer' || typeText === 'float') {
    return { name: propName, isJson: false, valueType: 'number', valueInitial: 0 }
  }
  if (typeText === 'bool' || typeText === 'boolean') {
    return { name: propName, isJson: false, valueType: 'bool', valueInitial: false }
  }
  if (typeText === 'string' || typeText === 'text') {
    return { name: propName, isJson: false, valueType: 'text', valueInitial: '' }
  }
  // object / array / unknown: edit as JSON text
  return { name: propName, isJson: true, valueType: 'text', valueInitial: '{}' }
}

class StorePlayground {
  stateByTabId = observable.map()
  instanceById = observable.map()
  instanceSequence = 0

  constructor() {
    makeAutoObservable(this)
    storeUi.tabCloseCallbackRegister((tabId) => this.tabDispose(tabId))
  }

  tabStateEnsure(tabId) {
    if (!this.stateByTabId.has(tabId)) {
      this.stateByTabId.set(tabId, tabStateCreate())
    }
    return this.stateByTabId.get(tabId)
  }

  tabDispose(tabId) {
    const state = this.stateByTabId.get(tabId)
    if (!state) return
    for (const instanceId of state.instanceIds) {
      this.instanceById.delete(instanceId)
      compRefByInstanceId.delete(instanceId)
    }
    this.stateByTabId.delete(tabId)
  }

  // ---- picker (component / version / exposed component) ----

  async compSelect(tabId, compId) {
    const state = this.tabStateEnsure(tabId)
    if (state.compSelectedId === compId) return
    state.compSelectedId = compId
    state.versionSelectedId = ''
    state.exposeSelectedName = ''
    if (!compId) return
    await storeComp.fetchVersions(compId)
    runInAction(() => {
      // auto-select the newest servable version unless the user already picked one
      if (state.compSelectedId !== compId || state.versionSelectedId) return
      const versions = storeComp.versionListByCompId.get(compId) || []
      const versionServable = versions.find((record) => buildHeadOf(record))
      if (!versionServable) return
      state.versionSelectedId = versionServable.versionId
      state.exposeSelectedName = exposeDefaultNameOf(versionServable)
    })
  }

  versionSelect(tabId, versionId) {
    const state = this.tabStateEnsure(tabId)
    state.versionSelectedId = versionId
    const versionRecord = storeComp.versionGet(state.compSelectedId, versionId)
    state.exposeSelectedName = exposeDefaultNameOf(versionRecord)
  }

  exposeSelect(tabId, exposeName) {
    const state = this.tabStateEnsure(tabId)
    state.exposeSelectedName = exposeName
  }

  // ---- playground instances ----

  async instanceAdd(tabId) {
    const state = this.tabStateEnsure(tabId)
    if (state.isAddPending || !state.compSelectedId) return
    state.isAddPending = true

    const params = new URLSearchParams({ compId: state.compSelectedId })
    if (state.versionSelectedId) params.set('versionId', state.versionSelectedId)
    if (state.exposeSelectedName) params.set('exposeName', state.exposeSelectedName)
    const result = await apiGet(`/api/comp/resolve?${params.toString()}`)

    if (result.code !== 0) {
      runInAction(() => {
        state.isAddPending = false
      })
      storeUi.setMessage('error', result.message || 'failed to resolve component')
      return
    }

    const resolveInfo = result.data
    let instance = null
    runInAction(() => {
      state.isAddPending = false
      this.instanceSequence += 1
      const instanceId = `playground-inst-${this.instanceSequence}`

      const propList = []
      const propertyById = {}
      const propValueByName = {}
      for (const [propName, propDecl] of Object.entries(resolveInfo.props || {})) {
        const entry = propEntryCreate(propName, propDecl)
        propList.push(entry)
        propertyById[propName] = {
          id: propName,
          label: propName,
          valueType: entry.valueType,
          value: entry.valueInitial,
        }
        propValueByName[propName] = entry.isJson ? JSON.parse(entry.valueInitial) : entry.valueInitial
      }

      instance = {
        instanceId,
        tabId,
        compId: resolveInfo.compId,
        compName: resolveInfo.compName,
        versionId: resolveInfo.versionId,
        exposeName: resolveInfo.exposeName,
        propDescriptionByName: Object.fromEntries(
          Object.entries(resolveInfo.props || {}).map(([name, decl]) => [name, decl?.description || '']),
        ),
        resolveInfo,
        loadStatus: 'loading',
        loadErrorText: '',
        propList,
        propertyById,
        propValueByName,
        renderEpoch: 0,
        renderErrorText: '',
      }
      this.instanceById.set(instanceId, instance)
      state.instanceIds.push(instanceId)
    })

    await this.instanceLoad(instance.instanceId)
  }

  async instanceLoad(instanceId) {
    const instance = this.instanceById.get(instanceId)
    if (!instance) return
    runInAction(() => {
      instance.loadStatus = 'loading'
      instance.loadErrorText = ''
      instance.renderErrorText = ''
    })
    try {
      const Comp = await loadRemoteComp(instance.resolveInfo)
      compRefByInstanceId.set(instanceId, Comp)
      runInAction(() => {
        instance.loadStatus = 'ready'
        instance.renderEpoch += 1
      })
    } catch (error) {
      runInAction(() => {
        instance.loadStatus = 'error'
        instance.loadErrorText = `${error?.message || error}\n\n${error?.stack || ''}`.trim()
      })
    }
  }

  instanceRemove(tabId, instanceId) {
    const state = this.stateByTabId.get(tabId)
    if (state) {
      const index = state.instanceIds.indexOf(instanceId)
      if (index >= 0) state.instanceIds.splice(index, 1)
    }
    this.instanceById.delete(instanceId)
    compRefByInstanceId.delete(instanceId)
  }

  // ---- prop editing (change attempt from PropEditor) ----

  propChangeAttempt(instanceId, propName, valueNext) {
    const instance = this.instanceById.get(instanceId)
    const propEntry = instance?.propList.find((entry) => entry.name === propName)
    const property = instance?.propertyById[propName]
    if (!instance || !propEntry || !property) {
      return { code: -1, message: `unknown prop: ${propName}` }
    }

    let valueParsed = valueNext
    if (propEntry.isJson) {
      try {
        valueParsed = JSON.parse(valueNext)
      } catch (error) {
        return { code: -1, message: `invalid JSON: ${error.message}` }
      }
    }

    property.value = valueNext
    instance.propValueByName[propName] = valueParsed
    // a component that threw on the previous props gets a fresh mount,
    // so the new props can be tried
    if (instance.renderErrorText) {
      instance.renderErrorText = ''
      instance.renderEpoch += 1
    }
    return { code: 0 }
  }

  // ---- render exception handling ----

  // called by the error boundary around the rendered remote component
  renderErrorSet(instanceId, error, errorInfo) {
    const instance = this.instanceById.get(instanceId)
    if (!instance) return
    const parts = [
      String(error?.message || error),
      error?.stack || '',
      errorInfo?.componentStack ? `component stack:${errorInfo.componentStack}` : '',
    ]
    instance.renderErrorText = parts.filter(Boolean).join('\n\n')
  }

  renderRetry(instanceId) {
    const instance = this.instanceById.get(instanceId)
    if (!instance) return
    instance.renderErrorText = ''
    instance.renderEpoch += 1
  }
}

export const storePlayground = new StorePlayground()
