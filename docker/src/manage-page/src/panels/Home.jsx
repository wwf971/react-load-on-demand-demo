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
  const storage = status?.storage
  const inspection = storage?.inspection

  return (
    <div>
      <div className="panel-title">
        Config
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
          <div className="panel-title-2">Service</div>
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
            <StatusRow label="server time" value={status.timeNow} />
          </div>

          <div className="panel-title-2">Backend service: storage-obj</div>
          <div className="row-table">
            <StatusRow
              label="url"
              value={storage?.urlBase || ''}
            />
            <StatusRow
              label="storage endpoint"
              value={storage?.storageEndpointKey || 'runtime default'}
            />
            <StatusRow
              label="connected"
              value={
                storage?.isReachable ? (
                  <span className="status-2">yes</span>
                ) : (
                  <span className="status-3">
                    no{storage?.inspectionError ? `: ${storage.inspectionError}` : ''}
                  </span>
                )
              }
            />
            <StatusRow label="required space" value={storage?.spaceName || ''} />
            <StatusRow
              label="space exists"
              value={<BooleanStatus value={inspection?.space?.isFound} />}
            />
            <StatusRow
              label="space unique"
              value={<BooleanStatus value={inspection?.space?.isUnique} />}
            />
            <StatusRow label="space id" value={inspection?.space?.spaceId || ''} />
            <StatusRow
              label="space ownership"
              value={
                <BooleanStatus
                  value={inspection?.space?.isOwned}
                  detail={inspection?.space?.owner || ''}
                />
              }
            />
            <StatusRow
              label="schema version"
              value={inspection?.space?.schemaVersion || ''}
            />
            <StatusRow
              label="structure normal"
              value={<BooleanStatus value={inspection?.isStructureNormal} />}
            />
            <StatusRow
              label="objects"
              value={inspection ? String(inspection.objectCount) : ''}
            />
            <StatusRow
              label="objects by type"
              value={inspection ? JSON.stringify(inspection.objectCountByType) : ''}
            />
          </div>

          {inspection?.issues?.length > 0 && (
            <>
              <div className="panel-title-2">Structure issues</div>
              <div className="config-issue-list">
                {inspection.issues.map((issue) => (
                  <div key={issue} className="status-3">{issue}</div>
                ))}
              </div>
            </>
          )}
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

const BooleanStatus = ({ value, detail = '' }) => (
  <span className={value ? 'status-2' : 'status-3'}>
    {value ? 'yes' : 'no'}{detail ? `: ${detail}` : ''}
  </span>
)

export default Home
