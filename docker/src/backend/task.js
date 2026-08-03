// Task records and outbox events, stored in storage-obj. Refer to /doc/service_task.md.
//
// The single service process owns all task writes, so an in-memory copy of task
// records (rebuilt from storage at boot) is kept authoritative for fast list/get.

import { newIdMs48, idMs48ToStampMs } from './id.js'
import { timeNow } from './time.js'

export const TASK_TYPE_VERSION_BUILD = 1

export const TASK_STATUS_UNDERGOING = 1
export const TASK_STATUS_SUCCESS = 2
export const TASK_STATUS_FAIL = 3
export const TASK_STATUS_CANCEL = 4

export class TaskService {
  constructor({ client, resource, wsHub }) {
    this.client = client
    this.resource = resource
    this.wsHub = wsHub
    this.taskById = new Map() // taskId -> { objectId, record }
    this.writeQueue = Promise.resolve()
  }

  runSerialized(fn) {
    const next = this.writeQueue.then(fn, fn)
    this.writeQueue = next.then(
      () => {},
      () => {},
    )
    return next
  }

  get spaceIdTask() {
    return this.resource.spaceIdByRole.task
  }

  get spaceIdOutbox() {
    return this.resource.spaceIdByRole.outbox
  }

  async init() {
    const items = await this.client.objectListAll({ spaceId: this.spaceIdTask, dataType: 'json' })
    for (const item of items) {
      const record = item.valueJson
      if (record?.taskId) {
        this.taskById.set(record.taskId, { objectId: item.objectId, record })
      }
    }
  }

  // ---- task record ----

  // task record first, outbox event last ("durably accepted" then "to be picked up")
  async taskCreate({ taskType, operationInfo }) {
    const taskId = newIdMs48()
    const record = {
      schemaVersion: 1,
      taskId,
      taskType,
      taskStatus: TASK_STATUS_UNDERGOING,
      taskStatusText: 'queued',
      operationInfo,
      taskProgress: {
        progressList: [
          { taskStatus: TASK_STATUS_UNDERGOING, taskStatusMessage: 'build queued', updateAt: timeNow() },
        ],
      },
      resultInfo: null,
      exitInfo: null,
      isCancelRequested: false,
      createdAt: timeNow(),
      startedAt: null,
      finishedAt: null,
    }
    const objectId = await this.client.objectCreate({
      spaceId: this.spaceIdTask,
      dataType: 'json',
      valueJson: record,
    })
    this.taskById.set(taskId, { objectId, record })
    await this.outboxEventCreate(taskId)
    this.wsHub?.pushTask(record)
    return record
  }

  taskGet(taskId) {
    return this.taskById.get(taskId)?.record || null
  }

  taskList({ taskStatus = null, compId = '' } = {}) {
    const records = []
    for (const { record } of this.taskById.values()) {
      if (taskStatus !== null && record.taskStatus !== taskStatus) continue
      if (compId && record.operationInfo?.compId !== compId) continue
      records.push(record)
    }
    records.sort((a, b) => idMs48ToStampMs(b.taskId) - idMs48ToStampMs(a.taskId))
    return records
  }

  // applyFn mutates the record in place
  async taskChange(taskId, applyFn) {
    return this.runSerialized(async () => {
      const entry = this.taskById.get(taskId)
      if (!entry) throw new Error(`task not found: ${taskId}`)
      applyFn(entry.record)
      await this.client.objectUpdate({
        spaceId: this.spaceIdTask,
        dataType: 'json',
        objectId: entry.objectId,
        valueJson: entry.record,
      })
      this.wsHub?.pushTask(entry.record)
      return entry.record
    })
  }

  async progressAppend(taskId, taskStatusMessage) {
    return this.taskChange(taskId, (record) => {
      record.taskStatusText = taskStatusMessage
      record.taskProgress.progressList.push({
        taskStatus: record.taskStatus,
        taskStatusMessage,
        updateAt: timeNow(),
      })
    })
  }

  async taskStart(taskId) {
    return this.taskChange(taskId, (record) => {
      record.startedAt = timeNow()
      record.taskStatusText = 'build started'
      record.taskProgress.progressList.push({
        taskStatus: TASK_STATUS_UNDERGOING,
        taskStatusMessage: 'build started',
        updateAt: timeNow(),
      })
    })
  }

  // taskStatus: 2 success / 3 fail / 4 cancel
  async taskFinish(taskId, taskStatus, { message = '', resultInfo = null } = {}) {
    return this.taskChange(taskId, (record) => {
      record.taskStatus = taskStatus
      record.taskStatusText =
        taskStatus === TASK_STATUS_SUCCESS ? 'success' : taskStatus === TASK_STATUS_CANCEL ? 'cancel' : 'fail'
      record.finishedAt = timeNow()
      record.resultInfo = resultInfo
      record.taskProgress.progressList.push({
        taskStatus,
        taskStatusMessage: message || record.taskStatusText,
        updateAt: timeNow(),
      })
      if (taskStatus !== TASK_STATUS_SUCCESS) {
        record.exitInfo = { exitType: taskStatus, exitMessage: message, exitAt: timeNow() }
      }
    })
  }

  async taskCancelRequest(taskId) {
    const record = this.taskGet(taskId)
    if (!record) throw new Error(`task not found: ${taskId}`)
    if (record.taskStatus !== TASK_STATUS_UNDERGOING) {
      throw new Error('task is not undergoing')
    }
    return this.taskChange(taskId, (r) => {
      r.isCancelRequested = true
    })
  }

  // ---- outbox event ----
  // an event object exists while pending; marking done soft-deletes it

  async outboxEventCreate(taskId) {
    const eventId = newIdMs48()
    await this.client.objectCreate({
      spaceId: this.spaceIdOutbox,
      dataType: 'json',
      valueJson: { eventId, taskId, eventType: 'task-created', createdAt: timeNow() },
    })
  }

  // returns [{ objectId, event }], oldest first
  async outboxEventListPending() {
    const items = await this.client.objectListAll({ spaceId: this.spaceIdOutbox, dataType: 'json' })
    const events = items
      .filter((item) => item.valueJson?.taskId)
      .map((item) => ({ objectId: item.objectId, event: item.valueJson }))
    events.sort((a, b) => idMs48ToStampMs(a.event.eventId) - idMs48ToStampMs(b.event.eventId))
    return events
  }

  async outboxEventDone(objectId) {
    await this.client.objectDelete({ spaceId: this.spaceIdOutbox, dataType: 'json', objectId })
  }
}
