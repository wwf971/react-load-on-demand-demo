import { observer } from 'mobx-react-lite'

export const TaskVersionInfo = observer(function TaskVersionInfo({
  pageStore,
  taskId,
  taskVersionId,
}) {
  const versionRecord = pageStore.getTaskVersion(taskId, taskVersionId)
  return (
    <div className="task-version-info-root">
      <div className="task-version-info-line">
        task id: {taskId} / task version id: {taskVersionId}
      </div>
      <div className="task-version-info-line">
        {versionRecord?.detailFromServer != null
          ? 'detail loaded'
          : 'stub (no server detail yet)'}
      </div>
    </div>
  )
})
