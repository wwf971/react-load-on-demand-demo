import React, { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import PathBar, { defaultParsePathStrToPathData } from '@wwf971/react-comp-misc/PathBar'
import '@wwf971/react-comp-misc/PathBar.css'

function ResolvedPanel({ Comp, panelKey, compProps }) {
  return React.createElement(Comp, { key: panelKey, ...compProps })
}

const TabPanel = observer(function TabPanel(props) {
  const { tabId, tabsStore, pageStore, onTabAction } = props
  const tab = tabsStore.getTab(tabId)
  const [resolved, setResolved] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    const tabRow = tabsStore.getTab(tabId)
    if (!tabRow) {
      setResolved(null)
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setLoadError(null)
    tabsStore
      .getCompAndDataOfTab(tabId, pageStore, { onTabAction })
      .then((r) => {
        if (!cancelled) {
          setResolved(r)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'load failed')
          setIsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [tabId, tab?.path, pageStore, tabsStore, onTabAction])

  if (!tab) {
    return null
  }

  const pathData =
    defaultParsePathStrToPathData(tab.path) ?? { segments: [{ name: tab.path }] }

  return (
    <div className="tab-panel-root" data-tab-id={tabId}>
      <div className="tab-panel-pathbar-wrap">
        <PathBar
          pathData={pathData}
          addSlashBeforeFirstSeg={false}
          appendTrailingSlash={false}
          allowEditText={false}
          height={28}
        />
      </div>
      <div className="tab-panel-title-line">{tab.title}</div>
      <div className="tab-panel-body">
        {isLoading ? (
          <div className="tab-panel-loading">loading</div>
        ) : loadError ? (
          <div className="tab-panel-error">{loadError}</div>
        ) : resolved?.Comp ? (
          <ResolvedPanel Comp={resolved.Comp} panelKey={tab.path} compProps={resolved.compProps} />
        ) : null}
      </div>
    </div>
  )
})

export default TabPanel
