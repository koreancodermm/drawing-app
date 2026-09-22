import { describe, expect, it } from 'vitest'
import type { Stroke } from '../../canvas/stroke'
import { walkStamps, type StampPos } from './walk'

function stroke(points: { x: number; y: number }[]): Stroke {
  return { tool: 'pencil', color: '#000000', size: 10, points: points.map((p) => ({ ...p, p: 1 })) }
}

function collect(s: Stroke, from: number, to: number, spacing: number): StampPos[] {
  const out: StampPos[] = []
  walkStamps(s, from, to, spacing, (pos) => out.push({ ...pos }))
  return out
}

describe('walkStamps', () => {
  it('직선을 따라 일정한 간격으로 도장 위치를 정한다', () => {
    const s = stroke([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ])
    const stamps = collect(s, 0, s.points.length, 10)
    expect(stamps[0].x).toBeCloseTo(0)
    expect(stamps.length).toBeGreaterThanOrEqual(10)
    expect(stamps.length).toBeLessThanOrEqual(11)
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i].x - stamps[i - 1].x).toBeGreaterThan(8.9)
      expect(stamps[i].x - stamps[i - 1].x).toBeLessThan(11.1)
      expect(stamps[i].index).toBe(i)
    }
  })

  it('점이 하나면 도장 하나만 찍는다', () => {
    const s = stroke([{ x: 5, y: 6 }])
    const stamps = collect(s, 0, 1, 10)
    expect(stamps).toHaveLength(1)
    expect(stamps[0]).toMatchObject({ x: 5, y: 6, index: 0 })
  })

  it('붓이 움직이는 방향과 이전 도장 위치를 알려 준다', () => {
    const s = stroke([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 0, y: 80 },
    ])
    const stamps = collect(s, 0, s.points.length, 10)
    const second = stamps[1]
    expect(second.dirY).toBeGreaterThan(0.99)
    expect(second.prevY).toBeCloseTo(stamps[0].y)
  })

  it('그리는 도중에 이어서 얻은 위치가 처음부터 한 번에 얻은 위치와 같다', () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ x: i * 6, y: 20 + Math.sin(i / 3) * 15 }))
    const full = collect(stroke(pts), 0, pts.length, 7)

    // 세션이 하는 것처럼 점을 하나씩 늘리며 안전한 조각까지만 이어서 처리한다.
    const live = stroke([pts[0]])
    const got: StampPos[] = []
    let drawn = 0
    for (let n = 2; n <= pts.length; n++) {
      live.points.push({ ...pts[n - 1], p: 1 })
      const safe = n - 1
      walkStamps(live, drawn, safe, 7, (pos) => got.push({ ...pos }))
      drawn = safe
    }
    walkStamps(live, drawn, live.points.length, 7, (pos) => got.push({ ...pos }))

    expect(got).toHaveLength(full.length)
    got.forEach((g, i) => {
      expect(g.x).toBeCloseTo(full[i].x, 6)
      expect(g.y).toBeCloseTo(full[i].y, 6)
      expect(g.index).toBe(full[i].index)
    })
  })

  it('from이 0이면 처음부터 다시 시작한다(같은 획을 다시 그려도 결과가 같다)', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 60, y: 30 },
      { x: 120, y: 0 },
    ]
    const s = stroke(pts)
    const a = collect(s, 0, 3, 8)
    const b = collect(s, 0, 3, 8)
    expect(b).toEqual(a)
  })
})
