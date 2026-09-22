import type { ToolCategory, ToolDef } from './types'

export const CATEGORIES: { id: ToolCategory; label: string }[] = [
  { id: 'pen', label: '펜·연필' },
  { id: 'brush', label: '붓·회화' },
  { id: 'shape', label: '도형·선' },
  { id: 'fill', label: '채우기·색' },
  { id: 'edit', label: '지우기·편집' },
  { id: 'select', label: '선택·보조' },
]

const P = 'pen' as const
const B = 'brush' as const
const S = 'shape' as const
const F = 'fill' as const
const E = 'edit' as const
const L = 'select' as const

const SHAPE_OPTIONS = ['size', 'lineStyle', 'fill', 'color2'] as const

export const TOOLS: readonly ToolDef[] = [
  // ---- 펜/연필류 (10) ----
  {
    id: 'pencil', label: '연필', category: P, glyph: '✏️', hint: '까슬까슬한 연필 질감',
    engine: 'stamp', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 4, opacity: 1 },
    stamp: { tip: 'grain', spacing: 0.18, flow: 0.9, pressureSize: 0.3, pressureAlpha: true },
  },
  {
    id: 'ballpoint', label: '볼펜', category: P, glyph: '🖊️', hint: '일정한 굵기의 선',
    engine: 'line', live: 'direct', options: ['size'],
    defaults: { size: 3 },
    line: { width: 'const', cap: 'round' },
  },
  {
    id: 'liner', label: '리노펜', category: P, glyph: '🖋️', hint: '손떨림을 잡아 주는 깨끗한 선',
    engine: 'line', live: 'direct', options: ['size'],
    defaults: { size: 4 },
    line: { width: 'const', cap: 'round', stabilize: 0.6 },
  },
  {
    id: 'fountain', label: '만년필', category: P, glyph: '🖋️', hint: '필압에 따라 굵기가 변하는 선',
    engine: 'line', live: 'direct', options: ['size'],
    defaults: { size: 8 },
    line: { width: 'pressure', min: 0.25, cap: 'round' },
  },
  {
    id: 'brushpen', label: '붓펜', category: P, glyph: '🖌️', hint: '필압과 속도에 따라 끝이 가늘어지는 선',
    engine: 'line', live: 'direct', options: ['size'],
    defaults: { size: 14 },
    line: { width: 'brush', min: 0.12, cap: 'round' },
  },
  {
    id: 'calligraphy', label: '캘리그라피펜', category: P, glyph: '🪶', hint: '비스듬한 납작한 펜촉',
    engine: 'stamp', live: 'direct', options: ['size'],
    defaults: { size: 16 },
    stamp: { tip: 'flat', spacing: 0.08, flow: 1 },
  },
  {
    id: 'highlighter', label: '형광펜', category: P, glyph: '🖍️', hint: '글자가 비쳐 보이는 넓은 형광 선',
    engine: 'line', live: 'layer', options: ['size', 'opacity'],
    defaults: { size: 26, opacity: 0.5 },
    line: { width: 'const', cap: 'butt' },
    blend: 'multiply',
  },
  {
    id: 'felt', label: '사인펜', category: P, glyph: '🖊️', hint: '굵고 부드러운 사인펜',
    engine: 'line', live: 'layer', options: ['size', 'opacity'],
    defaults: { size: 7, opacity: 0.9 },
    line: { width: 'const', cap: 'round' },
  },
  {
    id: 'colorpencil', label: '색연필', category: P, glyph: '🖍️', hint: '결이 살아 있는 색연필',
    engine: 'stamp', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 6, opacity: 0.85 },
    stamp: { tip: 'grain', spacing: 0.15, flow: 0.7, pressureAlpha: true, jitter: 0.15 },
  },
  {
    id: 'sketchpencil', label: '스케치 연필(HB)', category: P, glyph: '✏️', hint: '가볍게 여러 번 덧그리는 연필',
    engine: 'stamp', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 3, opacity: 0.75 },
    stamp: { tip: 'grain', spacing: 0.2, flow: 0.45, pressureSize: 0.2, pressureAlpha: true },
  },

  // ---- 붓/회화류 (10) ----
  {
    id: 'watercolor', label: '수채 붓', category: B, glyph: '🎨', hint: '번지는 물감이 겹쳐 쌓이는 붓',
    engine: 'stamp', live: 'direct', options: ['size', 'opacity', 'softness'],
    defaults: { size: 40, opacity: 0.5, softness: 0.85 },
    stamp: { tip: 'soft', spacing: 0.08, flow: 0.12, pressureSize: 0.4, pressureAlpha: true },
  },
  {
    id: 'oil', label: '유화 붓', category: B, glyph: '🖌️', hint: '붓 자국이 남는 진한 붓',
    engine: 'stamp', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 30, opacity: 1 },
    stamp: { tip: 'bristle', spacing: 0.1, flow: 0.95, pressureSize: 0.3 },
  },
  {
    id: 'pastel', label: '파스텔', category: B, glyph: '🖍️', hint: '거칠고 부드러운 파스텔',
    engine: 'stamp', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 24, opacity: 0.8 },
    stamp: { tip: 'grain', spacing: 0.12, flow: 0.55, jitter: 0.2, scatter: 0.15 },
  },
  {
    id: 'crayon', label: '크레용', category: B, glyph: '🖍️', hint: '왁스 느낌의 거친 크레용',
    engine: 'stamp', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 14, opacity: 0.95 },
    stamp: { tip: 'grain', spacing: 0.1, flow: 0.9, jitter: 0.3, scatter: 0.1 },
  },
  {
    id: 'charcoal', label: '목탄', category: B, glyph: '⚫', hint: '번지듯 거친 목탄',
    engine: 'stamp', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 22, opacity: 0.8 },
    stamp: { tip: 'grain', spacing: 0.1, flow: 0.45, pressureAlpha: true, jitter: 0.35, scatter: 0.3 },
  },
  {
    id: 'airbrush', label: '에어브러시', category: B, glyph: '💨', hint: '스프레이처럼 부드럽게 뿌리기',
    engine: 'stamp', live: 'direct', options: ['size', 'opacity', 'softness'],
    defaults: { size: 50, opacity: 0.6, softness: 1 },
    stamp: { tip: 'soft', spacing: 0.06, flow: 0.08 },
  },
  {
    id: 'marker', label: '마커', category: B, glyph: '🖊️', hint: '겹쳐도 진해지지 않는 마커',
    engine: 'line', live: 'layer', options: ['size', 'opacity'],
    defaults: { size: 16, opacity: 0.8 },
    line: { width: 'const', cap: 'round' },
  },
  {
    id: 'smudge', label: '번짐 도구', category: B, glyph: '👆', hint: '손가락으로 문지르듯 색을 끌어당기기',
    engine: 'pixel', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 30, opacity: 0.7 },
    optionLabels: { opacity: '세기' },
    pixel: 'smudge',
    stamp: { tip: 'soft', spacing: 0.1, flow: 1 },
  },
  {
    id: 'inkwash', label: '수묵 붓', category: B, glyph: '🖌️', hint: '먹물이 번지는 붓, 필압으로 굵기 변화',
    engine: 'stamp', live: 'direct', options: ['size', 'opacity', 'softness'],
    defaults: { size: 26, opacity: 0.7, softness: 0.6 },
    stamp: { tip: 'soft', spacing: 0.06, flow: 0.22, pressureSize: 0.7, pressureAlpha: true },
  },
  {
    id: 'texture', label: '텍스처 붓', category: B, glyph: '✨', hint: '작은 무늬가 흩어지는 붓',
    engine: 'stamp', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 30, opacity: 0.9 },
    stamp: { tip: 'motif', spacing: 0.45, flow: 0.9, jitter: 0.5, scatter: 0.5 },
  },

  // ---- 도형/선 (10) ----
  {
    id: 'line', label: '직선', category: S, glyph: '╱', hint: '끌어서 반듯한 직선 그리기',
    engine: 'shape', live: 'preview', options: ['size', 'lineStyle'],
    defaults: { size: 4, lineStyle: 0 }, shape: 'line',
  },
  {
    id: 'rect', label: '사각형', category: S, glyph: '▭', hint: '끌어서 사각형 그리기',
    engine: 'shape', live: 'preview', options: [...SHAPE_OPTIONS],
    defaults: { size: 4, lineStyle: 0, fill: 0 }, shape: 'rect',
  },
  {
    id: 'ellipse', label: '원/타원', category: S, glyph: '◯', hint: '끌어서 원이나 타원 그리기',
    engine: 'shape', live: 'preview', options: [...SHAPE_OPTIONS],
    defaults: { size: 4, lineStyle: 0, fill: 0 }, shape: 'ellipse',
  },
  {
    id: 'polygon', label: '다각형', category: S, glyph: '⬠', hint: '가운데에서 끌어 정다각형 그리기',
    engine: 'shape', live: 'preview', options: ['size', 'lineStyle', 'fill', 'sides', 'color2'],
    defaults: { size: 4, lineStyle: 0, fill: 0, sides: 5 }, shape: 'polygon',
    optionLabels: { sides: '변의 수' },
  },
  {
    id: 'star', label: '별', category: S, glyph: '★', hint: '가운데에서 끌어 별 그리기',
    engine: 'shape', live: 'preview', options: ['size', 'lineStyle', 'fill', 'sides', 'color2'],
    defaults: { size: 4, lineStyle: 0, fill: 1, sides: 5 }, shape: 'star',
    optionLabels: { sides: '꼭짓점 수' },
  },
  {
    id: 'arrow', label: '화살표', category: S, glyph: '➜', hint: '끌어서 화살표 그리기',
    engine: 'shape', live: 'preview', options: ['size', 'lineStyle'],
    defaults: { size: 5, lineStyle: 0 }, shape: 'arrow',
  },
  {
    id: 'curve', label: '곡선(베지에)', category: S, glyph: '〰', hint: '대충 휘어 그리면 매끈한 곡선으로 바뀜',
    engine: 'shape', live: 'preview', options: ['size', 'lineStyle'],
    defaults: { size: 4, lineStyle: 0 }, shape: 'curve',
  },
  {
    id: 'dashed', label: '점선/실선', category: S, glyph: '┄', hint: '실선·점선·파선을 골라 직선 그리기',
    engine: 'shape', live: 'preview', options: ['size', 'lineStyle'],
    defaults: { size: 4, lineStyle: 1 }, shape: 'line',
  },
  {
    id: 'ruler', label: '자', category: S, glyph: '📏', hint: '끌어서 눈금 자 그리기',
    engine: 'shape', live: 'preview', options: ['size'],
    defaults: { size: 2 }, shape: 'ruler',
    optionLabels: { size: '선 굵기' },
  },
  {
    id: 'grid', label: '가이드 그리드', category: S, glyph: '▦', hint: '끌어서 칸 나눈 격자 그리기',
    engine: 'shape', live: 'preview', options: ['size', 'step'],
    defaults: { size: 1, step: 10 }, shape: 'grid',
    optionLabels: { size: '선 굵기', step: '칸 크기' },
  },

  // ---- 채우기/색 (6) ----
  {
    id: 'bucket', label: '페인트 통', category: F, glyph: '🪣', hint: '눌러서 닫힌 영역 채우기',
    engine: 'fill', live: 'instant', options: ['tolerance'],
    defaults: { size: 1, tolerance: 24 }, fillOp: 'bucket',
  },
  {
    id: 'gradient', label: '그라데이션 채우기', category: F, glyph: '🌈', hint: '끌어서 영역을 그라데이션으로 채우기',
    engine: 'fill', live: 'instant', options: ['tolerance', 'color2'],
    defaults: { size: 1, tolerance: 24 }, fillOp: 'gradient',
    optionLabels: { color2: '끝 색' },
  },
  {
    id: 'pattern', label: '패턴 채우기', category: F, glyph: '🔳', hint: '눌러서 영역을 무늬로 채우기',
    engine: 'fill', live: 'instant', options: ['tolerance', 'pattern', 'size', 'color2'],
    defaults: { size: 12, tolerance: 24, pattern: 0 }, fillOp: 'pattern',
    optionLabels: { size: '무늬 크기', color2: '바탕 색' },
  },
  {
    id: 'eyedropper', label: '스포이드', category: F, glyph: '💉', hint: '눌러서 그림의 색 가져오기',
    engine: 'none', live: 'none', options: [],
    defaults: { size: 1 },
  },
  {
    id: 'recolor', label: '색 바꾸기', category: F, glyph: '🔄', hint: '누른 곳과 비슷한 색을 모두 지금 색으로 바꾸기',
    engine: 'fill', live: 'instant', options: ['tolerance'],
    defaults: { size: 1, tolerance: 40 }, fillOp: 'recolor',
  },
  {
    id: 'colorblend', label: '색 번짐 보정', category: F, glyph: '🫧', hint: '문질러서 거친 색 경계를 부드럽게 정리',
    engine: 'pixel', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 40, opacity: 0.5 }, pixel: 'colorBlend',
    optionLabels: { opacity: '세기' },
    stamp: { tip: 'soft', spacing: 0.15, flow: 1 },
  },

  // ---- 지우기/편집 (6) ----
  {
    id: 'eraser', label: '지우개', category: E, glyph: '🧽', hint: '둥근/네모 지우개',
    engine: 'line', live: 'direct', options: ['size', 'eraserShape'],
    defaults: { size: 24, eraserShape: 0 },
    line: { width: 'const', cap: 'round' },
    stamp: { tip: 'square', spacing: 0.1, flow: 1 },
  },
  {
    id: 'coloreraser', label: '색 지우개', category: E, glyph: '🎯', hint: '지금 색과 비슷한 부분만 지우기',
    engine: 'pixel', live: 'direct', options: ['size', 'tolerance'],
    defaults: { size: 30, tolerance: 60 }, pixel: 'colorErase',
    stamp: { tip: 'soft', spacing: 0.15, flow: 1 },
  },
  {
    id: 'blur', label: '블러', category: E, glyph: '🌫️', hint: '문지른 곳을 흐리게',
    engine: 'pixel', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 40, opacity: 0.6 }, pixel: 'blur',
    optionLabels: { opacity: '세기' },
    stamp: { tip: 'soft', spacing: 0.15, flow: 1 },
  },
  {
    id: 'sharpen', label: '선명하게', category: E, glyph: '🔍', hint: '문지른 곳을 또렷하게',
    engine: 'pixel', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 40, opacity: 0.6 }, pixel: 'sharpen',
    optionLabels: { opacity: '세기' },
    stamp: { tip: 'soft', spacing: 0.15, flow: 1 },
  },
  {
    id: 'retouch', label: '리터치 손가락', category: E, glyph: '☝️', hint: '가볍게 문질러 경계를 다듬기',
    engine: 'pixel', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 20, opacity: 0.35 }, pixel: 'smudge',
    optionLabels: { opacity: '세기' },
    stamp: { tip: 'soft', spacing: 0.08, flow: 1 },
  },
  {
    id: 'waterbleed', label: '물 번짐', category: E, glyph: '💧', hint: '물에 젖은 듯 색이 흐려지며 번지기',
    engine: 'pixel', live: 'direct', options: ['size', 'opacity'],
    defaults: { size: 50, opacity: 0.5 }, pixel: 'waterBleed',
    optionLabels: { opacity: '세기' },
    stamp: { tip: 'soft', spacing: 0.12, flow: 1 },
  },

  // ---- 선택/보조 (8) ----
  {
    id: 'rectselect', label: '사각 선택', category: L, glyph: '⬚', hint: '끌어서 사각형 영역 선택 (선택 안에서만 그려짐)',
    engine: 'none', live: 'none', options: [],
    defaults: { size: 1 },
  },
  {
    id: 'lasso', label: '올가미 선택', category: L, glyph: '➰', hint: '자유롭게 둘러서 영역 선택',
    engine: 'none', live: 'none', options: [],
    defaults: { size: 1 },
  },
  {
    id: 'wand', label: '마술봉 선택', category: L, glyph: '🪄', hint: '눌러서 비슷한 색의 영역 선택',
    engine: 'none', live: 'none', options: ['tolerance'],
    defaults: { size: 1, tolerance: 24 },
  },
  {
    id: 'move', label: '이동', category: L, glyph: '✥', hint: '선택한 영역의 그림을 끌어서 옮기기',
    engine: 'move', live: 'instant', options: [],
    defaults: { size: 1 },
  },
  {
    id: 'text', label: '텍스트 입력', category: L, glyph: '🅣', hint: '누른 곳에 글자 넣기',
    engine: 'text', live: 'instant', options: ['size', 'font'],
    defaults: { size: 48, font: 0 },
    optionLabels: { size: '글자 크기' },
  },
  {
    id: 'sticker', label: '스티커/도장', category: L, glyph: '⭐', hint: '눌러서 스티커 찍기',
    engine: 'sticker', live: 'instant', options: ['size', 'sticker', 'color2'],
    defaults: { size: 90, sticker: 0 },
    optionLabels: { size: '스티커 크기', color2: '보조 색' },
  },
  {
    id: 'mirror', label: '대칭 그리기', category: L, glyph: '🪞', hint: '한쪽에 그리면 반대쪽에도 그려짐',
    engine: 'line', live: 'direct', options: ['size', 'symmetry'],
    defaults: { size: 4, symmetry: 0 },
    line: { width: 'pressure', min: 0.4, cap: 'round' },
  },
  {
    id: 'hand', label: '손 도구', category: L, glyph: '✋', hint: '끌어서 화면 옮기기',
    engine: 'none', live: 'none', options: [],
    defaults: { size: 1 },
  },

  // ---- 내부 도구(도구 패널에 보이지 않음) ----
  {
    id: '_transform', label: '선택 영역 변형', category: L, glyph: '', hint: '',
    engine: 'transform', live: 'instant', options: [], defaults: { size: 1 }, hidden: true,
  },
  {
    id: '_layer', label: '레이어 조작', category: L, glyph: '', hint: '',
    engine: 'layerop', live: 'instant', options: [], defaults: { size: 1 }, hidden: true,
  },
  {
    id: '_clear', label: '선택 영역 지우기', category: L, glyph: '', hint: '',
    engine: 'clear', live: 'instant', options: [], defaults: { size: 1 }, hidden: true,
  },
]

const byId = new Map(TOOLS.map((t) => [t.id, t]))

/** 예전 저장본에서 쓰던 도구 아이디를 지금 도구로 바꿔 부르는 이름표 */
const LEGACY: Record<string, string> = { pen: 'fountain' }

export function getTool(id: string): ToolDef | undefined {
  return byId.get(id) ?? byId.get(LEGACY[id])
}

export function isToolId(id: unknown): id is string {
  return typeof id === 'string' && getTool(id) !== undefined
}

/** 도구 패널에 나타내는 도구만(내부 도구 제외) */
export const VISIBLE_TOOLS: readonly ToolDef[] = TOOLS.filter((t) => !t.hidden)

export function toolsIn(category: ToolCategory): readonly ToolDef[] {
  return VISIBLE_TOOLS.filter((t) => t.category === category)
}

export const DEFAULT_TOOL_ID = 'ballpoint'
