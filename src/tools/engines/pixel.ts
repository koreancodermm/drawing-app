import type { Stroke } from '../../canvas/stroke'
import { hexToRgb } from '../geom'
import type { Region } from '../regions'
import type { PixelOp, ToolDef } from '../types'
import { clamp, commitImage, num, strokeClip } from './common'
import { walkStamps } from './walk'

const MAX_RADIUS = 110

/**
 * 도장마다 큰 배열을 새로 만들면 느려지므로(획 하나에 도장이 수십~수백 개), 작업 배열을 재사용한다.
 * applyPixelStamp는 동기로만 불리므로 같은 배열을 다시 써도 안전하다.
 */
const SLOT_DST = 0
const SLOT_SRC = 1
const SLOT_TMP = 2
const SLOT_BLUR = 3
const SLOT_WEIGHT = 4
const scratch: Float32Array[] = []

function buffer(slot: number, length: number): Float32Array {
  let b = scratch[slot]
  if (!b || b.length < length) {
    b = new Float32Array(length)
    scratch[slot] = b
  }
  return b.subarray(0, length)
}

/** 도장 안 픽셀마다의 세기: 안쪽은 1, 가장자리로 갈수록 부드럽게 0 */
function fillWeights(out: Float32Array, x0: number, y0: number, w: number, h: number, cx: number, cy: number, r: number): void {
  const inv = 1 / r
  for (let py = 0; py < h; py++) {
    const dy = y0 + py + 0.5 - cy
    for (let px = 0; px < w; px++) {
      const dx = x0 + px + 0.5 - cx
      const d = Math.sqrt(dx * dx + dy * dy) * inv
      out[py * w + px] = d >= 1 ? 0 : d < 0.5 ? 1 : 1 - (d - 0.5) * 2
    }
  }
}

/** 미리 곱한 알파(premultiplied) RGBA 실수 배열로 바꾼다. */
function toPremult(data: Uint8ClampedArray, out: Float32Array): Float32Array {
  for (let i = 0; i < out.length; i += 4) {
    const a = data[i + 3] / 255
    out[i] = data[i] * a
    out[i + 1] = data[i + 1] * a
    out[i + 2] = data[i + 2] * a
    out[i + 3] = data[i + 3]
  }
  return out
}

function fromPremult(src: Float32Array, dst: Uint8ClampedArray): void {
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3] / 255
    if (a <= 0.0001) {
      dst[i] = dst[i + 1] = dst[i + 2] = dst[i + 3] = 0
    } else {
      dst[i] = src[i] / a
      dst[i + 1] = src[i + 1] / a
      dst[i + 2] = src[i + 2] / a
      dst[i + 3] = src[i + 3]
    }
  }
}

/** 상자 모양 흐림(box blur). 가로·세로로 나눠 계산하고, 결과는 out에 쓴다(tmp는 중간 배열). */
function boxBlurInto(src: Float32Array, tmp: Float32Array, out: Float32Array, w: number, h: number, radius: number): void {
  const r = Math.max(1, Math.round(radius))
  const win = r * 2 + 1
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let c = 0; c < 4; c++) {
      let sum = 0
      for (let x = -r; x <= r; x++) sum += src[(row + clamp(x, 0, w - 1)) * 4 + c]
      for (let x = 0; x < w; x++) {
        tmp[(row + x) * 4 + c] = sum / win
        const add = x + r + 1 >= w ? w - 1 : x + r + 1
        const sub = x - r < 0 ? 0 : x - r
        sum += src[(row + add) * 4 + c] - src[(row + sub) * 4 + c]
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0
      for (let y = -r; y <= r; y++) sum += tmp[(clamp(y, 0, h - 1) * w + x) * 4 + c]
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + c] = sum / win
        const add = y + r + 1 >= h ? h - 1 : y + r + 1
        const sub = y - r < 0 ? 0 : y - r
        sum += tmp[(add * w + x) * 4 + c] - tmp[(sub * w + x) * 4 + c]
      }
    }
  }
}

export function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const out = new Float32Array(src.length)
  boxBlurInto(src, new Float32Array(src.length), out, w, h, radius)
  return out
}

interface PixelParams {
  op: PixelOp
  strength: number
  color: string
  tolerance: number
}

/** 브러시 자리 하나에 픽셀 처리를 한다. */
export function applyPixelStamp(
  ctx: CanvasRenderingContext2D,
  clip: Region | null,
  params: PixelParams,
  cx: number,
  cy: number,
  r: number,
  prevX: number,
  prevY: number,
): void {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const x0 = Math.max(0, Math.floor(cx - r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const x1 = Math.min(W, Math.ceil(cx + r))
  const y1 = Math.min(H, Math.ceil(cy + r))
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return

  const n = w * h * 4
  const image = ctx.getImageData(x0, y0, w, h)
  const d = image.data
  const dst = toPremult(d, buffer(SLOT_DST, n))
  const wt = buffer(SLOT_WEIGHT, w * h)
  fillWeights(wt, x0, y0, w, h, cx, cy, r)
  const s = clamp(params.strength, 0, 1)

  const mixInto = (from: Float32Array, amount: number) => {
    for (let k = 0; k < w * h; k++) {
      const t = wt[k] * amount
      if (t <= 0) continue
      const i = k * 4
      const keep = 1 - t
      dst[i] = dst[i] * keep + from[i] * t
      dst[i + 1] = dst[i + 1] * keep + from[i + 1] * t
      dst[i + 2] = dst[i + 2] * keep + from[i + 2] * t
      dst[i + 3] = dst[i + 3] * keep + from[i + 3] * t
    }
  }

  const blurred = (radius: number): Float32Array => {
    const out = buffer(SLOT_BLUR, n)
    boxBlurInto(dst, buffer(SLOT_TMP, n), out, w, h, radius)
    return out
  }

  switch (params.op) {
    case 'smudge': {
      const sx = Math.round(prevX - cx)
      const sy = Math.round(prevY - cy)
      const src = toPremult(ctx.getImageData(x0 + sx, y0 + sy, w, h).data, buffer(SLOT_SRC, n))
      mixInto(src, s)
      break
    }
    case 'blur': {
      mixInto(blurred(Math.max(1, r * 0.18)), s)
      break
    }
    case 'sharpen': {
      const soft = blurred(Math.max(1, r * 0.12))
      for (let k = 0; k < w * h; k++) {
        const t = wt[k] * s * 1.5
        if (t <= 0) continue
        const i = k * 4
        for (let c = 0; c < 3; c++) dst[i + c] = clamp(dst[i + c] + (dst[i + c] - soft[i + c]) * t, 0, dst[i + 3])
      }
      break
    }
    case 'waterBleed': {
      mixInto(blurred(Math.max(1, r * 0.22)), s * 0.8)
      const src = toPremult(
        ctx.getImageData(x0 + Math.round(prevX - cx), y0 + Math.round(prevY - cy), w, h).data,
        buffer(SLOT_SRC, n),
      )
      mixInto(src, s * 0.5)
      break
    }
    case 'colorBlend': {
      // 브러시 안 색의 평균에 가깝게 섞는다(투명도는 그대로)
      let sr = 0
      let sg = 0
      let sb = 0
      let sw = 0
      for (let k = 0; k < w * h; k++) {
        const i = k * 4
        const wgt = wt[k] * (d[i + 3] / 255)
        sr += d[i] * wgt
        sg += d[i + 1] * wgt
        sb += d[i + 2] * wgt
        sw += wgt
      }
      if (sw > 0) {
        const ar = sr / sw
        const ag = sg / sw
        const ab = sb / sw
        for (let k = 0; k < w * h; k++) {
          const i = k * 4
          const a = dst[i + 3] / 255
          if (a <= 0) continue
          const t = wt[k] * s
          dst[i] = (d[i] * (1 - t) + ar * t) * a
          dst[i + 1] = (d[i + 1] * (1 - t) + ag * t) * a
          dst[i + 2] = (d[i + 2] * (1 - t) + ab * t) * a
        }
      }
      break
    }
    case 'colorErase': {
      const [tr, tg, tb] = hexToRgb(params.color)
      for (let k = 0; k < w * h; k++) {
        const i = k * 4
        if (d[i + 3] === 0) continue
        const diff = Math.max(Math.abs(d[i] - tr), Math.abs(d[i + 1] - tg), Math.abs(d[i + 2] - tb))
        if (diff > params.tolerance) continue
        const t = wt[k]
        if (t <= 0) continue
        const keep = 1 - t
        dst[i] *= keep
        dst[i + 1] *= keep
        dst[i + 2] *= keep
        dst[i + 3] *= keep
      }
      break
    }
  }

  fromPremult(dst, d)
  commitImage(ctx, image, x0, y0, clip)
}

/** 픽셀 처리 도구(번짐·블러·선명하게·색 지우개 등)를 획의 조각을 따라 적용한다. */
export function drawPixelPieces(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  def: ToolDef,
  from: number,
  to: number,
): void {
  const cfg = def.stamp!
  const params: PixelParams = {
    op: def.pixel!,
    strength: num(stroke.opts, 'opacity', def.defaults.opacity ?? 0.5),
    color: stroke.color,
    tolerance: num(stroke.opts, 'tolerance', def.defaults.tolerance ?? 40),
  }
  const clip = strokeClip(stroke)
  const r = Math.min(MAX_RADIUS, Math.max(1, stroke.size / 2))
  walkStamps(stroke, from, to, cfg.spacing * stroke.size, (pos) => {
    applyPixelStamp(ctx, clip, params, pos.x, pos.y, r, pos.prevX, pos.prevY)
  })
}
