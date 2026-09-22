import { describe, expect, it } from 'vitest'
import type { Stroke } from '../canvas/stroke'
import {
  DEFAULT_UI,
  buildSnapshot,
  decodeStroke,
  encodeStroke,
  fnv1a,
  verifySnapshot,
} from './snapshot'

const stroke: Stroke = {
  tool: 'fountain',
  color: '#336699',
  size: 6,
  points: [
    { x: 10.5, y: 20.25, p: 0.5 },
    { x: 11, y: 22, p: 1 },
    { x: 15.75, y: 30, p: 0.25 },
  ],
}

describe('획 저장 형식', () => {
  it('인코딩했다 디코딩하면 같은 획이 나온다', () => {
    expect(decodeStroke(encodeStroke(stroke))).toEqual(stroke)
  })

  it('같은 획 객체는 한 번만 인코딩한다', () => {
    expect(encodeStroke(stroke)).toBe(encodeStroke(stroke))
  })
})

describe('verifySnapshot', () => {
  const good = () => buildSnapshot(3, 1000, [encodeStroke(stroke)], [], { '0,0': 2 }, DEFAULT_UI)

  it('온전한 저장본은 통과한다', () => {
    expect(verifySnapshot(good())).toBe(true)
  })

  it('획의 점이 바뀌면 걸러 낸다', () => {
    const s = good()
    s.strokes[0].p[1] += 1
    expect(verifySnapshot(s)).toBe(false)
  })

  it('타일 버전이 바뀌면 걸러 낸다', () => {
    const s = good()
    s.tiles['0,0'] = 99
    expect(verifySnapshot(s)).toBe(false)
  })

  it('화면 상태가 바뀌면 걸러 낸다', () => {
    const s = good()
    s.ui = { ...s.ui, size: 200 }
    expect(verifySnapshot(s)).toBe(false)
  })

  it('모양이 이상한 값은 예외 없이 거른다', () => {
    for (const bad of [null, undefined, 5, 'x', {}, { strokes: 3 }, { ...good(), strokes: [null] }]) {
      expect(verifySnapshot(bad)).toBe(false)
    }
  })
})

describe('도구 옵션(opts)을 담은 획', () => {
  const withOpts: Stroke = {
    tool: 'rect',
    color: '#123456',
    size: 5,
    points: [
      { x: 1, y: 2, p: 1 },
      { x: 30, y: 40, p: 1 },
    ],
    opts: { seed: 12345, fill: 2, color2: '#abcdef', clip: [[0, 0, 10, 0, 10, 10, 0, 10]] },
  }

  it('옵션과 선택 영역까지 그대로 저장했다가 되살린다', () => {
    const encoded = encodeStroke(withOpts)
    expect(encoded.x).toBeDefined()
    expect(decodeStroke(encoded)).toEqual(withOpts)
  })

  it('옵션이 바뀌면 검사값이 어긋나 걸러 낸다', () => {
    const snap = buildSnapshot(1, 1, [encodeStroke(withOpts)], [], {}, DEFAULT_UI)
    expect(verifySnapshot(snap)).toBe(true)
    snap.strokes[0].x = snap.strokes[0].x!.replace('12345', '54321')
    expect(verifySnapshot(snap)).toBe(false)
  })

  it('옵션이 JSON이 아니면 걸러 낸다', () => {
    const snap = buildSnapshot(1, 1, [encodeStroke(withOpts)], [], {}, DEFAULT_UI)
    snap.strokes[0].x = '{망가진'
    expect(verifySnapshot(snap)).toBe(false)
  })

  it('옵션이 없는 옛 형식의 획(도구 옵션 도입 전 저장본)도 그대로 통과한다', () => {
    const p = new Float32Array([1, 2, 1, 5, 6, 1])
    const head = fnv1a(new TextEncoder().encode('ballpoint|#000000|4'))
    const h = fnv1a(new Uint8Array(p.buffer), head)
    const old = { t: 'ballpoint', c: '#000000', s: 4, p, h }
    const snap = buildSnapshot(1, 1, [old], [], {}, DEFAULT_UI)
    expect(verifySnapshot(snap)).toBe(true)
  })

  it('예전 도구 아이디(pen)는 통과하고 모르는 도구는 걸러 낸다', () => {
    const legacy = encodeStroke({ ...withOpts, tool: 'pen', opts: undefined })
    expect(verifySnapshot(buildSnapshot(1, 1, [legacy], [], {}, DEFAULT_UI))).toBe(true)
    const unknown = encodeStroke({ ...withOpts, tool: '없는도구', opts: undefined })
    expect(verifySnapshot(buildSnapshot(1, 1, [unknown], [], {}, DEFAULT_UI))).toBe(false)
  })
})

describe('화면 상태(ui)의 도구 설정', () => {
  const ui = {
    ...DEFAULT_UI,
    tool: 'watercolor',
    color2: '#ffeeaa',
    settings: { watercolor: { size: 60, opacity: 0.4 }, eraser: { size: 30, eraserShape: 1 } },
  }

  it('도구별 옵션과 보조 색을 담은 화면 상태를 통과시킨다', () => {
    expect(verifySnapshot(buildSnapshot(1, 1, [], [], {}, ui))).toBe(true)
  })

  it('옵션 값이 숫자가 아니면 걸러 낸다', () => {
    const bad = { ...ui, settings: { eraser: { size: '큼' } } } as never
    expect(verifySnapshot(buildSnapshot(1, 1, [], [], {}, bad))).toBe(false)
  })

  it('예전 저장본의 화면 상태(옵션 없음)도 통과시킨다', () => {
    expect(verifySnapshot(buildSnapshot(1, 1, [], [], {}, { tool: 'pen', color: '#000000', size: 8, view: null }))).toBe(true)
  })
})
