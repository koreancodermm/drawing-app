import type { Stroke } from '../canvas/stroke'
import { pointsBox } from './geom'
import { regionBox, translateRegion, type Box, type Region } from './regions'
import { getTool } from './registry'
import { applyMatrix, type Matrix } from './transform'

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function union(a: Box, b: Box): Box {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}

function pad(b: Box, m: number): Box {
  return { x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m }
}

function intersect(a: Box, b: Box): Box | null {
  const x0 = Math.max(a.x0, b.x0)
  const y0 = Math.max(a.y0, b.y0)
  const x1 = Math.min(a.x1, b.x1)
  const y1 = Math.min(a.y1, b.y1)
  return x1 < x0 || y1 < y0 ? null : { x0, y0, x1, y1 }
}

/**
 * 획이 그림에 영향을 줄 수 있는 범위(캔버스 안으로 자른 것).
 * 저장할 때 어느 타일이 바뀌었는지 알아내고, 임시 층의 크기를 정하는 데 쓴다.
 * 범위를 알 수 없는 도구(채우기 등)는 캔버스 전체를 돌려준다.
 */
export function strokeBounds(stroke: Stroke, width: number, height: number): Box | null {
  const whole: Box = { x0: 0, y0: 0, x1: width, y1: height }
  const def = getTool(stroke.tool)
  if (!def) return null
  const pts = stroke.points
  const box = pointsBox(pts)
  if (!box) return null
  const opts = stroke.opts
  const clip = (Array.isArray(opts?.clip) ? (opts!.clip as Region) : null) ?? null
  const clipBox = clip ? regionBox(clip) : null
  const size = stroke.size

  let result: Box | null
  switch (def.engine) {
    case 'fill':
    case 'pixel':
      // 픽셀을 읽어 처리하므로 붓 주변만 바뀌는 픽셀 도구는 붓 범위, 채우기는 전체
      result = def.engine === 'fill' ? whole : pad(box, Math.min(110, size / 2) + 6)
      break
    case 'clear':
      result = clipBox
      break
    case 'layerop':
      return null
    case 'transform': {
      const m = Array.isArray(opts?.m) ? ((opts!.m as number[][])[0] as Matrix) : null
      if (!clip || !clipBox || !m || m.length !== 6) return null
      const corners = [
        applyMatrix(m, clipBox.x0, clipBox.y0),
        applyMatrix(m, clipBox.x1, clipBox.y0),
        applyMatrix(m, clipBox.x1, clipBox.y1),
        applyMatrix(m, clipBox.x0, clipBox.y1),
      ]
      const moved = {
        x0: Math.min(...corners.map((c) => c.x)) - 2,
        y0: Math.min(...corners.map((c) => c.y)) - 2,
        x1: Math.max(...corners.map((c) => c.x)) + 2,
        y1: Math.max(...corners.map((c) => c.y)) + 2,
      }
      result = union(clipBox, moved)
      break
    }
    case 'move': {
      if (!clip || !clipBox) return null
      const dx = pts[pts.length - 1].x - pts[0].x
      const dy = pts[pts.length - 1].y - pts[0].y
      const moved = regionBox(translateRegion(clip, dx, dy))
      result = moved ? union(clipBox, moved) : clipBox
      break
    }
    case 'text': {
      const text = typeof opts?.text === 'string' ? opts.text : ''
      const lines = text.split('\n')
      const longest = Math.max(1, ...lines.map((l) => l.length))
      const p = pts[0]
      result = { x0: p.x - 4, y0: p.y - 4, x1: p.x + longest * size * 1.3 + 8, y1: p.y + lines.length * size * 1.3 + 8 }
      break
    }
    case 'sticker': {
      const p = pts[0]
      result = pad({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }, size * 0.75 + 4)
      break
    }
    case 'shape': {
      const a = pts[0]
      const b = pts[pts.length - 1]
      if (def.shape === 'polygon' || def.shape === 'star') {
        const r = Math.hypot(b.x - a.x, b.y - a.y)
        result = pad({ x0: a.x - r, y0: a.y - r, x1: a.x + r, y1: a.y + r }, size + 2)
      } else if (def.shape === 'ruler') {
        const r = Math.hypot(b.x - a.x, b.y - a.y) + num(opts?.dpi, 150) * 0.6
        result = pad({ x0: a.x - r, y0: a.y - r, x1: a.x + r, y1: a.y + r }, size + 2)
      } else if (def.shape === 'arrow') {
        result = pad(box, Math.max(size * 3.5, 14) + size)
      } else if (def.shape === 'curve') {
        result = pad(box, size * 2 + 4)
      } else {
        result = pad(box, size + 2)
      }
      break
    }
    case 'stamp': {
      const spread = (def.stamp?.scatter ?? 0) * size
      result = pad(box, size * 0.5 + spread + 4)
      break
    }
    default:
      result = pad(box, size * 0.5 + 2)
  }

  if (!result) return null
  // 대칭 그리기는 반대편에도 그려지므로 전체를 바뀐 것으로 본다.
  if (def.id === 'mirror') result = whole
  if (clipBox && def.engine !== 'move' && def.engine !== 'clear' && def.engine !== 'transform') {
    result = intersect(result, clipBox)
    if (!result) return null
  }
  return intersect(result, whole)
}
