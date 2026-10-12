import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeCanvas } from '../test-utils/fakeCanvas'
import { VISIBLE_TOOLS, getTool } from '../tools/registry'
import ToolPreview from './ToolPreview'

beforeEach(() => installFakeCanvas())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('도구 미리보기 그림', () => {
  it('보이는 도구 50가지 모두 이모지가 아니라 그림(캔버스)으로 보여 준다', () => {
    for (const def of VISIBLE_TOOLS) {
      const { container, unmount } = render(<ToolPreview def={def} />)
      expect(container.querySelector('canvas.tool-preview'), def.label).not.toBeNull()
      expect(container.querySelector('.tool-glyph'), def.label).toBeNull()
      unmount()
    }
  })

  it('화면 배율이 높으면 그만큼 크게 그린다(폰·고해상도 화면에서 흐려지지 않게)', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const { container } = render(<ToolPreview def={getTool('pencil')!} />)
    const canvas = container.querySelector('canvas')!
    expect(canvas.width).toBe(128)
    expect(canvas.height).toBe(68)
  })

  it('배율은 1~3배로 제한한다(이상한 값·너무 큰 값에도 안전)', () => {
    vi.stubGlobal('devicePixelRatio', 5)
    expect(render(<ToolPreview def={getTool('pencil')!} />).container.querySelector('canvas')!.width).toBe(192)
    cleanup()
    vi.stubGlobal('devicePixelRatio', 0)
    expect(render(<ToolPreview def={getTool('pencil')!} />).container.querySelector('canvas')!.width).toBe(64)
    cleanup()
    vi.stubGlobal('devicePixelRatio', Number.NaN)
    expect(render(<ToolPreview def={getTool('bucket')!} />).container.querySelector('canvas')!.width).toBe(64)
  })

  it('미리보기를 그리다 오류가 나도 화면은 멀쩡하다', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('캔버스 없음')
    })
    expect(() => render(<ToolPreview def={getTool('pencil')!} />)).not.toThrow()
  })
})
