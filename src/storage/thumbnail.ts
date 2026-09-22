/** 캔버스를 작게 줄여 PNG 바이트로 만든다. 배경색을 깔아 투명한 부분이 검게 보이지 않게 한다. */
export async function renderThumbnail(
  source: HTMLCanvasElement,
  background: string,
  maxSide = 240,
): Promise<ArrayBuffer | null> {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? blob.arrayBuffer() : null
}
