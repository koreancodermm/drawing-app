import type { Stroke } from '../../canvas/stroke'
import { pieceGeom, type PieceGeom } from '../geom'
import type { ToolDef } from '../types'
import { clamp } from './common'

function widthOf(stroke: Stroke, def: ToolDef, g: PieceGeom): number {
  const cfg = def.line!
  const size = stroke.size
  if (cfg.width === 'const') return Math.max(0.5, size)
  const pressure = (g.pa + g.pb) / 2
  const min = cfg.min ?? 0.25
  if (cfg.width === 'pressure') return Math.max(0.5, size * (min + (1 - min) * pressure))
  // brush: 필압이 낮거나 빨리 그을수록 가늘어진다
  const speedFactor = clamp(1 - g.speed / (size * 5 + 20), 0.35, 1)
  return Math.max(0.5, size * (min + (1 - min) * pressure * speedFactor))
}

/**
 * 획의 조각 [from, to)를 굵기가 있는 선으로 그린다.
 * 지우개는 destination-out으로 그려 캔버스를 투명하게 만든다.
 */
export function drawLinePieces(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  def: ToolDef,
  from: number,
  to: number,
): void {
  const pts = stroke.points
  const n = pts.length
  if (n === 0 || from >= to) return
  const cfg = def.line!
  const erasing = def.id === 'eraser'

  ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'
  ctx.strokeStyle = erasing ? '#000' : stroke.color
  ctx.fillStyle = erasing ? '#000' : stroke.color
  ctx.lineCap = cfg.cap ?? 'round'
  ctx.lineJoin = 'round'

  if (n === 1) {
    if (from === 0) {
      ctx.beginPath()
      const r = Math.max(0.5, stroke.size) / 2
      if (cfg.cap === 'butt' || cfg.cap === 'square') ctx.rect(pts[0].x - r, pts[0].y - r, r * 2, r * 2)
      else ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    return
  }

  for (let k = from; k < Math.min(to, n); k++) {
    const g = pieceGeom(pts, k)
    ctx.lineWidth = widthOf(stroke, def, g)
    ctx.beginPath()
    ctx.moveTo(g.a.x, g.a.y)
    if (g.kind === 'line') ctx.lineTo(g.b.x, g.b.y)
    else ctx.quadraticCurveTo(g.c!.x, g.c!.y, g.b.x, g.b.y)
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'
}
