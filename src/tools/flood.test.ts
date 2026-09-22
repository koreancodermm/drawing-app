import { describe, expect, it } from 'vitest'
import { dilate, floodMask } from './flood'
import { maskToRegion, rectRegion, regionBox, regionContains, simplifyPolygon, translateRegion } from './regions'

/** 가로 w, 세로 h, 불투명 검정 테두리 사각형(x0..x1, y0..y1)이 있는 픽셀 배열 */
function bordered(w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x === x0 || x === x1 || y === y0 || y === y1) d[(y * w + x) * 4 + 3] = 255
    }
  }
  return d
}

describe('floodMask', () => {
  it('테두리 안쪽 빈 영역만 찾는다', () => {
    const d = bordered(20, 20, 5, 5, 14, 14)
    const r = floodMask(d, 20, 20, 10, 10, 10)
    expect(r.count).toBe(8 * 8)
    expect(r.box).toEqual({ x0: 6, y0: 6, x1: 13, y1: 13 })
    expect(r.mask[10 * 20 + 10]).toBe(1)
    expect(r.mask[2 * 20 + 2]).toBe(0)
    expect(r.mask[5 * 20 + 5]).toBe(0)
  })

  it('테두리 밖을 누르면 바깥 영역 전체를 찾는다', () => {
    const d = bordered(20, 20, 5, 5, 14, 14)
    const r = floodMask(d, 20, 20, 0, 0, 10)
    expect(r.count).toBe(20 * 20 - 10 * 10)
  })

  it('테두리에 틈이 있으면 안팎이 이어진다', () => {
    const d = bordered(20, 20, 5, 5, 14, 14)
    d[(5 * 20 + 9) * 4 + 3] = 0 // 윗변에 구멍
    const r = floodMask(d, 20, 20, 10, 10, 10)
    expect(r.count).toBe(20 * 20 - 35) // 테두리 36픽셀 중 구멍 하나만 빠진다
    expect(r.mask[0]).toBe(1)
    expect(r.mask[10 * 20 + 10]).toBe(1)
  })

  it('민감도(tolerance)가 크면 비슷한 색까지 함께 찾는다', () => {
    const d = new Uint8ClampedArray(4 * 1 * 4)
    for (let x = 0; x < 4; x++) {
      d[x * 4] = 100 + x * 10
      d[x * 4 + 3] = 255
    }
    expect(floodMask(d, 4, 1, 0, 0, 5).count).toBe(1)
    expect(floodMask(d, 4, 1, 0, 0, 15).count).toBe(2)
    expect(floodMask(d, 4, 1, 0, 0, 40).count).toBe(4)
  })

  it('contiguous=false면 떨어져 있어도 같은 색이면 모두 찾는다', () => {
    const d = bordered(20, 20, 5, 5, 14, 14)
    const r = floodMask(d, 20, 20, 10, 10, 10, false)
    expect(r.count).toBe(20 * 20 - 36) // 테두리 36픽셀만 다른 색
  })

  it('범위 밖을 누르면 아무것도 찾지 않는다', () => {
    const d = new Uint8ClampedArray(16)
    expect(floodMask(d, 2, 2, 5, 5, 0).box).toBeNull()
  })
})

describe('dilate', () => {
  it('영역을 사방으로 한 픽셀 넓힌다', () => {
    const mask = new Uint8Array(25)
    mask[12] = 1
    const out = dilate(mask, 5, 5)
    expect([...out].reduce((a, b) => a + b, 0)).toBe(5)
    expect(out[7]).toBe(1)
    expect(out[11]).toBe(1)
    expect(out[13]).toBe(1)
    expect(out[17]).toBe(1)
    expect(out[6]).toBe(0)
  })
})

describe('영역(region)', () => {
  it('maskToRegion은 같은 모양으로 이어진 줄을 직사각형 하나로 합친다', () => {
    const w = 6
    const h = 5
    const mask = new Uint8Array(w * h)
    for (let y = 1; y < 4; y++) for (let x = 2; x < 5; x++) mask[y * w + x] = 1
    const region = maskToRegion(mask, w, h)
    expect(region).toHaveLength(1)
    expect(regionBox(region)).toEqual({ x0: 2, y0: 1, x1: 5, y1: 4 })
  })

  it('L자 모양은 직사각형 두 개가 되고 안쪽 판정이 맞는다', () => {
    const w = 6
    const h = 6
    const mask = new Uint8Array(w * h)
    for (let y = 0; y < 4; y++) mask[y * w + 1] = 1
    for (let x = 1; x < 5; x++) mask[3 * w + x] = 1
    const region = maskToRegion(mask, w, h)
    expect(region.length).toBeGreaterThanOrEqual(2)
    expect(regionContains(region, 1.5, 0.5)).toBe(true)
    expect(regionContains(region, 3.5, 3.5)).toBe(true)
    expect(regionContains(region, 3.5, 0.5)).toBe(false)
  })

  it('원점 이동값(ox, oy)만큼 밀어서 만든다', () => {
    const mask = new Uint8Array([1])
    expect(maskToRegion(mask, 1, 1, 10, 20)).toEqual([[10, 20, 11, 20, 11, 21, 10, 21]])
  })

  it('rectRegion과 regionContains, translateRegion', () => {
    const r = rectRegion(50, 60, 10, 20)
    expect(regionBox(r)).toEqual({ x0: 10, y0: 20, x1: 50, y1: 60 })
    expect(regionContains(r, 30, 40)).toBe(true)
    expect(regionContains(r, 5, 40)).toBe(false)
    const moved = translateRegion(r, 100, -10)
    expect(regionBox(moved)).toEqual({ x0: 110, y0: 10, x1: 150, y1: 50 })
  })

  it('simplifyPolygon은 너무 가까운 점을 솎아 낸다', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: i * 0.5, y: 0 }))
    const out = simplifyPolygon(pts, 2)
    expect(out.length / 2).toBeLessThan(10)
  })
})
