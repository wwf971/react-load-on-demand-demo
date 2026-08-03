import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import {
  EditableValueComp,
  FolderView,
  MetadataKeyValues,
  RefreshIcon,
  SpinningCircle,
  AddIcon,
} from '@wwf971/react-comp-misc'
import { storeUi } from '../store.js'
import { storeComp, buildHeadOf, buildKeyOf } from '../storeComp.js'
import { storeTask } from '../storeTask.js'

const BUILD_STATUS_TEXT = { 2: 'success', 3: 'fail', 4: 'cancel' }
const COMP_COLS_ORDER = ['compName', 'description', 'tags', 'versionCount']
const COMP_COLUMNS = {
  compName: { data: 'compName', align: 'left' },
  description: { data: 'description', align: 'left' },
  tags: { data: 'tags', align: 'left' },
  versionCount: { data: 'versions', align: 'right' },
}
const COMP_COL_SIZE_BY_ID = {
  compName: { width: 160, minWidth: 90, resizable: true },
  description: { width: 240, minWidth: 120, resizable: true },
  tags: { width: 160, minWidth: 80, resizable: true },
  versionCount: { width: 80, minWidth: 60, resizable: true },
}
const VERSION_COLS_ORDER = ['versionId', 'versionName', 'servable', 'buildCount', 'createdAt']
const VERSION_COLUMNS = {
  versionId: { data: 'versionId', align: 'left' },
  versionName: { data: 'versionName', align: 'left' },
  servable: { data: 'servable', align: 'left' },
  buildCount: { data: 'builds', align: 'right' },
  createdAt: { data: 'createdAt', align: 'left' },
}
const VERSION_COL_SIZE_BY_ID = {
  versionId: { width: 120, minWidth: 90, resizable: true },
  versionName: { width: 100, minWidth: 70, resizable: true },
  servable: { width: 80, minWidth: 60, resizable: true },
  buildCount: { width: 70, minWidth: 50, resizable: true },
  createdAt: { width: 180, minWidth: 120, resizable: true },
}

const ServableCell = ({ data }) => (
  <span className={data ? 'status-2' : 'status-3'}>{data ? 'yes' : 'no'}</span>
)

const Comps = observer(() => {
  useEffect(() => {
    storeComp.fetchComps()
  }, [])

  const compSelected = storeUi.compSelectedId
    ? storeComp.compById.get(storeUi.compSelectedId)
    : null

  return (
    <div>
      <div className="panel-title">
        Components
        <button className="icon-btn" title="refresh" onClick={() => storeComp.fetchComps()}>
          {storeComp.isCompsLoading ? <SpinningCircle width={14} height={14} /> : <RefreshIcon width={14} height={14} />}
        </button>
      </div>

      <CompCreate />
      <CompListTable />

      {compSelected && (
        <>
          <hr className="panel-divider" />
          <CompDetail comp={compSelected} />
        </>
      )}
    </div>
  )
})

const CompCreate = observer(() => {
  if (!storeUi.isCompCreateOpen) {
    return (
      <div className="btn-row">
        <button className="btn" onClick={() => storeUi.setCompCreateOpen(true)}>
          <AddIcon width={11} height={11} /> new component
        </button>
      </div>
    )
  }
  return (
    <div className="comp-create-row">
      <span className="field-note">new component:</span>
      <span className="comp-create-editor">
        <EditableValueComp
          data={{ value: '' }}
          config={{
            configKey: 'comp-create-name',
            isEditable: true,
            isEditing: true,
            isEditIconVisible: false,
            isExternalSubmitting: storeUi.isCompCreatePending,
            placeholder: 'compName',
            valueType: 'text',
          }}
          onEvent={async (eventType, eventData) => {
            if (eventType === 'editStateChange') {
              if (eventData.reason === 'cancel' || eventData.reason === 'unchanged') {
                storeUi.setCompCreateOpen(false)
              }
              return { code: 0 }
            }
            if (eventType !== 'valueCommit') return { code: 0 }
            const compName = eventData.valueNext.trim()
            if (!compName) return { code: -1, message: 'compName is required' }
            storeUi.setCompCreatePending(true)
            const result = await storeComp.compCreate(compName)
            storeUi.setCompCreatePending(false)
            if (result.code === 0) storeUi.setCompCreateOpen(false)
            return result
          }}
        />
      </span>
      <button
        className="btn"
        onClick={() => {
          storeUi.setCompCreateOpen(false)
        }}
      >
        cancel
      </button>
    </div>
  )
})

const CompListTable = observer(() => {
  const rows = storeComp.compIds.map((compId) => {
    const record = storeComp.compById.get(compId)
    return {
      id: compId,
      data: {
        compName: record?.compName || '',
        description: record?.metadata?.description || '',
        tags: (record?.metadata?.tags || []).join(', '),
        versionCount: record?.versionList?.length || 0,
      },
    }
  })

  return (
    <div className="comp-folder-wrap">
      <FolderView
        data={{
          columns: COMP_COLUMNS,
          colsOrder: COMP_COLS_ORDER,
          rows,
          rowIdsSelected: storeUi.compSelectedId ? [storeUi.compSelectedId] : [],
          statusBar: {
            itemCount: rows.length,
            messageState: storeComp.isCompsLoading
              ? { status: 'loading', messageText: 'loading components' }
              : null,
          },
        }}
        config={{
          colSizeById: COMP_COL_SIZE_BY_ID,
          bodyHeight: 220,
          isListOnly: true,
          isLocked: storeComp.isCompsLoading,
          isStatusBarVisible: true,
          selectionMode: 'single',
        }}
        onEvent={(eventType, eventData) => {
          if (eventType === 'rowIdsSelectedChange') {
            const compId = eventData.rowIdsSelected?.[0] || ''
            storeUi.selectComp(compId)
            if (compId) storeComp.fetchVersions(compId)
            return { code: 0 }
          }
          return { code: 0 }
        }}
      />
      {rows.length === 0 && !storeComp.isCompsLoading && (
        <div className="field-note comp-empty-note">no components yet</div>
      )}
    </div>
  )
})

const CompDetail = observer(({ comp }) => {
  const compId = comp.compId
  const versions = storeComp.versionListByCompId.get(compId) || []
  const versionSelected = versions.find((v) => v.versionId === storeUi.versionSelectedId)

  return (
    <div>
      <div className="panel-title">
        <EditableValueComp
          data={{ value: comp.compName }}
          config={{ configKey: `comp-name-${compId}`, isEditable: true, valueType: 'text' }}
          onEvent={async (eventType, eventData) => {
            if (eventType !== 'valueCommit') return { code: 0 }
            return storeComp.compUpdate(compId, { compName: eventData.valueNext })
          }}
        />
        <span className="cell-id">{compId}</span>
      </div>
      <div className="field-note">
        created {comp.createdAt} / updated {comp.updatedAt}
      </div>
      <div className="btn-row">
        {storeUi.confirmState?.kind === 'comp-delete' && storeUi.confirmState.compId === compId ? (
          <span className="inline-confirm">
            delete this component?
            <button className="btn danger" onClick={() => storeComp.compDelete(compId)}>
              confirm
            </button>
            <button className="btn" onClick={() => storeUi.setConfirm(null)}>
              cancel
            </button>
          </span>
        ) : (
          <button
            className="btn danger"
            onClick={() => storeUi.setConfirm({ kind: 'comp-delete', compId })}
          >
            delete component
          </button>
        )}
      </div>

      <CompMetadata comp={comp} />

      <hr className="panel-divider" />
      <div className="panel-title-2">
        Versions
        <button className="icon-btn" title="refresh" onClick={() => storeComp.fetchVersions(compId)}>
          {storeComp.isVersionsLoadingByCompId.get(compId) ? (
            <SpinningCircle width={13} height={13} />
          ) : (
            <RefreshIcon width={13} height={13} />
          )}
        </button>
      </div>
      <VersionListTable
        versions={versions}
        isLoading={storeComp.isVersionsLoadingByCompId.get(compId)}
      />

      {versionSelected && (
        <>
          <hr className="panel-divider" />
          <VersionDetail compId={compId} version={versionSelected} />
        </>
      )}
    </div>
  )
})

// comp metadata is editable; values that are not strings are shown/edited as JSON text
const CompMetadata = observer(({ comp }) => {
  const compId = comp.compId
  const metadata = comp.metadata || {}
  const rows = Object.entries(metadata).map(([key, value]) => ({
    id: key,
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }))

  const parseValueText = (valueText) => {
    try {
      return JSON.parse(valueText)
    } catch {
      return valueText
    }
  }

  const metadataSave = async (metadataNext) => {
    return storeComp.compUpdate(compId, { metadata: metadataNext })
  }

  return (
    <MetadataKeyValues
      data={{
        titleText: 'Comp Metadata',
        rows,
        selectedRowId: storeUi.metadataSelectedRowId,
      }}
      config={{ isEditable: true, keyColWidth: '160px' }}
      onEvent={async (eventType, eventData) => {
        if (eventType === 'selectedRowIdChange') {
          storeUi.setMetadataSelectedRowId(eventData?.selectedRowId ?? eventData?.rowId ?? null)
          return { code: 0 }
        }
        if (eventType === 'cellUpdate') {
          const metadataNext = {}
          for (const row of rows) {
            const keyNext = row.id === eventData.rowId && eventData.field === 'key' ? eventData.nextValue : row.key
            const valueTextNext =
              row.id === eventData.rowId && eventData.field === 'value' ? eventData.nextValue : row.value
            metadataNext[keyNext] = parseValueText(valueTextNext)
          }
          return metadataSave(metadataNext)
        }
        if (eventType === 'addAtEnd' || eventType === 'addAbove' || eventType === 'addBelow') {
          let keyNew = 'newKey'
          let suffix = 1
          while (keyNew in metadata) {
            keyNew = `newKey${suffix}`
            suffix += 1
          }
          const entries = rows.map((row) => [row.key, parseValueText(row.value)])
          const selectedIndex = rows.findIndex((row) => row.id === eventData?.selectedRowId)
          if (eventType === 'addAtEnd' || selectedIndex < 0) {
            entries.push([keyNew, ''])
          } else {
            entries.splice(eventType === 'addAbove' ? selectedIndex : selectedIndex + 1, 0, [keyNew, ''])
          }
          return metadataSave(Object.fromEntries(entries))
        }
        if (eventType === 'delete') {
          const metadataNext = { ...metadata }
          delete metadataNext[eventData?.selectedRowId]
          return metadataSave(metadataNext)
        }
        if (eventType === 'moveUp' || eventType === 'moveDown') {
          const entries = rows.map((row) => [row.key, parseValueText(row.value)])
          const index = rows.findIndex((row) => row.id === eventData?.selectedRowId)
          const indexOther = eventType === 'moveUp' ? index - 1 : index + 1
          if (index < 0 || indexOther < 0 || indexOther >= entries.length) return { code: 0 }
          ;[entries[index], entries[indexOther]] = [entries[indexOther], entries[index]]
          return metadataSave(Object.fromEntries(entries))
        }
        return { code: 0 }
      }}
    />
  )
})

const VersionListTable = observer(({ versions, isLoading }) => {
  const rows = versions.map((version) => ({
    id: version.versionId,
    data: {
      versionId: version.versionId,
      versionName: version.metadata?.versionName || '',
      servable: Boolean(buildHeadOf(version)),
      buildCount: version.buildList?.length || 0,
      createdAt: version.createdAt || '',
    },
  }))

  return (
    <div className="comp-folder-wrap">
      <FolderView
        data={{
          columns: VERSION_COLUMNS,
          colsOrder: VERSION_COLS_ORDER,
          rows,
          rowIdsSelected: storeUi.versionSelectedId ? [storeUi.versionSelectedId] : [],
          statusBar: {
            itemCount: rows.length,
            messageState: isLoading
              ? { status: 'loading', messageText: 'loading versions' }
              : null,
          },
        }}
        config={{
          colSizeById: VERSION_COL_SIZE_BY_ID,
          bodyHeight: 180,
          isListOnly: true,
          isLocked: Boolean(isLoading),
          isStatusBarVisible: true,
          selectionMode: 'single',
          isLastColFilled: true,
          compBodyByColId: (colId) => (colId === 'servable' ? ServableCell : undefined),
        }}
        onEvent={(eventType, eventData) => {
          if (eventType === 'rowIdsSelectedChange') {
            storeUi.selectVersion(eventData.rowIdsSelected?.[0] || '')
            return { code: 0 }
          }
          return { code: 0 }
        }}
      />
      {rows.length === 0 && !isLoading && (
        <div className="field-note comp-empty-note">no versions yet</div>
      )}
    </div>
  )
})

const VersionDetail = observer(({ compId, version }) => {
  const versionId = version.versionId
  const head = buildHeadOf(version)

  return (
    <div>
      <div className="panel-title-2">
        Version <span className="cell-id">{versionId}</span>
        {version.source?.fileGroupId && (
          <button
            className="icon-btn"
            title="rebuild this version (new build record)"
            onClick={async () => {
              const taskId = await storeComp.versionBuild(compId, versionId)
              if (taskId) storeTask.fetchTask(taskId)
            }}
          >
            <RefreshIcon width={13} height={13} />
          </button>
        )}
      </div>
      <div className="field-note">
        created {version.createdAt}
        {version.source?.fileGroupId ? '' : ' / created from prebuilt upload (no source)'}
      </div>

      <div className="panel-title-2">Version Metadata (frozen)</div>
      <div className="status-json-block">{JSON.stringify(version.metadata, null, 2)}</div>

      <div className="panel-title-2">Builds</div>
      <div className="row-table">
        <div className="row-table-header">
          <div className="cell" style={{ width: 110 }}>buildId</div>
          <div className="cell" style={{ width: 110 }}>type</div>
          <div className="cell" style={{ width: 70 }}>status</div>
          <div className="cell" style={{ width: 50 }}>HEAD</div>
          <div className="cell" style={{ flex: 1 }}>finishedAt</div>
          <div className="cell" style={{ width: 110 }}>actions</div>
        </div>
        {(version.buildList || []).slice().reverse().map((build) => (
          <BuildRow key={build.buildId} compId={compId} versionId={versionId} build={build} isHead={head?.buildId === build.buildId} />
        ))}
        {(version.buildList || []).length === 0 && (
          <div className="row-table-row field-note">no finished builds; an ongoing build shows as an undergoing task</div>
        )}
      </div>

      <BuildExtra compId={compId} versionId={versionId} />
    </div>
  )
})

const BuildRow = observer(({ compId, versionId, build, isHead }) => {
  const key = `${versionId}/${build.buildId}`
  return (
    <div className="row-table-row" style={{ cursor: 'default' }}>
      <div className="cell cell-id" style={{ width: 110 }}>{build.buildId}</div>
      <div className="cell" style={{ width: 110 }}>{build.buildType}</div>
      <div className={`cell status-${build.buildStatus}`} style={{ width: 70 }}>
        {BUILD_STATUS_TEXT[build.buildStatus] || build.buildStatus}
      </div>
      <div className="cell" style={{ width: 50 }}>{isHead ? 'HEAD' : ''}</div>
      <div className="cell" style={{ flex: 1 }}>{build.finishedAt || ''}</div>
      <div className="cell" style={{ width: 110 }}>
        {build.logObjectId && (
          <button
            className="btn"
            onClick={() => {
              storeUi.toggleBuildLog(key)
              if (storeUi.buildLogOpenKey === key) {
                storeComp.fetchBuildLog(compId, versionId, build.buildId)
              }
            }}
          >
            log
          </button>
        )}{' '}
        {build.output?.fileGroupId && (
          <button
            className="btn"
            onClick={() => {
              storeUi.toggleBuildFiles(key)
              if (storeUi.buildFilesOpenKey === key) {
                storeComp.fetchBuildFiles(compId, versionId, build.buildId)
              }
            }}
          >
            files
          </button>
        )}
      </div>
    </div>
  )
})

// the opened log / file list below the build table
const BuildExtra = observer(({ compId, versionId }) => {
  const logKey = storeUi.buildLogOpenKey
  const filesKey = storeUi.buildFilesOpenKey

  const buildIdOfKey = (key) => key.split('/')[1]

  return (
    <>
      {logKey.startsWith(`${versionId}/`) && (
        <>
          <div className="panel-title-2">Build Log <span className="cell-id">{buildIdOfKey(logKey)}</span></div>
          <LogBlock compId={compId} versionId={versionId} buildId={buildIdOfKey(logKey)} />
        </>
      )}
      {filesKey.startsWith(`${versionId}/`) && (
        <>
          <div className="panel-title-2">Output Files <span className="cell-id">{buildIdOfKey(filesKey)}</span></div>
          <FilesBlock compId={compId} versionId={versionId} buildId={buildIdOfKey(filesKey)} />
        </>
      )}
    </>
  )
})

const LogBlock = observer(({ compId, versionId, buildId }) => {
  const state = storeComp.buildLogByKey.get(buildKeyOf(compId, versionId, buildId))
  if (!state || state.isLoading) return <div className="field-note">loading log...</div>
  return <div className="mono-block">{state.logText || '(empty log)'}</div>
})

const OUTPUT_FILE_COLS_ORDER = ['path', 'sizeBytes', 'link']
const OUTPUT_FILE_COLUMNS = {
  path: { data: 'path', align: 'left' },
  sizeBytes: { data: 'sizeBytes', align: 'right' },
  link: { data: 'link', align: 'left' },
}
const OUTPUT_FILE_COL_SIZE_BY_ID = {
  path: { width: 320, minWidth: 160, resizable: true },
  sizeBytes: { width: 100, minWidth: 70, resizable: true },
  link: { width: 70, minWidth: 50, resizable: true },
}

const OutputFileLinkCell = ({ data }) => {
  if (!data?.url) return null
  return (
    <a href={data.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      open
    </a>
  )
}

const FilesBlock = observer(({ compId, versionId, buildId }) => {
  const state = storeComp.buildFilesByKey.get(buildKeyOf(compId, versionId, buildId))
  const isLoading = !state || state.isLoading
  const files = state?.files || []
  const rows = files.map((file) => ({
    id: file.path,
    data: {
      path: file.path,
      sizeBytes: file.sizeBytes,
      link: { url: file.url },
    },
  }))

  if (isLoading) return <div className="field-note">loading files...</div>

  return (
    <div className="comp-folder-wrap">
      <FolderView
        data={{
          columns: OUTPUT_FILE_COLUMNS,
          colsOrder: OUTPUT_FILE_COLS_ORDER,
          rows,
          rowIdsSelected: [],
          statusBar: { itemCount: rows.length, messageState: null },
        }}
        config={{
          colSizeById: OUTPUT_FILE_COL_SIZE_BY_ID,
          bodyHeight: 180,
          isListOnly: true,
          selectionMode: 'none',
          isLastColFilled: true,
          isStatusBarVisible: true,
          compBodyByColId: (colId) => (colId === 'link' ? OutputFileLinkCell : undefined),
        }}
        onEvent={() => ({ code: 0 })}
      />
      {rows.length === 0 && (
        <div className="field-note comp-empty-note">no output files</div>
      )}
    </div>
  )
})

export default Comps
