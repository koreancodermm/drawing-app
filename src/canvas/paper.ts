export type Orientation = 'portrait' | 'landscape'
export type Unit = 'mm' | 'px'

export interface PaperPreset {
  id: string
  label: string
  /** 세로 방향 기준 크기(mm) */
  widthMm: number
  heightMm: number
}

export const PAPER_PRESETS: readonly PaperPreset[] = [
  { id: 'A0', label: 'A0', widthMm: 841, heightMm: 1189 },
  { id: 'A1', label: 'A1', widthMm: 594, heightMm: 841 },
  { id: 'A2', label: 'A2', widthMm: 420, heightMm: 594 },
  { id: 'A3', label: 'A3', widthMm: 297, heightMm: 420 },
  { id: 'A4', label: 'A4', widthMm: 210, heightMm: 297 },
  { id: 'A5', label: 'A5', widthMm: 148, heightMm: 210 },
  { id: 'A6', label: 'A6', widthMm: 105, heightMm: 148 },
  { id: 'B0', label: 'B0', widthMm: 1000, heightMm: 1414 },
  { id: 'B1', label: 'B1', widthMm: 707, heightMm: 1000 },
  { id: 'B2', label: 'B2', widthMm: 500, heightMm: 707 },
  { id: 'B3', label: 'B3', widthMm: 353, heightMm: 500 },
  { id: 'B4', label: 'B4', widthMm: 250, heightMm: 353 },
  { id: 'B5', label: 'B5', widthMm: 176, heightMm: 250 },
  { id: 'B6', label: 'B6', widthMm: 125, heightMm: 176 },
]

export const CUSTOM_PRESET_ID = 'custom'

export const DEFAULT_DPI = 150
export const MIN_DPI = 72
export const MAX_DPI = 300
/** 브라우저 캔버스 한 변의 안전한 최댓값 */
export const MAX_SIDE_PX = 16384
/** 이 픽셀 수를 넘으면 만들 수 없다 */
export const MAX_PIXELS = 100_000_000
/** 이 픽셀 수를 넘으면 메모리 경고를 보여 준다 */
export const WARN_PIXELS = 10_000_000

const MM_PER_INCH = 25.4

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi)
}

export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH
}

export interface CanvasSpec {
  widthPx: number
  heightPx: number
  dpi: number
  widthMm: number
  heightMm: number
  background: string
}

export interface PaperInput {
  presetId: string
  orientation: Orientation
  unit: Unit
  customWidth: number
  customHeight: number
  dpi: number
  background: string
}

export interface SpecResult {
  spec: CanvasSpec | null
  error: string | null
  warning: string | null
}

function fail(error: string): SpecResult {
  return { spec: null, error, warning: null }
}

export function buildCanvasSpec(input: PaperInput): SpecResult {
  const { dpi } = input
  if (!Number.isFinite(dpi) || dpi < MIN_DPI || dpi > MAX_DPI) {
    return fail(`해상도(DPI)는 ${MIN_DPI}~${MAX_DPI} 사이여야 합니다.`)
  }

  let widthPx: number
  let heightPx: number
  let widthMm: number
  let heightMm: number

  if (input.presetId === CUSTOM_PRESET_ID) {
    const { customWidth, customHeight } = input
    if (
      !Number.isFinite(customWidth) ||
      !Number.isFinite(customHeight) ||
      customWidth <= 0 ||
      customHeight <= 0
    ) {
      return fail('가로와 세로를 0보다 큰 숫자로 입력해 주세요.')
    }
    if (input.unit === 'mm') {
      widthMm = customWidth
      heightMm = customHeight
      widthPx = mmToPx(customWidth, dpi)
      heightPx = mmToPx(customHeight, dpi)
    } else {
      widthPx = Math.round(customWidth)
      heightPx = Math.round(customHeight)
      widthMm = pxToMm(widthPx, dpi)
      heightMm = pxToMm(heightPx, dpi)
    }
  } else {
    const preset = PAPER_PRESETS.find((p) => p.id === input.presetId)
    if (!preset) return fail('용지 크기를 선택해 주세요.')
    const landscape = input.orientation === 'landscape'
    widthMm = landscape ? preset.heightMm : preset.widthMm
    heightMm = landscape ? preset.widthMm : preset.heightMm
    widthPx = mmToPx(widthMm, dpi)
    heightPx = mmToPx(heightMm, dpi)
  }

  if (widthPx < 1 || heightPx < 1) return fail('크기가 너무 작습니다.')
  if (widthPx > MAX_SIDE_PX || heightPx > MAX_SIDE_PX) {
    return fail(`한 변은 ${MAX_SIDE_PX}px을 넘을 수 없습니다. 크기나 해상도를 줄여 주세요.`)
  }
  const pixels = widthPx * heightPx
  if (pixels > MAX_PIXELS) {
    return fail('그림이 너무 큽니다. 해상도(DPI)를 낮추거나 더 작은 용지를 골라 주세요.')
  }

  const warning =
    pixels > WARN_PIXELS
      ? '크기가 커서 메모리를 많이 씁니다. 기기에 따라 느려지거나 앱이 종료될 수 있습니다.'
      : null

  return {
    spec: { widthPx, heightPx, dpi, widthMm, heightMm, background: input.background },
    error: null,
    warning,
  }
}

/** RGBA 캔버스 한 장이 쓰는 대략적인 메모리(MB) */
export function estimateMemoryMb(widthPx: number, heightPx: number): number {
  return (widthPx * heightPx * 4) / (1024 * 1024)
}
