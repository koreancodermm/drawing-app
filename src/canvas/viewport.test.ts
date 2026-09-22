import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, MIN_ZOOM, clampZoom, fitView, keepVisible, zoomAt } from './viewport'

describe('clampZoom', () => {
  it('10%~800%로 제한한다', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(50)).toBe(MAX_ZOOM)
    expect(clampZoom(2)).toBe(2)
  })
})

describe('zoomAt', () => {
  it('커서 아래의 종이 지점이 그대로 유지된다', () => {
    const view = { zoom: 1, x: 40, y: 30 }
    const next = zoomAt(view, 2, 200, 150)
    const before = { x: (200 - view.x) / view.zoom, y: (150 - view.y) / view.zoom }
    const after = { x: (200 - next.x) / next.zoom, y: (150 - next.y) / next.zoom }
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('최대 배율을 넘지 않는다', () => {
    expect(zoomAt({ zoom: 4, x: 0, y: 0 }, 100, 0, 0).zoom).toBe(MAX_ZOOM)
  })
})

describe('fitView', () => {
  it('종이 전체가 들어오고 가운데에 놓인다', () => {
    const v = fitView(1000, 800, 2000, 1000, 1)
    expect(v.zoom).toBeCloseTo(0.5)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(150)
  })
})

describe('keepVisible', () => {
  it('종이가 화면 밖으로 완전히 나가지 않게 한다', () => {
    const v = keepVisible({ zoom: 1, x: -5000, y: 5000 }, 800, 600, 1000, 1000, 80)
    expect(v.x).toBe(80 - 1000)
    expect(v.y).toBe(600 - 80)
  })
})
