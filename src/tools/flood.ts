export interface FloodResult {
  /** 채울 픽셀이면 1. 길이는 width × height */
  mask: Uint8Array
  /** 채울 픽셀이 있는 범위(양 끝 포함). 채울 곳이 없으면 null */
  box: { x0: number; y0: number; x1: number; y1: number } | null
  count: number
}

function similar(d: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number, tol: number): boolean {
  return (
    Math.abs(d[i] - r) <= tol &&
    Math.abs(d[i + 1] - g) <= tol &&
    Math.abs(d[i + 2] - b) <= tol &&
    Math.abs(d[i + 3] - a) <= tol
  )
}

/**
 * (sx, sy)와 색이 비슷한 픽셀을 찾는다. 색은 R,G,B,A 각 채널의 차이가 tol 이하면 비슷한 것으로 본다.
 * contiguous가 true면 이어진 영역만(페인트 통), false면 화면 전체(색 바꾸기)에서 찾는다.
 */
export function floodMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sx: number,
  sy: number,
  tol: number,
  contiguous = true,
): FloodResult {
  const mask = new Uint8Array(width * height)
  const empty: FloodResult = { mask, box: null, count: 0 }
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return empty

  const si = (sy * width + sx) * 4
  const r = data[si]
  const g = data[si + 1]
  const b = data[si + 2]
  const a = data[si + 3]

  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  let count = 0
  const mark = (x: number, y: number) => {
    mask[y * width + x] = 1
    count++
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }

  if (!contiguous) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (similar(data, (y * width + x) * 4, r, g, b, a, tol)) mark(x, y)
      }
    }
    return count === 0 ? empty : { mask, box: { x0, y0, x1, y1 }, count }
  }

  // 가로줄 단위로 퍼져 나가는 방식(scanline)
  const stack: number[] = [sx, sy]
  while (stack.length > 0) {
    const y = stack.pop()!
    let x = stack.pop()!
    if (mask[y * width + x] || !similar(data, (y * width + x) * 4, r, g, b, a, tol)) continue
    let left = x
    while (left > 0 && !mask[y * width + left - 1] && similar(data, (y * width + left - 1) * 4, r, g, b, a, tol)) left--
    let right = x
    while (
      right < width - 1 &&
      !mask[y * width + right + 1] &&
      similar(data, (y * width + right + 1) * 4, r, g, b, a, tol)
    ) {
      right++
    }
    for (x = left; x <= right; x++) mark(x, y)
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue
      let inRun = false
      for (x = left; x <= right; x++) {
        const ok = !mask[ny * width + x] && similar(data, (ny * width + x) * 4, r, g, b, a, tol)
        if (ok && !inRun) stack.push(x, ny)
        inRun = ok
      }
    }
  }
  return count === 0 ? empty : { mask, box: { x0, y0, x1, y1 }, count }
}

/** 표시된 영역을 사방으로 한 픽셀씩 넓힌다(선 가장자리의 부드러운 픽셀까지 덮기 위해). */
export function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) continue
      if (
        (x > 0 && mask[y * width + x - 1]) ||
        (x < width - 1 && mask[y * width + x + 1]) ||
        (y > 0 && mask[(y - 1) * width + x]) ||
        (y < height - 1 && mask[(y + 1) * width + x])
      ) {
        out[y * width + x] = 1
      }
    }
  }
  return out
}
