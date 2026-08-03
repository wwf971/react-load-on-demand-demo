// Task records + the websocket connection. Pushed progress is applied to the
// records in place; observers re-render. Refer to /doc/service_manage_page.md.

import { makeAutoObservable, observable, runInAction } from 'mobx'
import { apiGet, apiPost } from './api.js'
import { storeUi } from './store.js'

class StoreTask {
  taskById = observable.map()
  taskIds = [] // newest first
  isLoading = false
  wsStatus = 'disconnected' // 'disconnected' | 'connecting' | 'connected'
  ws = null

  constructor() {
    makeAutoObservable(this, { ws: false })
  }

  async fetchTasks() {
    this.isLoading = true
    const result = await apiGet('/api/task/list')
    runInAction(() => {
      this.isLoading = false
      if (result.code !== 0) {
        storeUi.setMessage('error', result.message || 'failed to load tasks')
        return
      }
      this.taskIds = result.data.tasks.map((t) => t.taskId)
      for (const record of result.data.tasks) {
        this.taskById.set(record.taskId, record)
      }
    })
  }

  async fetchTask(taskId) {
    const result = await apiGet(`/api/task/get?taskId=${encodeURIComponent(taskId)}`)
    runInAction(() => {
      if (result.code === 0) {
        this.taskById.set(taskId, result.data)
        if (!this.taskIds.includes(taskId)) {
          this.taskIds = [taskId, ...this.taskIds]
        }
      }
    })
  }

  async cancelTask(taskId) {
    const result = await apiPost('/api/task/cancel', { taskId })
    if (result.code !== 0) {
      storeUi.setMessage('error', result.message || 'cancel failed')
    } else {
      storeUi.setMessage('success', 'cancel requested')
    }
  }

  connectWs() {
    if (this.ws) return
    this.wsStatus = 'connecting'
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/api/ws/task`)
    this.ws = ws

    ws.onopen = () => {
      runInAction(() => {
        this.wsStatus = 'connected'
      })
      ws.send(JSON.stringify({ action: 'subscribe', taskId: '*' }))
      // on reconnect: re-fetch, pushes carry only the latest state
      this.fetchTasks()
    }
    ws.onmessage = (event) => {
      let payload = null
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      this.applyPush(payload)
    }
    ws.onclose = () => {
      runInAction(() => {
        this.wsStatus = 'disconnected'
        this.ws = null
      })
      setTimeout(() => this.connectWs(), 3000)
    }
    ws.onerror = () => {
      ws.close()
    }
  }

  applyPush(payload) {
    const record = this.taskById.get(payload.taskId)
    if (!record) {
      this.fetchTask(payload.taskId)
      return
    }
    runInAction(() => {
      record.taskStatus = payload.taskStatus
      record.taskStatusText = payload.taskStatusText
      if (payload.progressEntry) {
        record.taskProgress.progressList.push(payload.progressEntry)
      }
    })
  }
}

export const storeTask = new StoreTask()
