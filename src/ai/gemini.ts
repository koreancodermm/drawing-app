import { CLIENT_LIMIT, GEMINI } from './config'
import { getApiKey } from './keyStore'

export type AiErrorKind =
  | 'no-key'
  | 'invalid-key'
  | 'rate-limit'
  | 'offline'
  | 'network'
  | 'blocked'
  | 'server'
  | 'bad-response'

/** 사용자에게 그대로 보여 줄 수 있는 오류. 키 값은 절대 담지 않는다. */
export class AiError extends Error {
  kind: AiErrorKind
  /** 한도 초과일 때 다시 시도할 수 있게 될 때까지 남은 시간(초) */
  retrySeconds?: number

  constructor(kind: AiErrorKind, message: string, retrySeconds?: number) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
    this.retrySeconds = retrySeconds
  }
}

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } }

export interface GeminiRequest {
  parts: Part[]
  system?: string
  /** 응답을 JSON으로 받고 싶을 때 */
  json?: boolean
  signal?: AbortSignal
}

const DEFAULT_RETRY_SECONDS = 60

// ---- 우리 쪽 요청 한도(최근 1분 동안의 요청 시각) ----
let recent: number[] = []

/** 테스트용 */
export function resetClientLimit(): void {
  recent = []
}

function checkClientLimit(now: number): void {
  recent = recent.filter((t) => now - t < 60_000)
  if (recent.length >= CLIENT_LIMIT.requestsPerMinute) {
    const wait = Math.ceil((60_000 - (now - recent[0])) / 1000)
    throw new AiError('rate-limit', limitMessage(wait), wait)
  }
  recent.push(now)
}

export function limitMessage(seconds: number): string {
  return `한도 초과, 나중에 다시 시도해 주세요. (약 ${seconds}초 뒤에 다시 쓸 수 있습니다.)`
}

/** "34s", "34.5s" 같은 값을 올림한 초로 바꾼다. */
export function parseRetryDelay(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = /^(\d+(?:\.\d+)?)s$/.exec(value.trim())
  return m ? Math.max(1, Math.ceil(Number(m[1]))) : null
}

interface ErrorBody {
  error?: { code?: number; status?: string; message?: string; details?: { retryDelay?: unknown; reason?: string }[] }
}

async function readErrorBody(res: Response): Promise<ErrorBody> {
  try {
    return (await res.json()) as ErrorBody
  } catch {
    return {}
  }
}

function retrySecondsFrom(res: Response, body: ErrorBody): number {
  for (const d of body.error?.details ?? []) {
    const s = parseRetryDelay(d.retryDelay)
    if (s !== null) return s
  }
  const header = Number(res.headers.get('retry-after'))
  if (Number.isFinite(header) && header > 0) return Math.ceil(header)
  return DEFAULT_RETRY_SECONDS
}

/** 응답에서 글을 꺼낸다. */
function extractText(data: unknown): string {
  const d = data as {
    promptFeedback?: { blockReason?: string }
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]
  }
  if (d?.promptFeedback?.blockReason) {
    throw new AiError('blocked', '안전 기준 때문에 AI가 답하지 못했습니다. 내용을 바꿔서 다시 시도해 주세요.')
  }
  const cand = d?.candidates?.[0]
  const text = (cand?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim()
  if (!text) {
    if (cand?.finishReason === 'SAFETY') {
      throw new AiError('blocked', '안전 기준 때문에 AI가 답하지 못했습니다. 내용을 바꿔서 다시 시도해 주세요.')
    }
    throw new AiError('bad-response', 'AI가 빈 답을 보냈습니다. 잠시 뒤 다시 시도해 주세요.')
  }
  return text
}

/**
 * 제미나이에 요청을 보내고 글 답을 돌려준다.
 * 키는 헤더로만 보내며 오류 문구나 로그에 넣지 않는다.
 */
export async function askGemini(req: GeminiRequest): Promise<string> {
  const key = getApiKey()
  if (!key) throw new AiError('no-key', '설정에서 API 키를 먼저 입력해 주세요.')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AiError('offline', '인터넷에 연결되어 있지 않아 AI를 쓸 수 없습니다. 그리기는 그대로 쓸 수 있습니다.')
  }
  checkClientLimit(Date.now())

  const body = {
    contents: [{ role: 'user', parts: req.parts }],
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    generationConfig: {
      maxOutputTokens: GEMINI.maxOutputTokens,
      ...(req.json ? { responseMimeType: 'application/json' } : {}),
    },
  }

  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), GEMINI.timeoutMs)
  const onAbort = () => timeout.abort()
  req.signal?.addEventListener('abort', onAbort)

  let res: Response
  try {
    res = await fetch(`${GEMINI.endpoint}/models/${GEMINI.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: timeout.signal,
    })
  } catch {
    if (req.signal?.aborted) throw new AiError('network', '요청을 취소했습니다.')
    if (timeout.signal.aborted) throw new AiError('network', 'AI 응답이 너무 늦습니다. 잠시 뒤 다시 시도해 주세요.')
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new AiError('offline', '인터넷에 연결되어 있지 않아 AI를 쓸 수 없습니다. 그리기는 그대로 쓸 수 있습니다.')
    }
    throw new AiError('network', '구글 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.')
  } finally {
    clearTimeout(timer)
    req.signal?.removeEventListener('abort', onAbort)
  }

  if (!res.ok) {
    const err = await readErrorBody(res)
    if (res.status === 429) {
      const wait = retrySecondsFrom(res, err)
      throw new AiError('rate-limit', limitMessage(wait), wait)
    }
    const reasons = (err.error?.details ?? []).map((d) => d.reason)
    if (res.status === 401 || res.status === 403 || reasons.includes('API_KEY_INVALID') || (res.status === 400 && /api key/i.test(err.error?.message ?? ''))) {
      throw new AiError('invalid-key', 'API 키가 올바르지 않거나 이 기능을 쓸 수 없는 키입니다. 설정에서 키를 확인해 주세요.')
    }
    if (res.status >= 500) {
      throw new AiError('server', '구글 AI 서버가 바쁩니다. 잠시 뒤 다시 시도해 주세요.')
    }
    throw new AiError('bad-response', `AI 요청이 거절되었습니다. (오류 ${res.status})`)
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new AiError('bad-response', 'AI의 답을 읽지 못했습니다. 다시 시도해 주세요.')
  }
  return extractText(data)
}
