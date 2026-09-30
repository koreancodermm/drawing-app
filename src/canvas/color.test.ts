import { describe, expect, it } from 'vitest'
import { addRecentColor, hexToHsv, hsvToHex, hsvToRgb, normalizeHex, rgbToHex, rgbToHsv } from './color'

describe('normalizeHex', () => {
  it('여러 형식을 #rrggbb로 바꾼다', () => {
    expect(normalizeHex('#FFAA00')).toBe('#ffaa00')
    expect(normalizeHex('fa0')).toBe('#ffaa00')
    expect(normalizeHex('  #123456 ')).toBe('#123456')
  })

  it('잘못된 값은 null이다', () => {
    expect(normalizeHex('#12')).toBeNull()
    expect(normalizeHex('gggggg')).toBeNull()
    expect(normalizeHex('')).toBeNull()
  })
})

describe('rgbToHex', () => {
  it('0~255를 두 자리 16진수 세 개로 만든다', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000')
    expect(rgbToHex(0, 128, 0)).toBe('#008000')
  })

  it('범위를 벗어난 값은 0~255로 잘라낸다', () => {
    expect(rgbToHex(-10, 300, 127.6)).toBe('#00ff80')
  })
})

describe('rgbToHsv / hsvToRgb', () => {
  it('원색(빨강·초록·파랑)의 색상각이 정확하다', () => {
    expect(rgbToHsv(255, 0, 0)).toMatchObject({ h: 0, s: 1, v: 1 })
    expect(rgbToHsv(0, 255, 0).h).toBeCloseTo(120, 5)
    expect(rgbToHsv(0, 0, 255).h).toBeCloseTo(240, 5)
  })

  it('무채색(흰·검정·회색)은 채도가 0이다', () => {
    expect(rgbToHsv(255, 255, 255)).toEqual({ h: 0, s: 0, v: 1 })
    expect(rgbToHsv(0, 0, 0)).toEqual({ h: 0, s: 0, v: 0 })
    expect(rgbToHsv(128, 128, 128).s).toBe(0)
  })

  it('rgb → hsv → rgb로 되돌리면 원래 값과 같다', () => {
    for (const [r, g, b] of [
      [255, 0, 0],
      [12, 200, 90],
      [10, 20, 30],
      [255, 255, 255],
      [0, 0, 0],
    ]) {
      const { h, s, v } = rgbToHsv(r, g, b)
      expect(hsvToRgb(h, s, v)).toEqual([r, g, b])
    }
  })
})

describe('hexToHsv / hsvToHex', () => {
  it('16진수 색을 hsv로, 다시 16진수로 왕복한다', () => {
    expect(hexToHsv('#ff0000')).toMatchObject({ h: 0, s: 1, v: 1 })
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000')
    expect(hsvToHex(120, 1, 1)).toBe('#00ff00')
  })
})

describe('addRecentColor', () => {
  it('최근 색을 맨 앞에 두고 중복을 없앤다', () => {
    expect(addRecentColor(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111'])
  })

  it('최대 개수를 넘으면 오래된 색을 버린다', () => {
    const list = Array.from({ length: 10 }, (_, i) => `#00000${i}`)
    const next = addRecentColor(list, '#ffffff')
    expect(next).toHaveLength(10)
    expect(next[0]).toBe('#ffffff')
  })
})
