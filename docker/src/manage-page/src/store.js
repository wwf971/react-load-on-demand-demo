// StoreUi owns all page navigation and per-tab operation state.

import { makeAutoObservable, observable } from 'mobx'

export const PATH_KIND_COMPONENTS = 'components'
export const PATH_KIND_PLAYGROUND = 'playground'
export const PATH_KIND_TASKS = 'tasks'
export const PATH_KIND_STATUS = 'status'

const pathClone = (pathData) => ({
  kind: pathData.kind,
  compId: pathData.compId || '',
  versionId: pathData.versionId || '',
  buildId: pathData.buildId || '',
  taskId: pathData.taskId || '',
})

const tabStateCreate = () => ({
  metadataSelectedRowId: null,
  confirmState: null,
  isCompCreateOpen: false,
  isCompCreatePending: false,
  compRowSelectedId: '',
  versionRowSelectedId: '',
  buildRowSelectedId: '',
  taskRowSelectedId: '',
})

class StoreUi {
  tabById = observable.map()
  tabIds = []
  tabActiveId = ''
  tabSequence = 0
  sectionActive = PATH_KIND_COMPONENTS

  messageState = { status: 'idle', messageText: '' }

  // other stores register cleanup for their per-tab state here
  tabCloseCallbacks = []

  constructor() {
    makeAutoObservable(this, { tabCloseCallbacks: false })
    this.tabCreate({ kind: PATH_KIND_COMPONENTS })
  }

  tabCloseCallbackRegister(callback) {
    this.tabCloseCallbacks.push(callback)
  }

  tabIdsOfSection(sectionKind) {
    return this.tabIds.filter((tabId) => this.tabById.get(tabId)?.pathData.kind === sectionKind)
  }

  sectionActiveSet(sectionKind) {
    this.sectionActive = sectionKind
    const tabIdsSection = this.tabIdsOfSection(sectionKind)
    if (tabIdsSection.length === 0) {
      this.tabCreate(this.pathRootOfSection(sectionKind))
      return
    }
    if (!tabIdsSection.includes(this.tabActiveId)) {
      this.tabActiveId = tabIdsSection[tabIdsSection.length - 1]
    }
  }

  pathRootOfSection(sectionKind) {
    if (sectionKind === PATH_KIND_PLAYGROUND) return { kind: PATH_KIND_PLAYGROUND }
    if (sectionKind === PATH_KIND_TASKS) return { kind: PATH_KIND_TASKS }
    if (sectionKind === PATH_KIND_STATUS) return { kind: PATH_KIND_STATUS }
    return { kind: PATH_KIND_COMPONENTS }
  }

  tabCreate(pathData) {
    this.tabSequence += 1
    const tabId = `manage-tab-${this.tabSequence}`
    this.tabById.set(tabId, {
      tabId,
      pathData: pathClone(pathData),
      state: tabStateCreate(),
    })
    this.tabIds.push(tabId)
    this.tabActiveId = tabId
    this.sectionActive = pathData.kind || PATH_KIND_COMPONENTS
    return tabId
  }

  tabActiveSet(tabId) {
    const tab = this.tabById.get(tabId)
    if (!tab) return
    this.tabActiveId = tabId
    this.sectionActive = tab.pathData.kind || PATH_KIND_COMPONENTS
  }

  tabPathSet(tabId, pathData) {
    const tab = this.tabById.get(tabId)
    if (!tab) return
    tab.pathData = pathClone(pathData)
    tab.state.metadataSelectedRowId = null
    tab.state.confirmState = null
    tab.state.compRowSelectedId = ''
    tab.state.versionRowSelectedId = ''
    tab.state.buildRowSelectedId = ''
    tab.state.taskRowSelectedId = ''
  }

  pathOpen(pathData, { isNewTab = false, tabId = this.tabActiveId } = {}) {
    if (isNewTab || !this.tabById.has(tabId)) {
      return this.tabCreate(pathData)
    }
    this.tabPathSet(tabId, pathData)
    this.tabActiveId = tabId
    this.sectionActive = pathData.kind || PATH_KIND_COMPONENTS
    return tabId
  }

  tabClose(tabId) {
    const tab = this.tabById.get(tabId)
    const sectionKind = tab?.pathData?.kind || PATH_KIND_COMPONENTS
    const index = this.tabIds.indexOf(tabId)
    if (index < 0) return
    this.tabIds.splice(index, 1)
    this.tabById.delete(tabId)
    for (const callback of this.tabCloseCallbacks) callback(tabId)
    if (this.tabIds.length === 0) {
      this.tabCreate(this.pathRootOfSection(sectionKind))
      return
    }
    if (this.tabActiveId === tabId) {
      this.tabActiveId = this.tabIds[Math.min(index, this.tabIds.length - 1)]
      const tabActive = this.tabById.get(this.tabActiveId)
      if (tabActive) this.sectionActive = tabActive.pathData.kind || PATH_KIND_COMPONENTS
    }
    if (this.tabIdsOfSection(sectionKind).length === 0) {
      this.tabCreate(this.pathRootOfSection(sectionKind))
    }
  }

  tabsReorder(tabIds) {
    const idsValid = tabIds.filter((tabId) => this.tabById.has(tabId))
    if (idsValid.length === this.tabIds.length) this.tabIds = idsValid
  }

  tabStateGet(tabId) {
    return this.tabById.get(tabId)?.state || null
  }

  tabConfirmSet(tabId, confirmState) {
    const state = this.tabStateGet(tabId)
    if (state) state.confirmState = confirmState
  }

  tabMetadataRowSet(tabId, rowId) {
    const state = this.tabStateGet(tabId)
    if (state) state.metadataSelectedRowId = rowId
  }

  tabCompCreateOpenSet(tabId, isOpen) {
    const state = this.tabStateGet(tabId)
    if (state) state.isCompCreateOpen = isOpen
  }

  tabCompCreatePendingSet(tabId, isPending) {
    const state = this.tabStateGet(tabId)
    if (state) state.isCompCreatePending = isPending
  }

  tabCompRowSelectedSet(tabId, compId) {
    const state = this.tabStateGet(tabId)
    if (state) state.compRowSelectedId = compId || ''
  }

  tabVersionRowSelectedSet(tabId, versionId) {
    const state = this.tabStateGet(tabId)
    if (state) state.versionRowSelectedId = versionId || ''
  }

  tabBuildRowSelectedSet(tabId, buildId) {
    const state = this.tabStateGet(tabId)
    if (state) state.buildRowSelectedId = buildId || ''
  }

  tabTaskRowSelectedSet(tabId, taskId) {
    const state = this.tabStateGet(tabId)
    if (state) state.taskRowSelectedId = taskId || ''
  }

  setMessage(status, messageText) {
    this.messageState = { status, messageText }
  }

  clearMessage() {
    this.messageState = { status: 'idle', messageText: '' }
  }
}

export const storeUi = new StoreUi()
