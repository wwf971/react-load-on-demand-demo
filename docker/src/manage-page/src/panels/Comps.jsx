import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import {
  AddIcon,
  CrossIcon,
  DeleteIcon,
  EditableValueComp,
  EyeIcon,
  FolderView,
  ForwardIcon,
  MetadataKeyValues,
  RefreshIcon,
} from '@wwf971/react-comp-misc'
import { storeUi } from '../store.js'
import { storeComp, buildHeadOf, buildKeyOf } from '../storeComp.js'
import { storeTask } from '../storeTask.js'
import ControlIconItem from '../ControlIconItem.jsx'
import HorizontalButtonGroup from '../HorizontalButtonGroup.jsx'
import TitleIconAction from '../TitleIconAction.jsx'

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
const BUILD_COLS_ORDER = ['buildId', 'buildType', 'buildStatus', 'isHead', 'finishedAt']
const BUILD_COLUMNS = {
  buildId: { data: 'buildId', align: 'left' },
  buildType: { data: 'buildType', align: 'left' },
  buildStatus: { data: 'buildStatus', align: 'left' },
  isHead: { data: 'isHead', align: 'left' },
  finishedAt: { data: 'finishedAt', align: 'left' },
}
const BUILD_COL_SIZE_BY_ID = {
  buildId: { width: 110, minWidth: 80, resizable: true },
  buildType: { width: 110, minWidth: 70, resizable: true },
  buildStatus: { width: 70, minWidth: 50, resizable: true },
  isHead: { width: 50, minWidth: 40, resizable: true },
  finishedAt: { width: 180, minWidth: 120, resizable: true },
}

const ServableCell = ({ data }) => (
  <span className={data ? 'status-2' : 'status-3'}>{data ? 'yes' : 'no'}</span>
)

const BuildStatusCell = ({ data }) => (
  <span className={`status-${data}`}>{BUILD_STATUS_TEXT[data] || data}</span>
)

const Comps = observer(({ tabId, pathData }) => {
  useEffect(() => {
    storeComp.fetchComps()
  }, [])

  useEffect(() => {
    if (pathData.compId) storeComp.fetchVersions(pathData.compId)
  }, [pathData.compId])

  useEffect(() => {
    if (pathData.compId && pathData.versionId) {
      storeComp.fetchVersion(pathData.compId, pathData.versionId)
    }
  }, [pathData.compId, pathData.versionId])

  const comp = pathData.compId ? storeComp.compById.get(pathData.compId) : null
  const version = pathData.compId && pathData.versionId
    ? storeComp.versionGet(pathData.compId, pathData.versionId)
    : null
  const build = version && pathData.buildId
    ? version.buildList?.find((item) => item.buildId === pathData.buildId)
    : null

  return (
    <div>
      {!pathData.compId && <CompListPage tabId={tabId} />}
      {pathData.compId && !pathData.versionId && (
        comp
          ? <CompDetail tabId={tabId} comp={comp} />
          : <div className="field-note">loading component...</div>
      )}
      {pathData.versionId && !pathData.buildId && (
        version
          ? <VersionDetail tabId={tabId} compId={pathData.compId} version={version} />
          : <div className="field-note">loading version...</div>
      )}
      {pathData.buildId && (
        build
          ? <BuildDetail compId={pathData.compId} versionId={pathData.versionId} build={build} />
          : <div className="field-note">loading build...</div>
      )}
    </div>
  )
})

const CompListPage = observer(({ tabId }) => {
  const state = storeUi.tabStateGet(tabId)
  const compSelectedId = state?.compRowSelectedId || ''
  const isDeleteConfirm = state?.confirmState?.kind === 'comp-delete'
    && state.confirmState.compId === compSelectedId
    && compSelectedId

  return (
    <>
      <div className="panel-title">
        Components
        <TitleIconAction
          title="refresh"
          isLoading={storeComp.isCompsLoading}
          onClick={() => storeComp.fetchComps()}
          icon={<RefreshIcon width={14} height={14} />}
        />
      </div>
      <div className="table-control-row">
        <HorizontalButtonGroup groupId={`comp-list-${tabId}`}>
          <ControlIconItem
            label="new component"
            onClick={() => storeUi.tabCompCreateOpenSet(tabId, true)}
          >
            <AddIcon width={12} height={12} />
          </ControlIconItem>
          {isDeleteConfirm ? (
            <>
              <ControlIconItem
                label="confirm delete"
                isDanger
                onClick={async () => {
                  const result = await storeComp.compDelete(compSelectedId)
                  if (result?.code === 0) {
                    storeUi.tabConfirmSet(tabId, null)
                    storeUi.tabCompRowSelectedSet(tabId, '')
                  }
                }}
              >
                <DeleteIcon width={12} height={12} />
              </ControlIconItem>
              <ControlIconItem
                label="cancel"
                onClick={() => storeUi.tabConfirmSet(tabId, null)}
              >
                <CrossIcon size={12} />
              </ControlIconItem>
            </>
          ) : (
            <ControlIconItem
              label="delete"
              isDanger
              isDisabled={!compSelectedId}
              onClick={() => {
                if (!compSelectedId) return
                storeUi.tabConfirmSet(tabId, { kind: 'comp-delete', compId: compSelectedId })
              }}
            >
              <DeleteIcon width={12} height={12} />
            </ControlIconItem>
          )}
        </HorizontalButtonGroup>
      </div>
      <CompCreate tabId={tabId} />
      <CompListTable tabId={tabId} />
    </>
  )
})

const CompCreate = observer(({ tabId }) => {
  const state = storeUi.tabStateGet(tabId)
  if (!state?.isCompCreateOpen) return null

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
            isExternalSubmitting: state.isCompCreatePending,
            placeholder: 'compName',
            valueType: 'text',
          }}
          onEvent={async (eventType, eventData) => {
            if (eventType === 'editStateChange') {
              if (eventData.reason === 'cancel' || eventData.reason === 'unchanged') {
                storeUi.tabCompCreateOpenSet(tabId, false)
              }
              return { code: 0 }
            }
            if (eventType !== 'valueCommit') return { code: 0 }
            const compName = eventData.valueNext.trim()
            if (!compName) return { code: -1, message: 'compName is required' }
            storeUi.tabCompCreatePendingSet(tabId, true)
            const result = await storeComp.compCreate(compName)
            storeUi.tabCompCreatePendingSet(tabId, false)
            if (result.code === 0) storeUi.tabCompCreateOpenSet(tabId, false)
            return result
          }}
        />
      </span>
      <ControlIconItem
        label="cancel"
        onClick={() => storeUi.tabCompCreateOpenSet(tabId, false)}
      >
        <CrossIcon size={12} />
      </ControlIconItem>
    </div>
  )
})

const CompListTable = observer(({ tabId }) => {
  const state = storeUi.tabStateGet(tabId)
  const compSelectedId = state?.compRowSelectedId || ''
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
          rowIdsSelected: compSelectedId ? [compSelectedId] : [],
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
            storeUi.tabCompRowSelectedSet(tabId, eventData.rowIdsSelected?.[0] || '')
            return { code: 0 }
          }
          if (eventType === 'rowDoubleClick') {
            const compId = eventData.rowId || ''
            if (compId) storeUi.pathOpen({ kind: 'components', compId }, { tabId })
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

const CompDetail = observer(({ tabId, comp }) => {
  const compId = comp.compId
  const versions = storeComp.versionListByCompId.get(compId) || []
  const state = storeUi.tabStateGet(tabId)
  const versionSelectedId = state?.versionRowSelectedId || ''
  const versionSelected = versions.find((item) => item.versionId === versionSelectedId)

  return (
    <div>
      <div className="panel-title">
        <span className="panel-title-main">
          <EditableValueComp
            data={{ value: comp.compName }}
            config={{ configKey: `comp-name-${compId}`, isEditable: true, valueType: 'text' }}
            onEvent={async (eventType, eventData) => {
              if (eventType !== 'valueCommit') return { code: 0 }
              return storeComp.compUpdate(compId, { compName: eventData.valueNext })
            }}
          />
          <span className="cell-id">{compId}</span>
        </span>
      </div>
      <div className="field-note">
        created {comp.createdAt} / updated {comp.updatedAt}
      </div>

      <CompMetadata tabId={tabId} comp={comp} />

      <hr className="panel-divider" />
      <div className="panel-title-2">
        Versions
        <TitleIconAction
          title="refresh"
          isLoading={storeComp.isVersionsLoadingByCompId.get(compId)}
          onClick={() => storeComp.fetchVersions(compId)}
          icon={<RefreshIcon width={13} height={13} />}
        />
      </div>
      <div className="table-control-row">
        <HorizontalButtonGroup groupId={`version-list-${tabId}`}>
          <ControlIconItem
            label="open"
            isDisabled={!versionSelectedId}
            onClick={() => {
              if (!versionSelectedId) return
              storeUi.pathOpen({ kind: 'components', compId, versionId: versionSelectedId }, { tabId })
            }}
          >
            <ForwardIcon width={12} height={12} />
          </ControlIconItem>
          <ControlIconItem
            label="rebuild"
            isDisabled={!versionSelected?.source?.fileGroupId}
            onClick={async () => {
              if (!versionSelectedId || !versionSelected?.source?.fileGroupId) return
              const taskId = await storeComp.versionBuild(compId, versionSelectedId)
              if (taskId) storeTask.fetchTask(taskId)
            }}
          >
            <RefreshIcon width={12} height={12} />
          </ControlIconItem>
        </HorizontalButtonGroup>
      </div>
      <VersionListTable
        tabId={tabId}
        compId={compId}
        versions={versions}
        versionSelectedId={versionSelectedId}
        isLoading={storeComp.isVersionsLoadingByCompId.get(compId)}
      />
    </div>
  )
})

const CompMetadata = observer(({ tabId, comp }) => {
  const compId = comp.compId
  const metadata = comp.metadata || {}
  const state = storeUi.tabStateGet(tabId)
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
        selectedRowId: state?.metadataSelectedRowId || null,
      }}
      config={{ isEditable: true, keyColWidth: '160px' }}
      onEvent={async (eventType, eventData) => {
        if (eventType === 'selectedRowIdChange') {
          storeUi.tabMetadataRowSet(tabId, eventData?.selectedRowId ?? eventData?.rowId ?? null)
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

const VersionListTable = observer(({ tabId, compId, versions, versionSelectedId, isLoading }) => {
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
          rowIdsSelected: versionSelectedId ? [versionSelectedId] : [],
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
            storeUi.tabVersionRowSelectedSet(tabId, eventData.rowIdsSelected?.[0] || '')
            return { code: 0 }
          }
          if (eventType === 'rowDoubleClick') {
            const versionId = eventData.rowId || ''
            if (versionId) storeUi.pathOpen({ kind: 'components', compId, versionId }, { tabId })
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

const VersionDetail = observer(({ tabId, compId, version }) => {
  const versionId = version.versionId
  const head = buildHeadOf(version)
  const state = storeUi.tabStateGet(tabId)
  const buildSelectedId = state?.buildRowSelectedId || ''
  const buildSelected = (version.buildList || []).find((item) => item.buildId === buildSelectedId)

  return (
    <div>
      <div className="panel-title-2">
        Version <span className="cell-id">{versionId}</span>
      </div>
      <div className="field-note">
        created {version.createdAt}
        {version.source?.fileGroupId ? '' : ' / created from prebuilt upload (no source)'}
      </div>

      <div className="panel-title-2">Version Metadata (frozen)</div>
      <div className="status-json-block">{JSON.stringify(version.metadata, null, 2)}</div>

      <div className="panel-title-2">Exposed Components</div>
      <div className="row-table">
        <div className="row-table-header">
          <div className="cell" style={{ width: 130 }}>exposeName</div>
          <div className="cell" style={{ width: 180 }}>module / export</div>
          <div className="cell" style={{ flex: 1 }}>description</div>
          <div className="cell" style={{ width: 90 }}>packages</div>
        </div>
        {(version.metadata?.exposeList || []).map((expose) => (
          <div className="row-table-row" key={expose.exposeName} style={{ cursor: 'default' }}>
            <div className="cell cell-id" style={{ width: 130 }}>{expose.exposeName}</div>
            <div className="cell cell-id" style={{ width: 180 }}>
              {expose.modulePath} / {expose.entryExport || 'default'}
            </div>
            <div className="cell" style={{ flex: 1 }}>{expose.description || ''}</div>
            <div className="cell" style={{ width: 90 }}>
              {Object.keys(expose.packages || {}).length}
            </div>
          </div>
        ))}
        {(version.metadata?.exposeList || []).length === 0 && (
          <div className="row-table-row field-note">
            legacy single-component metadata; see the raw metadata above
          </div>
        )}
      </div>

      <div className="panel-title-2">Builds</div>
      <div className="table-control-row">
        <HorizontalButtonGroup groupId={`build-list-${tabId}`}>
          <ControlIconItem
            label="open"
            isDisabled={!buildSelectedId}
            onClick={() => {
              if (!buildSelectedId) return
              storeUi.pathOpen(
                { kind: 'components', compId, versionId, buildId: buildSelectedId },
                { tabId },
              )
            }}
          >
            <ForwardIcon width={12} height={12} />
          </ControlIconItem>
          <ControlIconItem
            label="view log"
            isDisabled={!buildSelected?.logObjectId}
            onClick={() => {
              if (!buildSelectedId || !buildSelected?.logObjectId) return
              storeUi.pathOpen(
                { kind: 'components', compId, versionId, buildId: buildSelectedId },
                { tabId },
              )
            }}
          >
            <EyeIcon width={12} height={12} />
          </ControlIconItem>
        </HorizontalButtonGroup>
      </div>
      <BuildListTable
        tabId={tabId}
        compId={compId}
        versionId={versionId}
        builds={(version.buildList || []).slice().reverse()}
        buildSelectedId={buildSelectedId}
        headBuildId={head?.buildId || ''}
      />
    </div>
  )
})

const BuildListTable = observer(({ tabId, compId, versionId, builds, buildSelectedId, headBuildId }) => {
  const rows = builds.map((build) => ({
    id: build.buildId,
    data: {
      buildId: build.buildId,
      buildType: build.buildType,
      buildStatus: build.buildStatus,
      isHead: headBuildId === build.buildId ? 'HEAD' : '',
      finishedAt: build.finishedAt || '',
    },
  }))

  return (
    <div className="comp-folder-wrap">
      <FolderView
        data={{
          columns: BUILD_COLUMNS,
          colsOrder: BUILD_COLS_ORDER,
          rows,
          rowIdsSelected: buildSelectedId ? [buildSelectedId] : [],
          statusBar: { itemCount: rows.length, messageState: null },
        }}
        config={{
          colSizeById: BUILD_COL_SIZE_BY_ID,
          bodyHeight: 180,
          isListOnly: true,
          isStatusBarVisible: true,
          selectionMode: 'single',
          isLastColFilled: true,
          compBodyByColId: (colId) => (colId === 'buildStatus' ? BuildStatusCell : undefined),
        }}
        onEvent={(eventType, eventData) => {
          if (eventType === 'rowIdsSelectedChange') {
            storeUi.tabBuildRowSelectedSet(tabId, eventData.rowIdsSelected?.[0] || '')
            return { code: 0 }
          }
          if (eventType === 'rowDoubleClick') {
            const buildId = eventData.rowId || ''
            if (buildId) {
              storeUi.pathOpen({ kind: 'components', compId, versionId, buildId }, { tabId })
            }
            return { code: 0 }
          }
          return { code: 0 }
        }}
      />
      {rows.length === 0 && (
        <div className="field-note comp-empty-note">no finished builds; an ongoing build shows as an undergoing task</div>
      )}
    </div>
  )
})

const BuildDetail = observer(({ compId, versionId, build }) => {
  useEffect(() => {
    if (build.logObjectId) storeComp.fetchBuildLog(compId, versionId, build.buildId)
    if (build.output?.fileGroupId) storeComp.fetchBuildFiles(compId, versionId, build.buildId)
  }, [compId, versionId, build.buildId, build.logObjectId, build.output?.fileGroupId])

  return (
    <div>
      <div className="panel-title">
        Build <span className="cell-id">{build.buildId}</span>
        <span className={`status-${build.buildStatus}`}>
          {BUILD_STATUS_TEXT[build.buildStatus] || build.buildStatus}
        </span>
      </div>
      <div className="field-note">
        type {build.buildType} / created {build.createdAt} / finished {build.finishedAt || ''}
      </div>
      <div className="panel-title-2">Build Metadata</div>
      <div className="status-json-block">{JSON.stringify(build, null, 2)}</div>
      {build.logObjectId && (
        <>
          <div className="panel-title-2">Build Log</div>
          <LogBlock compId={compId} versionId={versionId} buildId={build.buildId} />
        </>
      )}
      {build.output?.fileGroupId && (
        <>
          <div className="panel-title-2">Output Files</div>
          <FilesBlock compId={compId} versionId={versionId} buildId={build.buildId} />
        </>
      )}
    </div>
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
