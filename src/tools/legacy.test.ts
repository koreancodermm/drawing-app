import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeCanvas } from '../test-utils/fakeCanvas'
import { createRecorder } from '../test-utils/memCanvas'
import { drawStroke } from './draw'
import { getTool } from './registry'
import { makeStroke } from './settings'

beforeEach(() => installFakeCanvas())

const env = { seed: 42, cx: 32, cy: 32, dpi: 150, clip: null, color2: '#3366ff' }

function fnv(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** 종이 결(grain)·손떨림 보정 옵션이 생기기 전에 저장된 획을 흉내 낸다. */
function legacyStroke(id: string) {
  const stroke = makeStroke(getTool(id)!, '#e03131', undefined, { x: 10, y: 12, p: 0.4 }, env)
  for (const [x, y, p] of [
    [16, 20, 0.6],
    [24, 30, 0.9],
    [34, 36, 0.7],
    [44, 30, 0.5],
    [52, 44, 0.8],
    [90, 60, 1],
    [140, 90, 0.7],
  ]) {
    stroke.points.push({ x, y, p })
  }
  delete stroke.opts!.grain
  delete stroke.opts!.stabilize
  return stroke
}

/**
 * 질감을 바꾸기 전(종이 결 도입 직전) 코드로 같은 획을 그렸을 때의 그리기 기록 지문.
 * 앱을 업데이트해도 이미 저장된 그림(최근 100획은 다시 그려서 보여 준다)의 모양이 바뀌면 안 되므로,
 * grain 옵션이 없는 획은 예전 방식 그대로 그려져야 한다. 이 값이 바뀌었다면 옛 그림의 모양이 바뀐 것이다.
 */
const BEFORE_GRAIN: Record<string, string> = {
  pencil: '624:859a69ed',
  colorpencil: '624:5fc2ddb6',
  sketchpencil: '624:e49016e4',
  pastel: '1000:2b785e4',
  crayon: '662:8ad1ccc1',
  charcoal: '1016:6f2dd2a3',
  oil: '1272:d2f95677',
  watercolor: '50:e0edf5a8',
  inkwash: '101:2cc119ea',
  texture: '19:ddb6f746',
  ballpoint: '8:795976fd',
  liner: '8:c116f975',
}

describe('옛 저장본의 획은 예전 모양 그대로 그려진다', () => {
  for (const [id, expected] of Object.entries(BEFORE_GRAIN)) {
    it(`${getTool(id)!.label}(${id})`, () => {
      const r = createRecorder()
      drawStroke(r.ctx, legacyStroke(id))
      expect(`${r.draws.length}:${fnv(JSON.stringify(r.draws))}`).toBe(expected)
    })
  }

  it('새로 그린 획(grain 옵션 있음)은 옛 방식과 다르게 그려진다', () => {
    for (const id of ['pencil', 'charcoal', 'oil', 'watercolor']) {
      const old = legacyStroke(id)
      const fresh = { ...old, points: old.points.map((p) => ({ ...p })), opts: { ...old.opts, grain: getTool(id)!.defaults.grain! } }
      const a = createRecorder()
      const b = createRecorder()
      drawStroke(a.ctx, old)
      drawStroke(b.ctx, fresh)
      expect(b.draws, id).not.toEqual(a.draws)
    }
  })
})
