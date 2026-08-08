// Resource layer: components, versions, builds, file groups, mapped onto storage-obj.
// Refer to /doc/service_resource.md and /doc/service_storage.md.
//
// Multi-object writes follow the visibility-order rule: an object is written
// before the record that points to it; the pointing write comes last.

import path from 'node:path'
import { newIdRandom, newIdMs48, idMs48ToStampMs } from './id.js'
import { timeNow } from './time.js'
import { exposeSelect, versionMetadataAnalyze } from './versionMetadata.js'
import {
  OBJECT_TYPE,
  OBJECT_TYPE_DEFINITION,
  SPACE_METADATA_TAG,
  STORAGE_OWNER,
  STORAGE_SCHEMA_VERSION,
  objectTypeName,
} from './storageSchema.js'

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
  constructor({ client, spaceName }) {
    this.client = client
    this.spaceName = spaceName
    this.spaceId = null
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

  // ---- init: ensure one owned space and service-level objects ----

  async init() {
    this.serviceObjectId = null
    this.compIndexObjectId = null
    this.compIndex = { objectKind: 'comp-index', compById: {} }

    let inspection = await this.storageInspect()
    if (!inspection.space.isFound) {
      const created = await this.client.spaceCreate()
      await this.client.spaceMetadataEnsure({
        spaceId: created.spaceId,
        tag: SPACE_METADATA_TAG.OWNER,
        valueText: STORAGE_OWNER,
      })
      await this.client.spaceMetadataEnsure({
        spaceId: created.spaceId,
        tag: SPACE_METADATA_TAG.SCHEMA_VERSION,
        valueText: String(STORAGE_SCHEMA_VERSION),
      })
      // Publish the discoverable name only after ownership markers are complete.
      await this.client.spaceMetadataUpsert({
        spaceId: created.spaceId,
        tag: SPACE_METADATA_TAG.NAME,
        valueText: this.spaceName,
      })
      inspection = await this.storageInspect()
    }
    if (!inspection.space.isUnique || !inspection.space.isOwned) {
      throw new Error(inspection.issues.join('; ') || `storage space is not usable: ${this.spaceName}`)
    }

    this.spaceId = inspection.space.spaceId
    const blockingIssues = inspection.issues.filter(
      (issue) => issue !== 'service metadata object is missing' && issue !== 'component index object is missing',
    )
    if (blockingIssues.length > 0) throw new Error(blockingIssues.join('; '))

    if (inspection.root.serviceMetadata.count === 0) {
      this.serviceObjectId = await this.client.objectCreate({
        spaceId: this.spaceId,
        dataType: 'json',
        type: OBJECT_TYPE.SERVICE_METADATA,
        valueJson: {
          objectKind: 'service-metadata',
          schemaVersion: STORAGE_SCHEMA_VERSION,
          serviceName: STORAGE_OWNER,
          description: 'remote react component service',
          createdAt: timeNow(),
        },
      })
    }
    if (inspection.root.compIndex.count === 0) {
      this.compIndex = { objectKind: 'comp-index', schemaVersion: STORAGE_SCHEMA_VERSION, compById: {} }
      this.compIndexObjectId = await this.client.objectCreate({
        spaceId: this.spaceId,
        dataType: 'json',
        type: OBJECT_TYPE.COMP_INDEX,
        valueJson: this.compIndex,
      })
    }

    inspection = await this.storageInspect()
    if (!inspection.isStructureNormal) throw new Error(inspection.issues.join('; '))
    this.serviceObjectId = inspection.root.serviceMetadata.objectId
    this.compIndexObjectId = inspection.root.compIndex.objectId
    this.compIndex = inspection.root.compIndex.valueJson
    if (!this.compIndex.compById) this.compIndex.compById = {}
  }

  async storageInspect() {
    const result = {
      space: {
        name: this.spaceName,
        isFound: false,
        isUnique: false,
        isOwned: false,
        spaceId: null,
        owner: '',
        schemaVersion: '',
      },
      root: {
        serviceMetadata: { count: 0, objectId: null, valueJson: null },
        compIndex: { count: 0, objectId: null, valueJson: null },
      },
      objectCountByType: {},
      objectCount: 0,
      isStructureNormal: false,
      issues: [],
    }

    const spacesData = await this.client.spaceList()
    const matches = (spacesData.spaceItems || []).filter(
      (space) => String(space.name || '').toLowerCase() === this.spaceName.toLowerCase(),
    )
    result.space.isFound = matches.length > 0
    result.space.isUnique = matches.length === 1
    if (matches.length === 0) {
      result.issues.push(`storage space is missing: ${this.spaceName}`)
      return result
    }
    if (matches.length > 1) {
      result.issues.push(`multiple storage spaces have the name: ${this.spaceName}`)
      return result
    }

    result.space.spaceId = matches[0].spaceId
    const metadataItems = await this.client.spaceMetadataList(matches[0].spaceId)
    const metadataByTag = Object.fromEntries(metadataItems.map((item) => [item.tag, item]))
    result.space.owner = metadataByTag[SPACE_METADATA_TAG.OWNER]?.valueText || ''
    result.space.schemaVersion = metadataByTag[SPACE_METADATA_TAG.SCHEMA_VERSION]?.valueText || ''
    result.space.isOwned =
      result.space.owner === STORAGE_OWNER
      && result.space.schemaVersion === String(STORAGE_SCHEMA_VERSION)
    if (result.space.owner !== STORAGE_OWNER) {
      result.issues.push(`space owner should be ${STORAGE_OWNER}`)
    }
    if (result.space.schemaVersion !== String(STORAGE_SCHEMA_VERSION)) {
      result.issues.push(`space schema version should be ${STORAGE_SCHEMA_VERSION}`)
    }
    if (!result.space.isOwned) return result

    const objectByKey = new Map()
    for (const dataType of ['json', 'bytes', 'text']) {
      const items = await this.client.objectListAll({ spaceId: matches[0].spaceId, dataType })
      for (const item of items) {
        objectByKey.set(`${dataType}/${item.objectId}`, item)
        result.objectCount += 1
        const definition = OBJECT_TYPE_DEFINITION[item.type]
        const typeKey = String(item.type)
        result.objectCountByType[typeKey] = (result.objectCountByType[typeKey] || 0) + 1
        if (!definition) {
          result.issues.push(`object ${item.objectId} has unknown type ${item.type}`)
          continue
        }
        if (definition.dataType !== dataType) {
          result.issues.push(
            `object ${item.objectId} type ${objectTypeName(item.type)} should use ${definition.dataType}`,
          )
          continue
        }
        if (definition.objectKind && item.valueJson?.objectKind !== definition.objectKind) {
          result.issues.push(
            `object ${item.objectId} type ${objectTypeName(item.type)} has invalid objectKind`,
          )
        }
        if (
          definition.objectKind
          && item.valueJson?.schemaVersion !== STORAGE_SCHEMA_VERSION
        ) {
          result.issues.push(
            `object ${item.objectId} type ${objectTypeName(item.type)} has invalid schema version`,
          )
        }
        const shapeIssue = this.storageObjectShapeIssue(item)
        if (shapeIssue) result.issues.push(`object ${item.objectId}: ${shapeIssue}`)
        if (item.type === OBJECT_TYPE.SERVICE_METADATA) {
          result.root.serviceMetadata.count += 1
          result.root.serviceMetadata.objectId = item.objectId
          result.root.serviceMetadata.valueJson = item.valueJson
        }
        if (item.type === OBJECT_TYPE.COMP_INDEX) {
          result.root.compIndex.count += 1
          result.root.compIndex.objectId = item.objectId
          result.root.compIndex.valueJson = item.valueJson
        }
      }
    }

    this.storageReferenceIssues(objectByKey, result.issues)

    if (result.root.serviceMetadata.count === 0) result.issues.push('service metadata object is missing')
    if (result.root.serviceMetadata.count > 1) result.issues.push('multiple service metadata objects exist')
    if (result.root.compIndex.count === 0) result.issues.push('component index object is missing')
    if (result.root.compIndex.count > 1) result.issues.push('multiple component index objects exist')
    if (
      result.root.serviceMetadata.valueJson
      && result.root.serviceMetadata.valueJson.serviceName !== STORAGE_OWNER
    ) {
      result.issues.push(`service metadata serviceName should be ${STORAGE_OWNER}`)
    }
    if (
      result.root.compIndex.valueJson
      && (
        result.root.compIndex.valueJson.schemaVersion !== STORAGE_SCHEMA_VERSION
        || typeof result.root.compIndex.valueJson.compById !== 'object'
        || result.root.compIndex.valueJson.compById === null
        || Array.isArray(result.root.compIndex.valueJson.compById)
      )
    ) {
      result.issues.push('component index structure is invalid')
    }
    result.isStructureNormal = result.issues.length === 0
    return result
  }

  storageObjectShapeIssue(item) {
    const value = item.valueJson
    if (item.type === OBJECT_TYPE.COMPONENT) {
      if (!value?.compId || !Array.isArray(value.versionList)) return 'component structure is invalid'
    }
    if (item.type === OBJECT_TYPE.VERSION) {
      if (!value?.compId || !value?.versionId || !Array.isArray(value.buildList)) {
        return 'version structure is invalid'
      }
    }
    if (item.type === OBJECT_TYPE.FILE_MANIFEST && !Array.isArray(value?.fileList)) {
      return 'file manifest structure is invalid'
    }
    if (item.type === OBJECT_TYPE.TASK && !value?.taskId) return 'task structure is invalid'
    if (
      item.type === OBJECT_TYPE.OUTBOX_EVENT
      && (!value?.eventId || !value?.taskId || value.eventType !== 'task-created')
    ) {
      return 'outbox event structure is invalid'
    }
    return ''
  }

  storageReferenceIssues(objectByKey, issues) {
    const objectOf = (dataType, objectId, expectedType, description) => {
      if (!objectId) return null
      const item = objectByKey.get(`${dataType}/${objectId}`)
      if (!item) {
        issues.push(`${description} references missing object ${objectId}`)
        return null
      }
      if (item.type !== expectedType) {
        issues.push(`${description} references ${objectId} with type ${objectTypeName(item.type)}`)
        return null
      }
      return item
    }

    for (const item of objectByKey.values()) {
      if (item.type === OBJECT_TYPE.COMP_INDEX) {
        for (const [compId, entry] of Object.entries(item.valueJson?.compById || {})) {
          const component = objectOf('json', entry?.objectId, OBJECT_TYPE.COMPONENT, `component index ${compId}`)
          if (component && component.valueJson?.compId !== compId) {
            issues.push(`component index ${compId} points to a different component`)
          }
        }
      }
      if (item.type === OBJECT_TYPE.COMPONENT) {
        for (const entry of item.valueJson?.versionList || []) {
          const version = objectOf(
            'json',
            entry?.objectId,
            OBJECT_TYPE.VERSION,
            `component ${item.valueJson.compId} version ${entry?.versionId || ''}`,
          )
          if (
            version
            && (
              version.valueJson?.compId !== item.valueJson.compId
              || version.valueJson?.versionId !== entry.versionId
            )
          ) {
            issues.push(`component ${item.valueJson.compId} has an invalid version reference`)
          }
        }
      }
      if (item.type === OBJECT_TYPE.FILE_MANIFEST) {
        for (const entry of item.valueJson?.fileList || []) {
          objectOf('bytes', entry?.objectId, OBJECT_TYPE.FILE_CONTENT, `file manifest ${item.objectId}`)
        }
      }
      if (item.type === OBJECT_TYPE.VERSION) {
        if (item.valueJson?.source?.fileGroupId) {
          objectOf(
            'json',
            item.valueJson.source.fileGroupId,
            OBJECT_TYPE.FILE_MANIFEST,
            `version ${item.valueJson.versionId} source`,
          )
        }
        for (const build of item.valueJson?.buildList || []) {
          if (build?.logObjectId) {
            objectOf(
              'text',
              build.logObjectId,
              OBJECT_TYPE.BUILD_LOG,
              `build ${build.buildId} log`,
            )
          }
          if (build?.output?.fileGroupId) {
            objectOf(
              'json',
              build.output.fileGroupId,
              OBJECT_TYPE.FILE_MANIFEST,
              `build ${build.buildId} output`,
            )
          }
        }
      }
      if (item.type === OBJECT_TYPE.OUTBOX_EVENT) {
        const taskId = item.valueJson?.taskId
        const taskExists = [...objectByKey.values()].some(
          (candidate) =>
            candidate.type === OBJECT_TYPE.TASK
            && candidate.valueJson?.taskId === taskId,
        )
        if (taskId && !taskExists) {
          issues.push(`outbox event ${item.objectId} references missing task ${taskId}`)
        }
      }
    }
  }

  async objectGetExpected({ dataType, objectId, type }) {
    const data = await this.client.objectGet({
      spaceId: this.spaceId,
      dataType,
      objectId,
    })
    if (data && data.type !== type) {
      throw new Error(
        `object ${objectId} has type ${objectTypeName(data.type)}, expected ${objectTypeName(type)}`,
      )
    }
    return data
  }

  async serviceMetadataGet() {
    const data = await this.objectGetExpected({
      dataType: 'json',
      objectId: this.serviceObjectId,
      type: OBJECT_TYPE.SERVICE_METADATA,
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
        spaceId: this.spaceId,
        dataType: 'bytes',
        type: OBJECT_TYPE.FILE_CONTENT,
        valueBase64: contentBase64,
      })
      manifestFileList.push({
        path: file.path,
        objectId,
        sizeBytes: Buffer.from(contentBase64, 'base64').length,
        contentType: contentTypeOfPath(file.path),
      })
    }
    const manifest = {
      objectKind: 'file-manifest',
      schemaVersion: STORAGE_SCHEMA_VERSION,
      fileList: manifestFileList,
    }
    const fileGroupId = await this.client.objectCreate({
      spaceId: this.spaceId,
      dataType: 'json',
      type: OBJECT_TYPE.FILE_MANIFEST,
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
    const data = await this.objectGetExpected({
      dataType: 'json',
      objectId: fileGroupId,
      type: OBJECT_TYPE.FILE_MANIFEST,
    })
    if (!data) return null
    this.manifestCacheById.set(fileGroupId, data.valueJson)
    return data.valueJson
  }

  // returns Buffer or null
  async fileBytesGet(objectId) {
    const data = await this.objectGetExpected({
      dataType: 'bytes',
      objectId,
      type: OBJECT_TYPE.FILE_CONTENT,
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
    const data = await this.objectGetExpected({
      dataType: 'json',
      objectId: indexEntry.objectId,
      type: OBJECT_TYPE.COMPONENT,
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
        objectKind: 'component',
        schemaVersion: STORAGE_SCHEMA_VERSION,
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
        spaceId: this.spaceId,
        dataType: 'json',
        type: OBJECT_TYPE.COMPONENT,
        valueJson: record,
      })
      this.compIndex.compById[compId] = { objectId }
      await this.compIndexSave()
      return record
    })
  }

  async compIndexSave() {
    await this.client.objectUpdate({
      spaceId: this.spaceId,
      dataType: 'json',
      type: OBJECT_TYPE.COMP_INDEX,
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
        spaceId: this.spaceId,
        dataType: 'json',
        type: OBJECT_TYPE.COMPONENT,
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
    const data = await this.objectGetExpected({
      dataType: 'json',
      objectId: entry.objectId,
      type: OBJECT_TYPE.VERSION,
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
      objectKind: 'version',
      schemaVersion: STORAGE_SCHEMA_VERSION,
      compId,
      versionId,
      metadata,
      source: source || null,
      buildList: buildList || [],
      createdAt: timeNow(),
    }
    const objectId = await this.client.objectCreate({
      spaceId: this.spaceId,
      dataType: 'json',
      type: OBJECT_TYPE.VERSION,
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
        spaceId: this.spaceId,
        dataType: 'json',
        type: OBJECT_TYPE.VERSION,
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
      spaceId: this.spaceId,
      dataType: 'text',
      type: OBJECT_TYPE.BUILD_LOG,
      valueText: logText,
    })
  }

  async buildLogGet(logObjectId) {
    const data = await this.objectGetExpected({
      dataType: 'text',
      objectId: logObjectId,
      type: OBJECT_TYPE.BUILD_LOG,
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

  async resolve({ compId, compName, versionId, exposeName }) {
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

    const metadata = versionRecord.metadata || {}
    const metadataInfo = versionMetadataAnalyze(metadata)
    const federation = metadataInfo.federation
    const expose = exposeSelect(metadataInfo, exposeName)
    const urlEntry = await this.buildHeadEntryUrl(
      compRecord.compId,
      versionRecord.versionId,
      headBuild,
      federation.fileEntry,
    )
    return {
      compId: compRecord.compId,
      compName: compRecord.compName,
      versionId: versionRecord.versionId,
      versionName: metadata.versionName || '',
      containerName: federation.containerName,
      urlEntry,
      exposeName: expose.exposeName,
      modulePath: expose.modulePath,
      entryExport: expose.entryExport || 'default',
      description: expose.description || '',
      props: expose.props || {},
      packages: expose.packages || {},
      exposeList: metadataInfo.exposeList.map((item) => ({
        exposeName: item.exposeName,
        description: item.description || '',
        modulePath: item.modulePath,
        entryExport: item.entryExport || 'default',
        props: item.props || {},
        packages: item.packages || {},
      })),
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
