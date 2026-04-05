import { observer } from 'mobx-react-lite'

export const AllTasks = observer(function AllTasks({ pageStore, onTaskDoubleClick }) {
  const rows = pageStore.getTaskListSnapshot()
  return (
    <div className="all-tasks-root">
      <div className="all-tasks-count-line">{rows.length} tasks</div>
      <div className="all-tasks-list">
        {rows.map((row) => (
          <div
            key={row.taskId}
            className="all-tasks-row"
            role="listitem"
            onDoubleClick={() => onTaskDoubleClick?.(row.taskId)}
          >
            <span className="all-tasks-task-id">{row.taskId}</span>
            <span className="all-tasks-updated-at">
              {row.updatedAt != null ? String(row.updatedAt) : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
})
