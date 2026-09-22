/**
 * 복사·잘라내기한 그림. 앱 안에서만 쓰며, 다른 그림으로 옮겨 붙여넣을 수도 있다.
 * (x, y)는 복사한 위치로, 붙여넣을 때 같은 자리에 놓는다.
 */
export interface ClipboardImage {
  canvas: HTMLCanvasElement
  x: number
  y: number
}

let current: ClipboardImage | null = null

export function setClipboard(image: ClipboardImage | null): void {
  current = image
}

export function getClipboard(): ClipboardImage | null {
  return current
}
