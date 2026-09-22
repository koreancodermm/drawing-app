import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_LIMIT, GEMINI } from './config'
import { AiError, askGemini, parseRetryDelay, resetClientLimit } from './gemini'
import { clearApiKey, setApiKey } from './keyStore'

const SECRET = 'AIza-테스트-비밀-키'

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

const okBody = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] })

beforeEach(() => {
  localStorage.clear()
  resetClientLimit()
  setApiKey(SECRET)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function failure(): Promise<AiError> {
  try {
    await askGemini({ parts: [{ text: '안녕' }] })
  } catch (e) {
    return e as AiError
  }
  throw new Error('오류가 나야 한다')
}

describe('askGemini', () => {
  it('키를 헤더로 보내고 모델·글·시스템 안내를 요청에 담는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, okBody('반가워')))
    vi.stubGlobal('fetch', fetchMock)
    const text = await askGemini({ parts: [{ text: '안녕' }], system: '도우미', json: true })
    expect(text).toBe('반가워')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${GEMINI.endpoint}/models/${GEMINI.model}:generateContent`)
    expect(url).not.toContain(SECRET)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(SECRET)
    const body = JSON.parse(init.body as string)
    expect(body.contents[0].parts).toEqual([{ text: '안녕' }])
    expect(body.systemInstruction.parts[0].text).toBe('도우미')
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(init.body).not.toContain(SECRET)
  })

  it('키가 없으면 요청하지 않고 안내한다', async () => {
    clearApiKey()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const e = await failure()
    expect(e.kind).toBe('no-key')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('한도 초과(429)는 자연스러운 안내와 재시도 시간(RetryInfo)을 돌려준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        reply(429, {
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34.2s' }],
          },
        }),
      ),
    )
    const e = await failure()
    expect(e.kind).toBe('rate-limit')
    expect(e.retrySeconds).toBe(35)
    expect(e.message).toBe('한도 초과, 나중에 다시 시도해 주세요. (약 35초 뒤에 다시 쓸 수 있습니다.)')
  })

  it('429에 재시도 시간이 없으면 Retry-After 헤더, 그것도 없으면 60초', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(429, {}, { 'retry-after': '12' })))
    expect((await failure()).retrySeconds).toBe(12)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(429, {})))
    expect((await failure()).retrySeconds).toBe(60)
  })

  it('우리 쪽 분당 한도를 넘기면 요청을 보내지 않고 남은 시간을 알려 준다', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => reply(200, okBody('ok')))
    vi.stubGlobal('fetch', fetchMock)
    for (let i = 0; i < CLIENT_LIMIT.requestsPerMinute; i++) await askGemini({ parts: [{ text: 'x' }] })
    const e = await failure()
    expect(e.kind).toBe('rate-limit')
    expect(e.retrySeconds).toBeGreaterThan(0)
    expect(e.retrySeconds).toBeLessThanOrEqual(60)
    expect(fetchMock).toHaveBeenCalledTimes(CLIENT_LIMIT.requestsPerMinute)
  })

  it('인터넷이 없으면 AI만 안 된다고 안내한다(요청 없음)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const e = await failure()
    expect(e.kind).toBe('offline')
    expect(e.message).toContain('그리기는 그대로')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('연결이 실패하면 연결 문제라고 안내한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect((await failure()).kind).toBe('network')
  })

  it('잘못된 키(400·403)는 키를 확인하라고 안내하고 키 값은 문구에 없다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply(400, { error: { message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } })),
    )
    const a = await failure()
    expect(a.kind).toBe('invalid-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(403, { error: { message: 'no' } })))
    const b = await failure()
    expect(b.kind).toBe('invalid-key')
    expect(a.message + b.message).not.toContain(SECRET)
  })

  it('서버 오류·안전 차단·빈 답을 구분해 안내한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(503, {})))
    expect((await failure()).kind).toBe('server')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { promptFeedback: { blockReason: 'SAFETY' } })))
    expect((await failure()).kind).toBe('blocked')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { candidates: [{ content: { parts: [] } }] })))
    expect((await failure()).kind).toBe('bad-response')
  })

  it('오류가 나도 콘솔에 키를 찍지 않는다', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(403, {})))
    await failure()
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(SECRET)
  })
})

describe('parseRetryDelay', () => {
  it('"34s"와 "34.5s"를 올림한 초로 읽고, 이상한 값은 null', () => {
    expect(parseRetryDelay('34s')).toBe(34)
    expect(parseRetryDelay('0.2s')).toBe(1)
    expect(parseRetryDelay('34.5s')).toBe(35)
    expect(parseRetryDelay('곧')).toBeNull()
    expect(parseRetryDelay(5)).toBeNull()
  })
})
