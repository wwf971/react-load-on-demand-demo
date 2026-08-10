import { Component, useEffect, version as reactVersionHost } from 'react'
import { observer } from 'mobx-react-lite'
import { toJS } from 'mobx'
import {
  AddIcon,
  CrossIcon,
  PropEditor,
  RefreshIcon,
} from '@wwf971/react-comp-misc'
import { storeComp, buildHeadOf } from '../storeComp.js'
import { storePlayground, instanceCompRefGet } from '../storePlayground.js'
import ControlIconItem from '../ControlIconItem.jsx'
import HorizontalButtonGroup from '../HorizontalButtonGroup.jsx'
import TitleIconAction from '../TitleIconAction.jsx'

// components render inside this page, so their element format must match this
// page's react; a different declared major is marked as a mismatch
const reactReqMajorMismatch = (versionRequired) => {
  if (!versionRequired) return false
  const majorRequired = String(versionRequired).match(/\d+/)?.[0]
  const majorHost = String(reactVersionHost).match(/\d+/)?.[0]
  return Boolean(majorRequired && majorHost && majorRequired !== majorHost)
}

const ReactReqBadge = ({ versionRequired }) => {
  if (!versionRequired) return null
  const isMismatch = reactReqMajorMismatch(versionRequired)
  return (
    <span
      className={`react-req-badge ${isMismatch ? 'is-mismatch' : ''}`.trim()}
      title={isMismatch
        ? `declared react ${versionRequired}; this page runs react ${reactVersionHost}, rendering here will likely fail`
        : `declared react requirement; this page runs react ${reactVersionHost}`}
    >
      react {versionRequired}
    </span>
  )
}

const Playground = observer(({ tabId }) => {
  useEffect(() => {
    storeComp.fetchComps()
    storePlayground.tabStateEnsure(tabId)
  }, [tabId])

  const state = storePlayground.stateByTabId.get(tabId)
  if (!state) return null

  return (
    <div>
      <div className="panel-title">
        Playground
        <TitleIconAction
          title="refresh components"
          isLoading={storeComp.isCompsLoading}
          onClick={() => storeComp.fetchComps()}
          icon={<RefreshIcon width={14} height={14} />}
        />
      </div>
      <div className="field-note">
        pick a registered component, place it below, then edit its props live
        (this page renders with react {reactVersionHost})
      </div>

      <PlaygroundPicker tabId={tabId} state={state} />

      <hr className="panel-divider" />
      <PlaygroundArea tabId={tabId} state={state} />
    </div>
  )
})

const PlaygroundPicker = observer(({ tabId, state }) => {
  const versions = state.compSelectedId
    ? storeComp.versionListByCompId.get(state.compSelectedId) || []
    : []
  const versionSelected = versions.find((record) => record.versionId === state.versionSelectedId)
  const exposeList = versionSelected?.metadata?.exposeList || []
  const isVersionServable = Boolean(versionSelected && buildHeadOf(versionSelected))

  return (
    <>
      <div className="playground-picker">
        <div className="playground-picker-col">
          <div className="panel-title-2">Component</div>
          <div className="row-table">
            {storeComp.compIds.map((compId) => {
              const record = storeComp.compById.get(compId)
              return (
                <div
                  key={compId}
                  className={`row-table-row ${state.compSelectedId === compId ? 'is-selected' : ''}`}
                  onClick={() => storePlayground.compSelect(tabId, compId)}
                >
                  <div className="cell" style={{ flex: 1 }}>{record?.compName || compId}</div>
                  <div className="cell cell-id" style={{ width: 60, textAlign: 'right' }}>
                    {record?.versionList?.length || 0} ver
                  </div>
                </div>
              )
            })}
            {storeComp.compIds.length === 0 && (
              <div className="row-table-row field-note" style={{ cursor: 'default' }}>
                {storeComp.isCompsLoading ? 'loading components...' : 'no components registered'}
              </div>
            )}
          </div>
        </div>

        <div className="playground-picker-col">
          <div className="panel-title-2">Version</div>
          <div className="row-table">
            {versions.map((record) => {
              const isServable = Boolean(buildHeadOf(record))
              return (
                <div
                  key={record.versionId}
                  className={`row-table-row ${state.versionSelectedId === record.versionId ? 'is-selected' : ''}`}
                  onClick={() => storePlayground.versionSelect(tabId, record.versionId)}
                >
                  <div className="cell cell-id" style={{ flex: 1 }}>{record.versionId}</div>
                  <div className="cell" style={{ width: 70 }}>{record.metadata?.versionName || ''}</div>
                  <div className="cell" style={{ width: 60 }}>
                    <span className={isServable ? 'status-2' : 'status-3'}>
                      {isServable ? 'servable' : 'no build'}
                    </span>
                  </div>
                </div>
              )
            })}
            {versions.length === 0 && (
              <div className="row-table-row field-note" style={{ cursor: 'default' }}>
                {state.compSelectedId
                  ? (storeComp.isVersionsLoadingByCompId.get(state.compSelectedId) ? 'loading versions...' : 'no versions')
                  : 'select a component first'}
              </div>
            )}
          </div>
        </div>

        <div className="playground-picker-col">
          <div className="panel-title-2">Exposed Component</div>
          <div className="row-table">
            {exposeList.map((expose) => (
              <div
                key={expose.exposeName}
                className={`row-table-row ${state.exposeSelectedName === expose.exposeName ? 'is-selected' : ''}`}
                onClick={() => storePlayground.exposeSelect(tabId, expose.exposeName)}
              >
                <div className="cell cell-id" style={{ width: 110 }}>{expose.exposeName}</div>
                <div className="cell" style={{ flex: 1 }}>{expose.description || ''}</div>
                <div className="cell" style={{ width: 110 }}>
                  <ReactReqBadge versionRequired={expose.packages?.react?.versionRequired} />
                </div>
              </div>
            ))}
            {exposeList.length === 0 && (
              <div className="row-table-row field-note" style={{ cursor: 'default' }}>
                {versionSelected ? 'this version declares no exposeList' : 'select a version first'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="table-control-row">
        <HorizontalButtonGroup groupId={`playground-add-${tabId}`}>
          <ControlIconItem
            label={state.isAddPending ? 'adding...' : 'add to playground'}
            isDisabled={!state.compSelectedId || !isVersionServable || state.isAddPending}
            onClick={() => storePlayground.instanceAdd(tabId)}
          >
            <AddIcon width={12} height={12} />
          </ControlIconItem>
        </HorizontalButtonGroup>
        {versionSelected && !isVersionServable && (
          <span className="field-note playground-add-note">
            selected version has no successful build, so it cannot be served
          </span>
        )}
      </div>
    </>
  )
})

const PlaygroundArea = observer(({ tabId, state }) => {
  return (
    <div>
      <div className="panel-title-2">Playground Area</div>
      {state.instanceIds.length === 0 && (
        <div className="field-note">no components placed yet</div>
      )}
      {state.instanceIds.map((instanceId) => (
        <PlaygroundInstance key={instanceId} tabId={tabId} instanceId={instanceId} />
      ))}
    </div>
  )
})

const PlaygroundInstance = observer(({ tabId, instanceId }) => {
  const instance = storePlayground.instanceById.get(instanceId)
  if (!instance) return null

  return (
    <div className="playground-instance">
      <div className="panel-title-2">
        <span className="panel-title-2-main">
          {instance.exposeName}
          <span className="cell-id">
            {instance.compName} / {instance.versionId}
          </span>
          <ReactReqBadge versionRequired={instance.resolveInfo?.packages?.react?.versionRequired} />
        </span>
        <TitleIconAction
          title="reload remote component"
          isLoading={instance.loadStatus === 'loading'}
          onClick={() => storePlayground.instanceLoad(instanceId)}
          icon={<RefreshIcon width={13} height={13} />}
        />
        <TitleIconAction
          title="remove from playground"
          onClick={() => storePlayground.instanceRemove(tabId, instanceId)}
          icon={<CrossIcon size={13} />}
        />
      </div>

      <div className="playground-instance-body">
        <div className="playground-instance-props">
          <InstanceProps instance={instance} />
        </div>
        <div className="playground-instance-render">
          <InstanceRender instance={instance} />
        </div>
      </div>
    </div>
  )
})

const InstanceProps = observer(({ instance }) => {
  if (instance.propList.length === 0) {
    return <div className="field-note">this exposed component declares no props</div>
  }
  return (
    <>
      <PropEditor
        data={{
          panelList: instance.propList.map((entry) => ({ id: entry.name, type: 'property' })),
          propertyById: instance.propertyById,
        }}
        config={{
          width: '100%',
          isLevelLeftShown: false,
          isLevelTopShown: false,
          keyColWidth: 'min',
        }}
        onEvent={(eventType, eventData) => {
          if (eventType === 'propertyChangeAttempt') {
            return storePlayground.propChangeAttempt(
              instance.instanceId,
              eventData.propertyId,
              eventData.valueNext,
            )
          }
          return { code: 0 }
        }}
      />
      {instance.propList.some((entry) => entry.isJson) && (
        <div className="field-note">props declared as object/array are edited as JSON text</div>
      )}
    </>
  )
})

const InstanceRender = observer(({ instance }) => {
  if (instance.loadStatus === 'loading') {
    return <div className="field-note">loading remote component...</div>
  }

  if (instance.loadStatus === 'error') {
    return (
      <div>
        <div className="field-note playground-error-note">failed to load remote component</div>
        <div className="mono-block">{instance.loadErrorText}</div>
      </div>
    )
  }

  const Comp = instanceCompRefGet(instance.instanceId)
  if (!Comp) {
    return <div className="field-note">remote component is not available</div>
  }

  if (instance.renderErrorText) {
    return (
      <div>
        <div className="field-note playground-error-note">
          remote component threw during render
          <TitleIconAction
            title="retry render"
            onClick={() => storePlayground.renderRetry(instance.instanceId)}
            icon={<RefreshIcon width={13} height={13} />}
          />
        </div>
        <div className="mono-block">{instance.renderErrorText}</div>
      </div>
    )
  }

  // toJS hands plain values to the remote component, which is not mobx-aware
  const propValues = toJS(instance.propValueByName)
  return (
    <RenderErrorBoundary
      key={`${instance.instanceId}-${instance.renderEpoch}`}
      onError={(error, errorInfo) => storePlayground.renderErrorSet(instance.instanceId, error, errorInfo)}
    >
      <Comp {...propValues} />
    </RenderErrorBoundary>
  )
})

// catches exceptions thrown while rendering the remote component; the error
// text itself is owned by storePlayground and rendered by InstanceRender
class RenderErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

export default Playground
