import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetClientLimit } from './gemini'
import { setApiKey } from './keyStore'
import { giveFeedback, parsePalette, suggestIdeas, suggestPalette } from './tasks'

const okBody = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })

beforeEach(() => {
  localStorage.clear()
  resetClientLimit()
  setApiKey('test-key')
})

afterEach(() => vi.unstubAllGlobals())

describe('parsePalette', () => {
  it('JSON 배열의 색을 읽고 대문자·중복을 정리한다', () => {
    expect(parsePalette('["#FF0000","#ff0000","#00ff00"]')).toEqual(['#ff0000', '#00ff00'])
  })

  it('{colors:[...]}와 {hex:...} 형태도 읽는다', () => {
    expect(parsePalette('{"colors":[{"hex":"#112233"},"#445566"]}')).toEqual(['#112233', '#445566'])
  })

  it('JSON이 아니면 글 속의 #RRGGBB를 찾는다', () => {
    expect(parsePalette('하늘색 #87CEEB 그리고 남색 #000080 입니다')).toEqual(['#87ceeb', '#000080'])
  })

  it('색이 아닌 값은 버리고 최대 개수로 자른다', () => {
    expect(parsePalette('["빨강","#12345","#abcdef"]')).toEqual(['#abcdef'])
    const many = JSON.stringify(Array.from({ length: 12 }, (_, i) => `#0000${(i + 16).toString(16)}`))
    expect(parsePalette(many)).toHaveLength(8)
  })
})

describe('A1 그릴 거리', () => {
  it('주제를 담아 요청하고 글 답을 돌려준다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okBody('1. 바닷가의 등대'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await suggestIdeas('  바다  ')).toBe('1. 바닷가의 등대')
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.contents[0].parts[0].text).toContain('주제: 바다')
  })

  it('주제가 비어 있으면 요청하지 않는다', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(suggestIdeas('   ')).rejects.toThrow('주제')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('A2 색 조합', () => {
  it('가짜 응답의 색을 HEX 목록으로 돌려준다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okBody('["#1A2B3C","#FFEEDD","#556677"]'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await suggestPalette('비 오는 저녁')).toEqual(['#1a2b3c', '#ffeedd', '#556677'])
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
  })

  it('색을 하나도 못 읽으면 오류로 알린다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okBody('음… 잘 모르겠어요')))
    await expect(suggestPalette('안개')).rejects.toThrow('색을 읽지 못했습니다')
  })
})

describe('A3 그림 피드백', () => {
  it('이미지(JPEG)와 질문을 함께 보낸다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okBody('명암이 좋아요'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await giveFeedback('QUJD', '색은 어때요?')).toBe('명암이 좋아요')
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } })
    expect(body.contents[0].parts[1].text).toContain('색은 어때요?')
  })
})
