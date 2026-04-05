import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import TabsOnTop from '@wwf971/react-comp-misc/TabsOnTop'
import '@wwf971/react-comp-misc/TabsOnTop.css'
import CrossIcon from '@wwf971/react-comp-misc/CrossIcon'
import TabPanel from './TabPanel.jsx'
import { titleFromPath } from './storeTabs.js'
import { TAB_ACTION } from './tabActionKinds.js'

function tabsOnTopKeyToIndex(key) {
  const m = /^tab-(\d+)$/.exec(key)
  return m ? Number(m[1]) - 1 : -1
}

const TabsChromeContext = createContext(null)

const ManageTabLabel = observer(function ManageTabLabel(props) {
  const ctx = useContext(TabsChromeContext)
  const { label, isActive, onClick, onClose, isDragging, draggable, onDragStart, onDrag, onDragEnd } =
    props
  const tab = ctx?.tabsStore?.getTab(label)
  const displayTitle = tab?.title ?? label

  return (
    <button
      type="button"
      className={`manage-tab-label-btn ${isActive ? 'manage-tab-label-btn-active' : ''} ${isDragging ? 'manage-tab-label-btn-dragging' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
    >
      <span className="manage-tab-label-title">{displayTitle}</span>
      {onClose ? (
        <span role="presentation" className="manage-tab-label-close" onClick={onClose}>
          <CrossIcon size={12} />
        </span>
      ) : null}
    </button>
  )
})

const TabsContainer = observer(function TabsContainer({ tabsStore, pageStore, onTabActionNotify }) {
  const tabsOnTopRef = useRef(null)
  const idsSignature = tabsStore.tabIds.join('\n')

  const handleTabAction = useCallback(
    (action) => {
      if (typeof onTabActionNotify === 'function') {
        onTabActionNotify(action)
      }
      switch (action.type) {
        case TAB_ACTION.OPEN_TASK_IN_NEW_TAB: {
          const { sourceTabId, taskId } = action
          if (!sourceTabId || !taskId || !/^[0-9a-z]+$/.test(String(taskId))) {
            break
          }
          const path = `task/${taskId}`
          tabsStore.addTabAfter(sourceTabId, {
            path,
            title: titleFromPath(path),
            activate: true,
          })
          break
        }
        case TAB_ACTION.CLOSE_TAB: {
          if (tabsStore.tabs.length <= 1) {
            break
          }
          tabsStore.removeTab(action.tabId)
          break
        }
        case TAB_ACTION.CLONE_TAB: {
          tabsStore.cloneTab(action.tabId)
          break
        }
        case TAB_ACTION.CREATE_TAB_NEXT: {
          const rel = action.relativeToTabId ?? tabsStore.activeTabId
          const path = action.path ?? 'tasks'
          const nextTitle = action.title ?? titleFromPath(path)
          if (rel) {
            tabsStore.addTabAfter(rel, {
              path,
              title: nextTitle,
              activate: action.activate !== false,
            })
          } else {
            tabsStore.addTab({
              path,
              title: nextTitle,
              activate: action.activate !== false,
            })
          }
          break
        }
        default:
          break
      }
    },
    [tabsStore, onTabActionNotify],
  )

  const chromeContextValue = useMemo(
    () => ({
      tabsStore,
    }),
    [tabsStore],
  )

  useEffect(() => {
    const id = tabsStore.activeTabId
    if (!id || !tabsOnTopRef.current?.switchTab) {
      return
    }
    tabsOnTopRef.current.switchTab(id)
  }, [tabsStore.activeTabId, idsSignature])

  if (tabsStore.tabs.length === 0) {
    return null
  }

  const defaultLabel = tabsStore.tabs[0].id

  return (
    <div className="all-tabs-root">
      <TabsChromeContext.Provider value={chromeContextValue}>
        <TabsOnTop
          ref={tabsOnTopRef}
          defaultTab={defaultLabel}
          allowCloseTab={tabsStore.tabs.length > 1}
          allowTabReorder
          onTabReorder={(newTabsConfig) => {
            const orderedIds = newTabsConfig.map((t) => t.label).filter(Boolean)
            tabsStore.reorderTabs(orderedIds)
          }}
          allowTabCreate
          onTabCreate={() => {
            handleTabAction({
              type: TAB_ACTION.CREATE_TAB_NEXT,
              relativeToTabId: tabsStore.activeTabId,
              path: 'tasks',
              title: titleFromPath('tasks'),
            })
          }}
          onTabChange={(internalKey) => {
            const idx = tabsOnTopKeyToIndex(internalKey)
            const row = tabsStore.tabs[idx]
            if (row) {
              tabsStore.setActiveTab(row.id)
            }
          }}
          onTabClose={(internalKey) => {
            const idx = tabsOnTopKeyToIndex(internalKey)
            const row = tabsStore.tabs[idx]
            if (!row) {
              return
            }
            if (typeof onTabActionNotify === 'function') {
              onTabActionNotify({ type: TAB_ACTION.CLOSE_TAB, tabId: row.id })
            }
            if (tabsStore.tabs.length <= 1) {
              return
            }
            tabsStore.removeTab(row.id)
          }}
        >
          {tabsStore.tabs.map((tab) => (
            <React.Fragment key={tab.id}>
              <TabsOnTop.TabLabel>
                <ManageTabLabel />
              </TabsOnTop.TabLabel>
              <TabsOnTop.Tab label={tab.id} keepMounted>
                <TabPanel
                  tabId={tab.id}
                  tabsStore={tabsStore}
                  pageStore={pageStore}
                  onTabAction={handleTabAction}
                />
              </TabsOnTop.Tab>
            </React.Fragment>
          ))}
        </TabsOnTop>
      </TabsChromeContext.Provider>
    </div>
  )
})

export default TabsContainer
