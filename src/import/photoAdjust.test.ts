import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ADJUSTMENTS,
  applyAdjustments,
  buildAdjustLUTs,
  grayWorldWhiteBalance,
  isIdentity,
  type PhotoAdjustments,
} from './photoAdjust'

describe('isIdentity', () => {
  it('기본값은 항등(아무것도 안 바꿈)이다', () => {
    expect(isIdentity(DEFAULT_ADJUSTMENTS)).toBe(true)
  })

  it('하나라도 바뀌면 항등이 아니다', () => {
    expect(isIdentity({ ...DEFAULT_ADJUSTMENTS, exposureEv: 0.1 })).toBe(false)
    expect(isIdentity({ ...DEFAULT_ADJUSTMENTS, shadows: 1 })).toBe(false)
  })
})

describe('buildAdjustLUTs', () => {
  it('기본값의 표는 0~255를 그대로 되돌린다(항등 표)', () => {
    const luts = buildAdjustLUTs(DEFAULT_ADJUSTMENTS)
    for (let v = 0; v < 256; v++) {
      expect(luts.r[v]).toBe(v)
      expect(luts.g[v]).toBe(v)
      expect(luts.b[v]).toBe(v)
    }
  })

  it('노출을 1스톱 올리면 중간 밝기가 대략 두 배가 된다(255에서 잘림)', () => {
    const luts = buildAdjustLUTs({ ...DEFAULT_ADJUSTMENTS, exposureEv: 1 })
    expect(luts.r[50]).toBeCloseTo(100, -1)
    expect(luts.r[200]).toBe(255) // 넘치면 흰색으로 잘린다
  })

  it('빨강 배수를 올리면 빨강 채널만 밝아지고 초록·파랑은 그대로다', () => {
    const luts = buildAdjustLUTs({ ...DEFAULT_ADJUSTMENTS, wbR: 1.5 })
    expect(luts.r[100]).toBeGreaterThan(100)
    expect(luts.g[100]).toBe(100)
    expect(luts.b[100]).toBe(100)
  })

  it('검정점·흰점(레벨)은 그 사이 값을 0~255로 늘린다', () => {
    const luts = buildAdjustLUTs({ ...DEFAULT_ADJUSTMENTS, blackPoint: 50, whitePoint: 200 })
    expect(luts.r[50]).toBe(0)
    expect(luts.r[200]).toBe(255)
    expect(luts.r[125]).toBeGreaterThan(120)
    expect(luts.r[125]).toBeLessThan(135)
  })

  it('감마를 올리면 중간 톤이 밝아지되 검정·흰색 끝은 그대로다', () => {
    const luts = buildAdjustLUTs({ ...DEFAULT_ADJUSTMENTS, gamma: 2 })
    expect(luts.r[0]).toBe(0)
    expect(luts.r[255]).toBe(255)
    expect(luts.r[64]).toBeGreaterThan(64)
  })

  it('어두운 영역을 올리면 어두운 값만 밝아지고 밝은 값은 그대로다', () => {
    const luts = buildAdjustLUTs({ ...DEFAULT_ADJUSTMENTS, shadows: 50 })
    expect(luts.r[10]).toBeGreaterThan(10)
    expect(luts.r[255]).toBe(255)
  })

  it('밝은 영역을 내리면 밝은 값만 어두워지고 어두운 값은 그대로다', () => {
    const luts = buildAdjustLUTs({ ...DEFAULT_ADJUSTMENTS, highlights: -50 })
    expect(luts.r[245]).toBeLessThan(245)
    expect(luts.r[0]).toBe(0)
  })
})

describe('applyAdjustments', () => {
  it('항등이면 픽셀을 건드리지 않는다', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128])
    applyAdjustments(data, DEFAULT_ADJUSTMENTS)
    expect([...data]).toEqual([10, 20, 30, 255, 40, 50, 60, 128])
  })

  it('알파 채널은 절대 바꾸지 않는다', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 77])
    const adj: PhotoAdjustments = { ...DEFAULT_ADJUSTMENTS, exposureEv: 2 }
    applyAdjustments(data, adj)
    expect(data[3]).toBe(77)
  })
})

describe('grayWorldWhiteBalance', () => {
  it('한쪽으로 치우친 색을 회색 평균이 되게 하는 배수를 찾는다', () => {
    // 빨강이 유난히 강한 사진(평균 R=200, G=100, B=100) → 빨강 배수는 1보다 작아야 한다.
    const n = 100
    const data = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n; i++) {
      data[i * 4] = 200
      data[i * 4 + 1] = 100
      data[i * 4 + 2] = 100
      data[i * 4 + 3] = 255
    }
    const wb = grayWorldWhiteBalance(data)
    expect(wb.wbR).toBeLessThan(1)
    expect(wb.wbG).toBeGreaterThan(1)
    expect(wb.wbB).toBeGreaterThan(1)
    expect(wb.wbG).toBeCloseTo(wb.wbB, 5)
  })

  it('완전히 투명한 이미지는 배수를 1로 둔다(0으로 나누지 않는다)', () => {
    const data = new Uint8ClampedArray(16)
    expect(grayWorldWhiteBalance(data)).toEqual({ wbR: 1, wbG: 1, wbB: 1 })
  })
})
