import { describe, expect, it } from 'vitest'
import { CATEGORIES, DEFAULT_TOOL_ID, TOOLS, VISIBLE_TOOLS, getTool, isToolId, toolsIn } from './registry'

/** PRD 4장의 도구 목록 */
const PRD_TOOLS: Record<string, string[]> = {
  pen: ['연필', '볼펜', '리노펜', '만년필', '붓펜', '캘리그라피펜', '형광펜', '사인펜', '색연필', '스케치 연필(HB)'],
  brush: ['수채 붓', '유화 붓', '파스텔', '크레용', '목탄', '에어브러시', '마커', '번짐 도구', '수묵 붓', '텍스처 붓'],
  shape: ['직선', '사각형', '원/타원', '다각형', '별', '화살표', '곡선(베지에)', '점선/실선', '자', '가이드 그리드'],
  fill: ['페인트 통', '그라데이션 채우기', '패턴 채우기', '스포이드', '색 바꾸기', '색 번짐 보정'],
  edit: ['지우개', '색 지우개', '블러', '선명하게', '리터치 손가락', '물 번짐'],
  select: ['사각 선택', '올가미 선택', '마술봉 선택', '이동', '텍스트 입력', '스티커/도장', '대칭 그리기', '손 도구'],
}

describe('도구 목록', () => {
  it('도구 패널에 보이는 도구는 정확히 50가지다', () => {
    expect(VISIBLE_TOOLS).toHaveLength(50)
  })

  it('카테고리별 개수가 10·10·10·6·6·8이다', () => {
    expect(CATEGORIES.map((c) => toolsIn(c.id).length)).toEqual([10, 10, 10, 6, 6, 8])
  })

  it('PRD 4장의 도구 이름이 카테고리별로 모두 있다', () => {
    for (const [category, names] of Object.entries(PRD_TOOLS)) {
      const have = toolsIn(category as never).map((t) => t.label)
      expect(have).toEqual(names)
    }
  })

  it('아이디는 서로 다르고 이름은 한국어이며 설명이 있다', () => {
    const ids = TOOLS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of VISIBLE_TOOLS) {
      expect(t.label).toMatch(/[가-힣]/)
      expect(t.hint.length).toBeGreaterThan(3)
    }
  })

  it('내부 도구는 도구 패널에 나오지 않는다', () => {
    expect(TOOLS.some((t) => t.hidden)).toBe(true)
    expect(VISIBLE_TOOLS.some((t) => t.hidden)).toBe(false)
  })

  it('도구마다 방식에 맞는 설정이 채워져 있다', () => {
    for (const t of TOOLS) {
      expect(t.defaults.size).toBeGreaterThan(0)
      if (t.engine === 'line') expect(t.line).toBeDefined()
      if (t.engine === 'stamp') expect(t.stamp).toBeDefined()
      if (t.engine === 'shape') expect(t.shape).toBeDefined()
      if (t.engine === 'pixel') {
        expect(t.pixel).toBeDefined()
        expect(t.stamp).toBeDefined()
      }
      if (t.engine === 'fill') expect(t.fillOp).toBeDefined()
    }
  })

  it('보여 주는 옵션마다 기본값이 있다(색 제외)', () => {
    for (const t of TOOLS) {
      for (const key of t.options) {
        if (key === 'color2') continue
        expect(t.defaults[key], `${t.id}.${key}`).toBeDefined()
      }
    }
  })

  it('지우개는 둥근/네모 옵션, 도형은 선 모양 옵션처럼 도구에 맞는 옵션만 보인다', () => {
    expect(getTool('eraser')?.options).toContain('eraserShape')
    expect(getTool('ballpoint')?.options).toEqual(['size'])
    expect(getTool('rect')?.options).toEqual(expect.arrayContaining(['lineStyle', 'fill']))
    expect(getTool('bucket')?.options).toContain('tolerance')
    expect(getTool('hand')?.options).toEqual([])
  })

  it('예전 저장본의 도구 아이디(pen)를 지금 도구로 읽는다', () => {
    expect(getTool('pen')?.id).toBe('fountain')
    expect(isToolId('pen')).toBe(true)
    expect(isToolId('없는도구')).toBe(false)
    expect(isToolId(3)).toBe(false)
  })

  it('처음 도구는 볼펜이다', () => {
    expect(getTool(DEFAULT_TOOL_ID)?.label).toBe('볼펜')
  })

  it('겹쳐도 진해지지 않는 도구(형광펜·사인펜·마커)만 임시 층을 쓰고, 형광펜은 곱하기로 합친다', () => {
    const layered = TOOLS.filter((t) => t.live === 'layer').map((t) => t.id)
    expect(layered.sort()).toEqual(['felt', 'highlighter', 'marker'])
    expect(getTool('highlighter')?.blend).toBe('multiply')
  })
})
