import { normalizeHex } from '../canvas/color'
import { askGemini, AiError } from './gemini'

const SYSTEM =
  '너는 그림 그리기 앱 안의 친절한 미술 도우미다. 한국어로 짧고 쉽게 답한다. 누구나 볼 수 있는 안전한 내용만 다룬다.'

const MAX_INPUT = 200

function clean(text: string): string {
  return text.trim().slice(0, MAX_INPUT)
}

/** A1. 그릴 거리와 구도 아이디어 */
export async function suggestIdeas(topic: string, signal?: AbortSignal): Promise<string> {
  const t = clean(topic)
  if (!t) throw new AiError('bad-response', '주제를 먼저 적어 주세요.')
  return askGemini({
    system: SYSTEM,
    signal,
    parts: [
      {
        text: `주제: ${t}\n\n이 주제로 그릴 만한 아이디어 4가지를 번호를 붙여 제안해 줘. 각 아이디어마다 무엇을 그릴지와 구도(어디에 무엇을 놓을지)를 한두 문장으로 써 줘.`,
      },
    ],
  })
}

/** 답에서 색 코드를 뽑는다. JSON 배열이든 글 속의 #RRGGBB든 읽고, 중복은 뺀다. */
export function parsePalette(text: string, max = 8): string[] {
  const found: string[] = []
  const add = (raw: unknown) => {
    if (typeof raw !== 'string') return
    const hex = normalizeHex(raw.trim())
    if (hex && !found.includes(hex)) found.push(hex)
  }
  try {
    const data: unknown = JSON.parse(text)
    const list = Array.isArray(data) ? data : (data as { colors?: unknown })?.colors
    if (Array.isArray(list)) {
      for (const item of list) add(typeof item === 'object' && item ? (item as { hex?: unknown }).hex : item)
    }
  } catch {
    // JSON이 아니면 아래에서 글 속의 색 코드를 찾는다.
  }
  if (found.length === 0) {
    for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) add(m[0])
  }
  return found.slice(0, max)
}

/** A2. 분위기에 맞는 색 팔레트 */
export async function suggestPalette(mood: string, signal?: AbortSignal): Promise<string[]> {
  const t = clean(mood)
  if (!t) throw new AiError('bad-response', '분위기나 장면을 먼저 적어 주세요.')
  const text = await askGemini({
    system: SYSTEM,
    json: true,
    signal,
    parts: [
      {
        text: `분위기: ${t}\n\n이 분위기에 어울리는 색 5~6개를 골라 줘. 반드시 "#RRGGBB" 형식의 문자열만 담은 JSON 배열로 답해. 예: ["#1a2b3c","#ffeedd"]`,
      },
    ],
  })
  const colors = parsePalette(text)
  if (colors.length === 0) throw new AiError('bad-response', '색을 읽지 못했습니다. 다시 시도해 주세요.')
  return colors
}

/** A3. 지금 그림에 대한 피드백. imageBase64는 JPEG 데이터(앞부분 data: 표시 없이) */
export async function giveFeedback(imageBase64: string, question: string, signal?: AbortSignal): Promise<string> {
  const q = clean(question)
  return askGemini({
    system: SYSTEM,
    signal,
    parts: [
      { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
      {
        text: `이 그림에 대해 비례, 명암, 색 사용, 구도 면에서 잘한 점 2가지와 더 좋아질 점 3가지를 쉬운 말로 알려 줘. 격려하는 말투로 써 줘.${q ? `\n\n특히 궁금한 점: ${q}` : ''}`,
      },
    ],
  })
}
