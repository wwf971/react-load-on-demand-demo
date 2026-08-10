// Register this folder in the component registry as one new component version,
// driven by ./comp.jsonc.
// Works for both patterns: "source" dir (service builds) or "output" dir (prebuilt).
// Refer to /doc/service_workflow.md.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.dirname(fileURLToPath(import.meta.url))

const stripJsonc = (text) => {
  let result = ''
  let isInString = false
  let isInLineComment = false
  let isInBlockComment = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const chNext = text[i + 1]
    if (isInLineComment) {
      if (ch === '\n') {
        isInLineComment = false
        result += ch
      }
      continue
    }
    if (isInBlockComment) {
      if (ch === '*' && chNext === '/') {
        isInBlockComment = false
        i++
      }
      continue
    }
    if (isInString) {
      result += ch
      if (ch === '\\') {
        result += chNext
        i++
      } else if (ch === '"') {
        isInString = false
      }
      continue
    }
    if (ch === '"') {
      isInString = true
      result += ch
      continue
    }
    if (ch === '/' && chNext === '/') {
      isInLineComment = true
      i++
      continue
    }
    if (ch === '/' && chNext === '*') {
      isInBlockComment = true
      i++
      continue
    }
    result += ch
  }
  return result
}

const readJsonc = (filePath) => {
  return JSON.parse(stripJsonc(fs.readFileSync(filePath, 'utf-8')))
}

const collectFiles = (dirAbs, dirBaseAbs) => {
  const fileList = []
  const walk = (currentAbs) => {
    for (const entry of fs.readdirSync(currentAbs, { withFileTypes: true })) {
      const entryAbs = path.join(currentAbs, entry.name)
      if (entry.isDirectory()) {
        walk(entryAbs)
      } else if (entry.isFile()) {
        fileList.push({
          path: path.relative(dirBaseAbs, entryAbs).split(path.sep).join('/'),
          contentBase64: fs.readFileSync(entryAbs).toString('base64'),
        })
      }
    }
  }
  walk(dirAbs)
  return fileList
}

const apiCall = async (urlBase, endpoint, options = {}) => {
  const response = await fetch(`${urlBase}${endpoint}`, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  const result = await response.json()
  if (result.code !== 0) {
    throw new Error(`${endpoint} failed: ${result.message || 'unknown error'}`)
  }
  return result.data
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const main = async () => {
  const desc = readJsonc(path.join(projectDir, 'comp.jsonc'))
  const urlBase = desc.service.urlRegistry.replace(/\/$/, '')

  // resolve compName -> compId, create component when missing
  let compId
  try {
    const comp = await apiCall(
      urlBase,
      `/api/comp/find-by-name?compName=${encodeURIComponent(desc.compName)}`,
    )
    compId = comp.compId
    console.log(`component found: ${desc.compName} (${compId})`)
  } catch {
    const created = await apiCall(urlBase, '/api/comp/create', {
      method: 'POST',
      body: JSON.stringify({
        compName: desc.compName,
        metadata: { schemaVersion: 1, description: desc.metadata?.description || '' },
      }),
    })
    compId = created.compId
    console.log(`component created: ${desc.compName} (${compId})`)
  }

  const body = { compId, metadata: desc.metadata }
  if (desc.output?.dir) {
    // pattern 2: paths relative to the output dir itself
    const outputDirAbs = path.join(projectDir, desc.output.dir)
    body.outputFileList = collectFiles(outputDirAbs, outputDirAbs)
    console.log(`registering ${body.outputFileList.length} prebuilt files from ${desc.output.dir}/`)
  } else if (desc.source?.dir) {
    // pattern 1: paths relative to the project folder (keep the dir prefix)
    const sourceDirAbs = path.join(projectDir, desc.source.dir)
    body.sourceFileList = collectFiles(sourceDirAbs, projectDir)
    console.log(`registering ${body.sourceFileList.length} source files from ${desc.source.dir}/`)
  } else {
    throw new Error('comp.jsonc must have source.dir or output.dir')
  }

  const created = await apiCall(urlBase, '/api/comp/version/create', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  console.log(`version created: ${created.versionId}`)

  if (created.taskId) {
    console.log(`build task: ${created.taskId}, waiting...`)
    let messageLast = ''
    for (;;) {
      await sleep(2000)
      const task = await apiCall(urlBase, `/api/task/get?taskId=${created.taskId}`)
      if (task.taskStatusText !== messageLast) {
        messageLast = task.taskStatusText
        console.log(`  [${task.taskStatus}] ${task.taskStatusText}`)
      }
      if (task.taskStatus !== 1) {
        if (task.taskStatus !== 2) {
          console.error(`build did not succeed: ${task.exitInfo?.exitMessage || ''}`)
          console.error(`log: ${urlBase}/api/comp/build/log?compId=${compId}&versionId=${created.versionId}&buildId=${task.operationInfo?.buildId || ''}`)
          process.exit(1)
        }
        break
      }
    }
  }

  console.log(`done. resolve: ${urlBase}/api/comp/resolve?compId=${compId}&versionId=${created.versionId}`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
