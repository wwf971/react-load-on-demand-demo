import { makeAutoObservable, observable } from 'mobx'

class StoreButtonGroup {
  offsetXByGroupId = observable.map()
  offsetMaxByGroupId = observable.map()

  constructor() {
    makeAutoObservable(this)
  }

  sizeUpdate(groupId, widthViewport, widthContent) {
    const offsetMax = Math.max(0, widthContent - widthViewport)
    this.offsetMaxByGroupId.set(groupId, offsetMax)
    const offsetCurrent = this.offsetXByGroupId.get(groupId) || 0
    this.offsetXByGroupId.set(groupId, Math.min(offsetCurrent, offsetMax))
  }

  scroll(groupId, deltaX) {
    const offsetMax = this.offsetMaxByGroupId.get(groupId) || 0
    if (offsetMax <= 0) return
    const offsetCurrent = this.offsetXByGroupId.get(groupId) || 0
    this.offsetXByGroupId.set(
      groupId,
      Math.max(0, Math.min(offsetMax, offsetCurrent + deltaX)),
    )
  }

  translateXGet(groupId) {
    return -(this.offsetXByGroupId.get(groupId) || 0)
  }
}

export const storeButtonGroup = new StoreButtonGroup()
