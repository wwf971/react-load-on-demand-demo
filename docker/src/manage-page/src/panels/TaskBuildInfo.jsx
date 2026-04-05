import { observer } from 'mobx-react-lite'

export const TaskBuildInfo = observer(function TaskBuildInfo({
  pageStore,
  taskId,
  taskBuildId,
}) {
  const buildRow = pageStore.getTaskBuild(taskId, taskBuildId)
  return (
    <div className="task-build-info-root">
      <div className="task-build-info-line">
        task id: {taskId} / task build id: {taskBuildId}
      </div>
      {buildRow ? (
        <div className="task-build-info-line">
          phase: {String(buildRow.phase ?? '')} status: {String(buildRow.status ?? '')}
        </div>
      ) : (
        <div className="task-build-info-line">not found</div>
      )}
    </div>
  )
})
