import { beforeEach, describe, expect, it } from 'vitest'
import type { CanvasSpec } from '../canvas/paper'
import { defaultLayers } from '../canvas/layers'
import { TILE_SIZE } from '../canvas/tiles'
import type { Stroke } from '../canvas/stroke'
import { db } from './db'
import {
  DrawingLoadError,
  createDrawing,
  deleteDrawing,
  duplicateDrawing,
  getLastOpened,
  getRecentColors,
  listDrawings,
  loadDrawing,
  renameDrawing,
  saveRecentColors,
  saveSnapshot,
  saveThumbnail,
  setLastOpened,
} from './repository'
import { decodeStroke, encodeStroke, type UiState } from './snapshot'

const spec: CanvasSpec = {
  widthPx: 1240,
  heightPx: 1754,
  dpi: 150,
  widthMm: 210,
  heightMm: 297,
  background: '#ffffff',
}

const ui: UiState = { tool: 'pencil', color: '#ff0000', size: 12, view: { zoom: 0.5, x: 10, y: 20 } }

function stroke(seed: number): Stroke {
  return {
    tool: 'pen',
    color: '#123456',
    size: 8,
    points: [
      { x: seed, y: seed * 2, p: 1 },
      { x: seed + 10.5, y: seed * 2 + 3.25, p: 0.5 },
      { x: seed + 20, y: seed * 2 + 9, p: 0.75 },
    ],
  }
}

function tileBytes(fill: number): ArrayBuffer {
  const bytes = new Uint8Array(TILE_SIZE * TILE_SIZE * 4)
  bytes.fill(fill)
  return bytes.buffer
}

async function save(id: string, seed: number, tiles: { layer: string; tx: number; ty: number; data: ArrayBuffer | null }[] = []) {
  await saveSnapshot(
    id,
    { strokes: [encodeStroke(stroke(seed))], redo: [encodeStroke(stroke(seed + 100))], ui, layers: defaultLayers() },
    tiles,
  )
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('그림 만들기와 목록', () => {
  it('새 그림은 빈 상태로 저장되고 목록에 나온다', async () => {
    const meta = await createDrawing('첫 그림', spec)
    const list = await listDrawings()
    expect(list.map((i) => i.meta.name)).toEqual(['첫 그림'])
    const loaded = await loadDrawing(meta.id)
    expect(loaded.snapshot.strokes).toEqual([])
    expect(loaded.tiles).toEqual([])
    expect(loaded.recovered).toBe(false)
    expect(loaded.meta.spec).toEqual(spec)
  })

  it('목록은 최근에 저장한 그림이 앞에 온다', async () => {
    const a = await createDrawing('A', spec)
    await new Promise((r) => setTimeout(r, 5))
    const b = await createDrawing('B', spec)
    await new Promise((r) => setTimeout(r, 5))
    await save(a.id, 1)
    const list = await listDrawings()
    expect(list.map((i) => i.meta.id)).toEqual([a.id, b.id])
  })
})

describe('저장 후 다시 불러오기', () => {
  it('획, 다시하기 기록, 화면 상태, 타일 픽셀이 그대로 돌아온다', async () => {
    const meta = await createDrawing('그림', spec)
    await save(meta.id, 7, [{ layer: 'L0', tx: 1, ty: 2, data: tileBytes(9) }])

    const loaded = await loadDrawing(meta.id)
    expect(loaded.recovered).toBe(false)
    expect(loaded.snapshot.ui).toEqual(ui)
    expect(loaded.snapshot.strokes.map(decodeStroke)).toEqual([stroke(7)])
    expect(loaded.snapshot.redo.map(decodeStroke)).toEqual([stroke(107)])
    expect(loaded.tiles).toHaveLength(1)
    expect(loaded.tiles[0]).toMatchObject({ tx: 1, ty: 2 })
    expect(new Uint8Array(loaded.tiles[0].data)[0]).toBe(9)
  })

  it('저장하지 않은 타일은 다시 쓰지 않고 이전 것을 그대로 쓴다', async () => {
    const meta = await createDrawing('그림', spec)
    await save(meta.id, 1, [
      { layer: 'L0', tx: 0, ty: 0, data: tileBytes(1) },
      { layer: 'L0', tx: 1, ty: 0, data: tileBytes(2) },
    ])
    await save(meta.id, 2, [{ layer: 'L0', tx: 1, ty: 0, data: tileBytes(3) }])

    const loaded = await loadDrawing(meta.id)
    const byKey = Object.fromEntries(
      loaded.tiles.map((t) => [`${t.tx},${t.ty}`, new Uint8Array(t.data)[0]]),
    )
    expect(byKey).toEqual({ '0,0': 1, '1,0': 3 })
    // 바뀌지 않은 타일은 처음 저장한 버전(1) 그대로다.
    expect(loaded.snapshot.tiles['L0|0,0']).toBe(1)
    expect(loaded.snapshot.tiles['L0|1,0']).toBe(2)
  })

  it('완전히 투명해진 타일(data null)은 저장본에서 빠진다', async () => {
    const meta = await createDrawing('그림', spec)
    await save(meta.id, 1, [{ layer: 'L0', tx: 0, ty: 0, data: tileBytes(1) }])
    await save(meta.id, 2, [{ layer: 'L0', tx: 0, ty: 0, data: null }])
    const loaded = await loadDrawing(meta.id)
    expect(loaded.tiles).toEqual([])
  })

  it('두 저장본이 쓰지 않는 옛 타일은 지운다', async () => {
    const meta = await createDrawing('그림', spec)
    await save(meta.id, 1, [{ layer: 'L0', tx: 0, ty: 0, data: tileBytes(1) }])
    await save(meta.id, 2, [{ layer: 'L0', tx: 0, ty: 0, data: tileBytes(2) }])
    expect(await db.layerTiles.where('drawingId').equals(meta.id).count()).toBe(2)
    await save(meta.id, 3, [{ layer: 'L0', tx: 0, ty: 0, data: tileBytes(3) }])
    // 최신(3)과 직전(2)만 남는다.
    const versions = (await db.layerTiles.where('drawingId').equals(meta.id).toArray()).map((t) => t.v).sort()
    expect(versions).toEqual([2, 3])
  })

  it('여러 그림을 각각 저장하고 서로 섞이지 않는다', async () => {
    const a = await createDrawing('A', spec)
    const b = await createDrawing('B', { ...spec, widthPx: 500 })
    await save(a.id, 1, [{ layer: 'L0', tx: 0, ty: 0, data: tileBytes(11) }])
    await save(b.id, 2, [{ layer: 'L0', tx: 0, ty: 0, data: tileBytes(22) }])
    const la = await loadDrawing(a.id)
    const lb = await loadDrawing(b.id)
    expect(la.snapshot.strokes.map(decodeStroke)).toEqual([stroke(1)])
    expect(lb.snapshot.strokes.map(decodeStroke)).toEqual([stroke(2)])
    expect(new Uint8Array(la.tiles[0].data)[0]).toBe(11)
    expect(new Uint8Array(lb.tiles[0].data)[0]).toBe(22)
    expect(lb.meta.spec.widthPx).toBe(500)
  })

  it('없는 그림에 저장하면 오류가 난다', async () => {
    await expect(save('없는-아이디', 1)).rejects.toThrow()
  })
})

describe('손상된 저장 데이터 복구', () => {
  async function twoSaves() {
    const meta = await createDrawing('그림', spec)
    await save(meta.id, 1, [{ layer: 'L0', tx: 0, ty: 0, data: tileBytes(1) }])
    await save(meta.id, 2, [{ layer: 'L0', tx: 0, ty: 0, data: tileBytes(2) }])
    return meta
  }

  it('최신 저장본의 획 데이터가 깨지면 직전 저장본으로 연다', async () => {
    const meta = await twoSaves()
    const record = (await db.snapshots.get(meta.id))!
    record.current.strokes[0].p[0] = 12345
    await db.snapshots.put(record)

    const loaded = await loadDrawing(meta.id)
    expect(loaded.recovered).toBe(true)
    expect(loaded.snapshot.strokes.map(decodeStroke)).toEqual([stroke(1)])
    expect(new Uint8Array(loaded.tiles[0].data)[0]).toBe(1)
  })

  it('검사값이 어긋나면 직전 저장본으로 연다', async () => {
    const meta = await twoSaves()
    const record = (await db.snapshots.get(meta.id))!
    record.current.checksum += 1
    await db.snapshots.put(record)
    expect((await loadDrawing(meta.id)).recovered).toBe(true)
  })

  it('최신 저장본이 쓰는 타일이 없어지면 직전 저장본으로 연다', async () => {
    const meta = await twoSaves()
    const version = (await db.snapshots.get(meta.id))!.current.tiles['L0|0,0']
    await db.layerTiles.delete([meta.id, 'L0', 0, 0, version])
    const loaded = await loadDrawing(meta.id)
    expect(loaded.recovered).toBe(true)
    expect(new Uint8Array(loaded.tiles[0].data)[0]).toBe(1)
  })

  it('타일 크기가 맞지 않으면 손상으로 본다', async () => {
    const meta = await twoSaves()
    const version = (await db.snapshots.get(meta.id))!.current.tiles['L0|0,0']
    await db.layerTiles.put({ drawingId: meta.id, layer: 'L0', tx: 0, ty: 0, v: version, data: new ArrayBuffer(10) })
    expect((await loadDrawing(meta.id)).recovered).toBe(true)
  })

  it('두 저장본이 모두 깨지면 DrawingLoadError를 던진다', async () => {
    const meta = await twoSaves()
    const record = (await db.snapshots.get(meta.id))!
    record.current.checksum += 1
    if (record.previous) record.previous.checksum += 1
    await db.snapshots.put(record)
    await expect(loadDrawing(meta.id)).rejects.toBeInstanceOf(DrawingLoadError)
  })

  it('복구한 뒤 저장하면(fullTiles) 복구한 상태가 새 최신 저장본이 된다', async () => {
    const meta = await twoSaves()
    const record = (await db.snapshots.get(meta.id))!
    record.current.checksum += 1
    await db.snapshots.put(record)

    const loaded = await loadDrawing(meta.id)
    expect(loaded.recovered).toBe(true)
    await saveSnapshot(
      meta.id,
      { strokes: loaded.snapshot.strokes, redo: loaded.snapshot.redo, ui: loaded.snapshot.ui, layers: defaultLayers() },
      loaded.tiles.map((t) => ({ layer: t.layer, tx: t.tx, ty: t.ty, data: t.data })),
      { fullTiles: true },
    )
    const again = await loadDrawing(meta.id)
    expect(again.recovered).toBe(false)
    expect(new Uint8Array(again.tiles[0].data)[0]).toBe(1)
  })

  it('손상된 최신 저장본이 멀쩡한 직전 저장본을 밀어내지 않는다', async () => {
    const meta = await twoSaves()
    const record = (await db.snapshots.get(meta.id))!
    record.current.checksum += 1
    await db.snapshots.put(record)
    await save(meta.id, 3)
    const after = (await db.snapshots.get(meta.id))!
    expect(after.previous?.strokes.map((s) => decodeStroke(s))).toEqual([stroke(1)])
  })
})

describe('이름 바꾸기·복제·삭제', () => {
  it('이름을 바꾼다', async () => {
    const meta = await createDrawing('옛 이름', spec)
    await renameDrawing(meta.id, '새 이름')
    expect((await listDrawings())[0].meta.name).toBe('새 이름')
  })

  it('복제하면 획과 타일이 같은 새 그림이 생기고 서로 영향이 없다', async () => {
    const meta = await createDrawing('원본', spec)
    await save(meta.id, 5, [{ layer: 'L0', tx: 0, ty: 0, data: tileBytes(5) }])
    await saveThumbnail(meta.id, new Uint8Array([1, 2, 3]).buffer)

    const copy = await duplicateDrawing(meta.id, '원본 복사본')
    expect(copy.id).not.toBe(meta.id)
    const loaded = await loadDrawing(copy.id)
    expect(loaded.snapshot.strokes.map(decodeStroke)).toEqual([stroke(5)])
    expect(new Uint8Array(loaded.tiles[0].data)[0]).toBe(5)

    await deleteDrawing(meta.id)
    expect((await loadDrawing(copy.id)).tiles).toHaveLength(1)
    const list = await listDrawings()
    expect(list).toHaveLength(1)
    expect(list[0].thumbnail).not.toBeNull()
  })

  it('삭제하면 그림, 저장본, 타일, 썸네일이 모두 지워지고 마지막으로 연 그림 표시도 지워진다', async () => {
    const meta = await createDrawing('지울 그림', spec)
    await save(meta.id, 1, [{ layer: 'L0', tx: 0, ty: 0, data: tileBytes(1) }])
    await saveThumbnail(meta.id, new Uint8Array([1]).buffer)
    await setLastOpened(meta.id)

    await deleteDrawing(meta.id)
    expect(await listDrawings()).toEqual([])
    expect(await db.layerTiles.count()).toBe(0)
    expect(await db.snapshots.count()).toBe(0)
    expect(await db.thumbnails.count()).toBe(0)
    expect(await getLastOpened()).toBeNull()
  })
})

describe('앱 설정', () => {
  it('마지막으로 연 그림과 최근 색을 기억한다', async () => {
    expect(await getLastOpened()).toBeNull()
    await setLastOpened('abc')
    expect(await getLastOpened()).toBe('abc')
    await setLastOpened(null)
    expect(await getLastOpened()).toBeNull()

    expect(await getRecentColors()).toEqual([])
    await saveRecentColors(['#111111', '#222222'])
    expect(await getRecentColors()).toEqual(['#111111', '#222222'])
  })
})
