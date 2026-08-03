// Resource layer: components, versions, builds, file groups, mapped onto storage-obj.
// Refer to /doc/service_resource.md and /doc/service_storage.md.
//
// Multi-object writes follow the visibility-order rule: an object is written
// before the record that points to it; the pointing write comes last.

import path from 'node:path'
import { newIdRandom, newIdMs48, idMs48ToStampMs } from './id.js'
import { timeNow } from './time.js'

const SPACE_ROLES = ['service', 'comp', 'version', 'file', 'log', 'task', 'outbox']

const CONTENT_TYPE_BY_EXT = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
}

export const contentTypeOfPath = (filePath) => {
  return CONTENT_TYPE_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

export const isSafeRelativePath = (inputPath) => {
  if (typeof inputPath !== 'string' || inputPath === '') return false
  if (inputPath.startsWith('/') || inputPath.includes('\\')) return false
  const segments = inputPath.split('/')
  return segments.every((seg) => seg !== '' && seg !== '.' && seg !== '..')
}

// newest successful build of one version; null when none. Refer to
// /doc/service_resource.md#build-head. buildId is ms_48, so max = newest.
export const buildHeadOf = (versionRecord) => {
  let head = null
  for (const build of versionRecord.buildList || []) {
    if (build.buildStatus !== 2) continue
    if (!head || idMs48ToStampMs(build.buildId) > idMs48ToStampMs(head.buildId)) {
      head = build
    }
  }
  return head
}

export class ResourceService {
  constructor({ client, spacePrefix }) {
    this.client = client
    this.spacePrefix = spacePrefix
    this.spaceIdByRole = {}
    this.serviceObjectId = null
    this.compIndexObjectId = null
    this.compIndex = { compById: {} } // compId -> { objectId }
    this.manifestCacheById = new Map() // fileGroupId -> manifest (immutable)
    this.versionCacheByKey = new Map() // `${compId}/${versionId}` -> { objectId, record, fetchedAt }
    this.writeQueue = Promise.resolve()
  }

  // serialize read-modify-write of shared records inside this single process
  runSerialized(fn) {
    const next = this.writeQueue.then(fn, fn)
    // keep the chain alive even when fn rejects
    this.writeQueue = next.then(
      () => {},
      () => {},
    )
    return next
  }

  // ---- init: ensure spaces and service-level objects ----

  async init() {
    for (const role of SPACE_ROLES) {
      const spaceName = `${this.spacePrefix}-${role}`
      let found = await this.client.spaceFindByName(spaceName)
      if (!found) {
        const created = await this.client.spaceCreate()
        await this.client.spaceMetadataUpsert({
          spaceId: created.spaceId,
          tag: 'name',
          valueText: spaceName,
        })
        found = { spaceId: created.spaceId }
      }
      this.spaceIdByRole[role] = found.spaceId
    }

    // service metadata object and comp index object, identified by objectKind
    const items = await this.client.objectListAll({
      spaceId: this.spaceIdByRole.service,
      dataType: 'json',
    })
    for (const item of items) {
      if (item.valueJson?.objectKind === 'service-metadata') this.serviceObjectId = item.objectId
      if (item.valueJson?.objectKind === 'comp-index') {
        this.compIndexObjectId = item.objectId
        this.compIndex = item.valueJson
      }
    }
    if (!this.serviceObjectId) {
      this.serviceObjectId = await this.client.objectCreate({
        spaceId: this.spaceIdByRole.service,
        dataType: 'json',
        valueJson: {
          objectKind: 'service-metadata',
          schemaVersion: 1,
          serviceName: 'react-lazy-load',
          description: 'remote react component service',
          createdAt: timeNow(),
        },
      })
    }
    if (!this.compIndexObjectId) {
      this.compIndex = { objectKind: 'comp-index', compById: {} }
      this.compIndexObjectId = await this.client.objectCreate({
        spaceId: this.spaceIdByRole.service,
        dataType: 'json',
        valueJson: this.compIndex,
      })
    }
    if (!this.compIndex.compById) this.compIndex.compById = {}
  }

  async serviceMetadataGet() {
    const data = await this.client.objectGet({
      spaceId: this.spaceIdByRole.service,
      dataType: 'json',
      objectId: this.serviceObjectId,
    })
    return data?.valueJson || null
  }

  // ---- file group ----

  // fileList: [{ path, contentBase64 } | { path, contentText }]
  // members first, manifest last; fileGroupId = manifest objectId
  async fileGroupCreate(fileList) {
    const manifestFileList = []
    for (const file of fileList) {
      if (!isSafeRelativePath(file.path)) {
        throw new Error(`invalid file path: ${file.path}`)
      }
      const contentBase64 =
        file.contentBase64 !== undefined
          ? file.contentBase64
          : Buffer.from(file.contentText ?? '', 'utf-8').toString('base64')
      const objectId = await this.client.objectCreate({
        spaceId: this.spaceIdByRole.file,
        dataType: 'bytes',
        valueBase64: contentBase64,
      })
      manifestFileList.push({
        path: file.path,
        objectId,
        sizeBytes: Buffer.from(contentBase64, 'base64').length,
        contentType: contentTypeOfPath(file.path),
      })
    }
    const manifest = { fileList: manifestFileList }
    const fileGroupId = await this.client.objectCreate({
      spaceId: this.spaceIdByRole.file,
      dataType: 'json',
      valueJson: manifest,
    })
    this.manifestCacheById.set(fileGroupId, manifest)
    return { fileGroupId, manifest }
  }

  // manifests are immutable -> cache forever
  async fileGroupManifestGet(fileGroupId) {
    if (this.manifestCacheById.has(fileGroupId)) {
      return this.manifestCacheById.get(fileGroupId)
    }
    const data = await this.client.objectGet({
      spaceId: this.spaceIdByRole.file,
      dataType: 'json',
      objectId: fileGroupId,
    })
    if (!data) return null
    this.manifestCacheById.set(fileGroupId, data.valueJson)
    return data.valueJson
  }

  // returns Buffer or null
  async fileBytesGet(objectId) {
    const data = await this.client.objectGet({
      spaceId: this.spaceIdByRole.file,
      dataType: 'bytes',
      objectId,
    })
    if (!data || data.valueBase64 === null || data.valueBase64 === undefined) return null
    return Buffer.from(data.valueBase64, 'base64')
  }

  // returns each file of the group as { path, contentBuffer }
  async fileGroupFilesGet(fileGroupId) {
    const manifest = await this.fileGroupManifestGet(fileGroupId)
    if (!manifest) throw new Error(`file group not found: ${fileGroupId}`)
    const files = []
    for (const entry of manifest.fileList) {
      const contentBuffer = await this.fileBytesGet(entry.objectId)
      if (contentBuffer === null) throw new Error(`file object not found: ${entry.objectId}`)
      files.push({ path: entry.path, contentBuffer })
    }
    return files
  }

  // ---- component ----

  async compRecordGet(compId) {
    const indexEntry = this.compIndex.compById[compId]
    if (!indexEntry) return null
    const data = await this.client.objectGet({
      spaceId: this.spaceIdByRole.comp,
      dataType: 'json',
      objectId: indexEntry.objectId,
    })
    if (!data) return null
    return { objectId: indexEntry.objectId, record: data.valueJson }
  }

  async compList({ name = '', tag = '' } = {}) {
    const records = []
    for (const compId of Object.keys(this.compIndex.compById)) {
      const found = await this.compRecordGet(compId)
      if (!found) continue
      const { record } = found
      if (record.isDeleted) continue
      if (name && !record.compName.toLowerCase().includes(name.toLowerCase())) continue
      if (tag && !(record.metadata?.tags || []).includes(tag)) continue
      records.push(record)
    }
    records.sort((a, b) => (a.compName < b.compName ? -1 : 1))
    return records
  }

  async compFindByName(compName) {
    for (const compId of Object.keys(this.compIndex.compById)) {
      const found = await this.compRecordGet(compId)
      if (found && !found.record.isDeleted && found.record.compName === compName) {
        return found.record
      }
    }
    return null
  }

  async compCreate({ compName, metadata }) {
    return this.runSerialized(async () => {
      const existing = await this.compFindByName(compName)
      if (existing) throw new Error(`compName already exists: ${compName}`)

      const compId = newIdRandom()
      const record = {
        compId,
        compName,
        metadata: metadata || { schemaVersion: 1 },
        versionList: [],
        isDeleted: false,
        createdAt: timeNow(),
        updatedAt: timeNow(),
      }
      // record first, index entry last (index write makes the component visible)
      const objectId = await this.client.objectCreate({
        spaceId: this.spaceIdByRole.comp,
        dataType: 'json',
        valueJson: record,
      })
      this.compIndex.compById[compId] = { objectId }
      await this.compIndexSave()
      return record
    })
  }

  async compIndexSave() {
    await this.client.objectUpdate({
      spaceId: this.spaceIdByRole.service,
      dataType: 'json',
      objectId: this.compIndexObjectId,
      valueJson: this.compIndex,
    })
  }

  // applyFn mutates the record in place; serialized to avoid lost updates
  async compRecordChange(compId, applyFn) {
    return this.runSerialized(async () => {
      const found = await this.compRecordGet(compId)
      if (!found) throw new Error(`component not found: ${compId}`)
      applyFn(found.record)
      found.record.updatedAt = timeNow()
      await this.client.objectUpdate({
        spaceId: this.spaceIdByRole.comp,
        dataType: 'json',
        objectId: found.objectId,
        valueJson: found.record,
      })
      return found.record
    })
  }

  async compUpdate({ compId, compName, metadata }) {
    if (compName) {
      const existing = await this.compFindByName(compName)
      if (existing && existing.compId !== compId) {
        throw new Error(`compName already exists: ${compName}`)
      }
    }
    return this.compRecordChange(compId, (record) => {
      if (compName) record.compName = compName
      if (metadata) record.metadata = metadata
    })
  }

  async compDelete(compId) {
    return this.compRecordChange(compId, (record) => {
      record.isDeleted = true
    })
  }

  // ---- version ----

  versionCacheKey(compId, versionId) {
    return `${compId}/${versionId}`
  }

  async versionGet(compId, versionId, { isFresh = false } = {}) {
    const cacheKey = this.versionCacheKey(compId, versionId)
    const cached = this.versionCacheByKey.get(cacheKey)
    if (cached && !isFresh && Date.now() - cached.fetchedAt < 5000) {
      return cached
    }
    const comp = await this.compRecordGet(compId)
    if (!comp) return null
    const entry = (comp.record.versionList || []).find((v) => v.versionId === versionId)
    if (!entry) return null
    const data = await this.client.objectGet({
      spaceId: this.spaceIdByRole.version,
      dataType: 'json',
      objectId: entry.objectId,
    })
    if (!data) return null
    const result = { objectId: entry.objectId, record: data.valueJson, fetchedAt: Date.now() }
    this.versionCacheByKey.set(cacheKey, result)
    return result
  }

  async versionList(compId) {
    const comp = await this.compRecordGet(compId)
    if (!comp) throw new Error(`component not found: ${compId}`)
    const records = []
    for (const entry of comp.record.versionList || []) {
      const found = await this.versionGet(compId, entry.versionId)
      if (found) records.push(found.record)
    }
    // newest first
    records.sort((a, b) => idMs48ToStampMs(b.versionId) - idMs48ToStampMs(a.versionId))
    return records
  }

  // create a version; buildList may already contain the upload-prebuilt build record
  // (pattern 2). Write order: version record first, comp record entry last.
  async versionCreate({ compId, metadata, source, buildList }) {
    const comp = await this.compRecordGet(compId)
    if (!comp || comp.record.isDeleted) throw new Error(`component not found: ${compId}`)

    const versionId = newIdMs48()
    const record = {
      compId,
      versionId,
      metadata,
      source: source || null,
      buildList: buildList || [],
      createdAt: timeNow(),
    }
    const objectId = await this.client.objectCreate({
      spaceId: this.spaceIdByRole.version,
      dataType: 'json',
      valueJson: record,
    })
    await this.compRecordChange(compId, (compRecord) => {
      compRecord.versionList.push({ versionId, objectId })
    })
    this.versionCacheByKey.set(this.versionCacheKey(compId, versionId), {
      objectId,
      record,
      fetchedAt: Date.now(),
    })
    return record
  }

  // append one finished build record; source and metadata of the version stay frozen
  async versionBuildAppend(compId, versionId, buildRecord) {
    return this.runSerialized(async () => {
      const found = await this.versionGet(compId, versionId, { isFresh: true })
      if (!found) throw new Error(`version not found: ${compId}/${versionId}`)
      found.record.buildList.push(buildRecord)
      await this.client.objectUpdate({
        spaceId: this.spaceIdByRole.version,
        dataType: 'json',
        objectId: found.objectId,
        valueJson: found.record,
      })
      this.versionCacheByKey.set(this.versionCacheKey(compId, versionId), {
        objectId: found.objectId,
        record: found.record,
        fetchedAt: Date.now(),
      })
      return found.record
    })
  }

  // ---- build log ----

  async buildLogCreate(logText) {
    return this.client.objectCreate({
      spaceId: this.spaceIdByRole.log,
      dataType: 'text',
      valueText: logText,
    })
  }

  async buildLogGet(logObjectId) {
    const data = await this.client.objectGet({
      spaceId: this.spaceIdByRole.log,
      dataType: 'text',
      objectId: logObjectId,
    })
    return data ? data.valueText : null
  }

  // ---- resolve (for host pages) ----

  // find the served file url of the build HEAD output; entry file matched by basename
  async buildHeadEntryUrl(compId, versionId, headBuild, fileEntry) {
    const manifest = await this.fileGroupManifestGet(headBuild.output.fileGroupId)
    if (!manifest) throw new Error('build output manifest not found')
    const entry = manifest.fileList.find((f) => path.posix.basename(f.path) === fileEntry)
    if (!entry) throw new Error(`entry file not found in build output: ${fileEntry}`)
    return `/comp-file/${compId}/${versionId}/${entry.path}`
  }

  async resolve({ compId, compName, versionId }) {
    let compRecord = null
    if (compId) {
      const found = await this.compRecordGet(compId)
      compRecord = found?.record || null
    } else if (compName) {
      compRecord = await this.compFindByName(compName)
    }
    if (!compRecord || compRecord.isDeleted) {
      throw new Error('component not found')
    }

    let versionRecord = null
    let headBuild = null
    if (versionId) {
      const found = await this.versionGet(compRecord.compId, versionId)
      if (!found) throw new Error(`version not found: ${versionId}`)
      versionRecord = found.record
      headBuild = buildHeadOf(versionRecord)
      if (!headBuild) throw new Error(`version has no successful build: ${versionId}`)
    } else {
      // newest servable version
      const versionRecords = await this.versionList(compRecord.compId)
      for (const record of versionRecords) {
        const head = buildHeadOf(record)
        if (head) {
          versionRecord = record
          headBuild = head
          break
        }
      }
      if (!versionRecord) throw new Error('component has no servable version')
    }

    const federation = versionRecord.metadata?.federation || {}
    const urlEntry = await this.buildHeadEntryUrl(
      compRecord.compId,
      versionRecord.versionId,
      headBuild,
      federation.fileEntry,
    )
    return {
      compId: compRecord.compId,
      versionId: versionRecord.versionId,
      containerName: federation.containerName,
      modulePath: federation.modulePath,
      entryExport: federation.entryExport || 'default',
      urlEntry,
      packages: versionRecord.metadata?.packages || {},
    }
  }

  // ---- comp file serving ----

  // returns { contentBuffer, contentType } or null
  async compFileGet(compId, versionId, filePath) {
    const found = await this.versionGet(compId, versionId)
    if (!found) return null
    const headBuild = buildHeadOf(found.record)
    if (!headBuild) return null
    const manifest = await this.fileGroupManifestGet(headBuild.output.fileGroupId)
    if (!manifest) return null
    const entry = manifest.fileList.find((f) => f.path === filePath)
    if (!entry) return null
    const contentBuffer = await this.fileBytesGet(entry.objectId)
    if (contentBuffer === null) return null
    return { contentBuffer, contentType: entry.contentType }
  }
}
