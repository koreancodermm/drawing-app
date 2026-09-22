export type ToolCategory = 'pen' | 'brush' | 'shape' | 'fill' | 'edit' | 'select'

/** 도구 패널에 보여 줄 수 있는 옵션 종류. 도구마다 해당하는 것만 보여 준다. */
export type OptionKey =
  | 'size'
  | 'opacity'
  | 'softness'
  | 'lineStyle'
  | 'fill'
  | 'sides'
  | 'tolerance'
  | 'pattern'
  | 'color2'
  | 'sticker'
  | 'symmetry'
  | 'step'
  | 'eraserShape'
  | 'font'

/**
 * 그리는 동안 화면에 나타내는 방식
 * - direct: 획 조각을 그때그때 캔버스에 바로 그린다
 * - layer: 임시 층에 그렸다가 끝나면 불투명도·혼합 방식을 적용해 합친다(겹쳐도 진해지지 않음)
 * - preview: 끌 때마다 임시 층에 모양 전체를 다시 그리고, 끝나면 캔버스에 그린다
 * - instant: 손을 뗄 때 한 번에 적용한다
 * - none: 그림을 바꾸지 않는 도구(선택, 스포이드, 손 도구)
 */
export type LiveMode = 'direct' | 'layer' | 'preview' | 'instant' | 'none'

export type EngineKind =
  | 'line'
  | 'stamp'
  | 'shape'
  | 'pixel'
  | 'fill'
  | 'text'
  | 'sticker'
  | 'move'
  | 'transform'
  | 'clear'
  | 'layerop'
  | 'none'

/** 도구별로 저장해 두는 옵션 값. 키는 OptionKey(color2 제외)이고 값은 모두 숫자다. */
export type ToolSettings = Partial<Record<Exclude<OptionKey, 'color2'>, number>>

export type LineWidthMode = 'const' | 'pressure' | 'brush'

export interface LineCfg {
  width: LineWidthMode
  /** 필압·속도에 따라 가늘어질 때의 최소 굵기 비율 */
  min?: number
  cap?: 'round' | 'butt' | 'square'
  /** 입력을 부드럽게 따라가는 정도(0이면 그대로). 클수록 손떨림이 줄지만 늦게 따라온다 */
  stabilize?: number
}

export type TipKind = 'soft' | 'grain' | 'bristle' | 'flat' | 'motif' | 'square'

export interface StampCfg {
  tip: TipKind
  /** 도장 간격(굵기 대비 비율) */
  spacing: number
  /** 도장 하나의 기본 진하기(0~1). 낮으면 겹쳐 그릴수록 진해진다 */
  flow: number
  pressureSize?: number
  pressureAlpha?: boolean
  /** 굵기를 무작위로 흔드는 정도(0~1) */
  jitter?: number
  /** 도장 위치를 무작위로 흩뜨리는 정도(굵기 대비 비율) */
  scatter?: number
}

export type ShapeKind = 'line' | 'rect' | 'ellipse' | 'polygon' | 'star' | 'arrow' | 'curve' | 'ruler' | 'grid'

export type PixelOp = 'smudge' | 'blur' | 'sharpen' | 'colorErase' | 'colorBlend' | 'waterBleed'

export type FillOp = 'bucket' | 'gradient' | 'pattern' | 'recolor'

export interface ToolDef {
  id: string
  label: string
  category: ToolCategory
  /** 도구를 고르면 잠깐 보여 주는 한 줄 설명 */
  hint: string
  /** 미리보기를 그릴 수 없는 도구에 쓰는 그림 글자 */
  glyph: string
  engine: EngineKind
  live: LiveMode
  /** 이 도구에서 보여 줄 옵션 */
  options: OptionKey[]
  /** 옵션 기본값. 도구를 처음 고를 때 쓴다 */
  defaults: Required<Pick<ToolSettings, 'size'>> & ToolSettings
  /** 옵션 이름을 도구에 맞게 바꿀 때 쓴다(예: 세기, 무늬 크기) */
  optionLabels?: Partial<Record<OptionKey, string>>
  line?: LineCfg
  stamp?: StampCfg
  shape?: ShapeKind
  pixel?: PixelOp
  fillOp?: FillOp
  /** layer 방식으로 합칠 때의 혼합 방식(예: 형광펜은 multiply) */
  blend?: 'multiply'
  /** true면 도구 패널에 나타내지 않는 내부 도구 */
  hidden?: boolean
}
