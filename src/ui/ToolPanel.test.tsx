import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeCanvas } from '../test-utils/fakeCanvas'
import { CATEGORIES, getTool, toolsIn } from '../tools/registry'
import { resolveSettings } from '../tools/settings'
import ToolOptions from './ToolOptions'
import ToolPanel from './ToolPanel'

beforeEach(() => installFakeCanvas())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ToolPanel', () => {
  it('여섯 카테고리 탭이 있고, 탭마다 해당 도구가 나온다(모두 50가지)', () => {
    render(<ToolPanel toolId="ballpoint" onSelect={() => {}} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(CATEGORIES.map((c) => c.label))

    let total = 0
    for (const category of CATEGORIES) {
      fireEvent.click(screen.getByRole('tab', { name: category.label }))
      const panel = screen.getByRole('tabpanel')
      const buttons = within(panel).getAllByRole('button')
      expect(buttons.map((b) => b.querySelector('.tool-btn__label')?.textContent)).toEqual(
        toolsIn(category.id).map((t) => t.label),
      )
      total += buttons.length
    }
    expect(total).toBe(50)
  })

  it('처음에는 고른 도구가 있는 탭이 열려 있고 그 도구가 눌린 상태다', () => {
    render(<ToolPanel toolId="eraser" onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: '지우기·편집' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: '지우개' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('도구를 누르면 그 도구의 아이디로 onSelect가 불린다', () => {
    const onSelect = vi.fn()
    render(<ToolPanel toolId="ballpoint" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: '연필' }))
    expect(onSelect).toHaveBeenCalledWith('pencil')
    fireEvent.click(screen.getByRole('tab', { name: '도형·선' }))
    fireEvent.click(screen.getByRole('button', { name: '별' }))
    expect(onSelect).toHaveBeenLastCalledWith('star')
  })

  it('고른 도구의 한 줄 설명을 보여 준다', () => {
    render(<ToolPanel toolId="highlighter" onSelect={() => {}} />)
    expect(screen.getByText(getTool('highlighter')!.hint)).toBeInTheDocument()
  })
})

describe('ToolOptions: 도구에 해당하는 옵션만 보인다', () => {
  const renderFor = (id: string, over: Record<string, number> = {}) => {
    const def = getTool(id)!
    const onChange = vi.fn()
    const onColor2 = vi.fn()
    render(
      <ToolOptions
        def={def}
        settings={resolveSettings(def, over)}
        color2="#ffffff"
        color="#000000"
        onChange={onChange}
        onColor2={onColor2}
      />,
    )
    return { onChange, onColor2 }
  }

  it('볼펜은 두께만 있다', () => {
    renderFor('ballpoint')
    expect(screen.getByLabelText('두께')).toBeInTheDocument()
    expect(screen.queryByLabelText('진하기')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('보조 색')).not.toBeInTheDocument()
  })

  it('수채 붓은 두께·진하기·부드러움이 있다', () => {
    renderFor('watercolor')
    expect(screen.getByLabelText('두께')).toBeInTheDocument()
    expect(screen.getByLabelText('진하기')).toBeInTheDocument()
    expect(screen.getByLabelText('부드러움')).toBeInTheDocument()
  })

  it('번짐 도구는 진하기 대신 세기라고 부른다', () => {
    renderFor('smudge')
    expect(screen.getByLabelText('세기')).toBeInTheDocument()
    expect(screen.queryByLabelText('진하기')).not.toBeInTheDocument()
  })

  it('사각형은 선 모양·채우기·보조 색, 다각형은 변의 수도 있다', () => {
    renderFor('rect')
    expect(screen.getByLabelText('선 모양')).toBeInTheDocument()
    expect(screen.getByLabelText('채우기')).toBeInTheDocument()
    expect(screen.getByLabelText('보조 색')).toBeInTheDocument()
    cleanup()
    renderFor('polygon')
    expect(screen.getByLabelText('변의 수')).toBeInTheDocument()
  })

  it('지우개는 둥근/네모 모양을, 페인트 통은 민감도를, 스티커는 스티커 목록을 보여 준다', () => {
    renderFor('eraser')
    expect(screen.getByLabelText('지우개 모양')).toBeInTheDocument()
    cleanup()
    renderFor('bucket')
    expect(screen.getByLabelText('민감도')).toBeInTheDocument()
    cleanup()
    renderFor('sticker')
    expect(screen.getByRole('group', { name: '스티커 고르기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '하트' })).toBeInTheDocument()
  })

  it('옵션을 바꾸면 onChange에 키와 숫자 값이 전달된다', () => {
    const { onChange } = renderFor('watercolor')
    fireEvent.change(screen.getByLabelText('두께'), { target: { value: '55' } })
    expect(onChange).toHaveBeenCalledWith('size', 55)
    fireEvent.change(screen.getByLabelText('진하기'), { target: { value: '0.25' } })
    expect(onChange).toHaveBeenCalledWith('opacity', 0.25)
  })

  it('보조 색과 스티커 선택도 전달된다', () => {
    const { onChange, onColor2 } = renderFor('sticker')
    fireEvent.click(screen.getByRole('button', { name: '꽃' }))
    expect(onChange).toHaveBeenCalledWith('sticker', 4)
    fireEvent.change(screen.getByLabelText('보조 색'), { target: { value: '#ff0000' } })
    expect(onColor2).toHaveBeenCalledWith('#ff0000')
  })
})
