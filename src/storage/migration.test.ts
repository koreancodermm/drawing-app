import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultLayers } from '../canvas/layers'
import { TILE_SIZE } from '../canvas/tiles'
import { AppDatabase } from './db'
import { buildSnapshot, encodeStroke, DEFAULT_UI } from './snapshot'
import { createBackup, restoreBackup } from './backup'
import { createDrawing, loadDrawing, saveSnapshot } from './repository'
import { db } from './db'

const NAME = 'migration-test-db'

afterEach(async () => {
  await Dexie.delete(NAME)
})

describe('저장소 버전 1 → 2 (레이어 도입)', () => {
  it('예전 타일은 모두 첫 레이어(L0)의 타일로 옮겨지고, 예전 저장본도 그대로 열린다', async () => {
    // 버전 1 형식으로 데이터를 만든다(레이어 없음, 타일 키는 "tx,ty").
    const old = new Dexie(NAME)
    old.version(1).stores({
      drawings: 'id, updatedAt',
      snapshots: 'id',
      tiles: '[drawingId+tx+ty+v], drawingId',
      thumbnails: 'id',
      meta: 'key',
    })
    const spec = { widthPx: 600, heightPx: 400, dpi: 150, widthMm: 100, heightMm: 67, background: '#ffffff' }
    const stroke = encodeStroke({
      tool: 'pen',
      color: '#123456',
      size: 6,
      points: [
        { x: 1, y: 2, p: 1 },
        { x: 30, y: 40, p: 1 },
      ],
    })
    const tile = new Uint8Array(TILE_SIZE * TILE_SIZE * 4).fill(7).buffer
    const snapshot = buildSnapshot(3, 1000, [stroke], [], { '1,0': 3 }, { ...DEFAULT_UI, tool: 'pen' })
    await old.table('drawings').add({ id: 'd1', name: '옛 그림', createdAt: 1, updatedAt: 2, spec })
    await old.table('snapshots').add({ id: 'd1', current: snapshot, previous: null })
    await old.table('tiles').add({ drawingId: 'd1', tx: 1, ty: 0, v: 3, data: tile })
    old.close()

    // 새 버전으로 연다.
    const upgraded = new AppDatabase(NAME)
    await upgraded.open()
    const tiles = await upgraded.layerTiles.toArray()
    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toMatchObject({ drawingId: 'd1', layer: 'L0', tx: 1, ty: 0, v: 3 })
    expect(new Uint8Array(tiles[0].data)[0]).toBe(7)
    expect(upgraded.tables.map((t) => t.name)).not.toContain('tiles')
    upgraded.close()
  })
})

describe('예전 저장본(레이어 정보 없음)과 새 저장', () => {
  it('레이어 정보가 없는 저장본을 열 수 있고, 이어서 저장하면 타일 키가 새 형식으로 바뀐다', async () => {
    await db.delete()
    await db.open()
    const meta = await createDrawing('옛', { widthPx: 600, heightPx: 400, dpi: 150, widthMm: 100, heightMm: 67, background: '#fff' })
    // 레이어 도입 전 저장본을 흉내 낸다: layers 필드 없음, 타일 키 "tx,ty".
    const legacy = buildSnapshot(1, 5, [], [], { '0,0': 1 }, { ...DEFAULT_UI })
    const tile = new Uint8Array(TILE_SIZE * TILE_SIZE * 4).fill(9).buffer
    await db.snapshots.put({ id: meta.id, current: legacy, previous: null })
    await db.layerTiles.put({ drawingId: meta.id, layer: 'L0', tx: 0, ty: 0, v: 1, data: tile })

    const loaded = await loadDrawing(meta.id)
    expect(loaded.snapshot.layers).toBeUndefined()
    expect(loaded.tiles).toHaveLength(1)
    expect(loaded.tiles[0].layer).toBe('L0')

    await saveSnapshot(meta.id, { strokes: [], redo: [], ui: legacy.ui, layers: defaultLayers() }, [])
    const record = (await db.snapshots.get(meta.id))!
    expect(Object.keys(record.current.tiles)).toEqual(['L0|0,0'])
    expect(record.current.layers).toEqual(defaultLayers())
    // 이전 타일은 그대로 살아 있다.
    expect((await loadDrawing(meta.id)).tiles).toHaveLength(1)
  })
})

describe('레이어가 여러 장인 그림의 저장·백업', () => {
  it('레이어 구조와 레이어별 타일이 저장과 백업을 거쳐도 그대로다', async () => {
    await db.delete()
    await db.open()
    const meta = await createDrawing('여러 장', { widthPx: 600, heightPx: 400, dpi: 150, widthMm: 100, heightMm: 67, background: '#fff' })
    const layers = [
      ...defaultLayers(),
      { id: 'B', name: '위', visible: false, opacity: 0.4, locked: true },
    ]
    const t = (n: number) => new Uint8Array(TILE_SIZE * TILE_SIZE * 4).fill(n).buffer
    await saveSnapshot(
      meta.id,
      { strokes: [], redo: [], ui: { ...DEFAULT_UI, activeLayer: 'B' }, layers },
      [
        { layer: 'L0', tx: 0, ty: 0, data: t(1) },
        { layer: 'B', tx: 0, ty: 0, data: t(2) },
      ],
    )
    const loaded = await loadDrawing(meta.id)
    expect(loaded.snapshot.layers).toEqual(layers)
    expect(loaded.snapshot.ui.activeLayer).toBe('B')
    const byLayer = Object.fromEntries(loaded.tiles.map((x) => [x.layer, new Uint8Array(x.data)[0]]))
    expect(byLayer).toEqual({ L0: 1, B: 2 })

    const { bytes } = await createBackup([meta.id])
    await db.delete()
    await db.open()
    expect(await restoreBackup(bytes)).toEqual({ imported: 1, failed: 0 })
    const [restored] = await db.drawings.toArray()
    const again = await loadDrawing(restored.id)
    expect(again.snapshot.layers).toEqual(layers)
    expect(Object.fromEntries(again.tiles.map((x) => [x.layer, new Uint8Array(x.data)[0]]))).toEqual({ L0: 1, B: 2 })
  })

  it('한 그림만 골라 .draw 파일(백업 형식)로 만들 수 있다', async () => {
    await db.delete()
    await db.open()
    const spec = { widthPx: 600, heightPx: 400, dpi: 150, widthMm: 100, heightMm: 67, background: '#fff' }
    const a = await createDrawing('A', spec)
    await createDrawing('B', spec)
    const { count } = await createBackup([a.id])
    expect(count).toBe(1)
  })
})
