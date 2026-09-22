import type { Stroke } from '../../canvas/stroke'
import { clipToRegion, regionBox } from '../regions'
import { num, strokeClip } from './common'

// ---- 텍스트 ----

export const FONT_FAMILIES = [
  '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  '"Batang", "AppleMyungjo", "Noto Serif KR", serif',
  '"Nanum Pen Script", "Comic Sans MS", "Segoe Print", cursive',
  '"D2Coding", "Consolas", "Courier New", monospace',
] as const

export const FONT_NAMES = ['고딕', '명조', '손글씨', '고정폭'] as const

export function drawText(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const text = stroke.opts?.text
  if (typeof text !== 'string' || text === '' || stroke.points.length === 0) return
  const p = stroke.points[0]
  const font = FONT_FAMILIES[Math.min(FONT_FAMILIES.length - 1, Math.max(0, Math.round(num(stroke.opts, 'font', 0))))]
  ctx.font = `${Math.max(6, stroke.size)}px ${font}`
  ctx.fillStyle = stroke.color
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  const lines = text.split('\n')
  const lineHeight = stroke.size * 1.25
  lines.forEach((line, i) => ctx.fillText(line, p.x, p.y + i * lineHeight))
}

// ---- 스티커 ----

/** 단위 크기(-1 ~ 1) 안에 들어가는 그림. 저작권 걱정이 없도록 모두 직접 그린 도형이다. */
type StickerPath = (ctx: CanvasRenderingContext2D) => void

function starPath(points: number, inner: number): StickerPath {
  return (ctx) => {
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? 1 : inner
      const a = -Math.PI / 2 + (i * Math.PI) / points
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
  }
}

export const STICKERS: { name: string; path: StickerPath; detail?: StickerPath }[] = [
  { name: '별', path: starPath(5, 0.45) },
  {
    name: '하트',
    path: (ctx) => {
      ctx.moveTo(0, 0.9)
      ctx.bezierCurveTo(-1.3, 0.1, -0.9, -0.95, 0, -0.35)
      ctx.bezierCurveTo(0.9, -0.95, 1.3, 0.1, 0, 0.9)
      ctx.closePath()
    },
  },
  {
    name: '웃는 얼굴',
    path: (ctx) => {
      ctx.arc(0, 0, 1, 0, Math.PI * 2)
    },
    detail: (ctx) => {
      ctx.moveTo(-0.28, -0.2)
      ctx.arc(-0.35, -0.2, 0.12, 0, Math.PI * 2)
      ctx.moveTo(0.47, -0.2)
      ctx.arc(0.35, -0.2, 0.12, 0, Math.PI * 2)
      ctx.moveTo(-0.55, 0.15)
      ctx.quadraticCurveTo(0, 0.85, 0.55, 0.15)
      ctx.quadraticCurveTo(0, 0.55, -0.55, 0.15)
    },
  },
  {
    name: '체크',
    path: (ctx) => {
      ctx.moveTo(-0.9, 0.05)
      ctx.lineTo(-0.55, -0.3)
      ctx.lineTo(-0.2, 0.2)
      ctx.lineTo(0.55, -0.85)
      ctx.lineTo(0.9, -0.55)
      ctx.lineTo(-0.2, 0.9)
      ctx.closePath()
    },
  },
  {
    name: '꽃',
    path: (ctx) => {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3
        ctx.moveTo(Math.cos(a) * 0.55 + 0.42, Math.sin(a) * 0.55)
        ctx.ellipse(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.42, 0.42, 0, 0, Math.PI * 2)
      }
    },
    detail: (ctx) => {
      ctx.moveTo(0.22, 0)
      ctx.arc(0, 0, 0.22, 0, Math.PI * 2)
    },
  },
  {
    name: '해',
    path: (ctx) => {
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6
        const r = i % 2 === 0 ? 1 : 0.78
        const b = a + Math.PI / 12
        ctx.moveTo(Math.cos(a) * 0.62, Math.sin(a) * 0.62)
        ctx.lineTo(Math.cos(b) * r, Math.sin(b) * r)
        ctx.lineTo(Math.cos(a + Math.PI / 6) * 0.62, Math.sin(a + Math.PI / 6) * 0.62)
      }
      ctx.moveTo(0.6, 0)
      ctx.arc(0, 0, 0.6, 0, Math.PI * 2)
    },
  },
  {
    name: '달',
    path: (ctx) => {
      ctx.arc(0, 0, 1, 0.6, Math.PI * 2 - 0.6)
      ctx.arc(0.45, 0, 0.78, Math.PI * 2 - 0.95, 0.95, true)
      ctx.closePath()
    },
  },
  {
    name: '구름',
    path: (ctx) => {
      ctx.moveTo(-0.7, 0.55)
      ctx.arc(-0.55, 0.2, 0.4, Math.PI * 0.5, Math.PI * 1.5)
      ctx.arc(-0.15, -0.15, 0.5, Math.PI, Math.PI * 1.9)
      ctx.arc(0.4, 0.05, 0.42, Math.PI * 1.5, Math.PI * 0.4)
      ctx.arc(0.55, 0.3, 0.25, -Math.PI * 0.1, Math.PI * 0.5)
      ctx.closePath()
    },
  },
  {
    name: '번개',
    path: (ctx) => {
      ctx.moveTo(0.25, -1)
      ctx.lineTo(-0.6, 0.15)
      ctx.lineTo(-0.05, 0.15)
      ctx.lineTo(-0.3, 1)
      ctx.lineTo(0.65, -0.25)
      ctx.lineTo(0.05, -0.25)
      ctx.closePath()
    },
  },
  {
    name: '다이아몬드',
    path: (ctx) => {
      ctx.moveTo(0, -1)
      ctx.lineTo(0.75, 0)
      ctx.lineTo(0, 1)
      ctx.lineTo(-0.75, 0)
      ctx.closePath()
    },
  },
  {
    name: '음표',
    path: (ctx) => {
      ctx.moveTo(0.05, -0.95)
      ctx.lineTo(0.05, 0.55)
      ctx.lineTo(0.28, 0.55)
      ctx.lineTo(0.28, -0.55)
      ctx.lineTo(0.85, -0.35)
      ctx.lineTo(0.85, -0.85)
      ctx.closePath()
      ctx.moveTo(0.05 + 0.4, 0.6)
      ctx.ellipse(-0.15, 0.62, 0.4, 0.3, -0.3, 0, Math.PI * 2)
    },
  },
  { name: '별 여덟 개', path: starPath(8, 0.6) },
]

export function drawSticker(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length === 0) return
  const p = stroke.points[0]
  const item = STICKERS[Math.min(STICKERS.length - 1, Math.max(0, Math.round(num(stroke.opts, 'sticker', 0))))]
  const half = Math.max(2, stroke.size) / 2
  const c2 = typeof stroke.opts?.color2 === 'string' ? (stroke.opts.color2 as string) : '#ffffff'
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.scale(half, half)
  ctx.beginPath()
  item.path(ctx)
  ctx.fillStyle = stroke.color
  ctx.fill()
  if (item.detail) {
    ctx.beginPath()
    item.detail(ctx)
    ctx.fillStyle = c2
    ctx.fill()
  }
  ctx.restore()
}

// ---- 선택 영역 이동·지우기 ----

/** 선택 영역의 그림을 (dx, dy)만큼 옮긴다. 원래 자리는 비운다. */
export function drawMove(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const clip = strokeClip(stroke)
  const pts = stroke.points
  if (!clip || pts.length < 2) return
  const dx = Math.round(pts[pts.length - 1].x - pts[0].x)
  const dy = Math.round(pts[pts.length - 1].y - pts[0].y)
  const box = regionBox(clip)
  if (!box || (dx === 0 && dy === 0)) return
  const bx = Math.max(0, Math.floor(box.x0))
  const by = Math.max(0, Math.floor(box.y0))
  const bw = Math.min(ctx.canvas.width, Math.ceil(box.x1)) - bx
  const bh = Math.min(ctx.canvas.height, Math.ceil(box.y1)) - by
  if (bw <= 0 || bh <= 0) return

  const scratch = document.createElement('canvas')
  scratch.width = bw
  scratch.height = bh
  const sctx = scratch.getContext('2d')
  if (!sctx) return
  sctx.translate(-bx, -by)
  clipToRegion(sctx, clip)
  sctx.drawImage(ctx.canvas, 0, 0)

  ctx.save()
  clipToRegion(ctx, clip)
  ctx.clearRect(bx, by, bw, bh)
  ctx.restore()
  ctx.drawImage(scratch, bx + dx, by + dy)
}

/** 선택 영역 안의 그림을 지운다. */
export function drawClear(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const clip = strokeClip(stroke)
  if (!clip) return
  const box = regionBox(clip)
  if (!box) return
  ctx.save()
  clipToRegion(ctx, clip)
  ctx.clearRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
  ctx.restore()
}

/** 선택 영역의 그림을 행렬(크기·회전·뒤집기·이동)대로 변형한다. 원래 자리는 비운다. */
export function drawTransform(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const clip = strokeClip(stroke)
  const m = Array.isArray(stroke.opts?.m) ? (stroke.opts!.m as number[][])[0] : null
  if (!clip || !m || m.length !== 6) return
  const box = regionBox(clip)
  if (!box) return
  const bx = Math.max(0, Math.floor(box.x0))
  const by = Math.max(0, Math.floor(box.y0))
  const bw = Math.min(ctx.canvas.width, Math.ceil(box.x1)) - bx
  const bh = Math.min(ctx.canvas.height, Math.ceil(box.y1)) - by
  if (bw <= 0 || bh <= 0) return

  const scratch = document.createElement('canvas')
  scratch.width = bw
  scratch.height = bh
  const sctx = scratch.getContext('2d')
  if (!sctx) return
  sctx.translate(-bx, -by)
  clipToRegion(sctx, clip)
  sctx.drawImage(ctx.canvas, 0, 0)

  ctx.save()
  clipToRegion(ctx, clip)
  ctx.clearRect(bx, by, bw, bh)
  ctx.restore()

  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5])
  ctx.drawImage(scratch, bx, by)
  ctx.restore()
}
