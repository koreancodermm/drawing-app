/**
 * AI 기능의 설정값 모음. 모델 이름·한도·글자를 바꿀 때는 이 파일만 고친다.
 * (제미나이 무료 모델과 한도는 구글이 바꿀 수 있다. 실제 한도는 Google AI Studio의 "Rate limits" 화면에서 확인한다.)
 */

/**
 * AI 기능 전체를 켜고 끄는 스위치.
 * 빌드할 때 `VITE_AI_ENABLED=false`로 두면 AI 화면이 앱에서 완전히 사라진다(모든 연령 대상 출시용).
 */
export const AI_FEATURE_ENABLED: boolean = import.meta.env.VITE_AI_ENABLED !== 'false'

export const GEMINI = {
  endpoint: 'https://generativelanguage.googleapis.com/v1beta',
  /** 무료 요금제에서 쓸 수 있는 글·그림 이해 모델(공식 가격 문서에서 확인). 바뀌면 여기만 고친다. */
  model: 'gemini-2.5-flash',
  maxOutputTokens: 1024,
  timeoutMs: 30_000,
  /** 그림 피드백에 보낼 이미지의 긴 변(px)과 JPEG 품질 */
  imageMaxSide: 768,
  imageQuality: 0.8,
} as const

/** 우리 쪽에서 미리 거는 요청 한도(구글의 무료 한도에 걸리기 전에 막는다) */
export const CLIENT_LIMIT = { requestsPerMinute: 8 } as const

/** 구글 API를 쓸 수 있는 최소 나이 */
export const MIN_AGE = 18

export const AI_KEY_URL = 'https://aistudio.google.com/apikey'

export const STORAGE_KEYS = {
  apiKey: 'drawing-app-ai-key',
  consent: 'drawing-app-ai-consent',
} as const
