import type { Stroke } from '../../canvas/stroke'
import { dilate, floodMask } from '../flood'
import { hexToRgb } from '../geom'
import { addRegionPath, regionBox, type Region } from '../regions'
import type { ToolDef } from '../types'
import { clamp, commitImage, num, strokeClip } from './common'

export const PATTERN_NAMES = ['줄무늬', '점', '체크', '격자'] as const

/** 무늬 위의 (x, y)가 무늬 색(true)인지 바탕(false)인지 */
export function patternHit(pattern: number, x: number, y: number, scale: number): boolean {
  const s = Math.max(2, scale)
  switch (pattern) {
    case 0:
      return Math.floor((x + y) / s) % 2 === 0
    case 1: {
      const cx = (x % (s * 2)) - s
      const cy = (y % (s * 2)) - s
      return Math.hypot(cx, cy) < s * 0.55
    }
    case 2:
      return (Math.floor(x / s) + Math.floor(y / s)) % 2 === 0
    default:
      return x % s < Math.max(1, s * 0.12) || y % s < Math.max(1, s * 0.12)
  }
}

/** 선택 영역 안쪽만 1인 표시를 (ox, oy)에서 w×h 크기로 만든다. */
function regionMask(region: Region, ox: number, oy: number, w: number, h: number): Uint8Array {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const out = new Uint8Array(w * h)
  if (!ctx) return out
  ctx.translate(-ox, -oy)
  ctx.fillStyle = '#000'
  ctx.beginPath()
  addRegionPath(ctx, region)
  ctx.fill()
  const d = ctx.getImageData(0, 0, w, h).data
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] > 127 ? 1 : 0
  return out
}

/**
 * 채우기 계열 도구(페인트 통, 그라데이션, 패턴, 색 바꾸기).
 * 캔버스의 현재 픽셀을 읽어 영역을 찾고 결과를 다시 써 넣는다. 손을 뗄 때 한 번만 실행한다.
 */
export function drawFill(ctx: CanvasRenderingContext2D, stroke: Stroke, def: ToolDef): void {
  const pts = stroke.points
  if (pts.length === 0) return
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const start = pts[0]
  const end = pts[pts.length - 1]
  const op = def.fillOp!
  const tol = num(stroke.opts, 'tolerance', def.defaults.tolerance ?? 24)

  const full = ctx.getImageData(0, 0, W, H)
  const flood = floodMask(full.data, W, H, Math.floor(start.x), Math.floor(start.y), tol, op !== 'recolor')
  if (!flood.box) return
  const clip = strokeClip(stroke)

  // core: 누른 곳과 같은 색으로 찾은 영역(통째로 새 색으로 바꾼다)
  // 넓힌 영역: 선 가장자리의 부드러운 픽셀까지 덮도록 한 픽셀 더 넓힌 곳(기존 그림 아래에 깔린다)
  const core = flood.mask
  let mask = op === 'recolor' ? flood.mask : dilate(flood.mask, W, H)
  const box = {
    x0: Math.max(0, flood.box.x0 - 1),
    y0: Math.max(0, flood.box.y0 - 1),
    x1: Math.min(W - 1, flood.box.x1 + 1),
    y1: Math.min(H - 1, flood.box.y1 + 1),
  }
  if (clip) {
    const cb = regionBox(clip)
    if (!cb) return
    const inside = regionMask(clip, 0, 0, W, H)
    const merged = new Uint8Array(mask.length)
    for (let i = 0; i < merged.length; i++) merged[i] = mask[i] && inside[i] ? 1 : 0
    mask = merged
  }

  const [fr, fg, fb] = hexToRgb(stroke.color)
  const c2 = typeof stroke.opts?.color2 === 'string' ? (stroke.opts.color2 as string) : '#ffffff'
  const [gr, gg, gb] = hexToRgb(c2)
  const scale = stroke.size
  const pattern = num(stroke.opts, 'pattern', 0)

  const bw = box.x1 - box.x0 + 1
  const bh = box.y1 - box.y0 + 1
  const out = ctx.getImageData(box.x0, box.y0, bw, bh)
  const d = out.data

  const dx = end.x - start.x
  const dy = end.y - start.y
  const len2 = dx * dx + dy * dy

  // 단색으로 통째로 바꾸는 픽셀(페인트 통·색 바꾸기의 안쪽)은 32비트 한 번에 써서 빠르게 처리한다.
  const u32 = new Uint32Array(d.buffer)
  const solid = ((255 << 24) | (fb << 16) | (fg << 8) | fr) >>> 0

  for (let y = box.y0; y <= box.y1; y++) {
    const rowMask = y * W
    const rowOut = (y - box.y0) * bw - box.x0
    for (let x = box.x0; x <= box.x1; x++) {
      if (!mask[rowMask + x]) continue
      const j = rowOut + x
      const i = j * 4
      const isCore = core[rowMask + x] === 1

      if (op === 'recolor') {
        if (d[i + 3] === 0) continue
        d[i] = fr
        d[i + 1] = fg
        d[i + 2] = fb
        continue
      }
      if (op === 'bucket' && isCore) {
        u32[j] = solid
        continue
      }

      // 채울 색(r,g,b)을 정한다.
      let r = fr
      let g = fg
      let b = fb
      if (op === 'gradient') {
        const t = len2 > 0 ? clamp(((x - start.x) * dx + (y - start.y) * dy) / len2, 0, 1) : 0
        r = fr + (gr - fr) * t
        g = fg + (gg - fg) * t
        b = fb + (gb - fb) * t
      } else if (op === 'pattern' && !patternHit(pattern, x, y, scale)) {
        r = gr
        g = gg
        b = gb
      }
      // 영역 안쪽은 기존 색을 새 색으로 바꾸고, 넓힌 가장자리는 기존 그림 아래에 깐다.
      if (isCore) {
        d[i] = r
        d[i + 1] = g
        d[i + 2] = b
        d[i + 3] = 255
        continue
      }
      const ea = d[i + 3] / 255
      const under = 1 - ea
      d[i] = d[i] * ea + r * under
      d[i + 1] = d[i + 1] * ea + g * under
      d[i + 2] = d[i + 2] * ea + b * under
      d[i + 3] = 255
    }
  }
  commitImage(ctx, out, box.x0, box.y0, null)
}
