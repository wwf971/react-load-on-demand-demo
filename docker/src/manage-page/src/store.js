// StoreUi: ui state of the manage page (fully data-driven; render components
// hold no ui state of their own). Refer to /doc/service_manage_page.md.

import { makeAutoObservable } from 'mobx'

export const SECTION_KEYS = [
  { key: 'comps', label: 'Components' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'status', label: 'Status' },
]

class StoreUi {
  sectionCurrent = 'comps'

  compSelectedId = ''
  versionSelectedId = ''
  taskSelectedId = ''

  // `${versionId}/${buildId}` of the build whose log panel is open
  buildLogOpenKey = ''
  // `${versionId}/${buildId}` of the build whose file list is open
  buildFilesOpenKey = ''

  metadataSelectedRowId = null

  // inline confirm for destructive actions (never window.confirm):
  // null | { kind: 'comp-delete', compId }
  confirmState = null

  // whether the "new component" creation row is open, and its pending state
  isCompCreateOpen = false
  isCompCreatePending = false

  messageState = { status: 'idle', messageText: '' }

  constructor() {
    makeAutoObservable(this)
  }

  setSection(sectionKey) {
    this.sectionCurrent = sectionKey
  }

  selectComp(compId) {
    this.compSelectedId = compId
    this.versionSelectedId = ''
    this.buildLogOpenKey = ''
    this.buildFilesOpenKey = ''
    this.metadataSelectedRowId = null
    this.confirmState = null
  }

  selectVersion(versionId) {
    this.versionSelectedId = versionId
    this.buildLogOpenKey = ''
    this.buildFilesOpenKey = ''
  }

  selectTask(taskId) {
    this.taskSelectedId = taskId
  }

  toggleBuildLog(key) {
    this.buildLogOpenKey = this.buildLogOpenKey === key ? '' : key
  }

  toggleBuildFiles(key) {
    this.buildFilesOpenKey = this.buildFilesOpenKey === key ? '' : key
  }

  setConfirm(confirmState) {
    this.confirmState = confirmState
  }

  setMetadataSelectedRowId(rowId) {
    this.metadataSelectedRowId = rowId
  }

  setCompCreateOpen(isOpen) {
    this.isCompCreateOpen = isOpen
  }

  setCompCreatePending(isPending) {
    this.isCompCreatePending = isPending
  }

  setMessage(status, messageText) {
    this.messageState = { status, messageText }
  }

  clearMessage() {
    this.messageState = { status: 'idle', messageText: '' }
  }
}

export const storeUi = new StoreUi()
