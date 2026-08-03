// Websocket hub for real-time task progress. Refer to /doc/service_task.md#websocket.
//
// Client -> server: { action: 'subscribe' | 'unsubscribe', taskId: '...' | '*' }
// Server -> client: { taskId, taskStatus, taskStatusText, progressEntry }

export class WsHub {
  constructor() {
    this.clients = new Set() // { socket, taskIds: Set }
  }

  register(socket) {
    const client = { socket, taskIds: new Set() }
    this.clients.add(client)

    socket.on('message', (raw) => {
      let message = null
      try {
        message = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (!message || typeof message.taskId !== 'string') return
      if (message.action === 'subscribe') client.taskIds.add(message.taskId)
      if (message.action === 'unsubscribe') client.taskIds.delete(message.taskId)
    })

    socket.on('close', () => {
      this.clients.delete(client)
    })
    socket.on('error', () => {
      this.clients.delete(client)
    })
  }

  pushTask(taskRecord) {
    const progressList = taskRecord.taskProgress?.progressList || []
    const payload = JSON.stringify({
      taskId: taskRecord.taskId,
      taskStatus: taskRecord.taskStatus,
      taskStatusText: taskRecord.taskStatusText,
      progressEntry: progressList[progressList.length - 1] || null,
    })
    for (const client of this.clients) {
      if (!client.taskIds.has('*') && !client.taskIds.has(taskRecord.taskId)) continue
      try {
        client.socket.send(payload)
      } catch {
        this.clients.delete(client)
      }
    }
  }
}
