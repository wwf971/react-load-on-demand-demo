const ControlIconItem = ({
  label = '',
  title = '',
  isDisabled = false,
  isDanger = false,
  isIconOnly = false,
  onClick,
  children,
}) => {
  const hasLabel = Boolean(label)
  const className = [
    'control-icon-item',
    hasLabel ? 'has-label' : '',
    isIconOnly ? 'is-icon-only' : '',
    isDisabled ? 'is-disabled' : '',
    isDanger ? 'is-danger' : '',
  ].filter(Boolean).join(' ')

  const handleActivate = (event) => {
    if (isDisabled) return
    onClick?.(event)
  }

  return (
    <div
      className={className}
      title={title || label}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (isDisabled) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick?.(event)
        }
      }}
    >
      <span className="control-icon-item-graphic">{children}</span>
      {hasLabel ? <span className="control-icon-item-label">{label}</span> : null}
    </div>
  )
}

export default ControlIconItem
