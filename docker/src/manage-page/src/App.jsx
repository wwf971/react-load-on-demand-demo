import { useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { createManagePageStore } from './store.js'
import { createTabsStore } from './storeTabs.js'
import TabsContainer from './TabsContainer.jsx'
import ConnectionStatus from './ConnectionStatus.jsx'
import './App.css'

const App = observer(function App() {
  const pageStore = useMemo(
    () =>
      createManagePageStore({
        baseUrl: import.meta.env.VITE_API_BASE ?? '',
      }),
    [],
  )
  const tabsStore = useMemo(() => createTabsStore(), [])

  return (
    <div className="manage-root">
      <div className="manage-title">Manage</div>
      <ConnectionStatus pageStore={pageStore} />
      <TabsContainer tabsStore={tabsStore} pageStore={pageStore} />
    </div>
  )
})

export default App
