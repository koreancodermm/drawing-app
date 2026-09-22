import { strokeBounds } from '../tools/bounds'
import { compositeLayer, drawStroke, drawStrokePieces } from '../tools/draw'
import { floodMask } from '../tools/flood'
import { maskToRegion, regionBox, type Region } from '../tools/regions'
import { getTool } from '../tools/registry'
import type { ToolDef } from '../tools/types'
import { UndoHistory } from './history'
import {
  applyLayerOp,
  defaultLayers,
  layerOpToStroke,
  layerTileKey,
  maxLayersFor,
  newLayerId,
  nextLayerName,
  parseLayerTileKey,
  strokeLayerId,
  strokeToLayerOp,
  type LayerInfo,
  type LayerOp,
} from './layers'
import type { Stroke, StrokePoint } from './stroke'
import { TILE_SIZE, tilesInBounds } from './tiles'

export const MAX_UNDO_STEPS = 100

export interface TileData {
  layer: string
  tx: number
  ty: number
  /** TILE_SIZE × TILE_SIZE RGBA 원본 픽셀. 완전히 투명하면 null */
  data: ArrayBuffer | null
}

export interface RestoreState {
  /** 오래된 획을 굳힌 시점의 레이어 구조. 없으면 레이어 하나짜리(예전 저장본) */
  layers?: LayerInfo[]
  tiles: { layer: string; tx: number; ty: number; data: Uint8ClampedArray }[]
  strokes: Stroke[]
  redo: Stroke[]
}

export interface SessionOptions {
  width: number
  height: number
  maxUndo?: number
  maxLayers?: number
  /** 레이어 캔버스를 만드는 함수(기본은 document.createElement) */
  createCanvas?: () => HTMLCanvasElement
}

interface LiveStroke {
  stroke: Stroke
  def: ToolDef
  layerId: string
  /** 지금까지 캔버스(또는 임시 층)에 그린 조각 수 */
  drawn: number
  /** 필터를 거치지 않은 마지막 입력 점(손떨림 보정 도구용) */
  lastRaw: StrokePoint
}

function cloneLayers(layers: readonly LayerInfo[]): LayerInfo[] {
  return layers.map((l) => ({ ...l }))
}

/**
 * 그림 한 장의 그리기 상태(레이어 여러 장).
 *
 * - 레이어마다 그림 크기의 캔버스가 있다. 캔버스는 투명하게 두고 종이 색은 화면에서 따로 깐다.
 * - 되돌리기 기록에는 획뿐 아니라 레이어 추가·삭제·순서·보이기·불투명도·잠금 조작도 들어간다.
 *   최근 100개까지는 목록으로 들고 있어 되돌리고, 그보다 오래된 것은 base(구조 + 레이어별 캔버스)에 굳힌다.
 * - 다시 그릴 때는 base에서 시작해 기록을 처음부터 다시 적용하므로, 어떤 순서로 되돌려도 결과가 같다.
 * - base가 바뀐 타일은 dirtyTiles에 모아 두었다가 저장할 때만 다시 쓴다.
 *
 * 그리는 동안의 보여 주기 방식은 도구마다 다르다(ToolDef.live).
 */
export class DrawingSession {
  onChange: (() => void) | null = null
  /** 레이어 구조나 순서, 캔버스가 바뀌었을 때(화면이 캔버스를 다시 배치해야 할 때) */
  onLayersChange: (() => void) | null = null

  readonly width: number
  readonly height: number
  readonly maxLayers: number

  private readonly makeCanvas: () => HTMLCanvasElement
  private readonly history: UndoHistory<Stroke>
  /** 지금 레이어 구조(바닥→맨 위 순서) */
  private structure: LayerInfo[] = defaultLayers()
  /** base 시점의 레이어 구조 */
  private baseStructure: LayerInfo[] = defaultLayers()
  private live = new Map<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>()
  private bases = new Map<string, HTMLCanvasElement>()
  private current: LiveStroke | null = null
  private dirtyTiles = new Set<string>()
  private overlay: HTMLCanvasElement | null = null
  private overlayCtx: CanvasRenderingContext2D | null = null

  constructor(options: SessionOptions) {
    this.width = options.width
    this.height = options.height
    this.maxLayers = options.maxLayers ?? maxLayersFor(options.width, options.height)
    this.makeCanvas = options.createCanvas ?? (() => document.createElement('canvas'))
    this.history = new UndoHistory<Stroke>(
      options.maxUndo ?? MAX_UNDO_STEPS,
      (item) => this.commitToBase(item),
      (item) => this.discardOrphan(item),
    )
    this.renderAll()
  }

  // ---- 조회 ----

  /** 그리는 동안 획을 임시로 보여 줄 캔버스(레이어 위에 겹쳐 놓은 것)를 연결한다. */
  setOverlay(canvas: HTMLCanvasElement | null): void {
    this.overlay = canvas
    this.overlayCtx = null
  }

  get layers(): readonly LayerInfo[] {
    return this.structure
  }

  /** 바닥부터 맨 위까지 레이어와 캔버스 */
  orderedLayers(): { info: LayerInfo; canvas: HTMLCanvasElement }[] {
    return this.structure.map((info) => ({ info, canvas: this.liveEntry(info.id).canvas }))
  }

  layerCanvas(id: string): HTMLCanvasElement | null {
    return this.structure.some((l) => l.id === id) ? this.liveEntry(id).canvas : null
  }

  get isDrawing(): boolean {
    return this.current !== null
  }

  get canUndo(): boolean {
    return this.history.canUndo
  }

  get canRedo(): boolean {
    return this.history.canRedo
  }

  get hasDirtyTiles(): boolean {
    return this.dirtyTiles.size > 0
  }

  /** 저장할 되돌리기·다시하기 기록(그리는 중인 획은 포함하지 않는다) */
  exportHistory(): { strokes: Stroke[]; redo: Stroke[] } {
    return { strokes: [...this.history.undoable], redo: [...this.history.redoable] }
  }

  /** 저장할 base 시점의 레이어 구조 */
  exportBaseLayers(): LayerInfo[] {
    return cloneLayers(this.baseStructure)
  }

  /** 보이는 레이어를 합친 (x, y) 픽셀 색 [r, g, b, a] */
  sampleColor(x: number, y: number): [number, number, number, number] {
    const px = Math.floor(x)
    const py = Math.floor(y)
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return [0, 0, 0, 0]
    const probe = this.makeCanvas()
    probe.width = 1
    probe.height = 1
    const pctx = probe.getContext('2d', { willReadFrequently: true })
    if (!pctx) return [0, 0, 0, 0]
    for (const { info, canvas } of this.orderedLayers()) {
      if (!info.visible) continue
      pctx.globalAlpha = info.opacity
      pctx.drawImage(canvas, -px, -py)
    }
    const d = pctx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3]]
  }

  /** 레이어의 (x, y)와 색이 비슷하게 이어진 영역을 선택 영역(직사각형 목록)으로 만든다. */
  floodRegion(layerId: string, x: number, y: number, tolerance: number): Region | null {
    const entry = this.structure.some((l) => l.id === layerId) ? this.liveEntry(layerId) : null
    if (!entry) return null
    const image = entry.ctx.getImageData(0, 0, this.width, this.height)
    const result = floodMask(image.data, this.width, this.height, Math.floor(x), Math.floor(y), tolerance, true)
    if (!result.box) return null
    return maskToRegion(result.mask, this.width, this.height)
  }

  /** 레이어에서 선택 영역 안의 그림을 복사한다(붙여넣기용). 영역 밖은 투명하다. */
  copyRegion(layerId: string, region: Region): { canvas: HTMLCanvasElement; x: number; y: number } | null {
    const box = regionBox(region)
    if (!box || !this.structure.some((l) => l.id === layerId)) return null
    const x = Math.max(0, Math.floor(box.x0))
    const y = Math.max(0, Math.floor(box.y0))
    const w = Math.min(this.width, Math.ceil(box.x1)) - x
    const h = Math.min(this.height, Math.ceil(box.y1)) - y
    if (w <= 0 || h <= 0) return null
    const canvas = this.makeCanvas()
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.translate(-x, -y)
    ctx.beginPath()
    for (const poly of region) {
      if (poly.length < 6) continue
      ctx.moveTo(poly[0], poly[1])
      for (let i = 2; i + 1 < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1])
      ctx.closePath()
    }
    ctx.clip()
    ctx.drawImage(this.liveEntry(layerId).canvas, 0, 0)
    return { canvas, x, y }
  }

  /**
   * 보이는 레이어를 불투명도대로 합친 그림. background가 있으면 종이 색을 깔고, null이면 투명하게 둔다.
   * 내보내기와 썸네일에 쓴다.
   */
  flatten(background: string | null): HTMLCanvasElement {
    const out = this.makeCanvas()
    out.width = this.width
    out.height = this.height
    const ctx = out.getContext('2d')
    if (!ctx) return out
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, this.width, this.height)
    }
    for (const { info, canvas } of this.orderedLayers()) {
      if (!info.visible) continue
      ctx.globalAlpha = info.opacity
      ctx.drawImage(canvas, 0, 0)
    }
    ctx.globalAlpha = 1
    return out
  }

  // ---- 그리기 ----

  beginStroke(stroke: Stroke): void {
    if (this.current) this.cancelStroke()
    const def = getTool(stroke.tool)
    if (!def) return
    const layerId = this.structure.some((l) => l.id === strokeLayerId(stroke)) ? strokeLayerId(stroke) : this.structure[0].id
    this.current = { stroke, def, layerId, drawn: 0, lastRaw: stroke.points[0] }
    if (def.live === 'layer' || def.live === 'preview') this.prepareOverlay(stroke, def)
  }

  extendStroke(points: readonly StrokePoint[]): void {
    const cur = this.current
    if (!cur || points.length === 0) return
    const { stroke, def } = cur
    const smooth = def.line?.stabilize ?? 0
    for (const raw of points) {
      cur.lastRaw = raw
      if (smooth > 0) {
        const last = stroke.points[stroke.points.length - 1]
        stroke.points.push({
          x: last.x + (raw.x - last.x) * (1 - smooth),
          y: last.y + (raw.y - last.y) * (1 - smooth),
          p: last.p + (raw.p - last.p) * (1 - smooth),
        })
      } else {
        stroke.points.push(raw)
      }
    }

    if (def.live === 'preview') {
      const octx = this.overlayContext()
      if (octx) {
        octx.clearRect(0, 0, this.width, this.height)
        drawStroke(octx, stroke)
      }
      return
    }
    if (def.live === 'instant' || def.live === 'none') return

    // 조각 k를 그리려면 점 k+1이 있어야 하므로 마지막 조각은 끝날 때까지 남겨 둔다.
    const n = stroke.points.length
    const safe = n >= 2 ? n - 1 : 0
    if (safe > cur.drawn) {
      const target = def.live === 'layer' ? this.overlayContext() : this.liveEntry(cur.layerId).ctx
      if (target) drawStrokePieces(target, stroke, cur.drawn, safe)
      cur.drawn = safe
    }
  }

  endStroke(): Stroke | null {
    const cur = this.current
    if (!cur) return null
    this.current = null
    const { stroke, def } = cur
    const target = this.liveEntry(cur.layerId).ctx

    // 손떨림 보정으로 뒤처진 끝을 실제 마지막 입력 위치까지 이어 준다.
    if ((def.line?.stabilize ?? 0) > 0) {
      const last = stroke.points[stroke.points.length - 1]
      if (last.x !== cur.lastRaw.x || last.y !== cur.lastRaw.y) stroke.points.push(cur.lastRaw)
    }

    switch (def.live) {
      case 'direct':
        drawStrokePieces(target, stroke, cur.drawn, stroke.points.length)
        break
      case 'layer': {
        const octx = this.overlayContext()
        if (octx && this.overlay) {
          drawStrokePieces(octx, stroke, cur.drawn, stroke.points.length)
          compositeLayer(target, this.overlay, 0, 0, stroke, def)
        }
        this.releaseOverlay()
        break
      }
      case 'preview':
        drawStroke(target, stroke)
        this.releaseOverlay()
        break
      default:
        drawStroke(target, stroke)
    }
    this.history.push(stroke)
    this.onChange?.()
    return stroke
  }

  cancelStroke(): void {
    const cur = this.current
    if (!cur) return
    this.current = null
    this.releaseOverlay()
    // 바로 그리는 도구만 캔버스에 흔적이 남으므로 이 경우에만 다시 그린다.
    if (cur.def.live === 'direct') this.renderAll()
  }

  // ---- 레이어 조작 ----

  /** 레이어 조작을 실행하고 되돌리기 기록에 넣는다. 적용할 수 없으면 false. */
  applyLayerOperation(op: LayerOp): boolean {
    if (this.current) return false
    if (op.op === 'add' && this.structure.length >= this.maxLayers) return false
    if (op.op === 'delete' && this.structure.length <= 1) return false
    if (op.op !== 'add' && !this.structure.some((l) => l.id === op.id)) return false
    const stroke = layerOpToStroke(op)
    this.history.push(stroke)
    this.applyItem(stroke)
    this.notifyLayers()
    this.onChange?.()
    return true
  }

  /** 새 레이어를 만들어 맨 위(또는 index 자리)에 놓는다. 만든 레이어 정보를 돌려준다. */
  addLayer(name?: string, index?: number): LayerInfo | null {
    const info: LayerInfo = {
      id: newLayerId(),
      name: name ?? nextLayerName(this.structure),
      visible: true,
      opacity: 1,
      locked: false,
    }
    const ok = this.applyLayerOperation({ op: 'add', id: info.id, name: info.name, index: index ?? this.structure.length })
    return ok ? info : null
  }

  /**
   * 그림이 미리 그려진 새 레이어를 만든다(이미지 불러오기, 붙여넣기).
   * 그림은 base 캔버스에 곧바로 굳히고, 레이어 추가만 되돌리기 기록에 넣는다.
   * 되돌리면 레이어가 통째로 사라진다.
   */
  addLayerWithPixels(name: string, index: number | undefined, draw: (ctx: CanvasRenderingContext2D) => void): LayerInfo | null {
    if (this.current || this.structure.length >= this.maxLayers) return null
    const info: LayerInfo = { id: newLayerId(), name, visible: true, opacity: 1, locked: false }
    const baseCtx = this.baseContext(info.id)
    if (!baseCtx) return null
    draw(baseCtx)
    this.markAllTilesDirty(info.id)
    const ok = this.applyLayerOperation({ op: 'add', id: info.id, name, index: index ?? this.structure.length })
    if (!ok) {
      this.discardBase(info.id)
      return null
    }
    return info
  }

  // ---- 되돌리기·다시하기 ----

  undo(): boolean {
    if (this.current || !this.history.undo()) return false
    this.renderAll()
    this.onChange?.()
    return true
  }

  redo(): boolean {
    if (this.current) return false
    const stroke = this.history.redo()
    if (!stroke) return false
    this.applyItem(stroke)
    this.notifyLayers()
    this.onChange?.()
    return true
  }

  // ---- 저장·복원 ----

  /**
   * 바뀐 타일의 픽셀을 꺼낸다. 호출하면 바뀜 표시가 지워지므로,
   * 저장에 실패하면 markTilesDirty로 되돌려 놓아야 한다.
   */
  takeDirtyTiles(): TileData[] {
    const result: TileData[] = []
    for (const key of this.dirtyTiles) {
      const { layer, tx, ty } = parseLayerTileKey(key)
      const base = this.bases.get(layer)
      const baseCtx = base ? this.baseContext(layer) : null
      if (!baseCtx) {
        result.push({ layer, tx, ty, data: null })
        continue
      }
      const image = baseCtx.getImageData(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
      const px = image.data
      let empty = true
      for (let i = 3; i < px.length; i += 4) {
        if (px[i] !== 0) {
          empty = false
          break
        }
      }
      result.push({ layer, tx, ty, data: empty ? null : (px.buffer as ArrayBuffer) })
    }
    this.dirtyTiles.clear()
    return result
  }

  markTilesDirty(tiles: readonly { layer: string; tx: number; ty: number }[]): void {
    for (const { layer, tx, ty } of tiles) this.dirtyTiles.add(layerTileKey(layer, tx, ty))
  }

  /** 저장해 둔 상태로 되돌린다. 픽셀은 base에 깔고, 획 기록은 그대로 되살린다. */
  restoreState(state: RestoreState): void {
    this.current = null
    this.releaseOverlay()
    this.dirtyTiles.clear()
    this.bases.clear()
    this.baseStructure = state.layers && state.layers.length > 0 ? cloneLayers(state.layers) : defaultLayers()
    for (const tile of state.tiles) {
      const baseCtx = this.baseContext(tile.layer)
      if (!baseCtx) continue
      const image = new ImageData(tile.data as Uint8ClampedArray<ArrayBuffer>, TILE_SIZE, TILE_SIZE)
      baseCtx.putImageData(image, tile.tx * TILE_SIZE, tile.ty * TILE_SIZE)
    }
    this.history.restore(state.strokes, state.redo)
    this.renderAll()
    this.onChange?.()
  }

  // ---- 임시 층 ----

  private overlayContext(): CanvasRenderingContext2D | null {
    if (!this.overlay) {
      // 화면에 연결된 임시 층이 없으면(예: 테스트) 보이지 않는 캔버스를 대신 쓴다.
      this.overlay = this.makeCanvas()
      this.overlay.width = this.width
      this.overlay.height = this.height
    }
    if (!this.overlayCtx) this.overlayCtx = this.overlay.getContext('2d')
    return this.overlayCtx
  }

  private prepareOverlay(stroke: Stroke, def: ToolDef): void {
    const el = this.overlay
    if (el) {
      // 캔버스 크기를 바꾸면 내용이 지워지고 메모리가 새로 잡힌다.
      el.width = this.width
      el.height = this.height
      el.style.display = 'block'
      const opacity = def.live === 'layer' ? (typeof stroke.opts?.opacity === 'number' ? stroke.opts.opacity : (def.defaults.opacity ?? 1)) : 1
      el.style.opacity = String(opacity)
      el.style.mixBlendMode = def.blend ?? 'normal'
    }
    this.overlayCtx = null
    this.overlayContext()
  }

  private releaseOverlay(): void {
    const el = this.overlay
    if (!el) return
    el.style.display = 'none'
    // 큰 캔버스의 메모리를 바로 돌려준다.
    el.width = 1
    el.height = 1
    this.overlayCtx = null
  }

  // ---- 내부: 캔버스 ----

  private liveEntry(id: string): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    let entry = this.live.get(id)
    if (!entry) {
      const canvas = this.makeCanvas()
      canvas.width = this.width
      canvas.height = this.height
      // 번짐·블러·채우기 같은 도구는 그리는 도중에 픽셀을 읽어 오므로, 읽기가 빠른 방식으로 만든다.
      // (그래픽 카드 쪽 캔버스는 픽셀을 읽을 때마다 기다려서 매우 느리다.)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('이 브라우저에서는 캔버스를 사용할 수 없습니다.')
      entry = { canvas, ctx }
      this.live.set(id, entry)
    }
    return entry
  }

  private baseContext(layerId: string): CanvasRenderingContext2D | null {
    let base = this.bases.get(layerId)
    if (!base) {
      base = this.makeCanvas()
      base.width = this.width
      base.height = this.height
      this.bases.set(layerId, base)
    }
    return base.getContext('2d', { willReadFrequently: true })
  }

  private discardBase(layerId: string): void {
    if (this.bases.delete(layerId)) this.markAllTilesDirty(layerId)
  }

  private markAllTilesDirty(layerId: string): void {
    for (let ty = 0; ty * TILE_SIZE < this.height; ty++) {
      for (let tx = 0; tx * TILE_SIZE < this.width; tx++) this.dirtyTiles.add(layerTileKey(layerId, tx, ty))
    }
  }

  private notifyLayers(): void {
    this.onLayersChange?.()
  }

  // ---- 내부: 기록 적용 ----

  /** 기록 항목 하나(획 또는 레이어 조작)를 지금 상태에 적용한다. */
  private applyItem(item: Stroke): void {
    const op = strokeToLayerOp(item)
    if (op) {
      this.structure = applyLayerOp(this.structure, op)
      if (op.op === 'add') {
        const entry = this.liveEntry(op.id)
        entry.ctx.clearRect(0, 0, this.width, this.height)
        const base = this.bases.get(op.id)
        if (base) entry.ctx.drawImage(base, 0, 0)
      } else if (op.op === 'delete' && !this.structure.some((l) => l.id === op.id)) {
        this.live.delete(op.id)
      }
      return
    }
    const id = strokeLayerId(item)
    if (!this.structure.some((l) => l.id === id)) return
    drawStroke(this.liveEntry(id).ctx, item)
  }

  private renderAll(): void {
    this.structure = cloneLayers(this.baseStructure)
    const keep = new Set(this.structure.map((l) => l.id))
    for (const id of [...this.live.keys()]) if (!keep.has(id)) this.live.delete(id)
    for (const layer of this.structure) {
      const entry = this.liveEntry(layer.id)
      entry.ctx.clearRect(0, 0, this.width, this.height)
      const base = this.bases.get(layer.id)
      if (base) entry.ctx.drawImage(base, 0, 0)
    }
    for (const item of this.history.undoable) this.applyItem(item)
    this.notifyLayers()
  }

  /** 되돌릴 수 없게 된 가장 오래된 항목을 base에 굳힌다. */
  private commitToBase(item: Stroke): void {
    const op = strokeToLayerOp(item)
    if (op) {
      this.baseStructure = applyLayerOp(this.baseStructure, op)
      if (op.op === 'delete' && !this.baseStructure.some((l) => l.id === op.id)) this.discardBase(op.id)
      return
    }
    const id = strokeLayerId(item)
    if (!this.baseStructure.some((l) => l.id === id)) return
    const baseCtx = this.baseContext(id)
    if (baseCtx) drawStroke(baseCtx, item)
    const bounds = strokeBounds(item, this.width, this.height)
    if (bounds) {
      for (const { tx, ty } of tilesInBounds(bounds, this.width, this.height)) {
        this.dirtyTiles.add(layerTileKey(id, tx, ty))
      }
    }
  }

  /** 다시하기 목록에서 버려지는 항목이 남긴 찌꺼기를 치운다(취소된 이미지 레이어의 base 캔버스). */
  private discardOrphan(item: Stroke): void {
    const op = strokeToLayerOp(item)
    if (op?.op === 'add' && !this.baseStructure.some((l) => l.id === op.id)) this.discardBase(op.id)
  }
}
