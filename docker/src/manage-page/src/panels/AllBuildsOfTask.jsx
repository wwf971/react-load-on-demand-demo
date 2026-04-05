import { observer } from 'mobx-react-lite'

export const AllBuildsOfTask = observer(function AllBuildsOfTask({
  pageStore,
  taskId,
}) {
  const buildIds = pageStore.getTaskBuildIdsForTask(taskId)
  return (
    <div className="all-builds-of-task-root">
      <div className="all-builds-of-task-line">task id: {taskId}</div>
      <div className="all-builds-of-task-list">
        {buildIds.map((taskBuildId) => {
          const row = pageStore.getTaskBuild(taskId, taskBuildId)
          return (
            <div key={taskBuildId} className="all-builds-of-task-row">
              <span className="all-builds-of-task-build-id">{taskBuildId}</span>
              <span className="all-builds-of-task-phase">
                {row?.phase != null ? String(row.phase) : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
})
