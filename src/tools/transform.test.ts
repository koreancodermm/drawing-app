import { describe, expect, it } from 'vitest'
import { rectRegion, regionBox } from './regions'
import { IDENTITY, applyMatrix, buildTransform, isIdentity, transformRegion } from './transform'

describe('buildTransform', () => {
  it('아무것도 바꾸지 않으면 항등 행렬이다', () => {
    expect(isIdentity(buildTransform(50, 60, 1, 0))).toBe(true)
    expect(isIdentity(IDENTITY)).toBe(true)
    expect(isIdentity(buildTransform(50, 60, 1.1, 0))).toBe(false)
  })

  it('중심점은 크기·회전·뒤집기를 해도 제자리에 있다', () => {
    for (const m of [buildTransform(50, 60, 2, 0), buildTransform(50, 60, 1, Math.PI / 3), buildTransform(50, 60, 0.5, 1, true, true)]) {
      const p = applyMatrix(m, 50, 60)
      expect(p.x).toBeCloseTo(50)
      expect(p.y).toBeCloseTo(60)
    }
  })

  it('크기 200%는 중심에서 거리를 두 배로 만든다', () => {
    const p = applyMatrix(buildTransform(0, 0, 2, 0), 10, 5)
    expect(p).toEqual({ x: 20, y: 10 })
  })

  it('90도 회전은 (1,0)을 (0,1)로 보낸다', () => {
    const p = applyMatrix(buildTransform(0, 0, 1, Math.PI / 2), 1, 0)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(1)
  })

  it('좌우 뒤집기는 x만, 상하 뒤집기는 y만 반대편으로 보낸다', () => {
    const fx = applyMatrix(buildTransform(100, 100, 1, 0, true, false), 130, 120)
    expect(fx.x).toBeCloseTo(70)
    expect(fx.y).toBeCloseTo(120)
    const fy = applyMatrix(buildTransform(100, 100, 1, 0, false, true), 130, 120)
    expect(fy.x).toBeCloseTo(130)
    expect(fy.y).toBeCloseTo(80)
  })
})

describe('transformRegion', () => {
  it('영역의 꼭짓점을 모두 변환한다', () => {
    const region = rectRegion(0, 0, 10, 20)
    const scaled = transformRegion(region, buildTransform(0, 0, 2, 0))
    expect(regionBox(scaled)).toEqual({ x0: 0, y0: 0, x1: 20, y1: 40 })
  })

  it('원본 영역은 바뀌지 않는다', () => {
    const region = rectRegion(0, 0, 10, 20)
    transformRegion(region, buildTransform(5, 5, 3, 1))
    expect(regionBox(region)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 20 })
  })
})
