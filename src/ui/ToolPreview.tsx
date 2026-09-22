import { useEffect, useRef } from 'react'
import type { Stroke } from '../canvas/stroke'
import { drawStroke } from '../tools/draw'
import { resolveSettings } from '../tools/settings'
import type { ToolDef } from '../tools/types'

const W = 64
const H = 34

/** 미리보기에 그릴 물결 모양 점들 */
function samplePoints(def: ToolDef): Stroke['points'] {
  const shape = def.shape
  if (def.engine === 'shape') {
    if (shape === 'polygon' || shape === 'star') {
      return [
        { x: W / 2, y: H / 2 + 1, p: 1 },
        { x: W / 2 + 13, y: H / 2 - 6, p: 1 },
      ]
    }
    if (shape === 'curve') {
      return [
        { x: 8, y: 26, p: 1 },
        { x: 20, y: 8, p: 1 },
        { x: 36, y: 8, p: 1 },
        { x: 56, y: 26, p: 1 },
      ]
    }
    return [
      { x: 9, y: 26, p: 1 },
      { x: 55, y: 9, p: 1 },
    ]
  }
  const pts: Stroke['points'] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    pts.push({ x: 7 + t * 50, y: H / 2 + Math.sin(t * Math.PI * 2) * 8, p: 0.25 + 0.75 * Math.sin(t * Math.PI) })
  }
  return pts
}

/** 도구가 실제로 그리는 모습을 작게 미리 보여 준다. 그릴 수 없는 도구는 그림 글자로 대신한다. */
function hasCanvasPreview(def: ToolDef): boolean {
  return def.engine === 'line' || def.engine === 'stamp' || def.engine === 'shape'
}

export default function ToolPreview({ def, color = '#1f2328' }: { def: ToolDef; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const canvasPreview = hasCanvasPreview(def)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !canvasPreview) return
    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, W, H)
      const s = resolveSettings(def, undefined)
      // 작은 미리보기에 맞게 굵기를 줄인다.
      const size = Math.min(s.size, def.engine === 'shape' ? 3 : def.id === 'highlighter' ? 12 : 9)
      const stroke: Stroke = {
        tool: def.id,
        color,
        size,
        points: samplePoints(def),
        opts: {
          seed: 7,
          cx: W / 2,
          cy: H / 2,
          dpi: 150,
          ...(s.opacity !== undefined ? { opacity: s.opacity } : {}),
          ...(s.softness !== undefined ? { softness: s.softness } : {}),
          ...(s.lineStyle !== undefined ? { lineStyle: s.lineStyle } : {}),
          ...(s.fill !== undefined ? { fill: s.fill } : {}),
          ...(s.sides !== undefined ? { sides: s.sides } : {}),
        },
      }
      if (def.id === 'eraser') {
        ctx.fillStyle = '#c9ced6'
        ctx.fillRect(0, 0, W, H)
      }
      drawStroke(ctx, stroke)
    } catch {
      // 미리보기를 그리지 못해도 도구는 쓸 수 있다.
    }
  }, [def, color, canvasPreview])

  if (!canvasPreview) {
    return (
      <span className="tool-glyph" aria-hidden="true">
        {def.glyph}
      </span>
    )
  }
  return <canvas ref={ref} className="tool-preview" width={W} height={H} aria-hidden="true" />
}
