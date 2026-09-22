import type { Region } from './regions'

/** 2차원 변환 행렬 [a, b, c, d, e, f] (캔버스 setTransform과 같은 순서) */
export type Matrix = [number, number, number, number, number, number]

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/**
 * (cx, cy)를 중심으로 뒤집고, 크기를 바꾸고, 회전하는 행렬.
 * 적용 순서: 뒤집기 → 크기 → 회전.
 */
export function buildTransform(
  cx: number,
  cy: number,
  scale: number,
  angleRad: number,
  flipX = false,
  flipY = false,
): Matrix {
  const sx = scale * (flipX ? -1 : 1)
  const sy = scale * (flipY ? -1 : 1)
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  const a = cos * sx
  const b = sin * sx
  const c = -sin * sy
  const d = cos * sy
  return [a, b, c, d, cx - (a * cx + c * cy), cy - (b * cx + d * cy)]
}

export function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }
}

export function transformRegion(region: Region, m: Matrix): Region {
  return region.map((poly) => {
    const out: number[] = []
    for (let i = 0; i + 1 < poly.length; i += 2) {
      const p = applyMatrix(m, poly[i], poly[i + 1])
      out.push(p.x, p.y)
    }
    return out
  })
}

export function isIdentity(m: Matrix): boolean {
  return m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9)
}
