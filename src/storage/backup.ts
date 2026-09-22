import { layerTileKey, normalizeTileMap, type LayerInfo } from '../canvas/layers'
import { db } from './db'
import { getRecentColors, isValidMeta, loadDrawing, newId, saveRecentColors } from './repository'
import { buildSnapshot, verifySnapshot, type EncodedStroke, type Snapshot } from './snapshot'

const FORMAT = 'drawing-app-backup'
const VERSION = 1

export const BACKUP_EXTENSION = 'drawbackup'

// ---- 바이트 <-> 문자열 ----

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

function toStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

function pipe(bytes: Uint8Array, transform: GenericTransformStream): Promise<Uint8Array> {
  const stream = toStream(bytes).pipeThrough(
    transform as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  )
  return collect(stream as ReadableStream<Uint8Array>)
}

/** 파일을 줄이기 위해 gzip으로 압축한다. 브라우저가 지원하지 않으면 그대로 둔다. */
async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return bytes
  return pipe(bytes, new CompressionStream('gzip'))
}

export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('이 브라우저는 압축된 백업 파일을 열 수 없습니다.')
  }
  return pipe(bytes, new DecompressionStream('gzip'))
}

// ---- 저장본 <-> 파일 ----

interface FileStroke {
  t: EncodedStroke['t']
  c: string
  s: number
  h: number
  p: string
  x?: string
}

interface FileSnapshot {
  seq: number
  savedAt: number
  strokes: FileStroke[]
  redo: FileStroke[]
  tiles: Record<string, number>
  ui: Snapshot['ui']
  layers?: LayerInfo[]
  checksum: number
}

function strokeToFile(s: EncodedStroke): FileStroke {
  return {
    t: s.t,
    c: s.c,
    s: s.s,
    h: s.h,
    p: bytesToBase64(new Uint8Array(s.p.buffer, s.p.byteOffset, s.p.byteLength)),
    ...(s.x ? { x: s.x } : {}),
  }
}

function strokeFromFile(s: FileStroke): EncodedStroke {
  const bytes = base64ToBytes(s.p)
  // Float32Array는 4바이트 정렬이 필요하므로 새 버퍼로 복사한다.
  const p = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  return { t: s.t, c: s.c, s: s.s, h: s.h, p, ...(s.x ? { x: s.x } : {}) }
}

interface FileDrawing {
  meta: unknown
  snapshot: FileSnapshot
  tiles: { layer?: string; tx: number; ty: number; v: number; data: string }[]
  thumbnail: string | null
}

export interface BackupResult {
  bytes: Uint8Array
  count: number
  /** 손상되어 담지 못한 그림 이름 */
  skipped: string[]
}

/** 모든 그림을 파일 하나로 묶는다. 각 그림은 온전한 최신 저장본만 담는다. */
export async function createBackup(onlyIds?: readonly string[]): Promise<BackupResult> {
  const metas = (await db.drawings.toArray()).filter(isValidMeta).filter((m) => !onlyIds || onlyIds.includes(m.id))
  const drawings: FileDrawing[] = []
  const skipped: string[] = []

  for (const meta of metas) {
    try {
      const loaded = await loadDrawing(meta.id)
      const s = loaded.snapshot
      const thumb = await db.thumbnails.get(meta.id)
      drawings.push({
        meta,
        snapshot: {
          seq: s.seq,
          savedAt: s.savedAt,
          strokes: s.strokes.map(strokeToFile),
          redo: s.redo.map(strokeToFile),
          tiles: s.tiles,
          ui: s.ui,
          ...(s.layers ? { layers: s.layers } : {}),
          checksum: s.checksum,
        },
        tiles: loaded.tiles.map((t) => ({
          layer: t.layer,
          tx: t.tx,
          ty: t.ty,
          v: normalizeTileMap(s.tiles)[layerTileKey(t.layer, t.tx, t.ty)],
          data: bytesToBase64(new Uint8Array(t.data)),
        })),
        thumbnail: thumb ? bytesToBase64(new Uint8Array(thumb.data)) : null,
      })
    } catch {
      skipped.push(meta.name)
    }
  }

  const json = JSON.stringify({
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    drawings,
    recentColors: await getRecentColors(),
  })
  const bytes = await gzip(new TextEncoder().encode(json))
  return { bytes, count: drawings.length, skipped }
}

export interface RestoreResult {
  imported: number
  failed: number
}

/** 백업 파일의 그림을 새 그림으로 추가한다. 기존 그림을 덮어쓰지 않는다. */
export async function restoreBackup(bytes: Uint8Array): Promise<RestoreResult> {
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
  const text = new TextDecoder().decode(isGzip ? await gunzip(bytes) : bytes)

  let data: { format?: unknown; version?: unknown; drawings?: unknown; recentColors?: unknown }
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('백업 파일을 읽을 수 없습니다. 이 앱에서 만든 백업 파일이 맞는지 확인해 주세요.')
  }
  if (data.format !== FORMAT || data.version !== VERSION || !Array.isArray(data.drawings)) {
    throw new Error('이 앱의 백업 파일이 아니거나 지원하지 않는 버전입니다.')
  }

  let imported = 0
  let failed = 0
  for (const entry of data.drawings as FileDrawing[]) {
    try {
      if (!isValidMeta(entry.meta)) throw new Error('meta')
      const snap = entry.snapshot
      const snapshot = buildSnapshot(
        snap.seq,
        snap.savedAt,
        snap.strokes.map(strokeFromFile),
        snap.redo.map(strokeFromFile),
        snap.tiles,
        snap.ui,
        snap.layers,
      )
      // 파일 안의 검사값과 다시 계산한 값이 다르면 손상된 파일이다.
      if (snapshot.checksum !== snap.checksum || !verifySnapshot(snapshot)) throw new Error('checksum')

      const id = newId()
      const now = Date.now()
      const meta = { ...entry.meta, id, updatedAt: now }
      await db.transaction('rw', db.drawings, db.snapshots, db.layerTiles, db.thumbnails, async () => {
        await db.drawings.add(meta)
        await db.snapshots.add({ id, current: snapshot, previous: null })
        await db.layerTiles.bulkAdd(
          entry.tiles.map((t) => ({
            drawingId: id,
            layer: t.layer ?? 'L0',
            tx: t.tx,
            ty: t.ty,
            v: t.v,
            data: base64ToBytes(t.data).buffer as ArrayBuffer,
          })),
        )
        if (entry.thumbnail) {
          await db.thumbnails.put({
            id,
            data: base64ToBytes(entry.thumbnail).buffer as ArrayBuffer,
            updatedAt: now,
          })
        }
      })
      imported++
    } catch {
      failed++
    }
  }

  if (Array.isArray(data.recentColors) && (await getRecentColors()).length === 0) {
    await saveRecentColors(data.recentColors.filter((c): c is string => typeof c === 'string'))
  }
  return { imported, failed }
}
