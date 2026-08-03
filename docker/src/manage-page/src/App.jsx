import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { MessageBar, PanelDual } from '@wwf971/react-comp-misc'
import { SECTION_KEYS, storeUi } from './store.js'
import { storeTask } from './storeTask.js'
import Comps from './panels/Comps.jsx'
import AllTasks from './panels/AllTasks.jsx'
import Home from './panels/Home.jsx'
import './App.css'

const App = observer(() => {
  useEffect(() => {
    storeTask.connectWs()
  }, [])

  return (
    <div className="app-root">
      <MessageBar
        data={{ messageState: storeUi.messageState, idleText: 'react-lazy-load manage' }}
        onEvent={(eventType) => {
          if (eventType === 'dismissMessageRequest') storeUi.clearMessage()
        }}
      />
      <div className="app-body">
        <PanelDual orientation="vertical" initialWidth={170}>
          <div className="app-nav">
            {SECTION_KEYS.map((section) => (
              <div
                key={section.key}
                className={`app-nav-item ${storeUi.sectionCurrent === section.key ? 'is-current' : ''}`}
                onClick={() => storeUi.setSection(section.key)}
              >
                {section.label}
              </div>
            ))}
          </div>
          <div className="app-main">
            {storeUi.sectionCurrent === 'comps' && <Comps />}
            {storeUi.sectionCurrent === 'tasks' && <AllTasks />}
            {storeUi.sectionCurrent === 'status' && <Home />}
          </div>
        </PanelDual>
      </div>
    </div>
  )
})

export default App
