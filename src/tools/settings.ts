import type { Stroke, StrokeOpts, StrokePoint } from '../canvas/stroke'
import type { Region } from './regions'
import type { OptionKey, ToolDef, ToolSettings } from './types'

/** 도구별로 사용자가 마지막에 쓴 옵션 값(도구 아이디 → 옵션) */
export type AllToolSettings = Record<string, ToolSettings>

/** 저장된 값이 있으면 그 값, 없으면 도구 기본값 */
export function resolveSettings(def: ToolDef, saved: ToolSettings | undefined): Required<Pick<ToolSettings, 'size'>> & ToolSettings {
  return { ...def.defaults, ...(saved ?? {}) }
}

export interface StrokeEnv {
  /** 난수 씨앗(획의 질감을 정한다) */
  seed: number
  /** 캔버스 중심(대칭 그리기) */
  cx: number
  cy: number
  dpi: number
  /** 선택 영역이 있으면 그 안쪽에서만 그린다 */
  clip: Region | null
  /** 보조 색 */
  color2: string
  /** 그릴 레이어 아이디 */
  layer?: string
}

/**
 * 새 획을 만든다. 그릴 때 쓴 옵션은 모두 획에 담아 두어,
 * 나중에 도구 설정을 바꿔도 이미 그린 획은 그대로 다시 그려진다.
 */
export function makeStroke(
  def: ToolDef,
  color: string,
  saved: ToolSettings | undefined,
  first: StrokePoint,
  env: StrokeEnv,
): Stroke {
  const s = resolveSettings(def, saved)
  const opts: StrokeOpts = { seed: env.seed, cx: env.cx, cy: env.cy, dpi: env.dpi }
  for (const key of def.options as OptionKey[]) {
    if (key === 'size') continue
    if (key === 'color2') opts.color2 = env.color2
    else if (typeof s[key] === 'number') opts[key] = s[key] as number
  }
  if (env.clip && env.clip.length > 0 && def.engine !== 'none') opts.clip = env.clip
  if (env.layer) opts.layer = env.layer
  return { tool: def.id, color, size: s.size, points: [first], opts }
}
