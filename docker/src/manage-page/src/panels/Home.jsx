import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { AllTasks } from './AllTasks.jsx'
import { TAB_ACTION } from '../tabActionKinds.js'

export const Home = observer(function Home({ pageStore, tabId, onTabAction }) {
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const handleCreateTask = async () => {
    setCreateError(null)
    setIsCreating(true)
    try {
      await pageStore.createEmptyTask()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'create failed')
    } finally {
      setIsCreating(false)
    }
  }

  const handleTaskDoubleClick = (taskId) => {
    if (typeof onTabAction !== 'function' || !tabId) {
      return
    }
    onTabAction({
      type: TAB_ACTION.OPEN_TASK_IN_NEW_TAB,
      sourceTabId: tabId,
      taskId,
    })
  }

  return (
    <div className="home-root">
      <div className="home-actions">
        <button
          type="button"
          className="home-create-btn"
          disabled={isCreating}
          onClick={handleCreateTask}
        >
          {isCreating ? 'Creating' : 'Create task'}
        </button>
        {createError ? (
          <div className="home-create-error">{createError}</div>
        ) : null}
      </div>
      <AllTasks pageStore={pageStore} onTaskDoubleClick={handleTaskDoubleClick} />
    </div>
  )
})
