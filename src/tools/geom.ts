import type { StrokePoint } from '../canvas/stroke'

export interface Vec {
  x: number
  y: number
}

export interface PieceGeom {
  /** 직선이면 line, 점을 조절점으로 하는 곡선이면 quad */
  kind: 'line' | 'quad'
  a: Vec
  b: Vec
  c?: Vec
  /** 조각 양 끝의 필압 */
  pa: number
  pb: number
  /** 점 사이 거리(입력 속도를 재는 대용) */
  speed: number
}

function mid(a: Vec, b: Vec): Vec {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * 점이 n(≥2)개인 획의 k번째 조각 모양.
 * 0번은 첫 점→첫 중간점 직선, 마지막은 마지막 중간점→끝점 직선,
 * 그 사이는 점을 조절점으로 하는 곡선이다.
 * 마지막이 아닌 조각은 n이 늘어나도 바뀌지 않으므로 도중에 그린 결과와 다시 그린 결과가 같다.
 */
export function pieceGeom(pts: readonly StrokePoint[], k: number): PieceGeom {
  const n = pts.length
  const a = pts[Math.max(0, k - 1)]
  const b = pts[k]
  const c = pts[Math.min(n - 1, k + 1)]
  const speed = Math.hypot(c.x - b.x, c.y - b.y)
  if (k === 0) {
    return { kind: 'line', a: pts[0], b: mid(pts[0], pts[1]), pa: pts[0].p, pb: (pts[0].p + pts[1].p) / 2, speed }
  }
  if (k === n - 1) {
    return { kind: 'line', a: mid(a, b), b, pa: (a.p + b.p) / 2, pb: b.p, speed: Math.hypot(b.x - a.x, b.y - a.y) }
  }
  return { kind: 'quad', a: mid(a, b), c: b, b: mid(b, c), pa: (a.p + b.p) / 2, pb: (b.p + c.p) / 2, speed }
}

/** 조각을 약 1px 간격의 점들로 잘게 나눈다(첫 점은 제외). */
export function flattenPiece(g: PieceGeom): { x: number; y: number; p: number }[] {
  const approx =
    g.kind === 'line'
      ? Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y)
      : Math.hypot(g.c!.x - g.a.x, g.c!.y - g.a.y) + Math.hypot(g.b.x - g.c!.x, g.b.y - g.c!.y)
  const steps = Math.max(1, Math.ceil(approx))
  const out: { x: number; y: number; p: number }[] = []
  for (let s = 1; s <= steps; s++) {
    const t = s / steps
    const p = g.pa + (g.pb - g.pa) * t
    if (g.kind === 'line') {
      out.push({ x: g.a.x + (g.b.x - g.a.x) * t, y: g.a.y + (g.b.y - g.a.y) * t, p })
    } else {
      const u = 1 - t
      out.push({
        x: u * u * g.a.x + 2 * u * t * g.c!.x + t * t * g.b.x,
        y: u * u * g.a.y + 2 * u * t * g.c!.y + t * t * g.b.y,
        p,
      })
    }
  }
  return out
}

/** 점 목록의 x,y 범위 */
export function pointsBox(pts: readonly StrokePoint[]): { x0: number; y0: number; x1: number; y1: number } | null {
  if (pts.length === 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  return { x0, y0, x1, y1 }
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [0, 0, 0]
  const v = parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}
