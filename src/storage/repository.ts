import type { CanvasSpec } from '../canvas/paper'
import {
  FIRST_LAYER_ID,
  defaultLayers,
  layerTileKey,
  normalizeTileMap,
  parseLayerTileKey,
  type LayerInfo,
} from '../canvas/layers'
import { TILE_SIZE } from '../canvas/tiles'
import type { TileData } from '../canvas/session'
import { db, type DrawingMeta, type TileKey, type TileRecord } from './db'
import {
  DEFAULT_UI,
  buildSnapshot,
  verifySnapshot,
  type EncodedStroke,
  type Snapshot,
  type UiState,
} from './snapshot'

const TILE_BYTES = TILE_SIZE * TILE_SIZE * 4

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]'
}

export class DrawingLoadError extends Error {}

function isValidSpec(spec: unknown): spec is CanvasSpec {
  if (typeof spec !== 'object' || spec === null) return false
  const s = spec as Record<string, unknown>
  return (
    typeof s.widthPx === 'number' &&
    typeof s.heightPx === 'number' &&
    s.widthPx > 0 &&
    s.heightPx > 0 &&
    typeof s.dpi === 'number' &&
    typeof s.widthMm === 'number' &&
    typeof s.heightMm === 'number' &&
    typeof s.background === 'string'
  )
}

export function isValidMeta(meta: unknown): meta is DrawingMeta {
  if (typeof meta !== 'object' || meta === null) return false
  const m = meta as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.createdAt === 'number' &&
    typeof m.updatedAt === 'number' &&
    isValidSpec(m.spec)
  )
}

// ---- 그림 만들기·목록 ----

export async function createDrawing(name: string, spec: CanvasSpec): Promise<DrawingMeta> {
  const now = Date.now()
  const meta: DrawingMeta = { id: newId(), name, createdAt: now, updatedAt: now, spec }
  const snapshot = buildSnapshot(0, now, [], [], {}, { ...DEFAULT_UI, activeLayer: FIRST_LAYER_ID }, defaultLayers())
  await db.transaction('rw', db.drawings, db.snapshots, async () => {
    await db.drawings.add(meta)
    await db.snapshots.add({ id: meta.id, current: snapshot, previous: null })
  })
  return meta
}

export interface DrawingListItem {
  meta: DrawingMeta
  thumbnail: ArrayBuffer | null
}

export async function listDrawings(): Promise<DrawingListItem[]> {
  const metas = (await db.drawings.orderBy('updatedAt').reverse().toArray()).filter(isValidMeta)
  const thumbs = await db.thumbnails.bulkGet(metas.map((m) => m.id))
  return metas.map((meta, i) => ({ meta, thumbnail: thumbs[i]?.data ?? null }))
}

export async function getDrawingMeta(id: string): Promise<DrawingMeta | undefined> {
  const meta = await db.drawings.get(id)
  return isValidMeta(meta) ? meta : undefined
}

// ---- 저장 ----

export interface SaveInput {
  strokes: EncodedStroke[]
  redo: EncodedStroke[]
  ui: UiState
  /** 오래된 획을 굳힌 시점의 레이어 구조 */
  layers: LayerInfo[]
}

export interface SaveOptions {
  /**
   * true면 타일 목록을 처음부터 다시 만든다(넘긴 타일만 남는다).
   * 직전 저장본으로 복구한 뒤 첫 저장에 쓴다.
   */
  fullTiles?: boolean
}

/**
 * 저장본을 하나 추가한다. 메타, 저장본, 바뀐 타일을 한 트랜잭션에 쓰므로
 * 중간에 끊겨도 반쯤 쓰인 저장본은 남지 않는다.
 * 직전 저장본은 previous로 남기고, 두 저장본이 쓰지 않는 옛 타일만 지운다.
 */
export async function saveSnapshot(
  id: string,
  input: SaveInput,
  tiles: readonly TileData[],
  options: SaveOptions = {},
): Promise<void> {
  await db.transaction('rw', db.drawings, db.snapshots, db.layerTiles, async () => {
    const record = await db.snapshots.get(id)
    if (!record) throw new Error('저장할 그림을 찾을 수 없습니다.')

    const seq = record.current.seq + 1
    // 레이어 도입 전 저장본의 타일 키는 첫 레이어의 것으로 바꿔 이어 간다.
    const tileMap: Record<string, number> = options.fullTiles ? {} : normalizeTileMap(record.current.tiles)
    const writes: TileRecord[] = []
    for (const tile of tiles) {
      const key = layerTileKey(tile.layer, tile.tx, tile.ty)
      if (tile.data) {
        tileMap[key] = seq
        writes.push({ drawingId: id, layer: tile.layer, tx: tile.tx, ty: tile.ty, v: seq, data: tile.data })
      } else {
        delete tileMap[key]
      }
    }

    const snapshot = buildSnapshot(seq, Date.now(), input.strokes, input.redo, tileMap, input.ui, input.layers)
    // 손상된 저장본이 멀쩡한 직전 저장본을 밀어내지 않게 한다.
    const previous = options.fullTiles
      ? null
      : verifySnapshot(record.current)
        ? record.current
        : record.previous

    if (writes.length > 0) await db.layerTiles.bulkPut(writes)
    await db.snapshots.put({ id, current: snapshot, previous })
    await db.drawings.update(id, { updatedAt: snapshot.savedAt })

    const keep = new Set<string>()
    for (const snap of [snapshot, previous]) {
      if (!snap) continue
      for (const [key, v] of Object.entries(normalizeTileMap(snap.tiles))) {
        const t = parseLayerTileKey(key)
        keep.add(`${t.layer},${t.tx},${t.ty},${v}`)
      }
    }
    const stored = await db.layerTiles.where('drawingId').equals(id).primaryKeys()
    const stale = stored.filter(([, layer, tx, ty, v]) => !keep.has(`${layer},${tx},${ty},${v}`))
    if (stale.length > 0) await db.layerTiles.bulkDelete(stale)
  })
}

export async function saveThumbnail(id: string, data: ArrayBuffer): Promise<void> {
  if (!(await db.drawings.get(id))) return
  await db.thumbnails.put({ id, data, updatedAt: Date.now() })
}

// ---- 불러오기 ----

export interface LoadedDrawing {
  meta: DrawingMeta
  snapshot: Snapshot
  tiles: { layer: string; tx: number; ty: number; data: ArrayBuffer }[]
  /** 최신 저장본이 손상되어 직전 저장본으로 열었으면 true */
  recovered: boolean
}

async function loadTilesFor(id: string, snapshot: Snapshot) {
  const keys = Object.entries(normalizeTileMap(snapshot.tiles)).map(([key, v]) => ({ ...parseLayerTileKey(key), v }))
  const records = await db.layerTiles.bulkGet(keys.map((k) => [id, k.layer, k.tx, k.ty, k.v] as TileKey))
  const tiles: { layer: string; tx: number; ty: number; data: ArrayBuffer }[] = []
  for (let i = 0; i < keys.length; i++) {
    const data = records[i]?.data
    if (!isArrayBuffer(data) || data.byteLength !== TILE_BYTES) return null
    tiles.push({ layer: keys[i].layer, tx: keys[i].tx, ty: keys[i].ty, data })
  }
  return tiles
}

/** 최신 저장본을 열고, 손상됐으면 직전 저장본으로 연다. 둘 다 안 되면 DrawingLoadError. */
export async function loadDrawing(id: string): Promise<LoadedDrawing> {
  const meta = await db.drawings.get(id)
  if (!isValidMeta(meta)) throw new DrawingLoadError('그림 정보를 읽을 수 없습니다.')
  const record = await db.snapshots.get(id)
  if (!record) throw new DrawingLoadError('저장된 그림 데이터가 없습니다.')

  const candidates = [record.current, record.previous]
  for (let i = 0; i < candidates.length; i++) {
    const snapshot = candidates[i]
    if (!verifySnapshot(snapshot)) continue
    const tiles = await loadTilesFor(id, snapshot)
    if (!tiles) continue
    return { meta, snapshot, tiles, recovered: i > 0 }
  }
  throw new DrawingLoadError('저장 데이터가 손상되어 그림을 열 수 없습니다.')
}

// ---- 이름 바꾸기·복제·삭제 ----

export async function renameDrawing(id: string, name: string): Promise<void> {
  await db.drawings.update(id, { name })
}

export async function duplicateDrawing(id: string, name: string): Promise<DrawingMeta> {
  const loaded = await loadDrawing(id)
  const now = Date.now()
  const meta: DrawingMeta = { ...loaded.meta, id: newId(), name, createdAt: now, updatedAt: now }
  const s = loaded.snapshot
  const tileMap = normalizeTileMap(s.tiles)
  const snapshot = buildSnapshot(s.seq, now, s.strokes, s.redo, tileMap, s.ui, s.layers)
  const thumb = await db.thumbnails.get(id)
  await db.transaction('rw', db.drawings, db.snapshots, db.layerTiles, db.thumbnails, async () => {
    await db.drawings.add(meta)
    await db.snapshots.add({ id: meta.id, current: snapshot, previous: null })
    await db.layerTiles.bulkAdd(
      loaded.tiles.map((t) => ({
        drawingId: meta.id,
        layer: t.layer,
        tx: t.tx,
        ty: t.ty,
        v: tileMap[layerTileKey(t.layer, t.tx, t.ty)],
        data: t.data,
      })),
    )
    if (thumb) await db.thumbnails.put({ id: meta.id, data: thumb.data, updatedAt: now })
  })
  return meta
}

export async function deleteDrawing(id: string): Promise<void> {
  await db.transaction('rw', [db.drawings, db.snapshots, db.layerTiles, db.thumbnails, db.meta], async () => {
    await db.drawings.delete(id)
    await db.snapshots.delete(id)
    await db.thumbnails.delete(id)
    await db.layerTiles.where('drawingId').equals(id).delete()
    const last = await db.meta.get(LAST_OPENED)
    if (last?.value === id) await db.meta.delete(LAST_OPENED)
  })
}

// ---- 앱 전체 설정 ----

const LAST_OPENED = 'lastOpened'
const RECENT_COLORS = 'recentColors'
const SETTINGS = 'settings'

export interface AppSettings {
  version: number
}

export async function getLastOpened(): Promise<string | null> {
  const record = await db.meta.get(LAST_OPENED)
  return typeof record?.value === 'string' ? record.value : null
}

export async function setLastOpened(id: string | null): Promise<void> {
  if (id === null) await db.meta.delete(LAST_OPENED)
  else await db.meta.put({ key: LAST_OPENED, value: id })
}

export async function getRecentColors(): Promise<string[]> {
  const record = await db.meta.get(RECENT_COLORS)
  const value = record?.value
  return Array.isArray(value) ? value.filter((c): c is string => typeof c === 'string') : []
}

export async function saveRecentColors(colors: readonly string[]): Promise<void> {
  await db.meta.put({ key: RECENT_COLORS, value: [...colors] })
}

export async function getSettings(): Promise<AppSettings> {
  const record = await db.meta.get(SETTINGS)
  const value = record?.value as Partial<AppSettings> | undefined
  return { version: typeof value?.version === 'number' ? value.version : 1 }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.meta.put({ key: SETTINGS, value: settings })
}
