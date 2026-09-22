import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contextOf, installFakeCanvas } from '../test-utils/fakeCanvas'
import { FIRST_LAYER_ID } from './layers'
import { DrawingSession, MAX_UNDO_STEPS } from './session'
import type { Stroke, StrokePoint } from './stroke'
import { TILE_SIZE } from './tiles'

beforeEach(() => {
  installFakeCanvas()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function newSession(width = 1000, height = 1000, maxLayers?: number) {
  const session = new DrawingSession({ width, height, maxLayers })
  const canvas = session.layerCanvas(FIRST_LAYER_ID)!
  return { canvas, session, ctx: contextOf(canvas) }
}

function newStroke(point: StrokePoint, tool = 'ballpoint', opts: Stroke['opts'] = { seed: 1 }): Stroke {
  return { tool, color: '#000000', size: 4, points: [point], opts }
}

function drawLine(session: DrawingSession, y: number, x = 0, layer?: string) {
  const stroke = newStroke({ x, y, p: 1 })
  if (layer) stroke.opts = { ...stroke.opts, layer }
  session.beginStroke(stroke)
  session.extendStroke([{ x: x + 10, y, p: 1 }])
  session.extendStroke([{ x: x + 20, y, p: 1 }])
  return session.endStroke()
}

describe('DrawingSession', () => {
  it('처음에는 레이어 하나가 있다', () => {
    const { session } = newSession()
    expect(session.layers).toHaveLength(1)
    expect(session.layers[0]).toMatchObject({ id: FIRST_LAYER_ID, visible: true, opacity: 1, locked: false })
  })

  it('획을 그리면 되돌리기·다시하기가 켜진다', () => {
    const { session } = newSession()
    expect(session.canUndo).toBe(false)
    drawLine(session, 5)
    expect(session.canUndo).toBe(true)
    expect(session.undo()).toBe(true)
    expect(session.canRedo).toBe(true)
    expect(session.redo()).toBe(true)
    expect(session.canRedo).toBe(false)
  })

  it('획을 그리는 도중에는 되돌리기가 동작하지 않는다', () => {
    const { session } = newSession()
    drawLine(session, 5)
    session.beginStroke(newStroke({ x: 0, y: 9, p: 1 }))
    expect(session.undo()).toBe(false)
    session.cancelStroke()
    expect(session.undo()).toBe(true)
  })

  it('그리던 획을 취소하면 캔버스를 다시 그리고 기록은 늘지 않는다', () => {
    const { session, ctx } = newSession()
    session.beginStroke(newStroke({ x: 0, y: 0, p: 1 }))
    session.extendStroke([{ x: 5, y: 5, p: 1 }])
    const clears = ctx.calls.clearRect ?? 0
    session.cancelStroke()
    expect(ctx.calls.clearRect).toBeGreaterThan(clears)
    expect(session.canUndo).toBe(false)
    expect(session.isDrawing).toBe(false)
  })

  it('한 획을 끝내면 onChange가 불린다', () => {
    const { session } = newSession()
    const onChange = vi.fn()
    session.onChange = onChange
    drawLine(session, 5)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('되돌리기는 최대 100단계이고 그보다 오래된 획은 base 캔버스에 남는다', () => {
    const { session, ctx } = newSession()
    const created: HTMLCanvasElement[] = []
    const original = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = original(tag)
      if (tag === 'canvas') created.push(el as HTMLCanvasElement)
      return el
    })

    for (let i = 0; i < MAX_UNDO_STEPS + 5; i++) drawLine(session, i)

    // 밀려난 5획이 base 캔버스에 그려졌다.
    expect(created).toHaveLength(1)
    expect(contextOf(created[0]).calls.stroke).toBeGreaterThan(0)

    let undos = 0
    while (session.undo()) undos++
    expect(undos).toBe(MAX_UNDO_STEPS)
    expect(session.canUndo).toBe(false)
    // 되돌린 뒤 화면은 base 캔버스를 깔고 다시 그린다.
    expect(ctx.calls.drawImage).toBeGreaterThan(0)

    let redos = 0
    while (session.redo()) redos++
    expect(redos).toBe(MAX_UNDO_STEPS)
  })
})

describe('DrawingSession 저장·복원', () => {
  it('100획 안에서는 base가 바뀌지 않아 저장할 타일이 없다', () => {
    const { session } = newSession()
    for (let i = 0; i < 50; i++) drawLine(session, i * 10)
    expect(session.hasDirtyTiles).toBe(false)
    expect(session.takeDirtyTiles()).toEqual([])
  })

  it('100획을 넘겨 밀려난 획이 닿은 타일만 바뀐 타일이 된다(레이어 이름 포함)', () => {
    const { session } = newSession()
    for (let i = 0; i < 5; i++) drawLine(session, 20 + i * 5, 10)
    for (let i = 0; i < MAX_UNDO_STEPS; i++) drawLine(session, 800 + (i % 10), 800)

    expect(session.hasDirtyTiles).toBe(true)
    const tiles = session.takeDirtyTiles()
    expect(tiles.map((t) => `${t.layer}:${t.tx},${t.ty}`)).toEqual([`${FIRST_LAYER_ID}:0,0`])
    // 가짜 캔버스는 기본이 투명이라 픽셀이 없다고 나온다.
    expect(tiles[0].data).toBeNull()
    expect(session.hasDirtyTiles).toBe(false)
  })

  it('그려진 픽셀이 있는 타일은 TILE_SIZE² RGBA 버퍼로 꺼낸다', () => {
    const { session } = newSession()
    const created: HTMLCanvasElement[] = []
    const original = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = original(tag)
      if (tag === 'canvas') created.push(el as HTMLCanvasElement)
      return el
    })
    for (let i = 0; i < MAX_UNDO_STEPS + 1; i++) drawLine(session, 20, 10)

    // base 캔버스에 그려진 픽셀이 있는 것처럼 가짜 컨텍스트를 채운다.
    expect(created).toHaveLength(1)
    contextOf(created[0]).filled = true
    const tiles = session.takeDirtyTiles()
    expect(tiles).toHaveLength(1)
    expect(tiles[0].data?.byteLength).toBe(TILE_SIZE * TILE_SIZE * 4)
  })

  it('저장에 실패했을 때 markTilesDirty로 바뀜 표시를 되돌릴 수 있다', () => {
    const { session } = newSession()
    for (let i = 0; i < MAX_UNDO_STEPS + 3; i++) drawLine(session, 20, 10)
    const tiles = session.takeDirtyTiles()
    expect(session.hasDirtyTiles).toBe(false)
    session.markTilesDirty(tiles)
    expect(session.takeDirtyTiles().map((t) => `${t.layer}:${t.tx},${t.ty}`)).toEqual(
      tiles.map((t) => `${t.layer}:${t.tx},${t.ty}`),
    )
  })

  it('exportHistory는 되돌리기와 다시하기 기록을 돌려준다', () => {
    const { session } = newSession()
    drawLine(session, 1)
    drawLine(session, 2)
    drawLine(session, 3)
    session.undo()
    const { strokes, redo } = session.exportHistory()
    expect(strokes).toHaveLength(2)
    expect(redo).toHaveLength(1)
  })

  it('restoreState는 타일을 깔고 기록과 레이어 구조를 되살리며 바뀜 표시는 남기지 않는다', () => {
    const { session } = newSession()
    const stroke = (y: number): Stroke => ({
      tool: 'ballpoint',
      color: '#123456',
      size: 4,
      points: [
        { x: 0, y, p: 1 },
        { x: 20, y, p: 1 },
      ],
    })
    session.restoreState({
      layers: [
        { id: FIRST_LAYER_ID, name: '바닥', visible: true, opacity: 1, locked: false },
        { id: 'B', name: '위', visible: false, opacity: 0.5, locked: true },
      ],
      tiles: [
        { layer: FIRST_LAYER_ID, tx: 0, ty: 0, data: new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4) },
        { layer: 'B', tx: 2, ty: 1, data: new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4) },
      ],
      strokes: [stroke(1), stroke(2)],
      redo: [stroke(3)],
    })

    expect(session.layers.map((l) => l.name)).toEqual(['바닥', '위'])
    expect(session.layers[1]).toMatchObject({ visible: false, opacity: 0.5, locked: true })
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(true)
    expect(session.hasDirtyTiles).toBe(false)

    expect(session.undo()).toBe(true)
    expect(session.undo()).toBe(true)
    expect(session.undo()).toBe(false)
    expect(session.redo()).toBe(true)
    expect(session.redo()).toBe(true)
    expect(session.redo()).toBe(true)
    expect(session.redo()).toBe(false)
  })

  it('레이어 정보가 없는 예전 저장본은 레이어 하나로 연다', () => {
    const { session } = newSession()
    session.restoreState({ tiles: [], strokes: [], redo: [] })
    expect(session.layers).toHaveLength(1)
    expect(session.layers[0].id).toBe(FIRST_LAYER_ID)
  })
})

describe('DrawingSession 그리는 방식', () => {
  function withOverlay() {
    const made = newSession()
    const overlay = document.createElement('canvas')
    made.session.setOverlay(overlay)
    return { ...made, overlay, overlayCtx: contextOf(overlay) }
  }

  const path: StrokePoint[] = [
    { x: 10, y: 10, p: 1 },
    { x: 60, y: 40, p: 1 },
    { x: 120, y: 30, p: 1 },
    { x: 180, y: 90, p: 1 },
  ]

  it('형광펜(layer): 그리는 동안은 임시 층에만 그리고, 끝나면 곱하기로 합친 뒤 임시 층을 치운다', () => {
    const { session, ctx, overlay, overlayCtx } = withOverlay()
    session.beginStroke(newStroke(path[0], 'highlighter', { seed: 1, opacity: 0.5 }))
    expect(overlay.style.mixBlendMode).toBe('multiply')
    expect(overlay.style.opacity).toBe('0.5')
    expect(overlay.style.display).toBe('block')
    session.extendStroke(path.slice(1))

    expect(overlayCtx.calls.stroke).toBeGreaterThan(0)
    expect(ctx.calls.stroke ?? 0).toBe(0)
    expect(ctx.calls.drawImage ?? 0).toBe(0)

    session.endStroke()
    expect(ctx.calls.drawImage).toBe(1)
    expect(overlay.style.display).toBe('none')
    expect(overlay.width).toBe(1)
    expect(session.canUndo).toBe(true)
  })

  it('형광펜을 취소하면 캔버스를 다시 그리지 않고 임시 층만 치운다', () => {
    const { session, ctx, overlay } = withOverlay()
    session.beginStroke(newStroke(path[0], 'highlighter', { seed: 1, opacity: 0.5 }))
    session.extendStroke(path.slice(1))
    const clears = ctx.calls.clearRect ?? 0
    session.cancelStroke()
    expect(ctx.calls.clearRect ?? 0).toBe(clears)
    expect(overlay.style.display).toBe('none')
    expect(session.canUndo).toBe(false)
  })

  it('도형(preview): 끌 때마다 임시 층을 지우고 다시 그리며, 끝나면 캔버스에 그린다', () => {
    const { session, ctx, overlayCtx } = withOverlay()
    session.beginStroke(newStroke(path[0], 'rect', { seed: 1, fill: 0, lineStyle: 0 }))
    session.extendStroke([path[1]])
    session.extendStroke([path[2]])
    session.extendStroke([path[3]])
    expect(overlayCtx.calls.clearRect).toBe(3)
    expect(overlayCtx.calls.stroke).toBe(3)
    expect(ctx.calls.stroke ?? 0).toBe(0)

    session.endStroke()
    expect(ctx.calls.stroke).toBe(1)
  })

  it('페인트 통(instant): 끌 때는 아무것도 하지 않고 손을 뗄 때 한 번 적용한다', () => {
    const { session, ctx } = withOverlay()
    session.beginStroke(newStroke(path[0], 'bucket', { seed: 1, tolerance: 24 }))
    session.extendStroke([path[1]])
    expect(ctx.calls.getImageData ?? 0).toBe(0)
    session.endStroke()
    expect(ctx.calls.getImageData).toBeGreaterThan(0)
    expect(session.canUndo).toBe(true)
  })

  it('리노펜(손떨림 보정): 입력을 부드럽게 따라가되 마지막 점은 실제 위치까지 이어 준다', () => {
    const { session } = withOverlay()
    session.beginStroke(newStroke({ x: 0, y: 0, p: 1 }, 'liner', { seed: 1 }))
    session.extendStroke([{ x: 100, y: 0, p: 1 }])
    const stroke = session.endStroke()
    const pts = stroke!.points
    expect(pts[1].x).toBeGreaterThan(0)
    expect(pts[1].x).toBeLessThan(100)
    expect(pts[pts.length - 1]).toMatchObject({ x: 100, y: 0 })
  })

  it('알 수 없는 도구의 획은 시작하지 않는다', () => {
    const { session } = withOverlay()
    session.beginStroke(newStroke(path[0], '없는도구'))
    expect(session.isDrawing).toBe(false)
  })

  it('보이는 레이어를 합친 색(sampleColor)은 캔버스 밖이면 투명이다', () => {
    const { session } = withOverlay()
    expect(session.sampleColor(-5, 10)).toEqual([0, 0, 0, 0])
    expect(session.sampleColor(5000, 10)).toEqual([0, 0, 0, 0])
    expect(session.sampleColor(10, 10)).toEqual([0, 0, 0, 0])
  })

  it('floodRegion은 채울 곳이 있으면 영역을 돌려준다', () => {
    const { session } = withOverlay()
    const region = session.floodRegion(FIRST_LAYER_ID, 10, 10, 24)
    expect(region).not.toBeNull()
    expect(region!.length).toBe(1)
    expect(session.floodRegion('없는레이어', 10, 10, 24)).toBeNull()
  })

  it('저장 후 되살린 획 기록에도 도구 옵션이 그대로 들어 있다', () => {
    const { session } = withOverlay()
    session.beginStroke(newStroke(path[0], 'rect', { seed: 5, fill: 2, color2: '#112233' }))
    session.extendStroke([path[3]])
    session.endStroke()
    const { strokes } = session.exportHistory()
    expect(strokes[0].opts).toMatchObject({ seed: 5, fill: 2, color2: '#112233' })
  })
})

describe('DrawingSession 레이어', () => {
  it('레이어를 추가하면 맨 위에 새 캔버스가 생기고 되돌리기로 사라진다', () => {
    const { session } = newSession()
    const info = session.addLayer()!
    expect(session.layers.map((l) => l.id)).toEqual([FIRST_LAYER_ID, info.id])
    expect(session.layerCanvas(info.id)).not.toBeNull()
    expect(session.orderedLayers()).toHaveLength(2)

    session.undo()
    expect(session.layers).toHaveLength(1)
    expect(session.layerCanvas(info.id)).toBeNull()
    session.redo()
    expect(session.layers).toHaveLength(2)
  })

  it('획은 stroke.opts.layer로 정해진 레이어에만 그려진다', () => {
    const { session, ctx } = newSession()
    const top = session.addLayer()!
    const topCtx = contextOf(session.layerCanvas(top.id)!)
    const before = ctx.calls.stroke ?? 0
    drawLine(session, 10, 0, top.id)
    expect(topCtx.calls.stroke).toBeGreaterThan(0)
    expect(ctx.calls.stroke ?? 0).toBe(before)
  })

  it('레이어 삭제·순서·보이기·불투명도·잠금·이름이 모두 기록에 남고 되돌려진다', () => {
    const { session } = newSession()
    const a = session.addLayer('A')!
    const b = session.addLayer('B')!
    expect(session.applyLayerOperation({ op: 'move', id: b.id, index: 0 })).toBe(true)
    expect(session.layers.map((l) => l.name)).toEqual(['B', '레이어 1', 'A'])
    expect(session.applyLayerOperation({ op: 'set', id: a.id, key: 'visible', value: false })).toBe(true)
    expect(session.applyLayerOperation({ op: 'set', id: a.id, key: 'opacity', value: 0.4 })).toBe(true)
    expect(session.applyLayerOperation({ op: 'set', id: a.id, key: 'locked', value: true })).toBe(true)
    expect(session.applyLayerOperation({ op: 'set', id: a.id, key: 'name', value: '배경' })).toBe(true)
    expect(session.layers.find((l) => l.id === a.id)).toMatchObject({ name: '배경', visible: false, opacity: 0.4, locked: true })
    expect(session.applyLayerOperation({ op: 'delete', id: b.id })).toBe(true)
    expect(session.layers).toHaveLength(2)

    while (session.undo());
    expect(session.layers.map((l) => l.name)).toEqual(['레이어 1'])
    while (session.redo());
    expect(session.layers.map((l) => l.name)).toEqual(['레이어 1', '배경'])
  })

  it('마지막 한 장은 지울 수 없고, 없는 레이어 조작은 무시한다', () => {
    const { session } = newSession()
    expect(session.applyLayerOperation({ op: 'delete', id: FIRST_LAYER_ID })).toBe(false)
    expect(session.applyLayerOperation({ op: 'set', id: '없음', key: 'visible', value: false })).toBe(false)
    expect(session.canUndo).toBe(false)
  })

  it('레이어 수 한도(큰 용지는 더 적게)를 넘으면 추가할 수 없다', () => {
    const { session } = newSession(1000, 1000, 3)
    expect(session.addLayer()).not.toBeNull()
    expect(session.addLayer()).not.toBeNull()
    expect(session.addLayer()).toBeNull()
    expect(session.layers).toHaveLength(3)
  })

  it('삭제한 레이어의 그림도 되돌리면 그대로 살아난다', () => {
    const { session } = newSession()
    const top = session.addLayer()!
    drawLine(session, 10, 0, top.id)
    session.applyLayerOperation({ op: 'delete', id: top.id })
    expect(session.layerCanvas(top.id)).toBeNull()
    session.undo()
    const restored = session.layerCanvas(top.id)!
    expect(restored).not.toBeNull()
    expect(contextOf(restored).calls.stroke).toBeGreaterThan(0)
  })

  it('레이어 조작은 100단계를 넘으면 base 구조에 굳고, 삭제된 레이어의 타일은 저장에서 빠진다', () => {
    const { session } = newSession()
    const gone = session.addLayer('지울 것')!
    drawLine(session, 10, 0, gone.id)
    session.applyLayerOperation({ op: 'delete', id: gone.id })
    // 오래된 조작들이 base로 밀려나도록 획을 100개 더 그린다.
    for (let i = 0; i < MAX_UNDO_STEPS + 2; i++) drawLine(session, 900 + (i % 5), 800)

    expect(session.exportBaseLayers().map((l) => l.id)).toEqual([FIRST_LAYER_ID])
    const tiles = session.takeDirtyTiles()
    const goneTiles = tiles.filter((t) => t.layer === gone.id)
    expect(goneTiles.length).toBeGreaterThan(0)
    expect(goneTiles.every((t) => t.data === null)).toBe(true)
  })

  it('addLayerWithPixels: 그림이 채워진 새 레이어가 생기고, 되돌리면 레이어째 사라진다', () => {
    const { session } = newSession()
    const drawn = vi.fn()
    const info = session.addLayerWithPixels('이미지', 0, drawn)!
    expect(drawn).toHaveBeenCalledTimes(1)
    expect(session.layers.map((l) => l.name)).toEqual(['이미지', '레이어 1'])
    expect(session.hasDirtyTiles).toBe(true)

    session.undo()
    expect(session.layerCanvas(info.id)).toBeNull()
    session.redo()
    // 다시하기하면 base에 굳혀 둔 그림이 그대로 캔버스에 깔린다.
    expect(contextOf(session.layerCanvas(info.id)!).calls.drawImage).toBeGreaterThan(0)
  })

  it('이미지 레이어를 취소한 뒤 새 작업을 하면 남은 base 그림을 치운다', () => {
    const { session } = newSession()
    const info = session.addLayerWithPixels('이미지', undefined, () => {})!
    session.takeDirtyTiles()
    session.undo()
    drawLine(session, 5)
    const tiles = session.takeDirtyTiles()
    expect(tiles.some((t) => t.layer === info.id && t.data === null)).toBe(true)
  })

  it('flatten은 보이는 레이어만 불투명도대로 겹치고 종이 색을 깐다', () => {
    const { session } = newSession()
    const top = session.addLayer()!
    session.applyLayerOperation({ op: 'set', id: top.id, key: 'opacity', value: 0.5 })
    const hidden = session.addLayer()!
    session.applyLayerOperation({ op: 'set', id: hidden.id, key: 'visible', value: false })

    const flat = session.flatten('#ffeecc')
    const fctx = contextOf(flat)
    expect(fctx.calls.fillRect).toBe(1)
    expect(fctx.calls.drawImage).toBe(2) // 숨긴 레이어는 빠진다
    expect(flat.width).toBe(1000)
    // 배경이 없으면(투명 PNG) 종이 색을 깔지 않는다.
    const clear = session.flatten(null)
    expect(contextOf(clear).calls.fillRect ?? 0).toBe(0)
  })

  it('copyRegion은 선택 영역 크기의 캔버스에 복사한다', () => {
    const { session } = newSession()
    const region = [[100, 100, 200, 100, 200, 180, 100, 180]]
    const copy = session.copyRegion(FIRST_LAYER_ID, region)!
    expect(copy).toMatchObject({ x: 100, y: 100 })
    expect(copy.canvas.width).toBe(100)
    expect(copy.canvas.height).toBe(80)
    expect(session.copyRegion('없음', region)).toBeNull()
  })

  it('레이어 구조가 바뀌면 onLayersChange가 불린다', () => {
    const { session } = newSession()
    const changed = vi.fn()
    session.onLayersChange = changed
    session.addLayer()
    session.undo()
    session.redo()
    expect(changed.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})
