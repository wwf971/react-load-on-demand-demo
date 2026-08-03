// Id formats (refer to /doc/service_resource.md#id-formats):
// - compId: random 0-9a-z string, no semantic prefix/suffix
// - versionId/buildId/taskId/eventId: ms_48 (48-bit unix ms + 16-bit random offset),
//   displayed as base36 string

const CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'

export const newIdRandom = (length = 12) => {
  let id = ''
  for (let i = 0; i < length; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return id
}

export const newIdMs48 = () => {
  const stampMs = BigInt(Date.now())
  const offset = BigInt(Math.floor(Math.random() * 0x10000))
  const idNum = (stampMs << 16n) | offset
  return idNum.toString(36)
}

// creation time embedded in an ms_48 id, as unix ms number
export const idMs48ToStampMs = (idText) => {
  let idNum = 0n
  for (const ch of idText) {
    idNum = idNum * 36n + BigInt(CHARS.indexOf(ch))
  }
  return Number(idNum >> 16n)
}
