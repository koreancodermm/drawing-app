import type { Stroke } from '../../canvas/stroke'
import { rgba } from '../geom'
import { rand01 } from '../prng'
import type { ToolDef } from '../types'
import { clamp, num } from './common'
import { walkStamps, type StampPos } from './walk'

// ---- 부드러운 도장(원형 그라데이션) 그림을 만들어 두고 재사용한다 ----

const tipCache = new Map<string, HTMLCanvasElement>()
const TIP_CACHE_MAX = 48

function softTip(radius: number, softness: number, color: string): HTMLCanvasElement | null {
  const r = Math.max(1, Math.ceil(radius))
  const soft = Math.round(clamp(softness, 0, 1) * 10) / 10
  const key = `${r}|${soft}|${color}`
  const hit = tipCache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = r * 2
  canvas.height = r * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r)
  const hard = 1 - soft
  grad.addColorStop(0, rgba(color, 1))
  grad.addColorStop(Math.min(0.999, hard), rgba(color, 1))
  grad.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, r * 2, r * 2)
  if (tipCache.size >= TIP_CACHE_MAX) tipCache.delete(tipCache.keys().next().value as string)
  tipCache.set(key, canvas)
  return canvas
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45
    const a = rot + (i * Math.PI) / 5
    const px = x + Math.cos(a) * rad
    const py = y + Math.sin(a) * rad
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
}

/** 도장 하나를 찍는다. 질감은 획의 난수 씨앗과 도장 번호로 정해지므로 다시 그려도 같다. */
function stampOne(ctx: CanvasRenderingContext2D, stroke: Stroke, def: ToolDef, pos: StampPos): void {
  const cfg = def.stamp!
  const opts = stroke.opts
  const seed = num(opts, 'seed', 0)
  const idx = pos.index
  const opacity = num(opts, 'opacity', 1)
  const erasing = def.id === 'eraser'

  let r = stroke.size / 2
  if (cfg.pressureSize) r *= 1 - cfg.pressureSize + cfg.pressureSize * pos.p
  if (cfg.jitter) r *= 1 - cfg.jitter * 0.5 * rand01(seed, idx, 1)
  r = Math.max(0.4, r)

  let alpha = erasing ? 1 : cfg.flow * opacity
  if (cfg.pressureAlpha) alpha *= 0.35 + 0.65 * pos.p
  alpha = clamp(alpha, 0, 1)

  let x = pos.x
  let y = pos.y
  if (cfg.scatter) {
    const spread = cfg.scatter * stroke.size
    x += (rand01(seed, idx, 2) - 0.5) * 2 * spread
    y += (rand01(seed, idx, 3) - 0.5) * 2 * spread
  }

  const color = erasing ? '#000000' : stroke.color
  ctx.fillStyle = color

  switch (cfg.tip) {
    case 'soft': {
      const tip = softTip(r, num(opts, 'softness', 0.8), color)
      if (!tip) return
      ctx.globalAlpha = alpha
      ctx.drawImage(tip, x - r, y - r, r * 2, r * 2)
      break
    }
    case 'grain': {
      const dots = clamp(Math.round(r * r * 0.14), 4, 90)
      const dotSize = Math.max(0.8, Math.min(2.4, r * 0.28))
      for (let d = 0; d < dots; d++) {
        const ang = rand01(seed, idx, 10 + d * 3) * Math.PI * 2
        const dist = Math.sqrt(rand01(seed, idx, 11 + d * 3)) * r
        ctx.globalAlpha = clamp(alpha * (0.35 + 0.65 * rand01(seed, idx, 12 + d * 3)), 0, 1)
        const s = dotSize * (0.7 + 0.6 * rand01(seed, idx, 13 + d * 3))
        ctx.fillRect(x + Math.cos(ang) * dist - s / 2, y + Math.sin(ang) * dist - s / 2, s, s)
      }
      break
    }
    case 'bristle': {
      const bristles = clamp(Math.round(stroke.size / 2.5), 4, 30)
      const nx = -pos.dirY
      const ny = pos.dirX
      const dotR = Math.max(0.7, (r / bristles) * 1.15)
      for (let i = 0; i < bristles; i++) {
        const t = ((i + 0.5) / bristles) * 2 - 1
        const off = t * r + (rand01(seed, idx, 20 + i) - 0.5) * (r / bristles)
        const along = (rand01(seed, idx, 60 + i) - 0.5) * 2
        ctx.globalAlpha = clamp(alpha * (0.6 + 0.4 * rand01(seed, idx, 100 + i)), 0, 1)
        ctx.beginPath()
        ctx.arc(x + nx * off + pos.dirX * along, y + ny * off + pos.dirY * along, dotR, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'flat': {
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.ellipse(x, y, r, Math.max(0.6, r * 0.22), -Math.PI / 4, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'motif': {
      const kind = Math.floor(rand01(seed, idx, 4) * 3)
      const s = r * (0.3 + 0.7 * rand01(seed, idx, 5))
      const rot = rand01(seed, idx, 6) * Math.PI * 2
      ctx.globalAlpha = alpha
      if (kind === 0) drawStar(ctx, x, y, s, rot)
      else if (kind === 1) {
        ctx.beginPath()
        ctx.arc(x, y, s * 0.6, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.fillRect(-s * 0.5, -s * 0.5, s, s)
        ctx.restore()
      }
      break
    }
    case 'square': {
      ctx.globalAlpha = alpha
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
      break
    }
  }
}

/** 획의 조각 [from, to)를 따라 도장을 찍는다. */
export function drawStampPieces(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  def: ToolDef,
  from: number,
  to: number,
): void {
  const cfg = def.stamp!
  const erasing = def.id === 'eraser'
  ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'
  walkStamps(stroke, from, to, cfg.spacing * stroke.size, (pos) => stampOne(ctx, stroke, def, pos))
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}
