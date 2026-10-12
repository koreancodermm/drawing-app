import type { Stroke } from '../../canvas/stroke'
import { rgba } from '../geom'
import { paperGrain, tooth, washCloud } from '../grain'
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

  // 종이 결 옵션(grain)이 들어 있는 획만 새 질감으로 그린다. 옵션이 없는 옛 저장본의 획은 예전 그대로 다시 그려
  // 앱을 업데이트해도 이미 그린 그림의 모양이 바뀌지 않는다.
  const modern = typeof opts?.grain === 'number'
  const gs = modern ? clamp(num(opts, 'grain', 0), 0, 1) : 0
  // 수채·수묵처럼 물감이 번지는 붓: 같은 자리에서도 농도가 고르지 않고 군데군데 고이거나 옅어진다.
  if (modern && gs > 0 && cfg.tip === 'soft' && !erasing) {
    alpha = clamp(alpha * (1 + gs * 1.1 * (washCloud(x, y) - 0.5)), 0, 1)
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
      const dotSize = Math.max(0.8, Math.min(2.4, r * 0.28))
      if (!modern) {
        const dots = clamp(Math.round(r * r * 0.14), 4, 90)
        for (let d = 0; d < dots; d++) {
          const ang = rand01(seed, idx, 10 + d * 3) * Math.PI * 2
          const dist = Math.sqrt(rand01(seed, idx, 11 + d * 3)) * r
          ctx.globalAlpha = clamp(alpha * (0.35 + 0.65 * rand01(seed, idx, 12 + d * 3)), 0, 1)
          const s = dotSize * (0.7 + 0.6 * rand01(seed, idx, 13 + d * 3))
          ctx.fillRect(x + Math.cos(ang) * dist - s / 2, y + Math.sin(ang) * dist - s / 2, s, s)
        }
        break
      }
      // 종이 결을 타고 묻는다: 종이가 솟은 곳(paperGrain이 작은 곳)에 먼저 묻고, 세게(진하게) 눌러야 움푹한 곳(큰 곳)까지 채워진다.
      // 일부 알갱이는 걸러지므로 그만큼 알갱이를 더 흩뿌린다.
      const dots = clamp(Math.round(r * r * 0.14 * (1 + 1.2 * gs)), 4, 130)
      const level = 0.15 + 0.75 * alpha
      for (let d = 0; d < dots; d++) {
        const ang = rand01(seed, idx, 10 + d * 3) * Math.PI * 2
        const dist = Math.sqrt(rand01(seed, idx, 11 + d * 3)) * r
        const px = x + Math.cos(ang) * dist
        const py = y + Math.sin(ang) * dist
        const caught = 1 - gs + gs * tooth(paperGrain(px, py), level)
        if (caught <= 0.02) continue
        ctx.globalAlpha = clamp((0.55 + 0.45 * rand01(seed, idx, 12 + d * 3)) * Math.min(1, 0.45 + alpha) * caught, 0, 1)
        const s = dotSize * (0.7 + 0.6 * rand01(seed, idx, 13 + d * 3))
        ctx.fillRect(px - s / 2, py - s / 2, s, s)
      }
      break
    }
    case 'bristle': {
      const nx = -pos.dirY
      const ny = pos.dirX
      if (modern) {
        // 털마다 자리·물감 양이 획 내내 고정되어 있고, 털 한 가닥을 이전 도장 자리에서 지금 자리까지 이은 선으로 그려서
        // 붓을 끌면 끊김 없는 줄무늬(붓 자국)가 남는다. 길게 그을수록 물감이 떨어져 물감이 적은 털부터 옅어진다(마른 붓).
        const bristles = clamp(Math.round(stroke.size / 2.2), 5, 36)
        const unit = r / bristles // 털 사이 간격의 절반 정도
        const dry = Math.min(0.5, idx / 260) * (0.4 + 0.6 * gs)
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineCap = 'butt'
        for (let i = 0; i < bristles; i++) {
          const t = ((i + 0.5) / bristles) * 2 - 1
          // 털의 자리는 획 내내 거의 같지만, 줄이 자를 댄 듯 반듯하지 않게 아주 천천히 물결친다.
          const wobble = Math.sin(idx * 0.08 + rand01(seed, 0, 180 + i) * 6.283) * unit * 0.18
          const off = t * r + (rand01(seed, 0, 20 + i) - 0.5) * unit + wobble
          const load = 0.55 + 0.45 * rand01(seed, 0, 140 + i)
          const wet = clamp((load - dry) / 0.25, 0, 1)
          if (wet <= 0) continue
          // 털마다 굵기가 달라(이웃과 조금씩 겹치거나 틈이 생겨서) 면은 대체로 덮이고 줄무늬는 불규칙하게 남는다.
          const lineW = Math.max(0.8, unit * (1.9 + 1.0 * rand01(seed, 0, 220 + i)))
          ctx.lineWidth = lineW
          const bx = pos.x + nx * off
          const by = pos.y + ny * off
          const qx = pos.prevX + nx * off
          const qy = pos.prevY + ny * off
          const onPaper = gs > 0 ? 1 - gs * 0.55 + gs * 0.55 * tooth(paperGrain(bx, by), 0.2 + 0.7 * alpha, 0.2) : 1
          ctx.globalAlpha = clamp(alpha * (0.4 + 0.6 * rand01(seed, 0, 100 + i)) * wet * onPaper, 0, 1)
          ctx.beginPath()
          if (Math.hypot(bx - qx, by - qy) < 0.01) {
            ctx.arc(bx, by, lineW / 2, 0, Math.PI * 2)
            ctx.fill()
          } else {
            ctx.moveTo(qx, qy)
            ctx.lineTo(bx, by)
            ctx.stroke()
          }
        }
        ctx.restore()
        break
      }
      const bristles = clamp(Math.round(stroke.size / 2.5), 4, 30)
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
