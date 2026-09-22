import type { Stroke } from './stroke'

export interface LayerInfo {
  id: string
  name: string
  visible: boolean
  /** 0~1 */
  opacity: number
  locked: boolean
}

/** 레이어가 없던 시절의 저장본과 새 그림의 첫 레이어가 쓰는 아이디 */
export const FIRST_LAYER_ID = 'L0'
export const MAX_LAYERS = 30

/** 레이어 캔버스(그림 한 장 크기)를 만드는 데 쓸 수 있는 메모리 예산(바이트) */
const LAYER_MEMORY_BUDGET = 500 * 1024 * 1024

export function defaultLayers(): LayerInfo[] {
  return [{ id: FIRST_LAYER_ID, name: '레이어 1', visible: true, opacity: 1, locked: false }]
}

/**
 * 이 크기의 그림에서 만들 수 있는 레이어 수.
 * 레이어마다 그림 크기의 캔버스가 있고(오래된 획을 굳히는 캔버스까지 하면 두 배),
 * 큰 용지에서는 메모리가 모자라므로 30개보다 적게 제한한다.
 */
export function maxLayersFor(widthPx: number, heightPx: number): number {
  const perLayer = widthPx * heightPx * 4 * 2
  return Math.max(2, Math.min(MAX_LAYERS, Math.floor(LAYER_MEMORY_BUDGET / perLayer)))
}

export type LayerOp =
  | { op: 'add'; id: string; name: string; index: number }
  | { op: 'delete'; id: string }
  | { op: 'move'; id: string; index: number }
  | { op: 'set'; id: string; key: 'visible' | 'locked'; value: boolean }
  | { op: 'set'; id: string; key: 'opacity'; value: number }
  | { op: 'set'; id: string; key: 'name'; value: string }

export const LAYER_TOOL_ID = '_layer'

let counter = 0
export function newLayerId(): string {
  counter++
  return `L${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}

export function nextLayerName(layers: readonly LayerInfo[]): string {
  const used = new Set(layers.map((l) => l.name))
  for (let n = layers.length + 1; ; n++) {
    const name = `레이어 ${n}`
    if (!used.has(name)) return name
  }
}

/** 레이어 조작을 적용한 새 구조를 돌려준다(원본은 바꾸지 않는다). 적용할 수 없으면 그대로 돌려준다. */
export function applyLayerOp(layers: readonly LayerInfo[], op: LayerOp): LayerInfo[] {
  const list = layers.map((l) => ({ ...l }))
  const at = list.findIndex((l) => l.id === (op.op === 'add' ? '' : op.id))
  switch (op.op) {
    case 'add': {
      if (list.some((l) => l.id === op.id)) return list
      const index = Math.min(list.length, Math.max(0, op.index))
      list.splice(index, 0, { id: op.id, name: op.name, visible: true, opacity: 1, locked: false })
      return list
    }
    case 'delete':
      if (at < 0 || list.length <= 1) return list
      list.splice(at, 1)
      return list
    case 'move': {
      if (at < 0) return list
      const [item] = list.splice(at, 1)
      list.splice(Math.min(list.length, Math.max(0, op.index)), 0, item)
      return list
    }
    case 'set': {
      if (at < 0) return list
      const target = list[at]
      if (op.key === 'visible') target.visible = op.value
      else if (op.key === 'locked') target.locked = op.value
      else if (op.key === 'opacity') target.opacity = Math.min(1, Math.max(0, op.value))
      else target.name = String(op.value)
      return list
    }
  }
}

/** 레이어 조작을 되돌리기 기록에 넣을 수 있는 획으로 바꾼다. */
export function layerOpToStroke(op: LayerOp): Stroke {
  const opts: Stroke['opts'] = { ...(op as unknown as Record<string, string | number>) }
  if (op.op === 'set' && typeof op.value === 'boolean') opts.value = op.value ? 1 : 0
  return { tool: LAYER_TOOL_ID, color: '#000000', size: 1, points: [{ x: 0, y: 0, p: 1 }], opts }
}

export function strokeToLayerOp(stroke: Stroke): LayerOp | null {
  if (stroke.tool !== LAYER_TOOL_ID || !stroke.opts) return null
  const o = stroke.opts
  const id = typeof o.id === 'string' ? o.id : ''
  switch (o.op) {
    case 'add':
      return { op: 'add', id, name: typeof o.name === 'string' ? o.name : '', index: Number(o.index) || 0 }
    case 'delete':
      return { op: 'delete', id }
    case 'move':
      return { op: 'move', id, index: Number(o.index) || 0 }
    case 'set':
      if (o.key === 'visible' || o.key === 'locked') return { op: 'set', id, key: o.key, value: o.value === 1 }
      if (o.key === 'opacity') return { op: 'set', id, key: 'opacity', value: Number(o.value) }
      if (o.key === 'name') return { op: 'set', id, key: 'name', value: String(o.value ?? '') }
      return null
    default:
      return null
  }
}

/** 획이 그려지는 레이어 아이디. 레이어 정보가 없는 옛 획은 첫 레이어에 그려진다. */
export function strokeLayerId(stroke: Stroke): string {
  const layer = stroke.opts?.layer
  return typeof layer === 'string' ? layer : FIRST_LAYER_ID
}

// ---- 저장용 타일 키: "레이어|tx,ty" (레이어 도입 전 저장본은 "tx,ty") ----

export function layerTileKey(layer: string, tx: number, ty: number): string {
  return `${layer}|${tx},${ty}`
}

export function parseLayerTileKey(key: string): { layer: string; tx: number; ty: number } {
  const bar = key.indexOf('|')
  const layer = bar < 0 ? FIRST_LAYER_ID : key.slice(0, bar)
  const [tx, ty] = key.slice(bar + 1).split(',').map(Number)
  return { layer, tx, ty }
}

/** 예전 형식의 타일 키("tx,ty")를 새 형식으로 바꾼다. 이미 새 형식이면 그대로 둔다. */
export function normalizeTileMap(tiles: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, v] of Object.entries(tiles)) {
    const p = parseLayerTileKey(key)
    out[layerTileKey(p.layer, p.tx, p.ty)] = v
  }
  return out
}
