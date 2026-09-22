/**
 * 선택 영역 = 다각형 목록. 각 다각형은 [x0, y0, x1, y1, …]로 점을 늘어놓은 숫자 배열이다.
 * 사각 선택은 다각형 하나(꼭짓점 4개), 올가미는 다각형 하나,
 * 마술봉은 같은 모양이 이어진 가로줄을 합친 작은 직사각형 여러 개다.
 */
export type Region = number[][]

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function rectRegion(x0: number, y0: number, x1: number, y1: number): Region {
  const l = Math.min(x0, x1)
  const r = Math.max(x0, x1)
  const t = Math.min(y0, y1)
  const b = Math.max(y0, y1)
  return [[l, t, r, t, r, b, l, b]]
}

export function regionBox(region: Region): Box | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const poly of region) {
    for (let i = 0; i + 1 < poly.length; i += 2) {
      if (poly[i] < x0) x0 = poly[i]
      if (poly[i] > x1) x1 = poly[i]
      if (poly[i + 1] < y0) y0 = poly[i + 1]
      if (poly[i + 1] > y1) y1 = poly[i + 1]
    }
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 }
}

export function translateRegion(region: Region, dx: number, dy: number): Region {
  return region.map((poly) => poly.map((v, i) => v + (i % 2 === 0 ? dx : dy)))
}

/** 다각형 목록을 현재 경로로 만들고 그 안쪽으로 그리기를 제한한다. */
export function clipToRegion(ctx: CanvasRenderingContext2D, region: Region): void {
  ctx.beginPath()
  addRegionPath(ctx, region)
  ctx.clip()
}

export function addRegionPath(ctx: CanvasRenderingContext2D | Path2D, region: Region): void {
  for (const poly of region) {
    if (poly.length < 6) continue
    ctx.moveTo(poly[0], poly[1])
    for (let i = 2; i + 1 < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1])
    ctx.closePath()
  }
}

/** 점 (x, y)가 영역 안에 있는지(다각형 안쪽 판정) */
export function regionContains(region: Region, x: number, y: number): boolean {
  let inside = false
  for (const poly of region) {
    let hit = false
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
      const xi = poly[i]
      const yi = poly[i + 1]
      const xj = poly[j]
      const yj = poly[j + 1]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
    }
    if (hit) inside = !inside
  }
  return inside
}

/**
 * 표시(0이 아닌 값)된 픽셀 덩어리를 직사각형 목록으로 바꾼다.
 * 가로줄마다 이어진 구간을 찾고, 아래 줄에서 같은 구간이 이어지면 하나로 합친다.
 * 모든 경계가 픽셀 경계에 놓이므로 이 영역으로 자를 때 가장자리가 번지지 않는다.
 */
export function maskToRegion(mask: Uint8Array, width: number, height: number, ox = 0, oy = 0): Region {
  const region: Region = []
  let open = new Map<string, { x0: number; x1: number; y0: number }>()
  for (let y = 0; y <= height; y++) {
    const next = new Map<string, { x0: number; x1: number; y0: number }>()
    if (y < height) {
      let x = 0
      const row = y * width
      while (x < width) {
        if (mask[row + x] === 0) {
          x++
          continue
        }
        const start = x
        while (x < width && mask[row + x] !== 0) x++
        const key = `${start},${x}`
        const prev = open.get(key)
        next.set(key, prev ?? { x0: start, x1: x, y0: y })
        if (prev) open.delete(key)
      }
    }
    for (const r of open.values()) {
      region.push([ox + r.x0, oy + r.y0, ox + r.x1, oy + r.y0, ox + r.x1, oy + y, ox + r.x0, oy + y])
    }
    open = next
  }
  return region
}

/** 올가미로 그린 점들이 너무 촘촘하지 않게 정리한다. */
export function simplifyPolygon(points: readonly { x: number; y: number }[], minDist = 2): number[] {
  const out: number[] = []
  let lx = Infinity
  let ly = Infinity
  for (const p of points) {
    if (Math.hypot(p.x - lx, p.y - ly) >= minDist) {
      out.push(p.x, p.y)
      lx = p.x
      ly = p.y
    }
  }
  return out
}
