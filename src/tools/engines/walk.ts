import type { Stroke } from '../../canvas/stroke'
import { flattenPiece, pieceGeom } from '../geom'

interface WalkState {
  /** 지금까지 처리한 조각 수 */
  done: number
  /** 마지막 도장 이후 지나온 거리 */
  carry: number
  /** 지금까지 찍은 도장 수 */
  count: number
  lastX: number
  lastY: number
  /** 마지막으로 움직인 방향(단위 벡터) */
  dirX: number
  dirY: number
}

const states = new WeakMap<Stroke, WalkState>()

export interface StampPos {
  x: number
  y: number
  p: number
  /** 몇 번째 도장인지(난수 씨앗에 쓴다) */
  index: number
  /** 붓이 움직이는 방향(단위 벡터) */
  dirX: number
  dirY: number
  /** 이전 도장 위치(번짐 도구가 색을 끌어올 곳) */
  prevX: number
  prevY: number
}

/**
 * 획을 따라 일정한 간격(spacing px)으로 도장 위치를 정해 emit을 부른다.
 * 위치는 획의 모양과 지나온 거리만으로 정해지므로,
 * 그리는 도중에 이어 그린 결과와 처음부터 다시 그린 결과가 같다.
 * 조각은 0번부터 순서대로 불러야 한다(from이 0이면 처음부터 다시 시작한다).
 */
export function walkStamps(
  stroke: Stroke,
  from: number,
  to: number,
  spacing: number,
  emit: (pos: StampPos) => void,
): void {
  const pts = stroke.points
  const n = pts.length
  if (n === 0 || from >= to) return
  const step = Math.max(1, spacing)

  let st = states.get(stroke)
  if (!st || from === 0) {
    st = { done: 0, carry: 0, count: 0, lastX: pts[0].x, lastY: pts[0].y, dirX: 1, dirY: 0 }
    states.set(stroke, st)
  }

  const stamp = (x: number, y: number, p: number) => {
    emit({
      x,
      y,
      p,
      index: st.count,
      dirX: st.dirX,
      dirY: st.dirY,
      prevX: st.count === 0 ? x : st.lastX,
      prevY: st.count === 0 ? y : st.lastY,
    })
    st.count++
    st.lastX = x
    st.lastY = y
  }

  if (n === 1) {
    if (from === 0) stamp(pts[0].x, pts[0].y, pts[0].p)
    return
  }

  for (let k = from; k < Math.min(to, n); k++) {
    const g = pieceGeom(pts, k)
    if (k === 0) stamp(g.a.x, g.a.y, g.pa)
    let px = g.a.x
    let py = g.a.y
    for (const s of flattenPiece(g)) {
      const d = Math.hypot(s.x - px, s.y - py)
      if (d > 0) {
        st.dirX = (s.x - px) / d
        st.dirY = (s.y - py) / d
      }
      st.carry += d
      px = s.x
      py = s.y
      if (st.carry >= step) {
        st.carry -= step
        stamp(s.x, s.y, s.p)
      }
    }
    st.done = k + 1
  }
}
