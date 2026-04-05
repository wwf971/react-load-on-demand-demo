import { observer } from 'mobx-react-lite'

export const TaskInfo = observer(function TaskInfo({ pageStore, taskId }) {
  const taskRow = pageStore.getTask(taskId)
  return (
    <div className="task-info-root">
      <div className="task-info-line">task id: {taskId}</div>
      {taskRow ? (
        <div className="task-info-line">updatedAt: {String(taskRow.updatedAt ?? '')}</div>
      ) : (
        <div className="task-info-line">not found</div>
      )}
    </div>
  )
})
