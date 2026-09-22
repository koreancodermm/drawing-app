import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Stroke } from '../canvas/stroke'
import { contextOf, installFakeCanvas } from '../test-utils/fakeCanvas'
import { createRecorder } from '../test-utils/memCanvas'
import { drawStroke, drawStrokePieces } from './draw'
import { rectRegion } from './regions'
import { VISIBLE_TOOLS, getTool } from './registry'
import { makeStroke } from './settings'

beforeEach(() => installFakeCanvas())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const env = { seed: 42, cx: 32, cy: 32, dpi: 150, clip: rectRegion(2, 2, 60, 60), color2: '#3366ff' }

function sample(toolId: string, extra: Stroke['opts'] = {}): Stroke {
  const def = getTool(toolId)!
  const stroke = makeStroke(def, '#e03131', undefined, { x: 10, y: 12, p: 0.4 }, env)
  const pts = [
    [16, 20, 0.6],
    [24, 30, 0.9],
    [34, 36, 0.7],
    [44, 30, 0.5],
    [52, 44, 0.8],
  ]
  for (const [x, y, p] of pts) stroke.points.push({ x, y, p })
  stroke.opts = { ...stroke.opts, ...extra }
  if (toolId === 'text') stroke.opts = { ...stroke.opts, text: '안녕 abc' }
  return stroke
}

// 그림을 바꾸지 않는 도구(선택·스포이드·손 도구)
const NON_DRAWING = new Set(['eyedropper', 'rectselect', 'lasso', 'wand', 'hand'])

describe('모든 도구가 그려진다', () => {
  for (const def of VISIBLE_TOOLS.filter((t) => !NON_DRAWING.has(t.id))) {
    it(`${def.label}(${def.id})`, () => {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const ctx = contextOf(canvas)
      expect(() => drawStroke(ctx, sample(def.id))).not.toThrow()
      const total = Object.values(ctx.calls).reduce((a, b) => a + b, 0)
      expect(total).toBeGreaterThan(0)
    })
  }

  it('그림을 바꾸지 않는 도구는 엔진이 없다', () => {
    for (const id of NON_DRAWING) expect(getTool(id)?.engine).toBe('none')
  })

  it('모르는 도구의 획은 무시한다', () => {
    const canvas = document.createElement('canvas')
    const ctx = contextOf(canvas)
    drawStroke(ctx, { tool: '없는도구', color: '#000', size: 4, points: [{ x: 1, y: 1, p: 1 }] })
    expect(Object.keys(ctx.calls)).toHaveLength(0)
  })
})

describe('다시 그려도 똑같다(질감 난수 씨앗)', () => {
  const clone = (s: Stroke): Stroke => ({ ...s, points: s.points.map((p) => ({ ...p })), opts: { ...s.opts } })

  for (const id of ['pencil', 'colorpencil', 'crayon', 'charcoal', 'pastel', 'oil', 'texture', 'watercolor', 'calligraphy']) {
    it(`${getTool(id)!.label}: 같은 획은 같은 그리기 동작이 나온다`, () => {
      const s = sample(id)
      delete s.opts!.clip
      const a = createRecorder()
      const b = createRecorder()
      drawStroke(a.ctx, clone(s))
      drawStroke(b.ctx, clone(s))
      expect(a.draws.length).toBeGreaterThan(5)
      expect(b.draws).toEqual(a.draws)
    })

    it(`${getTool(id)!.label}: 그리는 도중에 이어 그린 것과 한 번에 그린 것이 같다`, () => {
      const full = sample(id)
      delete full.opts!.clip
      const a = createRecorder()
      drawStroke(a.ctx, clone(full))

      // 세션처럼 점을 하나씩 늘리며 안전한 조각까지 그리고, 끝에서 남은 조각을 그린다.
      const b = createRecorder()
      const live = clone(full)
      const all = live.points
      live.points = [all[0]]
      let drawn = 0
      for (let n = 2; n <= all.length; n++) {
        live.points.push(all[n - 1])
        const safe = n - 1
        drawStrokePieces(b.ctx, live, drawn, safe)
        drawn = safe
      }
      drawStrokePieces(b.ctx, live, drawn, live.points.length)
      expect(a.draws.length).toBeGreaterThan(5)
      expect(b.draws).toEqual(a.draws)
    })
  }

  it('씨앗이 다르면 질감이 다르다', () => {
    const a = sample('crayon')
    const b = sample('crayon')
    b.opts = { ...b.opts, seed: 7 }
    delete a.opts!.clip
    delete b.opts!.clip
    const ra = createRecorder()
    const rb = createRecorder()
    drawStroke(ra.ctx, a)
    drawStroke(rb.ctx, b)
    expect(rb.draws).not.toEqual(ra.draws)
  })
})

describe('선택 영역', () => {
  it('선택 영역이 있으면 clip으로 제한해서 그린다', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = contextOf(canvas)
    drawStroke(ctx, sample('ballpoint'))
    expect(ctx.calls.clip).toBeGreaterThan(0)
  })

  it('선택 영역이 없으면 clip을 쓰지 않는다', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = contextOf(canvas)
    const s = sample('ballpoint')
    delete s.opts!.clip
    drawStroke(ctx, s)
    expect(ctx.calls.clip ?? 0).toBe(0)
  })
})

describe('네모 지우개', () => {
  it('둥근 지우개는 선으로, 네모 지우개는 도장(fillRect)으로 지운다', () => {
    const round = createRecorder()
    const square = createRecorder()
    const r = sample('eraser', { eraserShape: 0 })
    const q = sample('eraser', { eraserShape: 1 })
    delete r.opts!.clip
    delete q.opts!.clip
    drawStroke(round.ctx, r)
    drawStroke(square.ctx, q)
    expect(round.log.some((l) => l.startsWith('stroke('))).toBe(true)
    expect(square.log.some((l) => l.startsWith('fillRect('))).toBe(true)
    expect(square.log).toContain('globalCompositeOperation=destination-out')
  })
})

describe('대칭 그리기', () => {
  const strokes = (id: string, opts: Stroke['opts']) => {
    const s = sample(id, opts)
    delete s.opts!.clip
    const r = createRecorder()
    drawStroke(r.ctx, s)
    return r.log.filter((l) => l.startsWith('stroke(')).length
  }

  it('좌우 대칭은 두 배, 6방향은 여섯 배, 8방향은 여덟 배로 그린다', () => {
    const one = strokes('ballpoint', {})
    expect(strokes('mirror', { symmetry: 0 })).toBe(one * 2)
    expect(strokes('mirror', { symmetry: 1 })).toBe(one * 2)
    expect(strokes('mirror', { symmetry: 2 })).toBe(one * 4)
    expect(strokes('mirror', { symmetry: 3 })).toBe(one * 6)
    expect(strokes('mirror', { symmetry: 4 })).toBe(one * 8)
  })
})

describe('임시 층(형광펜·사인펜·마커)', () => {
  it('임시 캔버스에 그려서 곱하기/불투명도로 합친다', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const rec = createRecorder()
    ;(rec.ctx as unknown as { canvas: unknown }).canvas = canvas
    const s = sample('highlighter')
    delete s.opts!.clip
    drawStroke(rec.ctx, s)
    expect(rec.log).toContain('globalCompositeOperation=multiply')
    expect(rec.log.some((l) => l.startsWith('globalAlpha=0.500'))).toBe(true)
    expect(rec.log.some((l) => l.startsWith('drawImage('))).toBe(true)
  })
})
