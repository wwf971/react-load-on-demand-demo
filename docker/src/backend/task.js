// Task records and outbox events, stored in storage-obj. Refer to /doc/service_task.md.
//
// The single service process owns all task writes, so an in-memory copy of task
// records (rebuilt from storage at boot) is kept authoritative for fast list/get.

import { newIdMs48, idMs48ToStampMs } from './id.js'
import { timeNow } from './time.js'
import { OBJECT_TYPE, STORAGE_SCHEMA_VERSION } from './storageSchema.js'

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

  async init() {
    this.taskById.clear()
    const items = await this.client.objectListAll({
      spaceId: this.resource.spaceId,
      dataType: 'json',
      type: OBJECT_TYPE.TASK,
    })
    for (const item of items) {
      const record = item.valueJson
      if (record?.objectKind !== 'task' || !record.taskId) {
        throw new Error(`invalid task object: ${item.objectId}`)
      }
      this.taskById.set(record.taskId, { objectId: item.objectId, record })
    }
  }

  // ---- task record ----

  // task record first, outbox event last ("durably accepted" then "to be picked up")
  async taskCreate({ taskType, operationInfo }) {
    const taskId = newIdMs48()
    const record = {
      objectKind: 'task',
      schemaVersion: STORAGE_SCHEMA_VERSION,
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
      spaceId: this.resource.spaceId,
      dataType: 'json',
      type: OBJECT_TYPE.TASK,
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
        spaceId: this.resource.spaceId,
        dataType: 'json',
        type: OBJECT_TYPE.TASK,
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
      spaceId: this.resource.spaceId,
      dataType: 'json',
      type: OBJECT_TYPE.OUTBOX_EVENT,
      valueJson: {
        objectKind: 'outbox-event',
        schemaVersion: STORAGE_SCHEMA_VERSION,
        eventId,
        taskId,
        eventType: 'task-created',
        createdAt: timeNow(),
      },
    })
  }

  // returns [{ objectId, event }], oldest first
  async outboxEventListPending() {
    const items = await this.client.objectListAll({
      spaceId: this.resource.spaceId,
      dataType: 'json',
      type: OBJECT_TYPE.OUTBOX_EVENT,
    })
    const events = items
      .filter(
        (item) =>
          item.valueJson?.objectKind === 'outbox-event'
          && item.valueJson?.eventType === 'task-created'
          && item.valueJson?.taskId
          && item.valueJson?.eventId,
      )
      .map((item) => ({ objectId: item.objectId, event: item.valueJson }))
    events.sort((a, b) => idMs48ToStampMs(a.event.eventId) - idMs48ToStampMs(b.event.eventId))
    return events
  }

  async outboxEventDone(objectId) {
    const data = await this.client.objectGet({
      spaceId: this.resource.spaceId,
      dataType: 'json',
      objectId,
    })
    if (!data) return
    if (data.type !== OBJECT_TYPE.OUTBOX_EVENT || data.valueJson?.objectKind !== 'outbox-event') {
      throw new Error(`refusing to delete non-outbox object: ${objectId}`)
    }
    await this.client.objectDelete({
      spaceId: this.resource.spaceId,
      dataType: 'json',
      objectId,
    })
  }
}
