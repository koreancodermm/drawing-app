import { beforeEach, describe, expect, it } from 'vitest'
import type { CanvasSpec } from '../canvas/paper'
import type { Stroke } from '../canvas/stroke'
import { defaultLayers } from '../canvas/layers'
import { TILE_SIZE } from '../canvas/tiles'
import { createBackup, gunzip, restoreBackup } from './backup'
import { db } from './db'
import {
  createDrawing,
  getRecentColors,
  listDrawings,
  loadDrawing,
  saveRecentColors,
  saveSnapshot,
  saveThumbnail,
} from './repository'
import { decodeStroke, encodeStroke } from './snapshot'

const spec: CanvasSpec = {
  widthPx: 800,
  heightPx: 600,
  dpi: 96,
  widthMm: 211,
  heightMm: 159,
  background: '#fffaf0',
}

const stroke: Stroke = {
  tool: 'eraser',
  color: '#000000',
  size: 20,
  points: [
    { x: 1, y: 2, p: 1 },
    { x: 30.5, y: 40.25, p: 1 },
  ],
}

async function makeDrawing(name: string, fill: number) {
  const meta = await createDrawing(name, spec)
  const tile = new Uint8Array(TILE_SIZE * TILE_SIZE * 4)
  tile.fill(fill)
  await saveSnapshot(
    meta.id,
    {
      strokes: [encodeStroke(stroke)],
      redo: [],
      ui: { tool: 'eraser', color: '#00ff00', size: 20, view: { zoom: 2, x: 5, y: 6 } },
      layers: defaultLayers(),
    },
    [{ layer: 'L0', tx: 3, ty: 1, data: tile.buffer }],
  )
  await saveThumbnail(meta.id, new Uint8Array([9, 8, 7]).buffer)
  return meta
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('백업', () => {
  it('내보낸 파일을 지운 뒤 불러오면 그림이 그대로 돌아온다', async () => {
    await makeDrawing('풍경', 7)
    await makeDrawing('인물', 8)
    await saveRecentColors(['#abcdef'])

    const { bytes, count, skipped } = await createBackup()
    expect(count).toBe(2)
    expect(skipped).toEqual([])

    await db.delete()
    await db.open()
    expect(await listDrawings()).toEqual([])

    const result = await restoreBackup(bytes)
    expect(result).toEqual({ imported: 2, failed: 0 })

    const list = await listDrawings()
    expect(list.map((i) => i.meta.name).sort()).toEqual(['인물', '풍경'])
    expect(list.every((i) => i.thumbnail !== null)).toBe(true)

    const scenery = list.find((i) => i.meta.name === '풍경')!
    const loaded = await loadDrawing(scenery.meta.id)
    expect(loaded.recovered).toBe(false)
    expect(loaded.meta.spec).toEqual(spec)
    expect(loaded.snapshot.ui.view).toEqual({ zoom: 2, x: 5, y: 6 })
    expect(loaded.snapshot.strokes.map(decodeStroke)).toEqual([stroke])
    expect(loaded.tiles).toHaveLength(1)
    expect(loaded.tiles[0]).toMatchObject({ tx: 3, ty: 1 })
    expect(new Uint8Array(loaded.tiles[0].data)[0]).toBe(7)
    expect(await getRecentColors()).toEqual(['#abcdef'])
  })

  it('이미 있는 그림 위에 불러와도 덮어쓰지 않고 새 그림으로 추가한다', async () => {
    await makeDrawing('풍경', 7)
    const { bytes } = await createBackup()
    await restoreBackup(bytes)
    const list = await listDrawings()
    expect(list).toHaveLength(2)
    expect(new Set(list.map((i) => i.meta.id)).size).toBe(2)
  })

  it('이 앱의 백업 파일이 아니면 오류를 낸다', async () => {
    await expect(restoreBackup(new TextEncoder().encode('{"hello":1}'))).rejects.toThrow(/백업 파일/)
    await expect(restoreBackup(new TextEncoder().encode('이건 json이 아님'))).rejects.toThrow(
      /읽을 수 없습니다/,
    )
  })

  it('내용이 바뀐(손상된) 그림은 건너뛰고 나머지는 불러온다', async () => {
    await makeDrawing('좋은 그림', 1)
    await makeDrawing('깨질 그림', 2)
    const { bytes } = await createBackup()

    // 압축을 풀지 않아도 되도록, 같은 내용을 압축 없는 JSON으로 다시 만든다.
    const text = new TextDecoder().decode(await gunzip(bytes))
    const data = JSON.parse(text)
    // 그림 순서는 아이디 순이라 이름으로 찾는다.
    const target = data.drawings.find((d: { meta: { name: string } }) => d.meta.name === '깨질 그림')
    target.snapshot.checksum += 1
    const tampered = new TextEncoder().encode(JSON.stringify(data))

    await db.delete()
    await db.open()
    const result = await restoreBackup(tampered)
    expect(result).toEqual({ imported: 1, failed: 1 })
    expect((await listDrawings()).map((i) => i.meta.name)).toEqual(['좋은 그림'])
  })
})
