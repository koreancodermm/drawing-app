import { useEffect, useRef } from 'react'
import type { Stroke } from '../canvas/stroke'
import { drawStroke } from '../tools/draw'
import { resolveSettings } from '../tools/settings'
import type { ToolDef } from '../tools/types'
import { ICON_H, ICON_W, drawToolIcon, hasToolIcon } from './toolIcons'

const W = ICON_W
const H = ICON_H

/** 화면 한 칸당 실제 픽셀 수(폰·고해상도 화면에서 미리보기가 흐려지지 않게 그만큼 크게 그린다). 최대 3배. */
function pixelRatio(): number {
  const r = typeof window === 'undefined' ? 1 : window.devicePixelRatio
  return Math.min(3, Math.max(1, Number.isFinite(r) && r ? r : 1))
}

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
  // 끝이 뭉툭한 굵은 선(형광펜)은 짧은 조각을 이어 그리면 조각 사이에 이음새가 줄무늬처럼 보여서, 미리보기는 곧은 한 줄로 보여 준다.
  if (def.line?.cap === 'butt') {
    return [
      { x: 9, y: 25, p: 1 },
      { x: 55, y: 10, p: 1 },
    ]
  }
  const pts: Stroke['points'] = []
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push({ x: 7 + t * 50, y: H / 2 + Math.sin(t * Math.PI * 2) * 8, p: 0.25 + 0.75 * Math.sin(t * Math.PI) })
  }
  return pts
}

/**
 * 도구가 실제로 그리는 모습(획 미리보기)이나, 직접 그린 도구 그림(toolIcons.ts)을 작게 보여 준다.
 * 둘 다 없는 도구만 그림 글자(이모지)로 대신한다.
 */
function hasCanvasPreview(def: ToolDef): boolean {
  return def.engine === 'line' || def.engine === 'stamp' || def.engine === 'shape' || hasToolIcon(def.id)
}

export default function ToolPreview({ def, color = '#1f2328' }: { def: ToolDef; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const canvasPreview = hasCanvasPreview(def)
  const dpr = pixelRatio()

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !canvasPreview) return
    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, W * dpr, H * dpr)
      // 직접 그린 도구 그림은 좌표를 64×34 칸 기준으로 두고 화면 배율만큼 확대해서 그린다.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (drawToolIcon(ctx, def.id, color)) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      // 획 미리보기는 임시 층을 쓰는 도구도 있어서(형광펜 등) 변환을 쓰지 않고, 좌표·굵기·간격을 배율만큼 키워서 그린다.
      // (변환을 쓰면 임시 층이 1배 해상도로 그려진 뒤 확대되어 흐려진다.)
      const k = dpr
      const s = resolveSettings(def, undefined)
      // 작은 미리보기에 맞게 굵기를 줄인다.
      const size = Math.min(s.size, def.engine === 'shape' ? 3 : def.id === 'highlighter' ? 12 : 9)
      const stroke: Stroke = {
        tool: def.id,
        color,
        size: size * k,
        points: samplePoints(def).map((p) => ({ x: p.x * k, y: p.y * k, p: p.p })),
        opts: {
          seed: 7,
          cx: (W / 2) * k,
          cy: (H / 2) * k,
          dpi: 150 * k,
          ...(s.opacity !== undefined ? { opacity: s.opacity } : {}),
          ...(s.softness !== undefined ? { softness: s.softness } : {}),
          ...(s.lineStyle !== undefined ? { lineStyle: s.lineStyle } : {}),
          ...(s.fill !== undefined ? { fill: s.fill } : {}),
          ...(s.sides !== undefined ? { sides: s.sides } : {}),
          // 종이 결이 있는 도구는 미리보기에도 결이 드러나게 한다.
          ...(s.grain !== undefined ? { grain: s.grain } : {}),
        },
      }
      if (def.id === 'eraser') {
        ctx.fillStyle = '#c9ced6'
        ctx.fillRect(0, 0, W * k, H * k)
      }
      drawStroke(ctx, stroke)
    } catch {
      // 미리보기를 그리지 못해도 도구는 쓸 수 있다.
    }
  }, [def, color, canvasPreview, dpr])

  if (!canvasPreview) {
    return (
      <span className="tool-glyph" aria-hidden="true">
        {def.glyph}
      </span>
    )
  }
  return <canvas ref={ref} className="tool-preview" width={W * dpr} height={H * dpr} aria-hidden="true" />
}
