import { makeAutoObservable, observable, runInAction } from 'mobx'
import {
  Home,
  TaskInfo,
  AllVersionsOfTask,
  TaskVersionInfo,
  AllBuildsOfTask,
  TaskBuildInfo,
  UnknownTabPath,
} from './panels/index.js'

const TASK_ID_RE = /^[0-9a-z]+$/

const TAB_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const TAB_ID_LENGTH = 16

function newTabId() {
  let out = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(TAB_ID_LENGTH)
    crypto.getRandomValues(buf)
    for (let i = 0; i < TAB_ID_LENGTH; i++) {
      out += TAB_ID_ALPHABET[buf[i] % TAB_ID_ALPHABET.length]
    }
    return out
  }
  for (let i = 0; i < TAB_ID_LENGTH; i++) {
    out += TAB_ID_ALPHABET[Math.floor(Math.random() * TAB_ID_ALPHABET.length)]
  }
  return out
}

function normalizePathStr(pathStr) {
  if (pathStr == null) return ''
  let s = String(pathStr).trim().replace(/\\/g, '/')
  s = s.replace(/\/+/g, '/')
  if (s.startsWith('/')) s = s.slice(1)
  if (s.endsWith('/')) s = s.slice(0, -1)
  return s
}

export function parseTabPathString(pathStr) {
  const body = normalizePathStr(pathStr)
  if (body === '') {
    return { kind: 'home', segments: [] }
  }
  const segments = body.split('/')
  if (segments.some((p) => p === '')) {
    return { kind: 'unknown', path: pathStr, segments }
  }

  if (segments.length === 1 && (segments[0] === 'home' || segments[0] === 'tasks')) {
    return { kind: 'home', segments }
  }

  if (segments[0] === 'task' && segments.length >= 2) {
    const taskId = segments[1]
    if (!TASK_ID_RE.test(taskId)) {
      return { kind: 'unknown', path: pathStr, segments }
    }
    if (segments.length === 2) {
      return { kind: 'task', taskId, segments }
    }
    if (segments.length === 3 && segments[2] === 'versions') {
      return { kind: 'taskVersions', taskId, segments }
    }
    if (segments.length === 3 && segments[2] === 'builds') {
      return { kind: 'taskBuilds', taskId, segments }
    }
    if (segments.length === 4 && segments[2] === 'version') {
      const taskVersionId = segments[3]
      if (!taskVersionId) {
        return { kind: 'unknown', path: pathStr, segments }
      }
      return { kind: 'taskVersion', taskId, taskVersionId, segments }
    }
    if (segments.length === 4 && segments[2] === 'build') {
      const taskBuildId = segments[3]
      if (!taskBuildId) {
        return { kind: 'unknown', path: pathStr, segments }
      }
      return { kind: 'taskBuild', taskId, taskBuildId, segments }
    }
  }

  return { kind: 'unknown', path: pathStr, segments }
}

export function titleFromPath(pathStr) {
  const body = normalizePathStr(pathStr)
  if (body === '' || body === 'home' || body === 'tasks') {
    return 'Home'
  }
  const parsed = parseTabPathString(pathStr)
  if (parsed.kind === 'task') {
    return `Task ${parsed.taskId}`
  }
  if (parsed.kind === 'taskVersions') {
    return `Versions ${parsed.taskId}`
  }
  if (parsed.kind === 'taskVersion') {
    return `Version ${parsed.taskId}/${parsed.taskVersionId}`
  }
  if (parsed.kind === 'taskBuilds') {
    return `Builds ${parsed.taskId}`
  }
  if (parsed.kind === 'taskBuild') {
    return `Build ${parsed.taskId}/${parsed.taskBuildId}`
  }
  return body.length > 40 ? `${body.slice(0, 38)}..` : body
}

export class ManageTabsStore {
  tabs = observable.array([])

  activeTabId = null

  constructor(options = {}) {
    makeAutoObservable(this, {
      tabs: false,
    })
    const initialPath =
      typeof options.initialPath === 'string' ? options.initialPath : 'tasks'
    if (options.skipInitialTab !== true) {
      this.addTab({ path: initialPath, title: titleFromPath(initialPath) })
    }
  }

  getTab(tabId) {
    return this.tabs.find((t) => t.id === tabId) ?? null
  }

  get activeTab() {
    if (!this.activeTabId) return null
    return this.getTab(this.activeTabId)
  }

  get tabIds() {
    return this.tabs.map((t) => t.id)
  }

  addTab({ path, title, activate = true }) {
    const id = newTabId()
    const pathNorm = normalizePathStr(path) === '' ? 'tasks' : normalizePathStr(path)
    const tab = observable({
      id,
      path: pathNorm,
      title: title ?? titleFromPath(pathNorm),
    })
    runInAction(() => {
      this.tabs.push(tab)
      if (activate) {
        this.activeTabId = id
      }
    })
    return id
  }

  addTabAfter(afterTabId, { path, title, activate = true }) {
    const pathNorm = normalizePathStr(path) === '' ? 'tasks' : normalizePathStr(path)
    const id = newTabId()
    const tab = observable({
      id,
      path: pathNorm,
      title: title ?? titleFromPath(pathNorm),
    })
    runInAction(() => {
      const idx = this.tabs.findIndex((t) => t.id === afterTabId)
      const insertAt = idx === -1 ? this.tabs.length : idx + 1
      this.tabs.splice(insertAt, 0, tab)
      if (activate) {
        this.activeTabId = id
      }
    })
    return id
  }

  cloneTab(sourceTabId) {
    const src = this.getTab(sourceTabId)
    if (!src) {
      return null
    }
    return this.addTabAfter(sourceTabId, {
      path: src.path,
      title: src.title,
      activate: true,
    })
  }

  reorderTabs(orderedTabIds) {
    if (orderedTabIds.length !== this.tabs.length) {
      return
    }
    const seen = new Set()
    for (const id of orderedTabIds) {
      if (seen.has(id)) {
        return
      }
      seen.add(id)
    }
    runInAction(() => {
      const map = new Map(this.tabs.map((t) => [t.id, t]))
      const next = orderedTabIds.map((id) => map.get(id)).filter(Boolean)
      if (next.length !== this.tabs.length) {
        return
      }
      this.tabs.replace(next)
    })
  }

  removeTab(tabId) {
    runInAction(() => {
      const idx = this.tabs.findIndex((t) => t.id === tabId)
      if (idx === -1) return
      this.tabs.splice(idx, 1)
      if (this.activeTabId === tabId) {
        const next = this.tabs[idx] ?? this.tabs[idx - 1] ?? null
        this.activeTabId = next ? next.id : null
      }
    })
  }

  setActiveTab(tabId) {
    if (!this.getTab(tabId)) return
    runInAction(() => {
      this.activeTabId = tabId
    })
  }

  setTabPath(tabId, pathStr, nextTitle) {
    const tab = this.getTab(tabId)
    if (!tab) return
    const nextPath = normalizePathStr(pathStr) === '' ? 'tasks' : normalizePathStr(pathStr)
    runInAction(() => {
      tab.path = nextPath
      if (typeof nextTitle === 'string') {
        tab.title = nextTitle
      } else {
        tab.title = titleFromPath(nextPath)
      }
    })
  }

  getCompForParsed(parsed) {
    switch (parsed.kind) {
      case 'home':
        return Home
      case 'task':
        return TaskInfo
      case 'taskVersions':
        return AllVersionsOfTask
      case 'taskVersion':
        return TaskVersionInfo
      case 'taskBuilds':
        return AllBuildsOfTask
      case 'taskBuild':
        return TaskBuildInfo
      default:
        return UnknownTabPath
    }
  }

  async getCompAndDataOfTab(tabId, pageStore, extras = {}) {
    const onTabAction = extras.onTabAction
    const tab = this.getTab(tabId)
    if (!tab) {
      return { Comp: UnknownTabPath, compProps: { path: '' } }
    }
    const parsed = parseTabPathString(tab.path)
    const Comp = this.getCompForParsed(parsed)

    if (parsed.kind === 'unknown') {
      return { Comp, compProps: { path: tab.path, tabId, onTabAction } }
    }

    if (parsed.kind === 'home') {
      await pageStore.ensureAllTasks()
      return { Comp, compProps: { pageStore, tabId, onTabAction } }
    }

    if (parsed.kind === 'task') {
      await pageStore.ensureTask(parsed.taskId)
      return { Comp, compProps: { pageStore, taskId: parsed.taskId, tabId, onTabAction } }
    }

    if (parsed.kind === 'taskVersions') {
      await pageStore.ensureTaskVersionIndexForTask(parsed.taskId)
      return { Comp, compProps: { pageStore, taskId: parsed.taskId, tabId, onTabAction } }
    }

    if (parsed.kind === 'taskVersion') {
      await pageStore.ensureTaskVersionRecord(parsed.taskId, parsed.taskVersionId)
      return {
        Comp,
        compProps: {
          pageStore,
          taskId: parsed.taskId,
          taskVersionId: parsed.taskVersionId,
          tabId,
          onTabAction,
        },
      }
    }

    if (parsed.kind === 'taskBuilds') {
      await pageStore.ensureTaskBuildsForTask(parsed.taskId)
      return { Comp, compProps: { pageStore, taskId: parsed.taskId, tabId, onTabAction } }
    }

    if (parsed.kind === 'taskBuild') {
      await pageStore.ensureTaskBuildsForTask(parsed.taskId)
      return {
        Comp,
        compProps: {
          pageStore,
          taskId: parsed.taskId,
          taskBuildId: parsed.taskBuildId,
          tabId,
          onTabAction,
        },
      }
    }

    return { Comp: UnknownTabPath, compProps: { path: tab.path, tabId, onTabAction } }
  }
}

export function createTabsStore(options) {
  return new ManageTabsStore(options)
}
