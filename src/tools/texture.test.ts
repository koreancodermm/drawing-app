import { beforeEach, describe, expect, it } from 'vitest'
import { installFakeCanvas } from '../test-utils/fakeCanvas'
import { createRecorder } from '../test-utils/memCanvas'
import { drawStroke } from './draw'
import { getTool } from './registry'
import { makeStroke } from './settings'

beforeEach(() => installFakeCanvas())

const env = { seed: 7, cx: 0, cy: 0, dpi: 150, clip: null, color2: '#fff' }

/** 왼쪽에서 오른쪽으로 곧게 그은 획(필압 일정) */
function straight(id: string, opts: Record<string, number>, length = 60, p = 1) {
  const stroke = makeStroke(getTool(id)!, '#202020', undefined, { x: 0, y: 100, p }, env)
  stroke.opts = { ...stroke.opts, ...opts }
  for (let x = 4; x <= length; x += 4) stroke.points.push({ x, y: 100, p })
  return stroke
}

/** 새 유화 붓이 그린 털 선들: 시작점의 y와 그릴 때의 투명도(도장 순서대로) */
function bristleLines(r: { log: string[]; draws: string[] }) {
  const ys = r.log
    .filter((l) => l.startsWith('moveTo('))
    .map((l) => Number(/^moveTo\(([-\d.]+),([-\d.]+)\)/.exec(l)![2]))
  const alphas = r.draws
    .filter((d) => d.startsWith('stroke('))
    .map((d) => Number(/\|a=([-\d.]+)/.exec(d)![1]))
  return { ys, alphas }
}

function arcs(draws: string[]) {
  return draws
    .filter((d) => d.startsWith('arc('))
    .map((d) => {
      const m = /^arc\(([-\d.]+),([-\d.]+),[^|]*\|a=([-\d.]+)/.exec(d)!
      return { x: Number(m[1]), y: Number(m[2]), a: Number(m[3]) }
    })
}

describe('유화 붓: 털마다 자리가 고정되어 이어진 붓 자국이 남는다', () => {
  const bristles = Math.max(5, Math.min(36, Math.round(30 / 2.2)))

  it('새 방식은 털마다 자리가 도장이 바뀌어도 거의 그대로다(이어진 줄무늬, 옛 방식은 도장마다 크게 흔들림)', () => {
    const unit = 15 / bristles // 털 간격 단위(반지름 / 털 수)
    const r = createRecorder()
    drawStroke(r.ctx, straight('oil', { grain: 0 }, 80))
    const { ys } = bristleLines(r)
    expect(ys.length).toBeGreaterThan(bristles * 4)
    const stamp = (n: number) => ys.slice(n * bristles, (n + 1) * bristles)
    expect(stamp(0)).toHaveLength(bristles)
    for (let n = 1; n < 10; n++) {
      const a = stamp(n)
      const b = stamp(n + 1)
      for (let i = 0; i < bristles; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(unit * 0.1)
    }
  })

  it('털 선은 서로 순서가 뒤바뀌지 않는다(줄무늬가 엉키지 않음)', () => {
    const r = createRecorder()
    drawStroke(r.ctx, straight('oil', { grain: 0 }, 400))
    const { ys } = bristleLines(r)
    for (const n of [1, 20, 60, 110]) {
      const row = ys.slice(n * bristles, (n + 1) * bristles)
      for (let i = 1; i < bristles; i++) expect(row[i]).toBeGreaterThan(row[i - 1])
    }
  })

  it('털은 점이 아니라 이전 도장에서 이어진 선으로 그려진다', () => {
    const r = createRecorder()
    drawStroke(r.ctx, straight('oil', { grain: 0.5 }, 80))
    expect(r.log.some((l) => l.startsWith('lineTo('))).toBe(true)
    expect(r.log.filter((l) => l.startsWith('lineCap=butt')).length).toBeGreaterThan(0)
  })

  it('옛 방식(grain 옵션 없음)은 도장마다 털 위치가 흔들린다(예전 모양 유지)', () => {
    const stroke = straight('oil', {}, 80)
    delete stroke.opts!.grain
    const r = createRecorder()
    drawStroke(r.ctx, stroke)
    const all = arcs(r.draws)
    const legacyBristles = Math.max(4, Math.min(30, Math.round(30 / 2.5)))
    const stamp = (n: number) => all.slice(n * legacyBristles, (n + 1) * legacyBristles).map((a) => a.y.toFixed(3)).sort()
    expect(stamp(5)).not.toEqual(stamp(0))
  })
})

describe('유화 붓: 길게 그을수록 물감이 떨어진다(마른 붓)', () => {
  const mean = (list: number[]) => list.reduce((x, y) => x + y, 0) / list.length
  const bristles = Math.max(5, Math.min(36, Math.round(30 / 2.2)))

  it('종이 결을 높이면 획 끝으로 갈수록 옅어진다', () => {
    const r = createRecorder()
    drawStroke(r.ctx, straight('oil', { grain: 1 }, 420))
    const { alphas } = bristleLines(r)
    const head = alphas.slice(bristles, bristles * 6) // 첫 도장(점으로 찍음)은 빼고 비교
    const tail = alphas.slice(-bristles * 5)
    expect(mean(tail)).toBeLessThan(mean(head) * 0.9)
  })

  it('종이 결을 0으로 하면 끝까지 진하기가 그대로다(마른 붓 효과 없음)', () => {
    const r = createRecorder()
    drawStroke(r.ctx, straight('oil', { grain: 0 }, 420))
    const { alphas } = bristleLines(r)
    const head = alphas.slice(bristles, bristles * 6)
    const tail = alphas.slice(-bristles * 5)
    expect(mean(tail)).toBeGreaterThan(mean(head) * 0.95)
  })
})

describe('연필·목탄: 종이 결 옵션', () => {
  it('종이 결 값이 다르면 그려지는 알갱이가 달라진다', () => {
    for (const id of ['pencil', 'charcoal', 'pastel']) {
      const a = createRecorder()
      const b = createRecorder()
      drawStroke(a.ctx, straight(id, { grain: 0 }, 60, 0.6))
      drawStroke(b.ctx, straight(id, { grain: 1 }, 60, 0.6))
      expect(b.draws, id).not.toEqual(a.draws)
    }
  })

  it('세게 누를수록(필압↑) 같은 종이에 더 많은 알갱이가 묻는다', () => {
    const count = (p: number) => {
      const r = createRecorder()
      drawStroke(r.ctx, straight('charcoal', { grain: 1 }, 60, p))
      return r.draws.filter((d) => d.startsWith('fillRect(')).length
    }
    expect(count(1)).toBeGreaterThan(count(0.3))
  })

  it('같은 자리를 다른 씨앗으로 다시 그어도 종이 결은 같은 자리에 걸린다(알갱이가 종이에 고정됨)', () => {
    // 알갱이가 종이 결에 고정되어 있다면, 두 획(씨앗이 다름)이 알갱이를 놓은 자리는 서로 우연보다 훨씬 많이 겹친다.
    // "우연"의 기준은 종이 결을 끈(grain 0) 같은 획들이 닿는 모든 자리(U)에서 각 획이 차지한 비율이다.
    const spots = (seed: number, grain: number) => {
      const stroke = straight('charcoal', { grain }, 60, 0.4)
      stroke.opts = { ...stroke.opts, seed }
      const r = createRecorder()
      drawStroke(r.ctx, stroke)
      return new Set(
        r.draws
          .filter((d) => d.startsWith('fillRect('))
          .map((d) => /^fillRect\(([-\d.]+),([-\d.]+)/.exec(d)!)
          .map((m) => `${Math.round(Number(m[1]) / 2)},${Math.round(Number(m[2]) / 2)}`),
      )
    }
    const reach = new Set([...spots(1, 0), ...spots(2, 0), ...spots(3, 0), ...spots(4, 0)])
    const a = spots(1, 1)
    const b = spots(2, 1)
    const both = [...b].filter((k) => a.has(k)).length
    const chance = a.size / reach.size // 서로 무관하게 흩뿌렸을 때 b의 자리가 a와 겹칠 확률
    expect(a.size).toBeGreaterThan(30)
    expect(both / b.size).toBeGreaterThan(chance * 1.25)
  })
})
