import type { Stroke, StrokeOpts, ToolId } from '../canvas/stroke'
import { isToolId } from '../tools/registry'
import type { LayerInfo } from '../canvas/layers'
import type { AllToolSettings } from '../tools/settings'

/** 저장용으로 줄인 획. 점은 x, y, 필압을 차례로 늘어놓은 Float32Array다. */
export interface EncodedStroke {
  t: ToolId
  c: string
  s: number
  p: Float32Array
  /** 도구 옵션(JSON 문자열). 옵션이 없는 획에는 없다 */
  x?: string
  /** 내용 검사값 */
  h: number
}

export interface UiState {
  tool: ToolId
  color: string
  size: number
  view: { zoom: number; x: number; y: number } | null
  /** 보조 색(그라데이션 끝 색, 도형 채움색 등) */
  color2?: string
  /** 도구별로 마지막에 쓴 옵션 값 */
  settings?: AllToolSettings
  /** 마지막으로 그리던 레이어 */
  activeLayer?: string
}

export const DEFAULT_UI: UiState = { tool: 'ballpoint', color: '#000000', size: 8, view: null }

/** 어느 한 시점의 저장본. 픽셀은 타일 조각으로 따로 저장하고 어느 버전을 쓰는지만 적는다. */
export interface Snapshot {
  seq: number
  savedAt: number
  strokes: EncodedStroke[]
  redo: EncodedStroke[]
  /** "레이어|tx,ty" → 타일 버전 (레이어 도입 전 저장본은 "tx,ty") */
  tiles: Record<string, number>
  ui: UiState
  /** 오래된 획을 굳힌 시점의 레이어 구조. 없으면 레이어 하나짜리(레이어 도입 전 저장본) */
  layers?: LayerInfo[]
  checksum: number
}

const textEncoder = new TextEncoder()

export function fnv1a(bytes: Uint8Array, seed = 0x811c9dc5): number {
  let h = seed
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function hashStroke(t: string, c: string, s: number, p: Float32Array, x?: string): number {
  const head = fnv1a(textEncoder.encode(x ? `${t}|${c}|${s}|${x}` : `${t}|${c}|${s}`))
  return fnv1a(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), head)
}

// 끝난 획은 바뀌지 않으므로 한 번 만든 저장용 획을 재사용한다.
const encodeCache = new WeakMap<Stroke, EncodedStroke>()

export function encodeStroke(stroke: Stroke): EncodedStroke {
  const cached = encodeCache.get(stroke)
  if (cached) return cached
  const p = new Float32Array(stroke.points.length * 3)
  stroke.points.forEach((pt, i) => {
    p[i * 3] = pt.x
    p[i * 3 + 1] = pt.y
    p[i * 3 + 2] = pt.p
  })
  const x = stroke.opts && Object.keys(stroke.opts).length > 0 ? JSON.stringify(stroke.opts) : undefined
  const encoded: EncodedStroke = {
    t: stroke.tool,
    c: stroke.color,
    s: stroke.size,
    p,
    ...(x ? { x } : {}),
    h: hashStroke(stroke.tool, stroke.color, stroke.size, p, x),
  }
  encodeCache.set(stroke, encoded)
  return encoded
}

export function decodeStroke(encoded: EncodedStroke): Stroke {
  const points = []
  for (let i = 0; i + 2 < encoded.p.length; i += 3) {
    points.push({ x: encoded.p[i], y: encoded.p[i + 1], p: encoded.p[i + 2] })
  }
  const stroke: Stroke = { tool: encoded.t, color: encoded.c, size: encoded.s, points }
  if (encoded.x) stroke.opts = JSON.parse(encoded.x) as StrokeOpts
  return stroke
}

export function computeChecksum(
  strokes: readonly EncodedStroke[],
  redo: readonly EncodedStroke[],
  tiles: Record<string, number>,
  ui: UiState,
  layers?: readonly LayerInfo[],
): number {
  const text = JSON.stringify({
    s: strokes.map((x) => x.h),
    r: redo.map((x) => x.h),
    t: Object.keys(tiles)
      .sort()
      .map((k) => [k, tiles[k]]),
    u: ui,
    // 레이어 정보가 있을 때만 넣어서, 레이어 도입 전 저장본의 검사값이 그대로 맞도록 한다.
    ...(layers ? { l: layers } : {}),
  })
  return fnv1a(textEncoder.encode(text))
}

export function buildSnapshot(
  seq: number,
  savedAt: number,
  strokes: EncodedStroke[],
  redo: EncodedStroke[],
  tiles: Record<string, number>,
  ui: UiState,
  layers?: LayerInfo[],
): Snapshot {
  return {
    seq,
    savedAt,
    strokes,
    redo,
    tiles,
    ui,
    ...(layers ? { layers } : {}),
    checksum: computeChecksum(strokes, redo, tiles, ui, layers),
  }
}

function isTool(value: unknown): value is ToolId {
  return isToolId(value)
}

function isOptsJson(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value !== 'string') return false
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

/** 실행 환경(iframe, 테스트)이 달라도 타입을 알아보도록 태그로도 확인한다. */
function isFloat32Array(value: unknown): value is Float32Array {
  return value instanceof Float32Array || Object.prototype.toString.call(value) === '[object Float32Array]'
}

function isEncodedStroke(value: unknown): value is EncodedStroke {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    isTool(s.t) &&
    typeof s.c === 'string' &&
    typeof s.s === 'number' &&
    typeof s.h === 'number' &&
    isFloat32Array(s.p) &&
    s.p.length % 3 === 0 &&
    isOptsJson(s.x) &&
    hashStroke(s.t, s.c, s.s, s.p, s.x as string | undefined) === s.h
  )
}

function isUiState(value: unknown): value is UiState {
  if (typeof value !== 'object' || value === null) return false
  const u = value as Record<string, unknown>
  if (!isTool(u.tool) || typeof u.color !== 'string' || typeof u.size !== 'number') return false
  if (u.color2 !== undefined && typeof u.color2 !== 'string') return false
  if (u.activeLayer !== undefined && typeof u.activeLayer !== 'string') return false
  if (u.settings !== undefined) {
    if (typeof u.settings !== 'object' || u.settings === null) return false
    for (const value of Object.values(u.settings)) {
      if (typeof value !== 'object' || value === null) return false
      if (!Object.values(value).every((n) => typeof n === 'number' && Number.isFinite(n))) return false
    }
  }
  if (u.view === null) return true
  if (typeof u.view !== 'object') return false
  const v = u.view as Record<string, unknown>
  return [v.zoom, v.x, v.y].every((n) => typeof n === 'number' && Number.isFinite(n))
}

function isLayerInfo(value: unknown): value is LayerInfo {
  if (typeof value !== 'object' || value === null) return false
  const l = value as Record<string, unknown>
  return (
    typeof l.id === 'string' &&
    typeof l.name === 'string' &&
    typeof l.visible === 'boolean' &&
    typeof l.locked === 'boolean' &&
    typeof l.opacity === 'number' &&
    l.opacity >= 0 &&
    l.opacity <= 1
  )
}

/** 저장본이 온전한지(모양, 획 내용, 전체 검사값) 확인한다. */
export function verifySnapshot(value: unknown): value is Snapshot {
  try {
    if (typeof value !== 'object' || value === null) return false
    const s = value as Record<string, unknown>
    if (typeof s.seq !== 'number' || typeof s.savedAt !== 'number' || typeof s.checksum !== 'number') {
      return false
    }
    if (!Array.isArray(s.strokes) || !Array.isArray(s.redo)) return false
    if (!s.strokes.every(isEncodedStroke) || !s.redo.every(isEncodedStroke)) return false
    if (typeof s.tiles !== 'object' || s.tiles === null) return false
    const tiles = s.tiles as Record<string, unknown>
    if (!Object.values(tiles).every((v) => typeof v === 'number')) return false
    if (!isUiState(s.ui)) return false
    if (s.layers !== undefined && (!Array.isArray(s.layers) || s.layers.length === 0 || !s.layers.every(isLayerInfo))) {
      return false
    }
    return (
      computeChecksum(
        s.strokes as EncodedStroke[],
        s.redo as EncodedStroke[],
        tiles as Record<string, number>,
        s.ui,
        s.layers as LayerInfo[] | undefined,
      ) === s.checksum
    )
  } catch {
    return false
  }
}
