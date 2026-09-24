import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { addRecentColor, normalizeHex } from '../canvas/color'
import { FIRST_LAYER_ID, type LayerInfo, type LayerOp } from '../canvas/layers'
import type { CanvasSpec } from '../canvas/paper'
import { DrawingSession } from '../canvas/session'
import type { Stroke, StrokePoint } from '../canvas/stroke'
import { clampZoom, fitView, keepVisible, zoomAt, type View } from '../canvas/viewport'
import { renderExport, safeFileName, downloadBlob, type ExportFormat } from '../export'
import { importCanvasAsLayer, type ImportMode } from '../export/importImage'
import { hexToRgb } from '../tools/geom'
import {
  rectRegion,
  regionBox,
  regionContains,
  simplifyPolygon,
  translateRegion,
  type Region,
} from '../tools/regions'
import { DEFAULT_TOOL_ID, getTool } from '../tools/registry'
import { IDENTITY, buildTransform, isIdentity, transformRegion } from '../tools/transform'
import { makeStroke, resolveSettings, type AllToolSettings } from '../tools/settings'
import type { OptionKey, ToolDef } from '../tools/types'
import { Autosaver, type SaveStatus } from '../storage/autosave'
import { createBackup } from '../storage/backup'
import { saveSnapshot, saveThumbnail } from '../storage/repository'
import { encodeStroke, type UiState } from '../storage/snapshot'
import { renderThumbnail } from '../storage/thumbnail'
import { aiPlugin } from './aiHost'
import { getClipboard, setClipboard } from './clipboard'
import FilePanel from './FilePanel'
import LayerPanel from './LayerPanel'
import PhotoAdjust from './PhotoAdjust'
import SelectionPanel from './SelectionPanel'
import ThemeToggle from './ThemeToggle'
import ToolOptions from './ToolOptions'
import ToolPanel from './ToolPanel'

/** 화면에 열려 있는 그림 한 장과, 저장소에서 불러온 상태 */
export interface OpenDrawing {
  id: string
  name: string
  spec: CanvasSpec
  ui: UiState
  /** 오래된 획을 굳힌 시점의 레이어 구조(없으면 레이어 하나) */
  layers?: LayerInfo[]
  tiles: { layer: string; tx: number; ty: number; data: ArrayBuffer }[]
  strokes: Stroke[]
  redo: Stroke[]
  /** 최신 저장본이 손상되어 직전 저장본으로 열었으면 true */
  recovered: boolean
}

interface Props {
  drawing: OpenDrawing
  recentColors: string[]
  onRecentColorsChange: (colors: string[]) => void
  onHome: () => void
}

const SWATCHES = [
  '#000000',
  '#ffffff',
  '#e03131',
  '#f08c00',
  '#f2c94c',
  '#2f9e44',
  '#1971c2',
  '#7048e8',
  '#c2255c',
  '#795548',
]

const THUMBNAIL_INTERVAL_MS = 5000

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  pending: '저장 대기 중…',
  saving: '저장 중…',
  saved: '저장됨',
  error: '저장 실패 — 다시 시도하는 중',
}

/** 그린 색이 "최근 사용한 색"에 들어갈 만한 도구인지 */
const COLOR_TOOL_ENGINES = new Set(['line', 'stamp', 'shape', 'fill', 'text', 'sticker'])

interface TouchEntry {
  x: number
  y: number
  type: string
}

type SelectionDraft =
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'lasso'; points: number[] }

function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true
  return target instanceof HTMLInputElement && (target.type === 'text' || target.type === 'number')
}

function uiKey(ui: UiState): string {
  return JSON.stringify(ui)
}

function regionPath(region: Region): string {
  return region
    .map((poly) => {
      let d = ''
      for (let i = 0; i + 1 < poly.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${poly[i]} ${poly[i + 1]} `
      return d + 'Z'
    })
    .join(' ')
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

export default function DrawingScreen({ drawing, recentColors, onRecentColorsChange, onHome }: Props) {
  const { id, spec } = drawing
  const viewportRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<DrawingSession | null>(null)
  const autosaverRef = useRef<Autosaver | null>(null)

  const [toolId, setToolId] = useState(() => (getTool(drawing.ui.tool) ?? getTool(DEFAULT_TOOL_ID)!).id)
  const [settings, setSettings] = useState<AllToolSettings>(drawing.ui.settings ?? {})
  const [color, setColor] = useState(drawing.ui.color)
  const [color2, setColor2] = useState(drawing.ui.color2 ?? '#ffffff')
  const [hexDraft, setHexDraft] = useState(drawing.ui.color)
  const [recent, setRecent] = useState<string[]>(recentColors)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [view, setViewState] = useState<View>(drawing.ui.view ?? { zoom: 1, x: 0, y: 0 })
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [showRecovered, setShowRecovered] = useState(drawing.recovered)
  const [selection, setSelectionState] = useState<Region | null>(null)
  const [selDraft, setSelDraftState] = useState<SelectionDraft | null>(null)
  const [moveDelta, setMoveDelta] = useState<{ dx: number; dy: number } | null>(null)
  const [textDraft, setTextDraft] = useState<{ x: number; y: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [layers, setLayers] = useState<LayerInfo[]>([])
  const [activeLayerId, setActiveLayerId] = useState(drawing.ui.activeLayer ?? FIRST_LAYER_ID)
  const [xf, setXf] = useState({ scale: 100, angle: 0, flipX: false, flipY: false })
  const [sheet, setSheet] = useState<'tools' | 'panel' | null>(null)
  const layersHostRef = useRef<HTMLDivElement>(null)

  const def = getTool(toolId) as ToolDef
  const opts = resolveSettings(def, settings[toolId])

  const viewRef = useRef(view)
  const spaceRef = useRef(false)
  const pointers = useRef(new Map<number, TouchEntry>())
  const drawingId = useRef<number | null>(null)
  const panRef = useRef<{ id: number; sx: number; sy: number; view: View } | null>(null)
  const pinchRef = useRef<{ dist: number; cx: number; cy: number; view: View } | null>(null)
  const gestureLock = useRef(false)
  const penSeen = useRef(false)
  const selectionRef = useRef<Region | null>(null)
  const lassoRef = useRef<StrokePoint[]>([])
  const dragStart = useRef<StrokePoint | null>(null)
  const selDraftRef = useRef<SelectionDraft | null>(null)
  // 단축키 처리기는 한 번만 등록되므로, 최신 동작을 ref로 건네 준다.
  const clipboardActions = useRef({ copy: () => {}, cut: () => {}, paste: () => {} })
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 저장에 필요한 최신 화면 상태. 이벤트 처리기에서 읽으므로 ref로 들고 있다.
  const currentUi = (): UiState => ({
    tool: toolId,
    color,
    size: opts.size,
    view,
    color2,
    settings,
    activeLayer: activeLayerId,
  })
  const uiRef = useRef<UiState>({ ...currentUi(), view: drawing.ui.view })
  const lastUiKey = useRef('')
  const fullTilesRef = useRef(false)
  const statusRef = useRef<SaveStatus>('idle')
  const lastThumbAt = useRef(0)
  const lastRecentKey = useRef(JSON.stringify(recentColors))

  useLayoutEffect(() => {
    uiRef.current = currentUi()
  })

  const setSelection = useCallback((region: Region | null) => {
    selectionRef.current = region
    setSelectionState(region)
    setXf({ scale: 100, angle: 0, flipX: false, flipY: false })
  }, [])

  // 선택 범위를 끄는 도중의 값. 포인터 이벤트가 연달아 올 때 화면이 다시 그려지기 전에도
  // 최신 값을 읽을 수 있도록 ref에도 함께 둔다.
  const setSelDraft = useCallback((draft: SelectionDraft | null) => {
    selDraftRef.current = draft
    setSelDraftState(draft)
  }, [])

  const showNotice = useCallback((text: string) => {
    setNotice(text)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 2600)
  }, [])

  const applyView = useCallback(
    (next: View) => {
      const vp = viewportRef.current
      const zoomed = { ...next, zoom: clampZoom(next.zoom) }
      const clamped = vp
        ? keepVisible(zoomed, vp.clientWidth, vp.clientHeight, spec.widthPx, spec.heightPx)
        : zoomed
      viewRef.current = clamped
      setViewState(clamped)
    },
    [spec.widthPx, spec.heightPx],
  )

  const fit = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    applyView(fitView(vp.clientWidth, vp.clientHeight, spec.widthPx, spec.heightPx))
  }, [applyView, spec.widthPx, spec.heightPx])

  // 저장된 화면 위치가 있으면 그대로, 없으면 종이 전체가 보이게 맞춘다.
  useLayoutEffect(() => {
    if (drawing.ui.view) applyView(drawing.ui.view)
    else fit()
    lastUiKey.current = uiKey({ ...currentUi(), view: viewRef.current })
    // 그림을 처음 열 때 한 번만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const savePayload = useCallback(async () => {
    const session = sessionRef.current
    if (!session) return
    // 저장할 내용은 여기서(동기로) 모두 모은다. 탭이 닫히는 도중에도 놓치지 않기 위해서다.
    const { strokes, redo } = session.exportHistory()
    const input = {
      strokes: strokes.map(encodeStroke),
      redo: redo.map(encodeStroke),
      ui: uiRef.current,
      layers: session.exportBaseLayers(),
    }
    const tiles = session.takeDirtyTiles()
    const fullTiles = fullTilesRef.current
    fullTilesRef.current = false
    try {
      await saveSnapshot(id, input, tiles, { fullTiles })
    } catch (error) {
      session.markTilesDirty(tiles)
      if (fullTiles) fullTilesRef.current = true
      throw error
    }
  }, [id])

  const saveThumbnailNow = useCallback(async () => {
    const session = sessionRef.current
    if (!session) return
    lastThumbAt.current = Date.now()
    try {
      const data = await renderThumbnail(session.flatten(null), spec.background)
      if (data) await saveThumbnail(id, data)
    } catch {
      // 미리보기는 없어도 되므로 실패해도 넘어간다.
    }
  }, [id, spec.background])

  useEffect(() => {
    const session = new DrawingSession({ width: spec.widthPx, height: spec.heightPx })
    session.setOverlay(overlayRef.current)
    session.onLayersChange = () => setLayers([...session.layers])
    const autosaver = new Autosaver({
      save: async () => {
        await savePayload()
        if (Date.now() - lastThumbAt.current > THUMBNAIL_INTERVAL_MS) void saveThumbnailNow()
      },
      onStatus: (s) => {
        statusRef.current = s
        setStatus(s)
      },
    })
    sessionRef.current = session
    autosaverRef.current = autosaver

    session.restoreState({
      layers: drawing.layers,
      tiles: drawing.tiles.map((t) => ({ layer: t.layer, tx: t.tx, ty: t.ty, data: new Uint8ClampedArray(t.data) })),
      strokes: drawing.strokes,
      redo: drawing.redo,
    })
    setHistoryState({ canUndo: session.canUndo, canRedo: session.canRedo })

    if (drawing.recovered) {
      // 직전 저장본으로 열었으므로, 복구한 상태를 새 최신 저장본으로 통째로 다시 저장한다.
      session.markTilesDirty(drawing.tiles)
      fullTilesRef.current = true
      autosaver.markDirty()
    }

    session.onChange = () => {
      setHistoryState({ canUndo: session.canUndo, canRedo: session.canRedo })
      autosaver.markDirty()
    }

    return () => {
      autosaver.dispose()
      sessionRef.current = null
      autosaverRef.current = null
    }
    // 그림을 처음 열 때 한 번만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 도구·색·옵션·화면 위치가 바뀌면 저장 대기열에 올린다.
  useEffect(() => {
    // 화면 위치는 state가 아니라 최신 ref로 비교한다. 그림을 처음 열 때 종이에 맞춰 위치를
    // 잡는 것은 사용자의 변경이 아니므로 저장 대기열에 올리지 않기 위해서다.
    const key = uiKey({ ...currentUi(), view: viewRef.current })
    if (key === lastUiKey.current) return
    lastUiKey.current = key
    autosaverRef.current?.markDirty()
    // currentUi는 아래 값들로 만들어지므로 이 값들이 바뀔 때만 확인한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId, settings, color, color2, view, activeLayerId])

  // 레이어 캔버스를 화면에 배치한다(바닥 → 맨 위 순서, 숨김·불투명도 반영).
  useLayoutEffect(() => {
    const host = layersHostRef.current
    const session = sessionRef.current
    if (!host || !session) return
    host.replaceChildren(
      ...session.orderedLayers().map(({ info, canvas }) => {
        canvas.className = 'layer-canvas'
        canvas.style.opacity = String(info.opacity)
        canvas.style.display = info.visible ? 'block' : 'none'
        return canvas
      }),
    )
  }, [layers])

  // 되돌리기 등으로 지금 레이어가 사라지면 맨 위 레이어로 옮긴다.
  useEffect(() => {
    if (layers.length > 0 && !layers.some((l) => l.id === activeLayerId)) {
      setActiveLayerId(layers[layers.length - 1].id)
    }
  }, [layers, activeLayerId])

  // 최근 사용한 색은 그림과 상관없이 앱 전체에서 기억한다.
  useEffect(() => {
    const key = JSON.stringify(recent)
    if (key === lastRecentKey.current) return
    lastRecentKey.current = key
    onRecentColorsChange(recent)
  }, [recent, onRecentColorsChange])

  // 저장에 실패한 채로 탭을 닫으려 하면 한 번 더 묻는다.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (statusRef.current === 'error') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const undo = useCallback(() => {
    sessionRef.current?.undo()
  }, [])
  const redo = useCallback(() => {
    sessionRef.current?.redo()
  }, [])

  const zoomBy = useCallback(
    (factor: number) => {
      const vp = viewportRef.current
      if (!vp) return
      const v = viewRef.current
      applyView(zoomAt(v, v.zoom * factor, vp.clientWidth / 2, vp.clientHeight / 2))
    },
    [applyView],
  )

  const zoomTo100 = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    applyView(zoomAt(viewRef.current, 1, vp.clientWidth / 2, vp.clientHeight / 2))
  }, [applyView])

  // 마우스 휠로 확대·축소. 페이지 스크롤을 막아야 하므로 passive: false로 직접 등록한다.
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = vp.getBoundingClientRect()
      const v = viewRef.current
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015))
      applyView(zoomAt(v, v.zoom * factor, e.clientX - rect.left, e.clientY - rect.top))
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [applyView])

  /** 선택 영역 안의 그림을 지운다(Delete 키). */
  const clearSelectionContent = useCallback(() => {
    const session = sessionRef.current
    const sel = selectionRef.current
    if (!session || !sel || session.isDrawing) return
    const clearDef = getTool('_clear') as ToolDef
    const stroke = makeStroke(clearDef, '#000000', undefined, { x: 0, y: 0, p: 1 }, {
      seed: 0,
      cx: 0,
      cy: 0,
      dpi: spec.dpi,
      clip: sel,
      color2: '#ffffff',
      layer: activeLayerId,
    })
    stroke.points.push({ x: 0, y: 0, p: 1 })
    session.beginStroke(stroke)
    session.endStroke()
  }, [spec.dpi, activeLayerId])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if (e.code === 'Space') {
        e.preventDefault()
        spaceRef.current = true
        setSpaceHeld(true)
        return
      }
      if (e.key === 'Escape') {
        setSelection(null)
        setTextDraft(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectionRef.current) {
        e.preventDefault()
        clearSelectionContent()
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && ['c', 'x', 'v'].includes(e.key.toLowerCase())) {
        const key = e.key.toLowerCase()
        if (key === 'v' && getClipboard()) {
          e.preventDefault()
          clipboardActions.current.paste()
        } else if (key !== 'v' && selectionRef.current) {
          e.preventDefault()
          if (key === 'c') clipboardActions.current.copy()
          else clipboardActions.current.cut()
        }
        return
      }
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase()
        if (key === 'z') {
          e.preventDefault()
          if (e.shiftKey) redo()
          else undo()
        } else if (key === 'y') {
          e.preventDefault()
          redo()
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false
        setSpaceHeld(false)
      }
    }
    const onBlur = () => {
      spaceRef.current = false
      setSpaceHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [undo, redo, setSelection, clearSelectionContent])

  const localPoint = (clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const toStrokePoint = (e: { clientX: number; clientY: number; pointerType: string; pressure: number }): StrokePoint => {
    const { x, y } = localPoint(e.clientX, e.clientY)
    const v = viewRef.current
    const pressure = e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 1
    return { x: (x - v.x) / v.zoom, y: (y - v.y) / v.zoom, p: pressure }
  }

  const touchEntries = () => [...pointers.current.values()].filter((p) => p.type === 'touch')

  const pickColor = (next: string) => {
    setColor(next)
    setHexDraft(next)
  }

  const newStroke = (point: StrokePoint, toolDef: ToolDef = def, toolSettings = settings[toolDef.id]): Stroke =>
    makeStroke(toolDef, color, toolSettings, point, {
      seed: Math.floor(Math.random() * 2 ** 31),
      cx: spec.widthPx / 2,
      cy: spec.heightPx / 2,
      dpi: spec.dpi,
      clip: selectionRef.current,
      color2,
      layer: activeLayerId,
    })

  /** 스포이드: 누른 곳의 색을 가져온다(투명한 곳은 종이 색과 섞어서). */
  const pickAt = (pt: StrokePoint) => {
    const session = sessionRef.current
    if (!session) return
    const [r, g, b, a] = session.sampleColor(pt.x, pt.y)
    const [br, bg, bb] = hexToRgb(spec.background)
    const t = a / 255
    pickColor(toHex(r * t + br * (1 - t), g * t + bg * (1 - t), b * t + bb * (1 - t)))
  }

  /** 지금 레이어에 그릴 수 있는지 확인하고, 안 되면 이유를 알려 준다. */
  const canEditActiveLayer = (): boolean => {
    const layer = sessionRef.current?.layers.find((l) => l.id === activeLayerId)
    if (!layer) return false
    if (layer.locked) {
      showNotice('잠긴 레이어에는 그릴 수 없습니다. 레이어의 🔒를 눌러 잠금을 풀어 주세요.')
      return false
    }
    if (!layer.visible) {
      showNotice('숨겨진 레이어에는 그릴 수 없습니다. 레이어의 눈 모양을 눌러 보이게 해 주세요.')
      return false
    }
    return true
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // 이미 끝난 포인터면 캡처할 수 없다. 그려지는 데는 영향이 없다.
    }
    const { x, y } = localPoint(e.clientX, e.clientY)
    pointers.current.set(e.pointerId, { x, y, type: e.pointerType })
    if (e.pointerType === 'pen') penSeen.current = true

    const session = sessionRef.current
    if (!session) return
    const startPan = () => {
      panRef.current = { id: e.pointerId, sx: x, sy: y, view: viewRef.current }
    }

    if (e.pointerType === 'touch') {
      const touches = touchEntries()
      if (touches.length >= 2) {
        // 두 번째 손가락이 닿으면 그리던 획은 버리고 확대·이동으로 바꾼다.
        if (drawingId.current !== null) {
          session.cancelStroke()
          drawingId.current = null
          setSelDraft(null)
          setMoveDelta(null)
        }
        gestureLock.current = true
        const [a, b] = touches
        pinchRef.current = {
          dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
          view: viewRef.current,
        }
        return
      }
      if (def.id === 'hand') {
        startPan()
        return
      }
      // 스타일러스를 쓴 적이 있으면 손가락(손바닥)으로는 그리지 않는다.
      if (gestureLock.current || penSeen.current) return
    } else if (e.button === 1 || (e.button === 0 && (spaceRef.current || def.id === 'hand'))) {
      e.preventDefault()
      startPan()
      return
    } else if (e.button !== 0) {
      return
    }

    const pt = toStrokePoint(e)
    if (def.engine !== 'none' && !canEditActiveLayer()) return
    switch (def.id) {
      case 'eyedropper':
        drawingId.current = e.pointerId
        pickAt(pt)
        return
      case 'rectselect':
        drawingId.current = e.pointerId
        dragStart.current = pt
        setSelDraft({ kind: 'rect', x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y })
        return
      case 'lasso':
        drawingId.current = e.pointerId
        lassoRef.current = [pt]
        setSelDraft({ kind: 'lasso', points: [pt.x, pt.y] })
        return
      case 'wand': {
        const region = session.floodRegion(activeLayerId, pt.x, pt.y, opts.tolerance ?? 24)
        setSelection(region)
        if (!region) showNotice('선택할 영역을 찾지 못했습니다.')
        return
      }
      case 'text':
        setTextDraft({ x: pt.x, y: pt.y })
        return
    }

    if (def.engine === 'move') {
      const sel = selectionRef.current
      if (!sel) {
        showNotice('먼저 사각·올가미·마술봉 선택으로 옮길 영역을 만들어 주세요.')
        return
      }
      if (!regionContains(sel, pt.x, pt.y)) {
        showNotice('선택한 영역 안을 끌어 주세요.')
        return
      }
      dragStart.current = pt
    }

    drawingId.current = e.pointerId
    session.beginStroke(newStroke(pt))
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const entry = pointers.current.get(e.pointerId)
    if (!entry) return
    const { x, y } = localPoint(e.clientX, e.clientY)
    entry.x = x
    entry.y = y

    const pinch = pinchRef.current
    if (pinch) {
      const touches = touchEntries()
      if (touches.length >= 2) {
        const [a, b] = touches
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
        const cx = (a.x + b.x) / 2
        const cy = (a.y + b.y) / 2
        const zoom = clampZoom(pinch.view.zoom * (dist / pinch.dist))
        // 처음 두 손가락 가운데에 있던 종이 지점이 지금 가운데 위치에 오도록 맞춘다.
        const px = (pinch.cx - pinch.view.x) / pinch.view.zoom
        const py = (pinch.cy - pinch.view.y) / pinch.view.zoom
        applyView({ zoom, x: cx - px * zoom, y: cy - py * zoom })
      }
      return
    }

    const pan = panRef.current
    if (pan && pan.id === e.pointerId) {
      applyView({ ...pan.view, x: pan.view.x + x - pan.sx, y: pan.view.y + y - pan.sy })
      return
    }

    if (drawingId.current !== e.pointerId) return
    const native = e.nativeEvent
    const events =
      typeof native.getCoalescedEvents === 'function' && native.getCoalescedEvents().length > 0
        ? native.getCoalescedEvents()
        : [native]
    const points = events.map((ev) => toStrokePoint(ev))
    const last = points[points.length - 1]

    switch (def.id) {
      case 'eyedropper':
        pickAt(last)
        return
      case 'rectselect': {
        const d = selDraftRef.current
        if (d && d.kind === 'rect') setSelDraft({ ...d, x1: last.x, y1: last.y })
        return
      }
      case 'lasso':
        lassoRef.current.push(...points)
        setSelDraft({ kind: 'lasso', points: simplifyPolygon(lassoRef.current, 2) })
        return
    }
    sessionRef.current?.extendStroke(points)
    if (def.engine === 'move' && dragStart.current) {
      setMoveDelta({ dx: last.x - dragStart.current.x, dy: last.y - dragStart.current.y })
    }
  }

  const finishPointer = (e: ReactPointerEvent<HTMLDivElement>, canceled: boolean) => {
    pointers.current.delete(e.pointerId)
    const touchesLeft = touchEntries().length
    if (pinchRef.current && touchesLeft < 2) pinchRef.current = null
    if (touchesLeft === 0) gestureLock.current = false
    if (panRef.current?.id === e.pointerId) panRef.current = null

    if (drawingId.current !== e.pointerId) return
    drawingId.current = null
    const session = sessionRef.current
    if (!session) return

    if (canceled) {
      session.cancelStroke()
      setSelDraft(null)
      setMoveDelta(null)
      return
    }

    switch (def.id) {
      case 'eyedropper':
        return
      case 'rectselect': {
        const d = selDraftRef.current
        setSelDraft(null)
        if (d && d.kind === 'rect' && Math.abs(d.x1 - d.x0) > 3 && Math.abs(d.y1 - d.y0) > 3) {
          setSelection(rectRegion(d.x0, d.y0, d.x1, d.y1))
        } else {
          setSelection(null)
        }
        return
      }
      case 'lasso': {
        const poly = simplifyPolygon(lassoRef.current, 2)
        lassoRef.current = []
        setSelDraft(null)
        setSelection(poly.length >= 6 ? [poly] : null)
        return
      }
    }

    const stroke = session.endStroke()
    if (!stroke) return
    if (def.engine === 'move') {
      const pts = stroke.points
      const dx = Math.round(pts[pts.length - 1].x - pts[0].x)
      const dy = Math.round(pts[pts.length - 1].y - pts[0].y)
      const sel = selectionRef.current
      if (sel) setSelection(translateRegion(sel, dx, dy))
      setMoveDelta(null)
      dragStart.current = null
    } else if (COLOR_TOOL_ENGINES.has(def.engine) && def.id !== 'eraser') {
      setRecent((r) => addRecentColor(r, stroke.color))
    }
  }

  const commitText = (text: string) => {
    const session = sessionRef.current
    const draft = textDraft
    setTextDraft(null)
    if (!session || !draft || text.trim() === '' || session.isDrawing) return
    const stroke = newStroke({ x: draft.x, y: draft.y, p: 1 })
    stroke.opts = { ...stroke.opts, text }
    session.beginStroke(stroke)
    session.endStroke()
    setRecent((r) => addRecentColor(r, color))
  }

  const commitHex = () => {
    const hex = normalizeHex(hexDraft)
    if (hex) pickColor(hex)
    else setHexDraft(color)
  }

  // 지금 그림(보이는 레이어를 합친 것)을 캔버스로 돌려준다. AI 도우미와 인쇄 미리보기가 함께 쓴다.
  const getFlattenedCanvas = () => sessionRef.current?.flatten(spec.background) ?? null

  /** AI 도우미(src/ai가 있을 때만 화면에 나온다) */

  /** AI가 추천한 색을 "최근 사용한 색"(팔레트)에 넣는다. 그림은 바꾸지 않는다. */
  const addAiColors = (colors: string[]) => {
    setRecent((r) => [...colors].reverse().reduce((list, c) => addRecentColor(list, c), r))
  }

  const changeOption = (key: Exclude<OptionKey, 'color2'>, value: number) => {
    setSettings((s) => ({ ...s, [toolId]: { ...(s[toolId] ?? {}), [key]: value } }))
  }

  // ---- 레이어 ----

  const layerOp = (op: LayerOp) => sessionRef.current?.applyLayerOperation(op)

  const indexAboveActive = () => {
    const at = (sessionRef.current?.layers ?? []).findIndex((l) => l.id === activeLayerId)
    return at < 0 ? undefined : at + 1
  }

  const addLayer = () => {
    const session = sessionRef.current
    if (!session) return
    const info = session.addLayer(undefined, indexAboveActive())
    if (info) setActiveLayerId(info.id)
    else showNotice('레이어를 더 만들 수 없습니다.')
  }

  const deleteLayer = (layerId: string) => {
    const session = sessionRef.current
    if (!session) return
    const list = session.layers
    const at = list.findIndex((l) => l.id === layerId)
    const name = list[at]?.name ?? '레이어'
    if (list.length <= 1) return showNotice('마지막 레이어는 지울 수 없습니다.')
    if (!window.confirm(`"${name}" 레이어를 삭제할까요? 삭제한 뒤에도 되돌리기로 살릴 수 있습니다.`)) return
    const next = list[at - 1] ?? list[at + 1]
    if (layerOp({ op: 'delete', id: layerId }) && next && layerId === activeLayerId) setActiveLayerId(next.id)
  }

  const renameLayer = (layerId: string) => {
    const layer = sessionRef.current?.layers.find((l) => l.id === layerId)
    if (!layer) return
    const name = window.prompt('레이어 이름', layer.name)?.trim()
    if (name && name !== layer.name) layerOp({ op: 'set', id: layerId, key: 'name', value: name })
  }

  const previewOpacity = (layerId: string, value: number) => {
    const canvas = sessionRef.current?.layerCanvas(layerId)
    if (canvas) canvas.style.opacity = String(value)
  }

  // ---- 선택 영역: 복사·잘라내기·붙여넣기·변형 ----

  const copySelection = (): boolean => {
    const session = sessionRef.current
    const sel = selectionRef.current
    if (!session || !sel) return false
    const image = session.copyRegion(activeLayerId, sel)
    if (!image) {
      showNotice('복사할 그림이 없습니다.')
      return false
    }
    setClipboard(image)
    showNotice('복사했습니다. 붙여넣으면 새 레이어로 들어갑니다.')
    return true
  }

  const cutSelection = () => {
    if (!canEditActiveLayer()) return
    if (copySelection()) clearSelectionContent()
  }

  const pasteClipboard = () => {
    const session = sessionRef.current
    const clip = getClipboard()
    if (!session || !clip) return
    const info = session.addLayerWithPixels('붙여넣기', indexAboveActive(), (ctx) => ctx.drawImage(clip.canvas, clip.x, clip.y))
    if (info) {
      setActiveLayerId(info.id)
      setSelection(null)
    } else {
      showNotice('레이어를 더 만들 수 없어 붙여넣지 못했습니다.')
    }
  }

  /** 선택 영역의 중심을 기준으로 한 지금 변형 행렬 */
  const currentMatrix = () => {
    const box = selection ? regionBox(selection) : null
    if (!box) return IDENTITY
    return buildTransform((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, xf.scale / 100, (xf.angle * Math.PI) / 180, xf.flipX, xf.flipY)
  }

  useLayoutEffect(() => {
    clipboardActions.current = { copy: () => void copySelection(), cut: cutSelection, paste: pasteClipboard }
  })

  const applyTransform = () => {
    const session = sessionRef.current
    const sel = selectionRef.current
    const m = currentMatrix()
    if (!session || !sel || isIdentity(m) || session.isDrawing || !canEditActiveLayer()) return
    const transformDef = getTool('_transform') as ToolDef
    const stroke = makeStroke(transformDef, '#000000', undefined, { x: 0, y: 0, p: 1 }, {
      seed: 0,
      cx: 0,
      cy: 0,
      dpi: spec.dpi,
      clip: sel,
      color2: '#ffffff',
      layer: activeLayerId,
    })
    stroke.opts = { ...stroke.opts, m: [[...m]] }
    session.beginStroke(stroke)
    session.endStroke()
    setSelection(transformRegion(sel, m))
  }

  // ---- 파일 ----

  const exportDrawing = async (format: ExportFormat, options: { transparent: boolean }) => {
    const session = sessionRef.current
    if (!session) throw new Error('그림이 아직 준비되지 않았습니다.')
    const { blob, extension } = await renderExport(session, spec, format, options)
    downloadBlob(blob, `${safeFileName(drawing.name)}.${extension}`)
  }

  const saveDrawFile = async () => {
    await autosaverRef.current?.flush()
    const { bytes, count } = await createBackup([id])
    if (count === 0) throw new Error('저장된 그림을 찾지 못했습니다.')
    downloadBlob(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), `${safeFileName(drawing.name)}.draw`)
  }

  /** 사진 보정 화면(PhotoAdjust)이 뜬 동안의 요청. 사용자가 적용·건너뛰기·취소를 고르면 채워진다. */
  const [photoAdjust, setPhotoAdjust] = useState<{ file: File } | null>(null)
  const photoAdjustDone = useRef<((canvas: HTMLCanvasElement | null) => void) | null>(null)

  /** 이미지 파일을 고르면 먼저 보정 화면을 띄우고, 사용자가 정한 결과(또는 취소)를 레이어에 반영한다. */
  const importImage = (file: File, mode: ImportMode): Promise<void> =>
    new Promise((resolve, reject) => {
      photoAdjustDone.current = (canvas) => {
        setPhotoAdjust(null)
        photoAdjustDone.current = null
        if (!canvas) {
          reject(new Error('이미지 불러오기를 취소했습니다.'))
          return
        }
        const session = sessionRef.current
        if (!session) {
          reject(new Error('그림이 아직 준비되지 않았습니다.'))
          return
        }
        const name = file.name.replace(/\.[^.]+$/, '') || '이미지'
        const info = importCanvasAsLayer(session, canvas, name, mode)
        if (!info) {
          reject(new Error('레이어를 더 만들 수 없어 이미지를 불러오지 못했습니다.'))
          return
        }
        setActiveLayerId(info.id)
        resolve()
      }
      setPhotoAdjust({ file })
    })

  const goHome = async () => {
    try {
      await autosaverRef.current?.flush()
    } catch {
      if (!window.confirm('변경 내용을 저장하지 못했습니다. 그래도 홈으로 나갈까요?')) return
    }
    // 미리보기가 늦어져도 홈으로 나가는 것을 오래 막지 않는다.
    await Promise.race([saveThumbnailNow(), new Promise((resolve) => setTimeout(resolve, 2000))])
    onHome()
  }

  const cursor = spaceHeld || def.id === 'hand' ? 'grab' : def.id === 'text' ? 'text' : 'crosshair'
  const shown = selection && moveDelta ? translateRegion(selection, moveDelta.dx, moveDelta.dy) : selection
  const simpleSelection = shown !== null && shown.length <= 2

  return (
    <div className="draw">
      <header className="draw__bar">
        <button className="btn" onClick={() => void goHome()} title="자동 저장 후 홈으로">
          홈
        </button>
        <span className="draw__name" title={drawing.name}>
          {drawing.name}
        </span>
        <output className={`draw__status draw__status--${status}`} aria-live="polite">
          {STATUS_LABEL[status]}
        </output>
        <span className="draw__spacer" />
        <button className="btn" onClick={undo} disabled={!historyState.canUndo} title="되돌리기 (Ctrl+Z)">
          되돌리기
        </button>
        <button className="btn" onClick={redo} disabled={!historyState.canRedo} title="다시하기 (Ctrl+Shift+Z)">
          다시하기
        </button>
        <span className="draw__spacer" />
        <button className="btn" onClick={() => zoomBy(1 / 1.25)} aria-label="축소">
          −
        </button>
        <output className="draw__zoom" aria-label="확대 비율">
          {Math.round(view.zoom * 100)}%
        </output>
        <button className="btn" onClick={() => zoomBy(1.25)} aria-label="확대">
          +
        </button>
        <button className="btn" onClick={zoomTo100}>
          100%
        </button>
        <button className="btn" onClick={fit}>
          맞춤
        </button>
        <ThemeToggle />
      </header>

      {showRecovered && (
        <div className="banner banner--warn" role="status">
          <span>
            저장 데이터가 손상되어 직전 저장본으로 열었습니다. 마지막 몇 획이 빠져 있을 수 있습니다.
          </span>
          <button className="btn" onClick={() => setShowRecovered(false)}>
            닫기
          </button>
        </div>
      )}

      <div className="draw__body">
        <div className={`sheet sheet--tools${sheet === 'tools' ? ' is-open' : ''}`}>
          <ToolPanel
            toolId={toolId}
            onSelect={(t) => {
              setToolId(t)
              setSheet(null)
            }}
          />
        </div>

        <div
          ref={viewportRef}
          className="draw__viewport"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finishPointer(e, false)}
          onPointerCancel={(e) => finishPointer(e, true)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="draw__paper"
            style={{
              width: spec.widthPx,
              height: spec.heightPx,
              background: spec.background,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            }}
          >
            <div
              ref={layersHostRef}
              className="layers-host"
              role="img"
              aria-label="그림 캔버스"
              style={{ width: spec.widthPx, height: spec.heightPx, imageRendering: view.zoom >= 2 ? 'pixelated' : 'auto' }}
            />
            <canvas
              ref={overlayRef}
              className="draw__overlay"
              width={1}
              height={1}
              aria-hidden="true"
              style={{ display: 'none' }}
            />
            {(shown || selDraft) && (
              <svg
                className="selection"
                width={spec.widthPx}
                height={spec.heightPx}
                viewBox={`0 0 ${spec.widthPx} ${spec.heightPx}`}
                aria-hidden="true"
              >
                {shown && <path d={regionPath(shown)} className="selection__fill" />}
                {shown && simpleSelection && <path d={regionPath(shown)} className="selection__ants" />}
                {selection && !isIdentity(currentMatrix()) && (
                  <path d={regionPath(transformRegion(selection, currentMatrix()))} className="selection__preview" />
                )}
                {selDraft?.kind === 'rect' && (
                  <rect
                    className="selection__ants"
                    x={Math.min(selDraft.x0, selDraft.x1)}
                    y={Math.min(selDraft.y0, selDraft.y1)}
                    width={Math.abs(selDraft.x1 - selDraft.x0)}
                    height={Math.abs(selDraft.y1 - selDraft.y0)}
                  />
                )}
                {selDraft?.kind === 'lasso' && (
                  <polyline
                    className="selection__ants"
                    points={selDraft.points.reduce((acc, v, i) => acc + (i % 2 === 0 ? `${v},` : `${v} `), '')}
                  />
                )}
              </svg>
            )}
            {textDraft && (
              <input
                className="text-draft"
                autoFocus
                type="text"
                aria-label="넣을 글자"
                placeholder="글자를 입력하고 Enter"
                style={{
                  left: textDraft.x,
                  top: textDraft.y,
                  fontSize: Math.max(12, opts.size),
                  color,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitText(e.currentTarget.value)
                  else if (e.key === 'Escape') setTextDraft(null)
                }}
                onBlur={(e) => commitText(e.currentTarget.value)}
              />
            )}
          </div>
          {notice && (
            <div className="viewport-notice" role="status">
              {notice}
            </div>
          )}
        </div>

        <aside className={`draw__panel sheet sheet--panel${sheet === 'panel' ? ' is-open' : ''}`} aria-label="색, 도구 옵션, 레이어, 파일">
          <section className="panel-block">
            <h2>색</h2>
            <div className="color-row">
              <input
                type="color"
                value={color}
                onChange={(e) => pickColor(e.target.value)}
                aria-label="색상 선택"
              />
              <input
                type="text"
                className="hex-input"
                value={hexDraft}
                maxLength={7}
                spellCheck={false}
                aria-label="HEX 색 코드"
                onChange={(e) => {
                  setHexDraft(e.target.value)
                  const hex = normalizeHex(e.target.value)
                  if (hex) setColor(hex)
                }}
                onBlur={commitHex}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitHex()
                }}
              />
            </div>
            <div className="swatches" role="group" aria-label="기본 색">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  className="swatch"
                  style={{ background: c }}
                  aria-label={`색 ${c}`}
                  aria-pressed={color === c}
                  onClick={() => pickColor(c)}
                />
              ))}
            </div>
            {recent.length > 0 && (
              <>
                <h3>최근 사용한 색</h3>
                <div className="swatches" role="group" aria-label="최근 사용한 색">
                  {recent.map((c) => (
                    <button
                      key={c}
                      className="swatch"
                      style={{ background: c }}
                      aria-label={`최근 색 ${c}`}
                      aria-pressed={color === c}
                      onClick={() => pickColor(c)}
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="panel-block">
            <h2>{def.label} 옵션</h2>
            {def.options.length === 0 ? (
              <p className="panel-empty">이 도구는 따로 고를 옵션이 없습니다.</p>
            ) : (
              <ToolOptions
                def={def}
                settings={opts}
                color2={color2}
                color={color}
                onChange={changeOption}
                onColor2={setColor2}
              />
            )}
          </section>

          {selection && (
            <SelectionPanel
              canPaste={getClipboard() !== null}
              scalePercent={xf.scale}
              angleDeg={xf.angle}
              flipX={xf.flipX}
              flipY={xf.flipY}
              onScale={(scale) => setXf((v) => ({ ...v, scale }))}
              onAngle={(angle) => setXf((v) => ({ ...v, angle }))}
              onFlipX={(flipX) => setXf((v) => ({ ...v, flipX }))}
              onFlipY={(flipY) => setXf((v) => ({ ...v, flipY }))}
              transformChanged={!isIdentity(currentMatrix())}
              onApply={applyTransform}
              onResetTransform={() => setXf({ scale: 100, angle: 0, flipX: false, flipY: false })}
              onCopy={() => void copySelection()}
              onCut={cutSelection}
              onPaste={pasteClipboard}
              onClear={clearSelectionContent}
              onDeselect={() => setSelection(null)}
            />
          )}

          <LayerPanel
            layers={layers}
            activeId={activeLayerId}
            maxLayers={sessionRef.current?.maxLayers ?? 30}
            onSelect={setActiveLayerId}
            onAdd={addLayer}
            onDelete={deleteLayer}
            onMove={(layerId, index) => layerOp({ op: 'move', id: layerId, index })}
            onVisible={(layerId, visible) => layerOp({ op: 'set', id: layerId, key: 'visible', value: visible })}
            onLocked={(layerId, locked) => layerOp({ op: 'set', id: layerId, key: 'locked', value: locked })}
            onRename={renameLayer}
            onOpacityPreview={previewOpacity}
            onOpacity={(layerId, opacity) => layerOp({ op: 'set', id: layerId, key: 'opacity', value: opacity })}
          />

          {aiPlugin && <aiPlugin.Panel getCanvas={getFlattenedCanvas} onAddColors={addAiColors} />}

          <FilePanel
            onExport={exportDrawing}
            onSaveDrawFile={saveDrawFile}
            onImportImage={importImage}
            getCanvas={getFlattenedCanvas}
          />
        </aside>
      </div>

      <nav className="sheet-nav" aria-label="패널 열기">
        <button className="btn" aria-pressed={sheet === 'tools'} onClick={() => setSheet(sheet === 'tools' ? null : 'tools')}>
          도구
        </button>
        <button className="btn" aria-pressed={sheet === 'panel'} onClick={() => setSheet(sheet === 'panel' ? null : 'panel')}>
          색·레이어·파일
        </button>
      </nav>

      {photoAdjust && <PhotoAdjust file={photoAdjust.file} onDone={(canvas) => photoAdjustDone.current?.(canvas)} />}
    </div>
  )
}
