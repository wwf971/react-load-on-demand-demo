import { useEffect, useLayoutEffect, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import { storeButtonGroup } from './storeButtonGroup.js'

const HorizontalButtonGroup = observer(({ groupId, children }) => {
  const viewportRef = useRef(null)
  const trackRef = useRef(null)
  const translateX = storeButtonGroup.translateXGet(groupId)

  useLayoutEffect(() => {
    const viewportEl = viewportRef.current
    const trackEl = trackRef.current
    if (!viewportEl || !trackEl) return undefined

    const sizeUpdate = () => {
      storeButtonGroup.sizeUpdate(groupId, viewportEl.clientWidth, trackEl.scrollWidth)
    }

    const observer = new ResizeObserver(sizeUpdate)
    observer.observe(viewportEl)
    observer.observe(trackEl)
    sizeUpdate()
    return () => observer.disconnect()
  }, [groupId, children])

  useEffect(() => {
    const viewportEl = viewportRef.current
    if (!viewportEl) return undefined

    const handleWheel = (event) => {
      const offsetMax = storeButtonGroup.offsetMaxByGroupId.get(groupId) || 0
      if (offsetMax <= 0) return
      event.preventDefault()
      storeButtonGroup.scroll(groupId, event.deltaX + event.deltaY)
    }

    viewportEl.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewportEl.removeEventListener('wheel', handleWheel)
  }, [groupId])

  return (
    <div className="horizontal-button-group-viewport" ref={viewportRef}>
      <div
        className="horizontal-button-group-track"
        ref={trackRef}
        style={{ transform: `translateX(${translateX}px)` }}
      >
        {children}
      </div>
    </div>
  )
})

export default HorizontalButtonGroup
