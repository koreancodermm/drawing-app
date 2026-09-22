import { describe, expect, it } from 'vitest'
import type { Stroke } from '../canvas/stroke'
import { strokeBounds } from './bounds'
import { rectRegion } from './regions'

const W = 1000
const H = 800

function stroke(tool: string, points: [number, number][], size = 10, opts: Stroke['opts'] = {}): Stroke {
  return { tool, color: '#000000', size, points: points.map(([x, y]) => ({ x, y, p: 1 })), opts }
}

describe('strokeBounds', () => {
  it('선은 점 범위에 굵기의 절반과 여유 2px를 더한다', () => {
    const b = strokeBounds(stroke('ballpoint', [[100, 200], [150, 260]]), W, H)
    expect(b).toEqual({ x0: 93, y0: 193, x1: 157, y1: 267 })
  })

  it('점이 없거나 없는 도구면 null이다', () => {
    expect(strokeBounds(stroke('ballpoint', []), W, H)).toBeNull()
    expect(strokeBounds(stroke('없는도구', [[1, 1]]), W, H)).toBeNull()
  })

  it('캔버스 밖으로 나가지 않게 자른다', () => {
    const b = strokeBounds(stroke('ballpoint', [[-50, -50], [5, 5]]), W, H)
    expect(b).toMatchObject({ x0: 0, y0: 0 })
    expect(b!.x1).toBeLessThan(20)
  })

  it('다각형·별은 가운데에서 반지름만큼 사방으로 넓다', () => {
    const b = strokeBounds(stroke('polygon', [[500, 400], [560, 400]], 4), W, H)!
    expect(b.x0).toBeLessThanOrEqual(500 - 60)
    expect(b.x1).toBeGreaterThanOrEqual(500 + 60)
    expect(b.y0).toBeLessThanOrEqual(400 - 60)
    expect(b.y1).toBeGreaterThanOrEqual(400 + 60)
  })

  it('채우기는 범위를 알 수 없으므로 캔버스 전체다', () => {
    expect(strokeBounds(stroke('bucket', [[10, 10]], 1), W, H)).toEqual({ x0: 0, y0: 0, x1: W, y1: H })
  })

  it('대칭 그리기는 반대편에도 그려지므로 캔버스 전체다', () => {
    expect(strokeBounds(stroke('mirror', [[10, 10], [20, 20]], 4, { symmetry: 0 }), W, H)).toEqual({ x0: 0, y0: 0, x1: W, y1: H })
  })

  it('선택 영역이 있으면 그 안으로 제한한다', () => {
    const clip = rectRegion(100, 100, 200, 200)
    const b = strokeBounds(stroke('ballpoint', [[50, 150], [400, 150]], 10, { clip }), W, H)!
    expect(b).toEqual({ x0: 100, y0: 143, x1: 200, y1: 157 })
  })

  it('이동은 원래 영역과 옮긴 영역을 모두 포함한다', () => {
    const clip = rectRegion(100, 100, 200, 200)
    const b = strokeBounds(stroke('move', [[150, 150], [350, 170]], 1, { clip }), W, H)!
    expect(b).toEqual({ x0: 100, y0: 100, x1: 400, y1: 220 })
  })

  it('선택 영역 지우기는 선택 영역 범위다', () => {
    const clip = rectRegion(10, 20, 30, 40)
    expect(strokeBounds(stroke('_clear', [[0, 0], [0, 0]], 1, { clip }), W, H)).toEqual({ x0: 10, y0: 20, x1: 30, y1: 40 })
  })

  it('글자는 글자 수와 크기에 비례해 오른쪽으로 넓다', () => {
    const short = strokeBounds(stroke('text', [[10, 10]], 40, { text: '가' }), W, H)!
    const long = strokeBounds(stroke('text', [[10, 10]], 40, { text: '가나다라마바' }), W, H)!
    expect(long.x1).toBeGreaterThan(short.x1)
  })

  it('스티커는 누른 곳 둘레를 감싼다', () => {
    const b = strokeBounds(stroke('sticker', [[500, 400]], 100), W, H)!
    expect(b.x0).toBeLessThan(450)
    expect(b.x1).toBeGreaterThan(550)
  })
})
