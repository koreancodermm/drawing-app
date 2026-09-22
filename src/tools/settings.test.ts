import { describe, expect, it } from 'vitest'
import { rectRegion } from './regions'
import { getTool } from './registry'
import { makeStroke, resolveSettings } from './settings'

const env = { seed: 9, cx: 100, cy: 80, dpi: 150, clip: null, color2: '#123456' }
const pt = { x: 5, y: 6, p: 1 }

describe('resolveSettings', () => {
  it('저장된 값이 없으면 도구 기본값을 쓴다', () => {
    expect(resolveSettings(getTool('watercolor')!, undefined)).toMatchObject({ size: 40, opacity: 0.5, softness: 0.85 })
  })

  it('저장된 값이 있으면 그 값이 우선한다(도구별 마지막 옵션 기억)', () => {
    expect(resolveSettings(getTool('watercolor')!, { size: 77 })).toMatchObject({ size: 77, opacity: 0.5 })
  })
})

describe('makeStroke', () => {
  it('굵기와 도구 옵션, 난수 씨앗을 획에 담는다', () => {
    const s = makeStroke(getTool('rect')!, '#ff0000', { size: 9, fill: 2 }, pt, env)
    expect(s).toMatchObject({ tool: 'rect', color: '#ff0000', size: 9 })
    expect(s.opts).toMatchObject({ seed: 9, fill: 2, lineStyle: 0, color2: '#123456', dpi: 150 })
  })

  it('그 도구에 없는 옵션은 담지 않는다', () => {
    const s = makeStroke(getTool('ballpoint')!, '#000000', undefined, pt, env)
    expect(Object.keys(s.opts!).sort()).toEqual(['cx', 'cy', 'dpi', 'seed'])
  })

  it('선택 영역이 있으면 획에 담고, 선택·스포이드 같은 도구에는 담지 않는다', () => {
    const clip = rectRegion(0, 0, 10, 10)
    expect(makeStroke(getTool('ballpoint')!, '#000', undefined, pt, { ...env, clip }).opts?.clip).toEqual(clip)
    expect(makeStroke(getTool('wand')!, '#000', undefined, pt, { ...env, clip }).opts?.clip).toBeUndefined()
    expect(makeStroke(getTool('ballpoint')!, '#000', undefined, pt, env).opts?.clip).toBeUndefined()
  })

  it('나중에 도구 설정을 바꿔도 이미 만든 획은 그대로다', () => {
    const settings = { size: 10 }
    const s = makeStroke(getTool('ballpoint')!, '#000', settings, pt, env)
    settings.size = 99
    expect(s.size).toBe(10)
  })

  it('첫 점을 그대로 담는다', () => {
    expect(makeStroke(getTool('line')!, '#000', undefined, pt, env).points).toEqual([pt])
  })
})
