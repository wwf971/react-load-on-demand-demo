import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import {
  MessageBar,
  PathBar,
  TabsOnTop,
  TabsOnTopTab,
} from '@wwf971/react-comp-misc'
import {
  PATH_KIND_COMPONENTS,
  PATH_KIND_STATUS,
  PATH_KIND_TASKS,
  storeUi,
} from './store.js'
import { storeComp } from './storeComp.js'
import { storeTask } from './storeTask.js'
import Comps from './panels/Comps.jsx'
import AllTasks from './panels/AllTasks.jsx'
import Home from './panels/Home.jsx'
import './App.css'

const SECTION_LIST = [
  { key: 'section-components', kind: PATH_KIND_COMPONENTS, label: 'Components' },
  { key: 'section-tasks', kind: PATH_KIND_TASKS, label: 'Tasks' },
  { key: 'section-status', kind: PATH_KIND_STATUS, label: 'Config' },
]

const sectionKeyOf = (sectionKind) => `section-${sectionKind}`

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
        <TabsOnTop
          defaultTab={sectionKeyOf(storeUi.sectionActive)}
          onTabChange={(sectionKey) => {
            const section = SECTION_LIST.find((item) => item.key === sectionKey)
            if (section) storeUi.sectionActiveSet(section.kind)
          }}
          autoSwitchToNewTab={false}
          defaultKeepMounted
        >
          {SECTION_LIST.map((section) => (
            <TabsOnTopTab key={section.key} tabKey={section.key} label={section.label}>
              <SectionWorkspace sectionKind={section.kind} />
            </TabsOnTopTab>
          ))}
        </TabsOnTop>
      </div>
    </div>
  )
})

const SectionWorkspace = observer(({ sectionKind }) => {
  const tabIdsSection = storeUi.tabIdsOfSection(sectionKind)
  const tabActiveIdSection = tabIdsSection.includes(storeUi.tabActiveId)
    ? storeUi.tabActiveId
    : tabIdsSection[tabIdsSection.length - 1] || ''

  return (
    <div className="section-workspace">
      <TabsOnTop
        defaultTab={tabActiveIdSection}
        onTabChange={(tabId) => storeUi.tabActiveSet(tabId)}
        allowCloseTab
        onTabClose={(tabId) => storeUi.tabClose(tabId)}
        allowTabReorder
        onTabReorder={(tabs) => storeUi.tabsReorder(tabs.map((tab) => tab.key))}
        autoSwitchToNewTab={false}
        defaultKeepMounted
      >
        {tabIdsSection.map((tabId) => {
          const tab = storeUi.tabById.get(tabId)
          if (!tab) return null
          return (
            <TabsOnTopTab key={tabId} tabKey={tabId} label={tabLabelOf(tab.pathData)}>
              <ManageTab tabId={tabId} />
            </TabsOnTopTab>
          )
        })}
      </TabsOnTop>
    </div>
  )
})

const ManageTab = observer(({ tabId }) => {
  const tab = storeUi.tabById.get(tabId)
  if (!tab) return null
  const pathData = tab.pathData
  const pathSegments = pathSegmentsOf(pathData)

  return (
    <div className="manage-tab">
      <PathBar
        pathData={{ segments: pathSegments }}
        allowEditText={false}
        addSlashBeforeFirstSeg={
          pathData.kind === PATH_KIND_COMPONENTS && pathSegments.length === 0
        }
        appendTrailingSlash
        onPathSegClicked={(index, event) => {
          const pathNext = pathAtSegment(pathData, index)
          storeUi.pathOpen(pathNext, {
            tabId,
            isNewTab: Boolean(event?.ctrlKey || event?.metaKey),
          })
        }}
      />
      <div className="app-main">
        {pathData.kind === PATH_KIND_COMPONENTS && <Comps tabId={tabId} pathData={pathData} />}
        {pathData.kind === PATH_KIND_TASKS && <AllTasks tabId={tabId} taskId={pathData.taskId} />}
        {pathData.kind === PATH_KIND_STATUS && <Home />}
      </div>
    </div>
  )
})

const tabLabelOf = (pathData) => {
  if (pathData.kind === PATH_KIND_STATUS) return 'Config'
  if (pathData.kind === PATH_KIND_TASKS) return pathData.taskId || 'Tasks'
  if (pathData.buildId) return pathData.buildId
  if (pathData.versionId) return pathData.versionId
  if (pathData.compId) {
    return storeComp.compById.get(pathData.compId)?.compName || pathData.compId
  }
  return 'Components'
}

const pathSegmentsOf = (pathData) => {
  if (pathData.kind === PATH_KIND_STATUS) {
    return [{ id: 'status', name: 'Config' }]
  }
  if (pathData.kind === PATH_KIND_TASKS) {
    const segments = [{ id: 'tasks', name: 'Tasks' }]
    if (pathData.taskId) segments.push({ id: pathData.taskId, name: pathData.taskId })
    return segments
  }

  const segments = []
  if (pathData.compId) {
    const compName = storeComp.compById.get(pathData.compId)?.compName || 'component'
    segments.push({
      id: pathData.compId,
      name: `${compName}(${pathData.compId})`,
    })
  }
  if (pathData.versionId) {
    segments.push({ id: pathData.versionId, name: pathData.versionId })
  }
  if (pathData.buildId) {
    segments.push({ id: pathData.buildId, name: pathData.buildId })
  }
  return segments
}

const pathAtSegment = (pathData, index) => {
  if (pathData.kind === PATH_KIND_STATUS) return { kind: PATH_KIND_STATUS }
  if (pathData.kind === PATH_KIND_TASKS) {
    return index === 0
      ? { kind: PATH_KIND_TASKS }
      : { kind: PATH_KIND_TASKS, taskId: pathData.taskId }
  }
  if (index === 0) {
    return { kind: PATH_KIND_COMPONENTS, compId: pathData.compId }
  }
  if (index === 1) {
    return {
      kind: PATH_KIND_COMPONENTS,
      compId: pathData.compId,
      versionId: pathData.versionId,
    }
  }
  return { ...pathData }
}

export default App
