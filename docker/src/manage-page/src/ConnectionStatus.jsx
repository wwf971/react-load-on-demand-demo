import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'

const POLL_MS = 5000
const ignoreError = () => {}

const ConnectionStatus = observer(function ConnectionStatus({ pageStore }) {
  useEffect(() => {
    let isMounted = true

    const runCheck = async (isForce) => {
      if (!isMounted) {
        return
      }
      await pageStore.ensureServerStatus({
        refresh: isForce,
        staleAfterMs: POLL_MS - 500,
      })
    }

    runCheck(true).catch(ignoreError)
    const timer = setInterval(() => {
      runCheck(false).catch(ignoreError)
    }, POLL_MS)

    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [pageStore])

  const status = pageStore.getServerStatusSnapshot()
  const isChecking = status.status === 'checking'
  const isOnline = status.status === 'online'
  const statusText =
    status.status === 'idle'
      ? 'idle'
      : status.status === 'checking'
        ? 'checking'
        : status.status === 'online'
          ? 'online'
          : 'offline'

  const checkedAtText =
    status.checkedAt > 0 ? new Date(status.checkedAt).toLocaleTimeString() : '--:--:--'

  return (
    <div className="connection-status-root">
      <span
        className={`connection-status-dot ${
          isChecking
            ? 'connection-status-dot-checking'
            : isOnline
              ? 'connection-status-dot-online'
              : 'connection-status-dot-offline'
        }`}
      />
      <span className="connection-status-text">server: {statusText}</span>
      <span className="connection-status-message">{status.message || '-'}</span>
      <span className="connection-status-time">checked: {checkedAtText}</span>
      <button
        type="button"
        className="connection-status-refresh-btn"
        disabled={isChecking}
        onClick={() => {
          pageStore.ensureServerStatus({ refresh: true }).catch(ignoreError)
        }}
      >
        refresh
      </button>
    </div>
  )
})

export default ConnectionStatus
