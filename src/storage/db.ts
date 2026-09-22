import Dexie, { type Table } from 'dexie'
import type { CanvasSpec } from '../canvas/paper'
import { FIRST_LAYER_ID } from '../canvas/layers'
import type { Snapshot } from './snapshot'

/** 목록에 보여 주는 가벼운 정보. 무거운 저장본은 snapshots에 따로 둔다. */
export interface DrawingMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  spec: CanvasSpec
}

/** current가 최신 저장본, previous가 그 직전 저장본(손상 시 복구용) */
export interface SnapshotRecord {
  id: string
  current: Snapshot
  previous: Snapshot | null
}

export interface TileRecord {
  drawingId: string
  /** 이 타일이 속한 레이어 */
  layer: string
  tx: number
  ty: number
  /** 이 타일이 저장된 저장본 번호 */
  v: number
  /** TILE_SIZE × TILE_SIZE RGBA 원본 픽셀 */
  data: ArrayBuffer
}

export interface ThumbnailRecord {
  id: string
  data: ArrayBuffer
  updatedAt: number
}

export interface MetaRecord {
  key: string
  value: unknown
}

export type TileKey = [string, string, number, number, number]

export class AppDatabase extends Dexie {
  declare drawings: Table<DrawingMeta, string>
  declare snapshots: Table<SnapshotRecord, string>
  declare layerTiles: Table<TileRecord, TileKey>
  declare thumbnails: Table<ThumbnailRecord, string>
  declare meta: Table<MetaRecord, string>

  constructor(name = 'drawing-app') {
    super(name)
    // 버전 1: 레이어가 없던 시절(타일에 레이어 정보 없음)
    this.version(1).stores({
      drawings: 'id, updatedAt',
      snapshots: 'id',
      tiles: '[drawingId+tx+ty+v], drawingId',
      thumbnails: 'id',
      meta: 'key',
    })
    // 버전 2: 타일에 레이어를 붙인다. 예전 타일은 모두 첫 레이어의 것이다.
    this.version(2)
      .stores({
        tiles: null,
        layerTiles: '[drawingId+layer+tx+ty+v], drawingId',
      })
      .upgrade(async (tx) => {
        const old = await tx.table('tiles').toArray()
        if (old.length > 0) {
          await tx.table('layerTiles').bulkAdd(old.map((t: Omit<TileRecord, 'layer'>) => ({ ...t, layer: FIRST_LAYER_ID })))
        }
      })
  }
}

export const db = new AppDatabase()
