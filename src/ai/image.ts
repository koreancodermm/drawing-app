import { GEMINI } from './config'

/** 그림 캔버스를 작게 줄여 JPEG base64(앞의 data: 표시 없이)로 만든다. 보내는 양을 줄이기 위해서다. */
export function canvasToJpegBase64(source: HTMLCanvasElement): string {
  const scale = Math.min(1, GEMINI.imageMaxSide / Math.max(source.width, source.height))
  const w = Math.max(1, Math.round(source.width * scale))
  const h = Math.max(1, Math.round(source.height * scale))
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('그림을 이미지로 만들지 못했습니다.')
  ctx.drawImage(source, 0, 0, w, h)
  const url = out.toDataURL('image/jpeg', GEMINI.imageQuality)
  const comma = url.indexOf(',')
  if (!url.startsWith('data:image/jpeg') || comma < 0) throw new Error('그림을 이미지로 만들지 못했습니다.')
  return url.slice(comma + 1)
}
