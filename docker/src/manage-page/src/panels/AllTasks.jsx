import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { RefreshIcon, SpinningCircle } from '@wwf971/react-comp-misc'
import { storeUi } from '../store.js'
import { storeTask } from '../storeTask.js'

const TASK_STATUS_TEXT = { 1: 'undergoing', 2: 'success', 3: 'fail', 4: 'cancel' }

const AllTasks = observer(() => {
  useEffect(() => {
    storeTask.fetchTasks()
  }, [])

  const taskSelected = storeUi.taskSelectedId ? storeTask.taskById.get(storeUi.taskSelectedId) : null

  return (
    <div>
      <div className="panel-title">
        Tasks
        <button className="icon-btn" title="refresh" onClick={() => storeTask.fetchTasks()}>
          {storeTask.isLoading ? <SpinningCircle width={14} height={14} /> : <RefreshIcon width={14} height={14} />}
        </button>
        <span className={`ws-status ${storeTask.wsStatus === 'connected' ? 'is-connected' : ''}`}>
          ws: {storeTask.wsStatus}
        </span>
      </div>

      <div className="row-table">
        <div className="row-table-header">
          <div className="cell" style={{ width: 110 }}>taskId</div>
          <div className="cell" style={{ width: 200 }}>comp / version</div>
          <div className="cell" style={{ width: 90 }}>status</div>
          <div className="cell" style={{ flex: 1 }}>latest message</div>
        </div>
        {storeTask.taskIds.map((taskId) => {
          const record = storeTask.taskById.get(taskId)
          if (!record) return null
          return (
            <div
              key={taskId}
              className={`row-table-row ${storeUi.taskSelectedId === taskId ? 'is-selected' : ''}`}
              onClick={() => storeUi.selectTask(taskId)}
            >
              <div className="cell cell-id" style={{ width: 110 }}>{taskId}</div>
              <div className="cell cell-id" style={{ width: 200 }}>
                {record.operationInfo?.compId} / {record.operationInfo?.versionId}
              </div>
              <div className={`cell status-${record.taskStatus}`} style={{ width: 90 }}>
                {TASK_STATUS_TEXT[record.taskStatus] || record.taskStatus}
              </div>
              <div className="cell" style={{ flex: 1 }}>{record.taskStatusText}</div>
            </div>
          )
        })}
        {storeTask.taskIds.length === 0 && !storeTask.isLoading && (
          <div className="row-table-row field-note">no tasks yet</div>
        )}
      </div>

      {taskSelected && (
        <>
          <hr className="panel-divider" />
          <TaskDetail task={taskSelected} />
        </>
      )}
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
        <div className="btn-row">
          <button
            className="btn danger"
            disabled={task.isCancelRequested}
            onClick={() => storeTask.cancelTask(task.taskId)}
          >
            {task.isCancelRequested ? 'cancel requested...' : 'cancel task'}
          </button>
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
