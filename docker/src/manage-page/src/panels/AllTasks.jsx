import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import {
  CrossIcon,
  FolderView,
  ForwardIcon,
  RefreshIcon,
} from '@wwf971/react-comp-misc'
import { storeUi } from '../store.js'
import { storeTask } from '../storeTask.js'
import ControlIconItem from '../ControlIconItem.jsx'
import HorizontalButtonGroup from '../HorizontalButtonGroup.jsx'
import TitleIconAction from '../TitleIconAction.jsx'

const TASK_STATUS_TEXT = { 1: 'undergoing', 2: 'success', 3: 'fail', 4: 'cancel' }
const TASK_COLS_ORDER = ['taskId', 'compVersion', 'taskStatus', 'taskStatusText']
const TASK_COLUMNS = {
  taskId: { data: 'taskId', align: 'left' },
  compVersion: { data: 'compVersion', align: 'left' },
  taskStatus: { data: 'taskStatus', align: 'left' },
  taskStatusText: { data: 'taskStatusText', align: 'left' },
}
const TASK_COL_SIZE_BY_ID = {
  taskId: { width: 110, minWidth: 80, resizable: true },
  compVersion: { width: 200, minWidth: 120, resizable: true },
  taskStatus: { width: 90, minWidth: 70, resizable: true },
  taskStatusText: { width: 240, minWidth: 120, resizable: true },
}

const TaskStatusCell = ({ data }) => (
  <span className={`status-${data}`}>{TASK_STATUS_TEXT[data] || data}</span>
)

const AllTasks = observer(({ tabId, taskId }) => {
  useEffect(() => {
    storeTask.fetchTasks()
  }, [])

  useEffect(() => {
    if (taskId) storeTask.fetchTask(taskId)
  }, [taskId])

  const taskSelected = taskId ? storeTask.taskById.get(taskId) : null

  if (taskId) {
    return taskSelected
      ? <TaskDetail task={taskSelected} />
      : <div className="field-note">loading task...</div>
  }

  const state = storeUi.tabStateGet(tabId)
  const taskSelectedId = state?.taskRowSelectedId || ''
  const taskRecord = taskSelectedId ? storeTask.taskById.get(taskSelectedId) : null
  const isCancelEnabled = Boolean(
    taskRecord
    && taskRecord.taskStatus === 1
    && !taskRecord.isCancelRequested,
  )

  const rows = storeTask.taskIds.map((id) => {
    const record = storeTask.taskById.get(id)
    if (!record) return null
    return {
      id,
      data: {
        taskId: id,
        compVersion: `${record.operationInfo?.compId || ''} / ${record.operationInfo?.versionId || ''}`,
        taskStatus: record.taskStatus,
        taskStatusText: record.taskStatusText || '',
      },
    }
  }).filter(Boolean)

  return (
    <div>
      <div className="panel-title">
        Tasks
        <TitleIconAction
          title="refresh"
          isLoading={storeTask.isLoading}
          onClick={() => storeTask.fetchTasks()}
          icon={<RefreshIcon width={14} height={14} />}
        />
        <span className={`ws-status ${storeTask.wsStatus === 'connected' ? 'is-connected' : ''}`}>
          ws: {storeTask.wsStatus}
        </span>
      </div>

      <div className="table-control-row">
        <HorizontalButtonGroup groupId={`task-list-${tabId}`}>
          <ControlIconItem
            label="open"
            isDisabled={!taskSelectedId}
            onClick={() => {
              if (!taskSelectedId) return
              storeUi.pathOpen({ kind: 'tasks', taskId: taskSelectedId }, { tabId })
            }}
          >
            <ForwardIcon width={12} height={12} />
          </ControlIconItem>
          <ControlIconItem
            label="cancel"
            isDanger
            isDisabled={!isCancelEnabled}
            onClick={() => {
              if (!isCancelEnabled) return
              storeTask.cancelTask(taskSelectedId)
            }}
          >
            <CrossIcon size={12} />
          </ControlIconItem>
        </HorizontalButtonGroup>
      </div>

      <div className="comp-folder-wrap">
        <FolderView
          data={{
            columns: TASK_COLUMNS,
            colsOrder: TASK_COLS_ORDER,
            rows,
            rowIdsSelected: taskSelectedId ? [taskSelectedId] : [],
            statusBar: {
              itemCount: rows.length,
              messageState: storeTask.isLoading
                ? { status: 'loading', messageText: 'loading tasks' }
                : null,
            },
          }}
          config={{
            colSizeById: TASK_COL_SIZE_BY_ID,
            bodyHeight: 220,
            isListOnly: true,
            isLocked: storeTask.isLoading,
            isStatusBarVisible: true,
            selectionMode: 'single',
            isLastColFilled: true,
            compBodyByColId: (colId) => (colId === 'taskStatus' ? TaskStatusCell : undefined),
          }}
          onEvent={(eventType, eventData) => {
            if (eventType === 'rowIdsSelectedChange') {
              storeUi.tabTaskRowSelectedSet(tabId, eventData.rowIdsSelected?.[0] || '')
              return { code: 0 }
            }
            if (eventType === 'rowDoubleClick') {
              const id = eventData.rowId || ''
              if (id) storeUi.pathOpen({ kind: 'tasks', taskId: id }, { tabId })
              return { code: 0 }
            }
            return { code: 0 }
          }}
        />
        {rows.length === 0 && !storeTask.isLoading && (
          <div className="field-note comp-empty-note">no tasks yet</div>
        )}
      </div>
    </div>
  )
})

const TaskDetail = observer(({ task }) => {
  return (
    <div>
      <div className="panel-title-2">
        Task <span className="cell-id">{task.taskId}</span>
        <span className={`status-${task.taskStatus}`}>{TASK_STATUS_TEXT[task.taskStatus]}</span>
      </div>
      <div className="field-note">
        comp <span className="cell-id">{task.operationInfo?.compId}</span>, version{' '}
        <span className="cell-id">{task.operationInfo?.versionId}</span>, build{' '}
        <span className="cell-id">{task.operationInfo?.buildId}</span>
      </div>
      <div className="field-note">
        created {task.createdAt}
        {task.startedAt ? ` / started ${task.startedAt}` : ''}
        {task.finishedAt ? ` / finished ${task.finishedAt}` : ''}
      </div>

      {task.taskStatus === 1 && (
        <div className="table-control-row">
          <HorizontalButtonGroup groupId={`task-detail-${task.taskId}`}>
            <ControlIconItem
              label="cancel"
              isDanger
              isDisabled={task.isCancelRequested}
              onClick={() => storeTask.cancelTask(task.taskId)}
            >
              <CrossIcon size={12} />
            </ControlIconItem>
          </HorizontalButtonGroup>
        </div>
      )}

      <div className="panel-title-2">Progress</div>
      <div className="mono-block">
        {(task.taskProgress?.progressList || [])
          .map((entry) => `[${entry.updateAt}] [${entry.taskStatus}] ${entry.taskStatusMessage}`)
          .join('\n')}
      </div>

      {task.resultInfo && (
        <>
          <div className="panel-title-2">Result</div>
          <div className="mono-block">{JSON.stringify(task.resultInfo, null, 2)}</div>
        </>
      )}
      {task.exitInfo && (
        <>
          <div className="panel-title-2">Exit</div>
          <div className="mono-block">{JSON.stringify(task.exitInfo, null, 2)}</div>
        </>
      )}
    </div>
  )
})

export default AllTasks
