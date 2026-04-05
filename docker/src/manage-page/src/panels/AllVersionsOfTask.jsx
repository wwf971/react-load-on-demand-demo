import { observer } from 'mobx-react-lite'

export const AllVersionsOfTask = observer(function AllVersionsOfTask({
  pageStore,
  taskId,
}) {
  const versionIds = pageStore.getTaskVersionIdsForTask(taskId)
  return (
    <div className="all-versions-of-task-root">
      <div className="all-versions-of-task-line">task id: {taskId}</div>
      <div className="all-versions-of-task-list">
        {versionIds.map((taskVersionId) => (
          <div key={taskVersionId} className="all-versions-of-task-row">
            {taskVersionId}
          </div>
        ))}
      </div>
    </div>
  )
})
