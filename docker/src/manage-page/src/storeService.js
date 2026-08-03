import { makeAutoObservable, runInAction } from 'mobx'
import { apiGet } from './api.js'
import { storeUi } from './store.js'

class StoreService {
  statusData = null
  loadError = ''
  isLoading = false
  hasLoaded = false

  constructor() {
    makeAutoObservable(this)
  }

  async fetchStatus() {
    this.isLoading = true
    const result = await apiGet('/api/service/status')
    runInAction(() => {
      this.isLoading = false
      this.hasLoaded = true
      if (result.code === 0) {
        this.statusData = result.data
        this.loadError = ''
        if (result.data?.isReady === false) {
          storeUi.setMessage(
            'error',
            `service not ready: waiting for storage-obj at ${result.data.storage?.urlBase}: ${result.data.initError || 'initializing'}`,
          )
        }
      } else {
        this.loadError = result.message || 'failed to load service status'
        storeUi.setMessage('error', this.loadError)
      }
    })
  }
}

export const storeService = new StoreService()
