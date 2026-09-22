import type { Stroke, StrokeOpts } from '../../canvas/stroke'
import { clipToRegion, type Region } from '../regions'

export function num(opts: StrokeOpts | undefined, key: string, fallback: number): number {
  const v = opts?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function strokeClip(stroke: Stroke): Region | null {
  const clip = stroke.opts?.clip
  return Array.isArray(clip) && clip.length > 0 ? (clip as Region) : null
}

/**
 * 계산이 끝난 픽셀 조각(ImageData)을 캔버스의 (x, y)에 그대로 덮어쓴다.
 * 선택 영역이 있으면 그 안쪽만 바뀐다. (putImageData는 선택 영역을 무시하므로
 * 임시 캔버스에 올려 clip 상태에서 'copy'로 덮어쓴다.)
 */
export function commitImage(
  ctx: CanvasRenderingContext2D,
  image: ImageData,
  x: number,
  y: number,
  clip: Region | null,
): void {
  if (!clip) {
    ctx.putImageData(image, x, y)
    return
  }
  const temp = document.createElement('canvas')
  temp.width = image.width
  temp.height = image.height
  temp.getContext('2d')?.putImageData(image, 0, 0)
  ctx.save()
  clipToRegion(ctx, clip)
  ctx.beginPath()
  ctx.rect(x, y, image.width, image.height)
  ctx.clip()
  ctx.globalCompositeOperation = 'copy'
  ctx.drawImage(temp, x, y)
  ctx.restore()
}
