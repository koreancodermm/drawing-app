import type { Stroke, StrokePoint } from '../../canvas/stroke'
import type { ToolDef } from '../types'
import { clamp, num } from './common'

/** 곡선 도구: 처음~끝 점을 잇는 선에서 가장 멀리 벗어난 점을 지나는 2차 곡선의 조절점 */
export function curveControl(pts: readonly StrokePoint[]): { x: number; y: number } {
  const a = pts[0]
  const b = pts[pts.length - 1]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  let best = 0
  let peak = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  for (const p of pts) {
    // 부호가 있는 거리(선의 어느 쪽인지 알기 위해)
    const dist = (dx * (p.y - a.y) - dy * (p.x - a.x)) / len
    if (Math.abs(dist) > Math.abs(best)) {
      best = dist
      peak = p
    }
  }
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  // 곡선이 peak를 지나도록 조절점을 반대편으로 밀어낸다(t=0.5에서 곡선 위치 = (a + 2c + b)/4).
  return { x: 2 * peak.x - mx, y: 2 * peak.y - my }
}

function applyLineStyle(ctx: CanvasRenderingContext2D, style: number, size: number): void {
  if (style === 1) ctx.setLineDash([size * 3.5, size * 2.5])
  else if (style === 2) ctx.setLineDash([0.01, size * 2])
  else ctx.setLineDash([])
}

/** 정다각형·별의 꼭짓점 */
export function polygonPoints(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  sides: number,
  star: boolean,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  const count = star ? sides * 2 : sides
  for (let i = 0; i < count; i++) {
    const r = star && i % 2 === 1 ? radius * 0.45 : radius
    const a = angle + (i * Math.PI * 2) / count
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  return out
}

function finish(ctx: CanvasRenderingContext2D, fillMode: number, fillColor: string, stroke: Stroke, line: boolean): void {
  if (fillMode >= 1 && line) {
    ctx.fillStyle = fillMode === 2 ? fillColor : stroke.color
    ctx.fill()
  }
  if (fillMode !== 1 || !line) ctx.stroke()
}

function drawRuler(ctx: CanvasRenderingContext2D, a: StrokePoint, b: StrokePoint, stroke: Stroke): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < 4) return
  const dpi = num(stroke.opts, 'dpi', 150)
  const mm = dpi / 25.4
  const thick = mm * 14
  ctx.save()
  ctx.translate(a.x, a.y)
  ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x))
  ctx.lineWidth = stroke.size
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.setLineDash([])
  ctx.strokeRect(0, 0, len, thick)
  ctx.beginPath()
  const total = Math.floor(len / mm)
  for (let i = 0; i <= total; i++) {
    const x = i * mm
    const tick = i % 10 === 0 ? mm * 5 : i % 5 === 0 ? mm * 3.5 : mm * 2
    ctx.moveTo(x, 0)
    ctx.lineTo(x, tick)
  }
  ctx.stroke()
  ctx.font = `${Math.max(8, mm * 3)}px sans-serif`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (let i = 10; i <= total; i += 10) ctx.fillText(String(i / 10), i * mm + mm * 0.5, mm * 5.5)
  ctx.restore()
}

function drawGrid(ctx: CanvasRenderingContext2D, a: StrokePoint, b: StrokePoint, stroke: Stroke): void {
  const dpi = num(stroke.opts, 'dpi', 150)
  const step = Math.max(2, (dpi / 25.4) * num(stroke.opts, 'step', 10))
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  ctx.lineWidth = stroke.size
  ctx.strokeStyle = stroke.color
  ctx.setLineDash([])
  ctx.beginPath()
  for (let x = x0; x <= x1 + 0.01; x += step) {
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y1)
  }
  for (let y = y0; y <= y1 + 0.01; y += step) {
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
  }
  ctx.stroke()
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
}

/** 처음~끝 점으로 정해지는 도형을 통째로 그린다. */
export function drawShape(ctx: CanvasRenderingContext2D, stroke: Stroke, def: ToolDef): void {
  const pts = stroke.points
  if (pts.length < 2) return
  const a = pts[0]
  const b = pts[pts.length - 1]
  const size = Math.max(0.5, stroke.size)
  const fillMode = num(stroke.opts, 'fill', 0)
  const c2 = typeof stroke.opts?.color2 === 'string' ? (stroke.opts.color2 as string) : stroke.color
  const style = num(stroke.opts, 'lineStyle', 0)

  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = size
  ctx.lineCap = style === 2 ? 'round' : 'butt'
  ctx.lineJoin = 'miter'
  ctx.miterLimit = 4
  applyLineStyle(ctx, style, size)

  switch (def.shape) {
    case 'line': {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      break
    }
    case 'rect': {
      ctx.beginPath()
      ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
      finish(ctx, fillMode, c2, stroke, true)
      break
    }
    case 'ellipse': {
      ctx.beginPath()
      ctx.ellipse(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.max(0.5, Math.abs(b.x - a.x) / 2),
        Math.max(0.5, Math.abs(b.y - a.y) / 2),
        0,
        0,
        Math.PI * 2,
      )
      finish(ctx, fillMode, c2, stroke, true)
      break
    }
    case 'polygon':
    case 'star': {
      const radius = Math.hypot(b.x - a.x, b.y - a.y)
      const sides = clamp(Math.round(num(stroke.opts, 'sides', 5)), 3, 12)
      const list = polygonPoints(a.x, a.y, radius, Math.atan2(b.y - a.y, b.x - a.x), sides, def.shape === 'star')
      ctx.beginPath()
      list.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      finish(ctx, fillMode, c2, stroke, true)
      break
    }
    case 'arrow': {
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const head = Math.max(size * 3.5, 14)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x - Math.cos(ang) * head * 0.6, b.y - Math.sin(ang) * head * 0.6)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = stroke.color
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - Math.cos(ang - 0.45) * head, b.y - Math.sin(ang - 0.45) * head)
      ctx.lineTo(b.x - Math.cos(ang + 0.45) * head, b.y - Math.sin(ang + 0.45) * head)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'curve': {
      const c = curveControl(pts)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y)
      ctx.stroke()
      break
    }
    case 'ruler':
      drawRuler(ctx, a, b, stroke)
      break
    case 'grid':
      drawGrid(ctx, a, b, stroke)
      break
  }
  ctx.setLineDash([])
}
