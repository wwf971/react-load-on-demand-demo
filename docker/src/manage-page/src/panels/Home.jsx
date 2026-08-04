import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { RefreshIcon } from '@wwf971/react-comp-misc'
import { storeService } from '../storeService.js'
import TitleIconAction from '../TitleIconAction.jsx'

const Home = observer(() => {
  useEffect(() => {
    storeService.fetchStatus()
  }, [])

  const status = storeService.statusData
  const isInitialLoading = storeService.isLoading && !storeService.hasLoaded

  return (
    <div>
      <div className="panel-title">
        Service Status
        <TitleIconAction
          title="refresh"
          isLoading={storeService.isLoading}
          onClick={() => storeService.fetchStatus()}
          icon={<RefreshIcon width={14} height={14} />}
        />
      </div>

      {isInitialLoading && <div className="field-note">loading...</div>}

      {!isInitialLoading && storeService.loadError && !status && (
        <div className="field-note status-3">{storeService.loadError}</div>
      )}

      {status && (
        <>
          <div className="row-table">
            <StatusRow
              label="ready"
              value={
                status.isReady ? (
                  <span className="status-2">yes</span>
                ) : (
                  <span className="status-3">no{status.initError ? `: ${status.initError}` : ''}</span>
                )
              }
            />
            <StatusRow label="service" value={status.serviceMetadata?.serviceName || ''} />
            <StatusRow label="components" value={String(status.compCount)} />
            <StatusRow label="versions" value={String(status.versionCount)} />
            <StatusRow
              label="tasks"
              value={`${status.taskCount} total, ${status.taskCountUndergoing} undergoing`}
            />
            <StatusRow
              label="storage-obj"
              value={`${status.storage?.urlBase} (prefix ${status.storage?.spacePrefix})`}
            />
            <StatusRow
              label="storage reachable"
              value={
                status.storage?.isReachable ? (
                  <span className="status-2">yes</span>
                ) : (
                  <span className="status-3">no</span>
                )
              }
            />
            <StatusRow label="server time" value={status.timeNow} />
          </div>

          <div className="panel-title-2">Raw</div>
          <div className="status-json-block">{JSON.stringify(status, null, 2)}</div>
        </>
      )}
    </div>
  )
})

const StatusRow = ({ label, value }) => (
  <div className="row-table-row" style={{ cursor: 'default' }}>
    <div className="cell" style={{ width: 150, fontWeight: 600 }}>{label}</div>
    <div className="cell" style={{ flex: 1 }}>{value}</div>
  </div>
)

export default Home
