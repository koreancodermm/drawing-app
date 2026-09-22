/** 저장·복원 단위인 조각(타일) 한 변의 크기(px) */
export const TILE_SIZE = 256

export function tileKey(tx: number, ty: number): string {
  return `${tx},${ty}`
}

export function parseTileKey(key: string): { tx: number; ty: number } {
  const [tx, ty] = key.split(',').map(Number)
  return { tx, ty }
}

export interface Bounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 영역과 겹치는 타일 목록(캔버스 밖은 제외) */
export function tilesInBounds(
  bounds: Bounds,
  width: number,
  height: number,
): { tx: number; ty: number }[] {
  const x0 = Math.max(0, Math.floor(bounds.x0))
  const y0 = Math.max(0, Math.floor(bounds.y0))
  const x1 = Math.min(width - 1, Math.ceil(bounds.x1))
  const y1 = Math.min(height - 1, Math.ceil(bounds.y1))
  if (x1 < x0 || y1 < y0) return []
  const tiles: { tx: number; ty: number }[] = []
  for (let ty = Math.floor(y0 / TILE_SIZE); ty <= Math.floor(y1 / TILE_SIZE); ty++) {
    for (let tx = Math.floor(x0 / TILE_SIZE); tx <= Math.floor(x1 / TILE_SIZE); tx++) {
      tiles.push({ tx, ty })
    }
  }
  return tiles
}
