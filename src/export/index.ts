import type { DrawingSession } from '../canvas/session'
import type { CanvasSpec } from '../canvas/paper'
import { rgbaToCmykBytes } from './cmyk'
import { buildPdf } from './pdf'

export type ExportFormat = 'png' | 'jpg' | 'pdf' | 'cmyk-pdf'

/** 이보다 큰 용지는 CMYK(압축 없는 4채널) 내보내기를 막는다(메모리를 너무 많이 써서). B2 정도까지는 된다. */
export const CMYK_MAX_PIXELS = 15_000_000

export interface ExportOptions {
  /** PNG에서 종이 색을 깔지 않고 투명하게 내보낸다 */
  transparent?: boolean
}

export interface ExportResult {
  blob: Blob
  extension: string
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지를 만들지 못했습니다. 그림이 너무 크면 용지 크기나 해상도를 줄여 보세요.'))),
      type,
      quality,
    )
  })
}

/**
 * 보이는 레이어를 불투명도대로 합쳐서 파일로 만든다.
 * PNG는 종이 색을 깔거나(기본) 투명하게 내보내고, JPG·PDF는 항상 종이 색을 깐다.
 */
export async function renderExport(
  session: DrawingSession,
  spec: CanvasSpec,
  format: ExportFormat,
  options: ExportOptions = {},
): Promise<ExportResult> {
  if (format === 'png') {
    const flat = session.flatten(options.transparent ? null : spec.background)
    return { blob: await canvasToBlob(flat, 'image/png'), extension: 'png' }
  }
  const flat = session.flatten(spec.background)
  if (format === 'jpg') {
    return { blob: await canvasToBlob(flat, 'image/jpeg', 0.92), extension: 'jpg' }
  }
  if (format === 'cmyk-pdf') {
    if (spec.widthPx * spec.heightPx > CMYK_MAX_PIXELS) {
      throw new Error('이 용지는 CMYK 내보내기에 너무 큽니다. B2보다 작은 용지에서 시도해 주세요.')
    }
    const ctx = flat.getContext('2d')
    if (!ctx) throw new Error('그림을 읽지 못했습니다.')
    const { data } = ctx.getImageData(0, 0, flat.width, flat.height)
    const cmyk = rgbaToCmykBytes(data, flat.width * flat.height)
    const pdf = buildPdf({ cmyk, widthPx: spec.widthPx, heightPx: spec.heightPx, widthMm: spec.widthMm, heightMm: spec.heightMm })
    return { blob: new Blob([pdf as BlobPart], { type: 'application/pdf' }), extension: 'pdf' }
  }
  const jpeg = new Uint8Array(await (await canvasToBlob(flat, 'image/jpeg', 0.95)).arrayBuffer())
  const pdf = buildPdf({
    jpeg,
    widthPx: spec.widthPx,
    heightPx: spec.heightPx,
    widthMm: spec.widthMm,
    heightMm: spec.heightMm,
  })
  return { blob: new Blob([pdf as BlobPart], { type: 'application/pdf' }), extension: 'pdf' }
}

/** 파일 이름에 쓸 수 없는 글자를 바꾼다. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim()
  return cleaned === '' ? '그림' : cleaned.slice(0, 80)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
