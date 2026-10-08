import { describe, expect, it } from 'vitest'
import { paperGrain, tooth, valueNoise, washCloud } from './grain'

describe('종이 결(paperGrain)', () => {
  it('항상 0~1 사이이고, 같은 자리는 언제나 같은 값이다', () => {
    for (let i = 0; i < 400; i++) {
      const x = (i * 7.31) % 500 - 100
      const y = (i * 3.77) % 500 - 100
      const g = paperGrain(x, y)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(1)
      expect(paperGrain(x, y)).toBe(g)
    }
  })

  it('가까운 자리는 비슷하고(부드럽게 이어짐) 먼 자리는 다르다', () => {
    let near = 0
    let far = 0
    const n = 300
    for (let i = 0; i < n; i++) {
      const x = i * 5.3
      const y = i * 2.9
      near += Math.abs(paperGrain(x, y) - paperGrain(x + 0.2, y))
      far += Math.abs(paperGrain(x, y) - paperGrain(x + 37.7, y + 19.3))
    }
    expect(near / n).toBeLessThan(far / n / 2)
  })

  it('값이 고르게 퍼져 있다(평균이 0.5 근처, 솟은 곳과 움푹한 곳이 모두 있다)', () => {
    let sum = 0
    let lo = 1
    let hi = 0
    const n = 4000
    for (let i = 0; i < n; i++) {
      const g = paperGrain((i % 80) * 1.3, Math.floor(i / 80) * 1.3)
      sum += g
      lo = Math.min(lo, g)
      hi = Math.max(hi, g)
    }
    expect(sum / n).toBeGreaterThan(0.4)
    expect(sum / n).toBeLessThan(0.6)
    expect(hi - lo).toBeGreaterThan(0.5)
  })

  it('음수 좌표에서도 문제없다', () => {
    expect(Number.isFinite(paperGrain(-123.4, -0.5))).toBe(true)
    expect(Number.isFinite(valueNoise(-5, -5))).toBe(true)
  })
})

describe('washCloud(물감 얼룩)', () => {
  it('0~1 사이이고 종이 결보다 훨씬 천천히 변한다', () => {
    let wash = 0
    let grain = 0
    const n = 300
    for (let i = 0; i < n; i++) {
      const x = i * 4.1
      const y = i * 1.7
      const c = washCloud(x, y)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
      wash += Math.abs(washCloud(x, y) - washCloud(x + 3, y))
      grain += Math.abs(paperGrain(x, y) - paperGrain(x + 3, y))
    }
    expect(wash).toBeLessThan(grain)
  })
})

describe('tooth(종이 결에 걸리는 정도)', () => {
  it('세게 누를수록(level이 클수록) 더 많이 묻는다', () => {
    expect(tooth(0.5, 0.2)).toBe(0)
    expect(tooth(0.5, 0.9)).toBe(1)
    expect(tooth(0.5, 0.5)).toBeCloseTo(0.5, 5)
    let prev = -1
    for (let level = 0; level <= 1.0001; level += 0.05) {
      const t = tooth(0.5, level)
      expect(t).toBeGreaterThanOrEqual(prev)
      prev = t
    }
  })

  it('같은 세기로 눌러도 종이가 솟은 곳(grain 값이 작은 곳)부터 묻는다', () => {
    expect(tooth(0.2, 0.4)).toBeGreaterThan(tooth(0.7, 0.4))
  })
})
