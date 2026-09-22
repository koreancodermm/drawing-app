import { describe, expect, it } from 'vitest'
import type { Stroke } from '../../canvas/stroke'
import { createMemCanvas } from '../../test-utils/memCanvas'
import { getTool } from '../registry'
import type { ToolDef } from '../types'
import { drawFill, patternHit } from './fill'
import { applyPixelStamp, boxBlur } from './pixel'

const RED: [number, number, number, number] = [255, 0, 0, 255]
const BLUE: [number, number, number, number] = [0, 0, 255, 255]
const BLACK: [number, number, number, number] = [0, 0, 0, 255]

function fillStroke(tool: string, color: string, points: [number, number][], opts: Stroke['opts'] = {}): [Stroke, ToolDef] {
  const def = getTool(tool)!
  return [{ tool, color, size: def.defaults.size, points: points.map(([x, y]) => ({ x, y, p: 1 })), opts }, def]
}

/** 검정 테두리 사각형(10..29)이 있는 40×40 캔버스 */
function boxedCanvas() {
  const m = createMemCanvas(40, 40)
  for (let i = 10; i <= 29; i++) {
    m.set(i, 10, BLACK)
    m.set(i, 29, BLACK)
    m.set(10, i, BLACK)
    m.set(29, i, BLACK)
  }
  return m
}

describe('페인트 통', () => {
  it('닫힌 영역 안쪽만 채우고 테두리와 바깥은 그대로 둔다', () => {
    const m = boxedCanvas()
    const [s, d] = fillStroke('bucket', '#ff0000', [[20, 20]], { tolerance: 24 })
    drawFill(m.ctx, s, d)
    expect(m.get(20, 20)).toEqual(RED)
    expect(m.get(11, 11)).toEqual(RED)
    expect(m.get(10, 15)).toEqual(BLACK)
    expect(m.get(3, 3)).toEqual([0, 0, 0, 0])
  })

  it('선 가장자리의 반투명 픽셀 아래까지 채워 틈이 생기지 않는다', () => {
    const m = boxedCanvas()
    m.set(10, 20, [0, 0, 0, 100]) // 반투명한 테두리 픽셀
    const [s, d] = fillStroke('bucket', '#ff0000', [[20, 20]], { tolerance: 24 })
    drawFill(m.ctx, s, d)
    const [r, , , a] = m.get(10, 20)
    expect(a).toBe(255)
    expect(r).toBeGreaterThan(0) // 아래에 깔린 빨강이 비쳐 보인다
  })

  it('기존 그림 위가 아니라 아래에 깔리므로 선의 진한 부분은 그대로다', () => {
    const m = boxedCanvas()
    const [s, d] = fillStroke('bucket', '#00ff00', [[20, 20]], { tolerance: 24 })
    drawFill(m.ctx, s, d)
    expect(m.get(29, 20)).toEqual(BLACK)
  })

  it('민감도가 낮으면 약간 다른 색은 채우지 않는다', () => {
    const m = createMemCanvas(10, 10)
    m.fillRect(0, 0, 10, 10, [100, 100, 100, 255])
    m.fillRect(5, 0, 10, 10, [140, 100, 100, 255])
    const [s, d] = fillStroke('bucket', '#ff0000', [[1, 1]], { tolerance: 10 })
    drawFill(m.ctx, s, d)
    expect(m.get(1, 1)).toEqual(RED)
    expect(m.get(7, 5)).toEqual([140, 100, 100, 255])
  })
})

describe('그라데이션 채우기', () => {
  it('끌기 시작한 쪽은 첫 색, 끝난 쪽은 끝 색에 가깝다', () => {
    const m = boxedCanvas()
    const [s, d] = fillStroke('gradient', '#ff0000', [[11, 20], [28, 20]], { tolerance: 24, color2: '#0000ff' })
    drawFill(m.ctx, s, d)
    const left = m.get(12, 20)
    const right = m.get(27, 20)
    expect(left[0]).toBeGreaterThan(right[0])
    expect(right[2]).toBeGreaterThan(left[2])
    expect(left[3]).toBe(255)
  })
})

describe('패턴 채우기', () => {
  it('무늬 색과 바탕 색이 번갈아 나온다', () => {
    const m = boxedCanvas()
    const [s, d] = fillStroke('pattern', '#ff0000', [[20, 20]], { tolerance: 24, color2: '#0000ff', pattern: 2 })
    s.size = 4
    drawFill(m.ctx, s, d)
    const colors = new Set<string>()
    for (let x = 12; x < 28; x++) colors.add(m.get(x, 20).join(','))
    expect(colors.size).toBe(2)
  })

  it('patternHit은 종류마다 서로 다른 모양이다', () => {
    const grid = (p: number) =>
      Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => (patternHit(p, x, y, 4) ? 1 : 0)).join('')).join('|')
    const shapes = [0, 1, 2, 3].map(grid)
    expect(new Set(shapes).size).toBe(4)
  })
})

describe('색 바꾸기', () => {
  it('누른 곳과 비슷한 색을 떨어진 곳까지 모두 바꾸고 투명도는 그대로 둔다', () => {
    const m = createMemCanvas(20, 4)
    m.fillRect(0, 0, 5, 4, RED)
    m.fillRect(10, 0, 15, 4, RED)
    m.fillRect(5, 0, 10, 4, BLUE)
    m.set(12, 1, [255, 0, 0, 128])
    const [s, d] = fillStroke('recolor', '#00ff00', [[1, 1]], { tolerance: 10 })
    drawFill(m.ctx, s, d)
    expect(m.get(1, 1).slice(0, 3)).toEqual([0, 255, 0])
    expect(m.get(12, 3).slice(0, 3)).toEqual([0, 255, 0])
    expect(m.get(7, 1)).toEqual(BLUE)
    expect(m.get(17, 1)).toEqual([0, 0, 0, 0]) // 투명한 곳은 그대로
  })
})

describe('픽셀 처리 도구', () => {
  const params = (op: 'smudge' | 'blur' | 'sharpen' | 'colorErase' | 'colorBlend' | 'waterBleed', over = {}) => ({
    op,
    strength: 1,
    color: '#ff0000',
    tolerance: 30,
    ...over,
  })

  it('번짐: 이전 자리의 색을 지금 자리로 끌어온다', () => {
    const m = createMemCanvas(60, 20)
    m.fillRect(0, 0, 30, 20, RED)
    expect(m.get(36, 10)[3]).toBe(0)
    applyPixelStamp(m.ctx, null, params('smudge'), 34, 10, 8, 24, 10)
    expect(m.get(36, 10)[3]).toBeGreaterThan(0)
    expect(m.get(36, 10)[0]).toBeGreaterThan(200)
  })

  it('블러: 선명한 세로선이 옆으로 퍼지고 가운데는 옅어진다', () => {
    const m = createMemCanvas(60, 40)
    m.fillRect(29, 0, 31, 40, BLACK)
    const beforeCenter = m.get(30, 20)[3]
    applyPixelStamp(m.ctx, null, params('blur'), 30, 20, 14, 30, 20)
    expect(m.get(32, 20)[3]).toBeGreaterThan(0)
    expect(m.get(30, 20)[3]).toBeLessThan(beforeCenter)
  })

  it('색 지우개: 지금 색과 비슷한 픽셀만 투명하게 만든다', () => {
    const m = createMemCanvas(40, 20)
    m.fillRect(0, 0, 20, 20, RED)
    m.fillRect(20, 0, 40, 20, BLUE)
    applyPixelStamp(m.ctx, null, params('colorErase'), 20, 10, 12, 20, 10)
    expect(m.get(18, 10)[3]).toBe(0)
    expect(m.get(22, 10)).toEqual(BLUE)
    expect(m.get(2, 10)).toEqual(RED) // 브러시 밖은 그대로
  })

  it('색 번짐 보정: 경계 근처 색이 평균 쪽으로 섞이고 투명도는 그대로다', () => {
    const m = createMemCanvas(40, 20)
    m.fillRect(0, 0, 20, 20, RED)
    m.fillRect(20, 0, 40, 20, BLUE)
    applyPixelStamp(m.ctx, null, params('colorBlend', { strength: 1 }), 20, 10, 12, 20, 10)
    const near = m.get(19, 10)
    expect(near[2]).toBeGreaterThan(0)
    expect(near[0]).toBeLessThan(255)
    expect(near[3]).toBe(255)
  })

  it('선명하게: 값이 0~255 안에 머물고 투명도는 바뀌지 않는다', () => {
    const m = createMemCanvas(30, 20)
    m.fillRect(0, 0, 15, 20, [80, 80, 80, 255])
    m.fillRect(15, 0, 30, 20, [160, 160, 160, 255])
    applyPixelStamp(m.ctx, null, params('sharpen'), 15, 10, 12, 15, 10)
    const dark = m.get(14, 10)
    const light = m.get(15, 10)
    expect(dark[3]).toBe(255)
    expect(light[0]).toBeGreaterThanOrEqual(160)
    expect(dark[0]).toBeLessThanOrEqual(80)
  })

  it('물 번짐: 색이 흐려지며 옆으로 번진다', () => {
    const m = createMemCanvas(60, 20)
    m.fillRect(0, 0, 30, 20, RED)
    applyPixelStamp(m.ctx, null, params('waterBleed'), 34, 10, 10, 26, 10)
    expect(m.get(36, 10)[3]).toBeGreaterThan(0)
  })

  it('boxBlur는 전체 합(밝기)을 거의 보존한다', () => {
    const w = 9
    const h = 9
    const src = new Float32Array(w * h * 4)
    src[(4 * w + 4) * 4 + 3] = 90
    const out = boxBlur(src, w, h, 1)
    let sum = 0
    for (let i = 3; i < out.length; i += 4) sum += out[i]
    expect(sum).toBeCloseTo(90, 3)
    expect(out[(4 * w + 4) * 4 + 3]).toBeLessThan(90)
  })
})
