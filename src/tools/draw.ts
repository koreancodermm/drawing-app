import type { Stroke } from '../canvas/stroke'
import { strokeBounds } from './bounds'
import { drawFill } from './engines/fill'
import { drawLinePieces } from './engines/line'
import { drawClear, drawMove, drawSticker, drawText, drawTransform } from './engines/misc'
import { drawPixelPieces } from './engines/pixel'
import { drawShape } from './engines/shape'
import { drawStampPieces } from './engines/stamp'
import { clipToRegion, type Region } from './regions'
import { getTool } from './registry'
import type { ToolDef } from './types'

/** 대칭 그리기에서 원본과 함께 그릴 변환 목록(캔버스 중심 기준) */
function symmetryTransforms(mode: number): { rotate: number; flipX: boolean; flipY: boolean }[] {
  const id = { rotate: 0, flipX: false, flipY: false }
  switch (mode) {
    case 0:
      return [id, { rotate: 0, flipX: true, flipY: false }]
    case 1:
      return [id, { rotate: 0, flipX: false, flipY: true }]
    case 2:
      return [id, { rotate: 0, flipX: true, flipY: false }, { rotate: 0, flipX: false, flipY: true }, { rotate: Math.PI, flipX: false, flipY: false }]
    case 3:
    case 4: {
      const n = mode === 3 ? 6 : 8
      return Array.from({ length: n }, (_, i) => ({ rotate: (i * Math.PI * 2) / n, flipX: false, flipY: false }))
    }
    default:
      return [id]
  }
}

function drawPiecesRaw(ctx: CanvasRenderingContext2D, stroke: Stroke, def: ToolDef, from: number, to: number): void {
  switch (def.engine) {
    case 'line':
      // 네모 지우개는 도장을 찍는 방식으로 지운다.
      if (def.id === 'eraser' && stroke.opts?.eraserShape === 1) drawStampPieces(ctx, stroke, def, from, to)
      else drawLinePieces(ctx, stroke, def, from, to)
      break
    case 'stamp':
      drawStampPieces(ctx, stroke, def, from, to)
      break
    case 'pixel':
      drawPixelPieces(ctx, stroke, def, from, to)
      break
  }
}

/**
 * 획의 조각 [from, to)를 그린다(도구가 획 조각 단위로 그리는 종류일 때).
 * 선·도장·픽셀 도구는 이 함수로 그리는 도중에 이어 그릴 수 있고,
 * 도형·채우기 같은 나머지 도구는 drawStroke로 한 번에 그린다.
 */
export function drawStrokePieces(ctx: CanvasRenderingContext2D, stroke: Stroke, from: number, to: number): void {
  const def = getTool(stroke.tool)
  if (!def) return
  if (def.engine !== 'line' && def.engine !== 'stamp' && def.engine !== 'pixel') {
    // 조각으로 나눌 수 없는 도구는 끝까지 가서 한 번에 그린다.
    if (to >= stroke.points.length && from === 0) drawWhole(ctx, stroke, def)
    return
  }

  const clip = Array.isArray(stroke.opts?.clip) && stroke.opts.clip.length > 0 ? (stroke.opts.clip as Region) : null
  const symmetric = def.id === 'mirror'
  const usesCanvasClip = def.engine !== 'pixel' // 픽셀 도구는 결과를 쓸 때 직접 선택 영역을 적용한다

  ctx.save()
  if (clip && usesCanvasClip) clipToRegion(ctx, clip)
  if (symmetric) {
    const cx = typeof stroke.opts?.cx === 'number' ? stroke.opts.cx : 0
    const cy = typeof stroke.opts?.cy === 'number' ? stroke.opts.cy : 0
    const mode = typeof stroke.opts?.symmetry === 'number' ? stroke.opts.symmetry : 0
    for (const t of symmetryTransforms(mode)) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t.rotate)
      ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1)
      ctx.translate(-cx, -cy)
      drawPiecesRaw(ctx, stroke, def, from, to)
      ctx.restore()
    }
  } else {
    drawPiecesRaw(ctx, stroke, def, from, to)
  }
  ctx.restore()
}

function drawWhole(ctx: CanvasRenderingContext2D, stroke: Stroke, def: ToolDef): void {
  const clip = Array.isArray(stroke.opts?.clip) && stroke.opts.clip.length > 0 ? (stroke.opts.clip as Region) : null
  switch (def.engine) {
    case 'fill':
      drawFill(ctx, stroke, def)
      return
    case 'move':
      drawMove(ctx, stroke)
      return
    case 'transform':
      drawTransform(ctx, stroke)
      return
    case 'layerop':
      // 레이어 구조를 바꾸는 조작은 픽셀을 그리지 않는다(세션이 따로 처리한다).
      return
    case 'clear':
      drawClear(ctx, stroke)
      return
  }
  ctx.save()
  if (clip) clipToRegion(ctx, clip)
  if (def.engine === 'shape') drawShape(ctx, stroke, def)
  else if (def.engine === 'text') drawText(ctx, stroke)
  else if (def.engine === 'sticker') drawSticker(ctx, stroke)
  ctx.restore()
}

/** 임시 층에 그렸다가 불투명도·혼합 방식을 적용해 합쳐야 하는 도구인지 */
export function isLayered(stroke: Stroke): boolean {
  const def = getTool(stroke.tool)
  return def?.live === 'layer'
}

/**
 * 획 하나를 처음부터 끝까지 그린다(다시 그리기·다시하기·저장본 복원에 쓴다).
 * layer 도구는 획이 지나는 범위만큼의 임시 캔버스에 그린 뒤 합쳐서 겹침으로 진해지지 않게 한다.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const def = getTool(stroke.tool)
  if (!def) return

  if (isLayered(stroke)) {
    const W = ctx.canvas.width
    const H = ctx.canvas.height
    const box = strokeBounds(stroke, W, H)
    if (!box) return
    const bx = Math.floor(box.x0)
    const by = Math.floor(box.y0)
    const bw = Math.max(1, Math.ceil(box.x1) - bx)
    const bh = Math.max(1, Math.ceil(box.y1) - by)
    const layer = document.createElement('canvas')
    layer.width = bw
    layer.height = bh
    const lctx = layer.getContext('2d')
    if (!lctx) return
    lctx.translate(-bx, -by)
    drawStrokePieces(lctx, stroke, 0, stroke.points.length)
    compositeLayer(ctx, layer, bx, by, stroke, def)
    return
  }

  if (def.engine === 'line' || def.engine === 'stamp' || def.engine === 'pixel') {
    drawStrokePieces(ctx, stroke, 0, stroke.points.length)
  } else {
    drawWhole(ctx, stroke, def)
  }
}

/** 임시 층을 캔버스에 합친다. */
export function compositeLayer(
  ctx: CanvasRenderingContext2D,
  layer: CanvasImageSource,
  x: number,
  y: number,
  stroke: Stroke,
  def: ToolDef,
): void {
  const opacity = typeof stroke.opts?.opacity === 'number' ? stroke.opts.opacity : (def.defaults.opacity ?? 1)
  ctx.save()
  ctx.globalAlpha = Math.min(1, Math.max(0, opacity))
  ctx.globalCompositeOperation = def.blend ?? 'source-over'
  ctx.drawImage(layer, x, y)
  ctx.restore()
}
