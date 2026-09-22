/** 화면 좌표 = 종이 좌표 × zoom + (x, y) */
export interface View {
  zoom: number
  x: number
  y: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** (cx, cy) 위치의 종이 지점이 그대로 그 자리에 있도록 확대·축소한다. */
export function zoomAt(view: View, nextZoom: number, cx: number, cy: number): View {
  const zoom = clampZoom(nextZoom)
  const px = (cx - view.x) / view.zoom
  const py = (cy - view.y) / view.zoom
  return { zoom, x: cx - px * zoom, y: cy - py * zoom }
}

/** 종이 전체가 화면 안에 들어오도록 맞추고 가운데에 놓는다. */
export function fitView(
  viewportW: number,
  viewportH: number,
  paperW: number,
  paperH: number,
  margin = 0.92,
): View {
  if (viewportW <= 0 || viewportH <= 0) return { zoom: 1, x: 0, y: 0 }
  const zoom = clampZoom(Math.min(viewportW / paperW, viewportH / paperH) * margin)
  return {
    zoom,
    x: (viewportW - paperW * zoom) / 2,
    y: (viewportH - paperH * zoom) / 2,
  }
}

/** 종이가 화면 밖으로 완전히 사라지지 않도록 위치를 제한한다. */
export function keepVisible(
  view: View,
  viewportW: number,
  viewportH: number,
  paperW: number,
  paperH: number,
  keep = 80,
): View {
  const w = paperW * view.zoom
  const h = paperH * view.zoom
  const x = Math.min(viewportW - keep, Math.max(keep - w, view.x))
  const y = Math.min(viewportH - keep, Math.max(keep - h, view.y))
  return { ...view, x, y }
}
