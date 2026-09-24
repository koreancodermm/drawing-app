import { describe, expect, it } from 'vitest'
import { cmykToRgb, rgbToCmyk, rgbaToCmykBytes, softProofRgb } from './cmyk'

describe('rgbToCmyk / cmykToRgb', () => {
  it('검정(0,0,0)은 K=1, 나머지 0', () => {
    expect(rgbToCmyk(0, 0, 0)).toEqual({ c: 0, m: 0, y: 0, k: 1 })
  })

  it('흰색(255,255,255)은 모두 0(K도 0)', () => {
    const c = rgbToCmyk(255, 255, 255)
    expect(c.k).toBeCloseTo(0, 5)
    expect(c.c).toBeCloseTo(0, 5)
    expect(c.m).toBeCloseTo(0, 5)
    expect(c.y).toBeCloseTo(0, 5)
  })

  it('순수한 빨강은 잉크로 마젠타+노랑을 섞은 것과 같다(C=0, M=Y=1)', () => {
    const c = rgbToCmyk(255, 0, 0)
    expect(c.k).toBeCloseTo(0, 5)
    expect(c.c).toBeCloseTo(0, 5)
    expect(c.m).toBeCloseTo(1, 5)
    expect(c.y).toBeCloseTo(1, 5)
  })

  it('되돌리면 원래 색과 거의 같다(왕복 변환)', () => {
    for (const [r, g, b] of [
      [10, 200, 90],
      [255, 128, 0],
      [12, 34, 56],
    ]) {
      const back = cmykToRgb(rgbToCmyk(r, g, b))
      expect(back.r).toBeCloseTo(r, -1)
      expect(back.g).toBeCloseTo(g, -1)
      expect(back.b).toBeCloseTo(b, -1)
    }
  })
})

describe('softProofRgb', () => {
  it('알파는 그대로 두고 RGB만 왕복 변환한다', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 200])
    softProofRgb(data)
    expect(data[3]).toBe(200)
    expect(data[0]).toBeCloseTo(255, -1)
  })
})

describe('rgbaToCmykBytes', () => {
  it('불투명 검정 한 픽셀은 C,M,Y=0, K=255', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255])
    const out = rgbaToCmykBytes(data, 1)
    expect([...out]).toEqual([0, 0, 0, 255])
  })

  it('완전히 투명한 픽셀은 흰 종이 위에 놓인 것으로 본다(전부 0)', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 0])
    const out = rgbaToCmykBytes(data, 1)
    expect([...out]).toEqual([0, 0, 0, 0])
  })

  it('픽셀 수만큼 4바이트씩 만든다', () => {
    const data = new Uint8ClampedArray(3 * 4)
    const out = rgbaToCmykBytes(data, 3)
    expect(out.length).toBe(12)
  })
})
