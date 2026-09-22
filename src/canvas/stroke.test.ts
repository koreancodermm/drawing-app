import { describe, expect, it } from 'vitest'
import { drawStroke, drawStrokePieces, type Stroke } from './stroke'

function makeRecorder() {
  const log: string[] = []
  const composites: string[] = []
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'stroke', 'fill', 'arc'].includes(prop)) {
        return (...args: number[]) => {
          if (prop === 'stroke' || prop === 'fill') composites.push(String(target.globalCompositeOperation))
          log.push(`${prop}(${args.map((a) => a.toFixed(3)).join(',')})@w${target.lineWidth}`)
        }
      }
      if (prop in target) return target[prop]
      return () => {}
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, log, composites, state }
}

const stroke = (tool: Stroke['tool'], n: number): Stroke => ({
  tool,
  color: '#123456',
  size: 10,
  points: Array.from({ length: n }, (_, i) => ({ x: i * 7, y: Math.sin(i) * 20, p: 0.3 + (i % 3) * 0.3 })),
})

describe('drawStrokePieces', () => {
  it('그리는 도중에 이어 그린 결과와 한 번에 그린 결과가 같다', () => {
    const s = stroke('fountain', 9)
    const live = makeRecorder()
    // n-1개까지 그리다가 마지막에 꼬리 조각을 그린다.
    for (let n = 2; n <= s.points.length; n++) {
      const partial = { ...s, points: s.points.slice(0, n) }
      const drawnBefore = n - 2
      drawStrokePieces(live.ctx, partial, drawnBefore, n - 1)
    }
    drawStrokePieces(live.ctx, s, s.points.length - 1, s.points.length)

    const full = makeRecorder()
    drawStroke(full.ctx, s)
    expect(live.log).toEqual(full.log)
  })

  it('점이 하나면 점(원)을 찍는다', () => {
    const r = makeRecorder()
    drawStroke(r.ctx, stroke('ballpoint', 1))
    expect(r.log.some((l) => l.startsWith('arc('))).toBe(true)
    expect(r.log.some((l) => l.startsWith('fill('))).toBe(true)
  })

  it('지우개는 destination-out으로 그리고 끝나면 원래대로 돌려 놓는다', () => {
    const r = makeRecorder()
    drawStroke(r.ctx, stroke('eraser', 3))
    expect(new Set(r.composites)).toEqual(new Set(['destination-out']))
    expect(r.ctx.globalCompositeOperation).toBe('source-over')
  })

  it('만년필은 필압에 따라 굵기가 달라지고 볼펜은 고정이다', () => {
    const widths = (tool: Stroke['tool']) => {
      const r = makeRecorder()
      drawStroke(r.ctx, stroke(tool, 6))
      return new Set(r.log.filter((l) => l.startsWith('stroke(')).map((l) => l.split('@w')[1]))
    }
    expect(widths('fountain').size).toBeGreaterThan(1)
    expect(widths('ballpoint').size).toBe(1)
  })
})
