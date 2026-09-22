import type { DrawingSession } from '../canvas/session'
import type { CanvasSpec } from '../canvas/paper'
import { buildPdf } from './pdf'

export type ExportFormat = 'png' | 'jpg' | 'pdf'

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
