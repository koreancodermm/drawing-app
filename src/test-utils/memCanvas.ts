/**
 * 픽셀 배열만 가진 아주 작은 가짜 캔버스. getImageData/putImageData만 진짜처럼 동작해서
 * 채우기·번짐·블러 같은 픽셀 처리 도구의 결과를 값으로 확인할 수 있다.
 */
export interface MemCanvas {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  get: (x: number, y: number) => [number, number, number, number]
  set: (x: number, y: number, rgba: [number, number, number, number]) => void
  fillRect: (x0: number, y0: number, x1: number, y1: number, rgba: [number, number, number, number]) => void
}

export function createMemCanvas(width: number, height: number): MemCanvas {
  const data = new Uint8ClampedArray(width * height * 4)
  const set = (x: number, y: number, rgba: [number, number, number, number]) => {
    const i = (y * width + x) * 4
    data[i] = rgba[0]
    data[i + 1] = rgba[1]
    data[i + 2] = rgba[2]
    data[i + 3] = rgba[3]
  }
  const ctx = {
    canvas: { width, height },
    getImageData(x: number, y: number, w: number, h: number) {
      const out = new Uint8ClampedArray(w * h * 4)
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const sx = x + px
          const sy = y + py
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
          const si = (sy * width + sx) * 4
          const di = (py * w + px) * 4
          out[di] = data[si]
          out[di + 1] = data[si + 1]
          out[di + 2] = data[si + 2]
          out[di + 3] = data[si + 3]
        }
      }
      return { data: out, width: w, height: h }
    },
    putImageData(image: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number) {
      for (let py = 0; py < image.height; py++) {
        for (let px = 0; px < image.width; px++) {
          const dx = x + px
          const dy = y + py
          if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue
          const si = (py * image.width + px) * 4
          const di = (dy * width + dx) * 4
          data[di] = image.data[si]
          data[di + 1] = image.data[si + 1]
          data[di + 2] = image.data[si + 2]
          data[di + 3] = image.data[si + 3]
        }
      }
    },
  } as unknown as CanvasRenderingContext2D

  return {
    ctx,
    width,
    height,
    get: (x, y) => {
      const i = (y * width + x) * 4
      return [data[i], data[i + 1], data[i + 2], data[i + 3]]
    },
    set,
    fillRect: (x0, y0, x1, y1, rgba) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, rgba)
    },
  }
}

/** 부른 메서드와 값을 넣은 속성을 모두 순서대로 기록하는 가짜 컨텍스트 */
const DRAW_CALLS = new Set(['fillRect', 'strokeRect', 'arc', 'ellipse', 'fill', 'stroke', 'drawImage', 'fillText', 'clearRect'])

export function createRecorder() {
  const log: string[] = []
  /** 실제로 무언가를 그리는 호출만(그릴 때의 색·투명도·굵기와 함께) 모은 기록 */
  const draws: string[] = []
  const state: Record<string, unknown> = {}
  const round = (v: unknown) => (typeof v === 'number' ? v.toFixed(3) : String(v))
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return (...args: unknown[]) => {
          log.push(`${prop}(${args.map(round).join(',')})`)
          return { addColorStop: () => {} }
        }
      }
      return (...args: unknown[]) => {
        log.push(`${prop}(${args.map(round).join(',')})`)
        if (DRAW_CALLS.has(prop)) {
          const t = target
          draws.push(
            `${prop}(${args.map(round).join(',')})|a=${round(t.globalAlpha ?? 1)}|f=${String(t.fillStyle)}|s=${String(t.strokeStyle)}|w=${round(t.lineWidth ?? 1)}|o=${String(t.globalCompositeOperation ?? 'source-over')}`,
          )
        }
      }
    },
    set(target, prop: string, value) {
      target[prop] = value
      log.push(`${prop}=${round(value)}`)
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  ;(state as { canvas: unknown }).canvas = { width: 64, height: 64 }
  return { ctx, log, draws }
}
