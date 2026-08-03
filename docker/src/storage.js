// HTTP client for the storage-obj service (versioned object storage).
// All persistent data of this service lives there; refer to /doc/service_storage.md.

export class StorageObjError extends Error {
  constructor(message, { httpStatus = 0 } = {}) {
    super(message)
    this.httpStatus = httpStatus
  }
}

export class StorageObjClient {
  constructor({ urlBase, storageEndpointKey = null }) {
    this.urlBase = urlBase.replace(/\/$/, '')
    this.storageEndpointKey = storageEndpointKey
  }

  async call(endpoint, { method = 'GET', query = null, body = null } = {}) {
    const url = new URL(`${this.urlBase}${endpoint}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== null && value !== undefined) url.searchParams.set(key, String(value))
      }
    }
    if (this.storageEndpointKey) {
      if (method === 'GET') {
        url.searchParams.set('storageEndpointKey', this.storageEndpointKey)
      } else {
        body = { ...(body || {}), storageEndpointKey: this.storageEndpointKey }
      }
    }

    let response
    try {
      response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      throw new StorageObjError(
        `storage-obj ${method} ${url.toString()}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    let result = null
    try {
      result = await response.json()
    } catch {
      throw new StorageObjError(
        `storage-obj ${endpoint}: non-json response (http ${response.status})`,
        { httpStatus: response.status },
      )
    }
    if (!result || result.code !== 0) {
      throw new StorageObjError(
        `storage-obj ${endpoint}: ${result?.message || `http ${response.status}`}`,
        { httpStatus: response.status },
      )
    }
    return result.data
  }

  // returns null instead of throwing; for lookups where "not found" is a normal answer
  // (storage-obj reports not-found as code -1)
  async tryCall(endpoint, options) {
    try {
      return await this.call(endpoint, options)
    } catch (error) {
      if (error instanceof StorageObjError) return null
      throw error
    }
  }

  // ---- health ----

  async healthPing() {
    return this.call('/api/health/ping')
  }

  // ---- space ----

  async spaceList() {
    return this.call('/api/space/list')
  }

  // returns { spaceId, name } or null
  async spaceFindByName(name) {
    return this.tryCall('/api/space/find-by-name', { query: { name } })
  }

  async spaceCreate() {
    return this.call('/api/space/create', { method: 'POST', body: {} })
  }

  async spaceMetadataUpsert({ spaceId, tag, valueText }) {
    return this.call('/api/space/metadata/upsert', {
      method: 'POST',
      body: { spaceId, tag, valueType: 1, valueText },
    })
  }

  // ---- object ----
  // dataType: 'text' | 'bytes' | 'json'
  // value field by dataType: valueText / valueBase64 / valueJson
  // all objects are created with editType 0 (UPDATE-ONLY): no in-place rewrite, ever

  async objectCreate({ spaceId, dataType, valueText, valueJson, valueBase64 }) {
    const data = await this.call('/api/object/create', {
      method: 'POST',
      body: { spaceId, dataType, editType: 0, valueText, valueJson, valueBase64 },
    })
    return data.objectId
  }

  async objectUpdate({ spaceId, dataType, objectId, valueText, valueJson, valueBase64 }) {
    return this.call('/api/object/update', {
      method: 'POST',
      body: { spaceId, dataType, objectId, valueText, valueJson, valueBase64 },
    })
  }

  // returns full object data { objectId, valueText/valueJson/valueBase64, ... } or null
  async objectGet({ spaceId, dataType, objectId }) {
    return this.tryCall('/api/object/get', { query: { spaceId, dataType, objectId } })
  }

  // returns { items, totalCount, pageIndex, pageSize }; items include full values
  async objectList({ spaceId, dataType, pageIndex = 1, pageSize = 200 }) {
    return this.call('/api/object/list', {
      query: { spaceId, dataType, pageIndex, pageSize },
    })
  }

  // list every non-deleted object of one (space, dataType), paging through
  async objectListAll({ spaceId, dataType }) {
    const items = []
    let pageIndex = 1
    for (;;) {
      const page = await this.objectList({ spaceId, dataType, pageIndex })
      items.push(...page.items)
      if (items.length >= page.totalCount || page.items.length === 0) break
      pageIndex += 1
    }
    return items
  }

  async objectDelete({ spaceId, dataType, objectId }) {
    return this.call('/api/object/delete', {
      method: 'POST',
      body: { spaceId, dataType, objectId },
    })
  }
}
