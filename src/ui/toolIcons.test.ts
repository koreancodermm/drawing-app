import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeCanvas, contextOf } from '../test-utils/fakeCanvas'
import { VISIBLE_TOOLS } from '../tools/registry'
import { TOOL_ICON_IDS, drawToolIcon, hasToolIcon } from './toolIcons'

beforeEach(() => installFakeCanvas())

const DRAWN_BY_STROKE = new Set(['line', 'stamp', 'shape'])

describe('도구 그림(toolIcons)', () => {
  it('획으로 미리 보여 줄 수 없는 도구는 모두 직접 그린 그림이 있다(이모지로 남는 도구가 없다)', () => {
    const missing = VISIBLE_TOOLS.filter((t) => !DRAWN_BY_STROKE.has(t.engine) && !hasToolIcon(t.id)).map((t) => t.label)
    expect(missing).toEqual([])
  })

  it('그림이 있는 도구 아이디는 모두 실제 도구다(오타·옛 도구가 남지 않는다)', () => {
    const ids = new Set(VISIBLE_TOOLS.map((t) => t.id))
    for (const id of TOOL_ICON_IDS) expect(ids.has(id), id).toBe(true)
  })

  it('모든 그림이 오류 없이 그려지고 그렸다고 알려 준다', () => {
    const canvas = document.createElement('canvas')
    const ctx = contextOf(canvas)
    for (const id of TOOL_ICON_IDS) {
      expect(() => drawToolIcon(ctx, id, '#1f2328'), id).not.toThrow()
      expect(drawToolIcon(ctx, id, '#1f2328'), id).toBe(true)
    }
    // 그림마다 실제로 무언가를 그린다.
    const fresh = contextOf(document.createElement('canvas'))
    drawToolIcon(fresh, 'bucket', '#1f2328')
    expect(Object.values(fresh.calls).reduce((a, b) => a + b, 0)).toBeGreaterThan(5)
  })

  it('그림이 없는 도구는 false를 돌려주고 아무것도 그리지 않는다', () => {
    const ctx = contextOf(document.createElement('canvas'))
    expect(drawToolIcon(ctx, '없는도구', '#000')).toBe(false)
    expect(hasToolIcon('없는도구')).toBe(false)
    expect(Object.keys(ctx.calls)).toHaveLength(0)
  })

  it('그리는 도중 오류가 나면 그대로 알리되, 그림 전체를 감싼 상태 저장은 반드시 되돌린다', () => {
    const ctx = contextOf(document.createElement('canvas'))
    ;(ctx as unknown as { fill: () => void }).fill = () => {
      throw new Error('실패')
    }
    expect(() => drawToolIcon(ctx, 'bucket', '#000')).toThrow()
    // 일부 그림은 안에서 따로 save()를 쓰므로 그 짝까지는 보장하지 않는다(오류는 ToolPreview가 잡아서 무시한다).
    expect(ctx.calls.restore).toBeGreaterThanOrEqual(1)
  })
})
