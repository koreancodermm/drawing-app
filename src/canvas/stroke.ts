/** 도구 아이디. 도구 목록은 src/tools/registry.ts에 있다. */
export type ToolId = string

export interface StrokePoint {
  x: number
  y: number
  /** 0~1. 마우스·손가락은 항상 1 */
  p: number
}

/**
 * 획마다 저장해 두는 도구 옵션. 다시 그릴 때 같은 결과가 나오도록 그릴 때 쓴 값을 모두 담는다.
 * 숫자(굵기 외 옵션, 난수 씨앗, 캔버스 정보), 문자열(보조 색), 선택 영역(다각형 목록)만 쓴다.
 */
export type StrokeOptValue = number | string | number[][]
export type StrokeOpts = Record<string, StrokeOptValue>

export interface Stroke {
  tool: ToolId
  color: string
  size: number
  points: StrokePoint[]
  opts?: StrokeOpts
}

export { drawStroke, drawStrokePieces } from '../tools/draw'
