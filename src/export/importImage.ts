import type { LayerInfo } from '../canvas/layers'
import type { DrawingSession } from '../canvas/session'

export type ImportMode = 'background' | 'layer'

/**
 * 이미지를 캔버스 안에 놓을 위치와 크기.
 * cover는 캔버스를 빈틈없이 채우고(넘치는 부분은 잘림), contain은 잘리지 않게 안에 맞춘다. 둘 다 가운데에 놓는다.
 */
export function fitRect(
  imageW: number,
  imageH: number,
  canvasW: number,
  canvasH: number,
  mode: 'cover' | 'contain',
): { x: number; y: number; w: number; h: number } {
  const scale =
    mode === 'cover' ? Math.max(canvasW / imageW, canvasH / imageH) : Math.min(canvasW / imageW, canvasH / imageH)
  const w = imageW * scale
  const h = imageH * scale
  return { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h }
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

/**
 * 이미지 파일을 새 레이어로 넣는다.
 * background: 맨 아래 레이어로, 캔버스를 꽉 채운다. layer: 맨 위 레이어로, 잘리지 않게 맞춘다.
 * 레이어가 이미 한도만큼 있으면 null.
 */
export async function importImageAsLayer(
  session: DrawingSession,
  file: Blob,
  name: string,
  mode: ImportMode,
): Promise<LayerInfo | null> {
  const image = await decode(file)
  try {
    const r = fitRect(image.width, image.height, session.width, session.height, mode === 'background' ? 'cover' : 'contain')
    return session.addLayerWithPixels(name, mode === 'background' ? 0 : undefined, (ctx) => {
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image.source, r.x, r.y, r.w, r.h)
    })
  } finally {
    image.close()
  }
}
