import { describe, expect, it } from 'vitest'
import { addRecentColor, normalizeHex } from './color'

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
