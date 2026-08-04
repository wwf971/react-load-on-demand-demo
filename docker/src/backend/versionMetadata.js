const valueRequired = (value, name) => {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${name} is required`)
  }
  return value
}

const exposeListLegacyOf = (metadata) => {
  const federation = metadata.federation || {}
  if (!federation.modulePath) return []
  return [
    {
      exposeName: metadata.exposeDefaultName || 'default',
      description: metadata.description || '',
      props: metadata.props || {},
      packages: metadata.packages || {},
      modulePath: federation.modulePath,
      fileEntrySource: federation.fileEntrySource,
      entryExport: federation.entryExport || 'default',
    },
  ]
}

export const exposeListOf = (metadata) => {
  if (Array.isArray(metadata?.exposeList)) return metadata.exposeList
  return exposeListLegacyOf(metadata || {})
}

export const versionMetadataAnalyze = (metadata, { isSourceBuild = false } = {}) => {
  if (!metadata || typeof metadata !== 'object') {
    throw new Error('metadata is required')
  }

  const federation = metadata.federation || {}
  valueRequired(federation.containerName, 'metadata.federation.containerName')
  valueRequired(federation.fileEntry, 'metadata.federation.fileEntry')

  const exposeList = exposeListOf(metadata)
  if (exposeList.length === 0) {
    throw new Error('metadata.exposeList should contain at least one exposed component')
  }

  const exposeNameSet = new Set()
  const sourceByModulePath = new Map()
  const packageByName = {}

  for (const [index, expose] of exposeList.entries()) {
    const fieldBase = `metadata.exposeList[${index}]`
    valueRequired(expose?.exposeName, `${fieldBase}.exposeName`)
    valueRequired(expose?.modulePath, `${fieldBase}.modulePath`)
    if (exposeNameSet.has(expose.exposeName)) {
      throw new Error(`duplicate exposeName: ${expose.exposeName}`)
    }
    exposeNameSet.add(expose.exposeName)

    if (isSourceBuild) {
      valueRequired(expose.fileEntrySource, `${fieldBase}.fileEntrySource`)
    }
    if (expose.fileEntrySource) {
      const sourceExisting = sourceByModulePath.get(expose.modulePath)
      if (sourceExisting && sourceExisting !== expose.fileEntrySource) {
        throw new Error(`modulePath has more than one source file: ${expose.modulePath}`)
      }
      sourceByModulePath.set(expose.modulePath, expose.fileEntrySource)
    }

    if (expose.props !== undefined && (typeof expose.props !== 'object' || Array.isArray(expose.props))) {
      throw new Error(`${fieldBase}.props should be an object`)
    }
    if (expose.packages !== undefined && (typeof expose.packages !== 'object' || Array.isArray(expose.packages))) {
      throw new Error(`${fieldBase}.packages should be an object`)
    }

    for (const [packageName, packageInfo] of Object.entries(expose.packages || {})) {
      valueRequired(packageInfo?.versionRequired, `${fieldBase}.packages.${packageName}.versionRequired`)
      const packageExisting = packageByName[packageName]
      if (
        packageExisting
        && (
          packageExisting.versionRequired !== packageInfo.versionRequired
          || Boolean(packageExisting.isShared) !== Boolean(packageInfo.isShared)
        )
      ) {
        throw new Error(
          `package requirement should be the same in every exposed component: ${packageName}`,
        )
      }
      packageByName[packageName] = {
        versionRequired: packageInfo.versionRequired,
        isShared: Boolean(packageInfo.isShared),
      }
    }
  }

  const exposeDefaultName = metadata.exposeDefaultName || exposeList[0].exposeName
  if (!exposeNameSet.has(exposeDefaultName)) {
    throw new Error(`exposeDefaultName not found in exposeList: ${exposeDefaultName}`)
  }

  return {
    federation,
    exposeList,
    exposeDefaultName,
    packageByName,
    sourceByModulePath,
  }
}

export const exposeSelect = (metadataInfo, exposeName = '') => {
  const exposeNameResolved = exposeName || metadataInfo.exposeDefaultName
  const expose = metadataInfo.exposeList.find((item) => item.exposeName === exposeNameResolved)
  if (!expose) throw new Error(`exposed component not found: ${exposeNameResolved}`)
  return expose
}
