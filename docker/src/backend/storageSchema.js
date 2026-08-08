export const STORAGE_OWNER = 'react-lazy-load'
export const STORAGE_SCHEMA_VERSION = 1

export const SPACE_METADATA_TAG = {
  NAME: 'name',
  OWNER: 'owner',
  SCHEMA_VERSION: 'schema-version',
}

export const OBJECT_TYPE = {
  SERVICE_METADATA: 1,
  COMP_INDEX: 2,
  COMPONENT: 3,
  VERSION: 4,
  FILE_MANIFEST: 5,
  FILE_CONTENT: 6,
  BUILD_LOG: 7,
  TASK: 8,
  OUTBOX_EVENT: 9,
}

export const OBJECT_TYPE_DEFINITION = {
  [OBJECT_TYPE.SERVICE_METADATA]: {
    name: 'service metadata',
    dataType: 'json',
    objectKind: 'service-metadata',
  },
  [OBJECT_TYPE.COMP_INDEX]: {
    name: 'component index',
    dataType: 'json',
    objectKind: 'comp-index',
  },
  [OBJECT_TYPE.COMPONENT]: {
    name: 'component',
    dataType: 'json',
    objectKind: 'component',
  },
  [OBJECT_TYPE.VERSION]: {
    name: 'version',
    dataType: 'json',
    objectKind: 'version',
  },
  [OBJECT_TYPE.FILE_MANIFEST]: {
    name: 'file manifest',
    dataType: 'json',
    objectKind: 'file-manifest',
  },
  [OBJECT_TYPE.FILE_CONTENT]: {
    name: 'file content',
    dataType: 'bytes',
  },
  [OBJECT_TYPE.BUILD_LOG]: {
    name: 'build log',
    dataType: 'text',
  },
  [OBJECT_TYPE.TASK]: {
    name: 'task',
    dataType: 'json',
    objectKind: 'task',
  },
  [OBJECT_TYPE.OUTBOX_EVENT]: {
    name: 'outbox event',
    dataType: 'json',
    objectKind: 'outbox-event',
  },
}

export const objectTypeName = (type) => OBJECT_TYPE_DEFINITION[type]?.name || `unknown type ${type}`
