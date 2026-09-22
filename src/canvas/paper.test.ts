import { describe, expect, it } from 'vitest'
import { buildCanvasSpec, mmToPx, type PaperInput } from './paper'

const base: PaperInput = {
  presetId: 'A4',
  orientation: 'portrait',
  unit: 'mm',
  customWidth: 210,
  customHeight: 297,
  dpi: 150,
  background: '#ffffff',
}

describe('mmToPx', () => {
  it('B2(500x707mm)를 150DPI로 바꾸면 2953x4175px이다', () => {
    expect(mmToPx(500, 150)).toBe(2953)
    expect(mmToPx(707, 150)).toBe(4175)
  })
})

describe('buildCanvasSpec', () => {
  it('A4 세로 150DPI는 1240x1754px이다', () => {
    const { spec } = buildCanvasSpec(base)
    expect(spec).toMatchObject({ widthPx: 1240, heightPx: 1754, dpi: 150 })
  })

  it('B2 세로 150DPI는 2953x4175px이고 큰 크기 경고가 나온다', () => {
    const { spec, warning } = buildCanvasSpec({ ...base, presetId: 'B2' })
    expect(spec).toMatchObject({ widthPx: 2953, heightPx: 4175 })
    expect(warning).not.toBeNull()
  })

  it('가로 방향이면 가로와 세로가 바뀐다', () => {
    const { spec } = buildCanvasSpec({ ...base, orientation: 'landscape' })
    expect(spec).toMatchObject({ widthPx: 1754, heightPx: 1240 })
  })

  it('직접 입력한 px 값을 그대로 쓴다', () => {
    const { spec } = buildCanvasSpec({
      ...base,
      presetId: 'custom',
      unit: 'px',
      customWidth: 1000,
      customHeight: 500,
    })
    expect(spec).toMatchObject({ widthPx: 1000, heightPx: 500 })
  })

  it('직접 입력한 mm 값을 DPI에 맞춰 px로 바꾼다', () => {
    const { spec } = buildCanvasSpec({
      ...base,
      presetId: 'custom',
      unit: 'mm',
      customWidth: 100,
      customHeight: 100,
      dpi: 300,
    })
    expect(spec).toMatchObject({ widthPx: 1181, heightPx: 1181 })
  })

  it('DPI가 범위를 벗어나면 오류다', () => {
    expect(buildCanvasSpec({ ...base, dpi: 400 }).error).not.toBeNull()
    expect(buildCanvasSpec({ ...base, dpi: 10 }).error).not.toBeNull()
  })

  it('너무 큰 크기(A0 300DPI)는 만들 수 없다', () => {
    const result = buildCanvasSpec({ ...base, presetId: 'A0', dpi: 300 })
    expect(result.spec).toBeNull()
    expect(result.error).not.toBeNull()
  })

  it('직접 입력이 비었거나 0이면 오류다', () => {
    const result = buildCanvasSpec({ ...base, presetId: 'custom', customWidth: 0 })
    expect(result.spec).toBeNull()
  })
})
