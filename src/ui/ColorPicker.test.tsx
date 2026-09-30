import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ColorPicker from './ColorPicker'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ColorPicker', () => {
  it('색상 막대를 옮기면 그 색상의 순색이 된다', () => {
    const onChange = vi.fn()
    render(<ColorPicker value="#ff0000" onChange={onChange} label="색" />)
    fireEvent.change(screen.getByLabelText('색 색상'), { target: { value: '120' } })
    expect(onChange).toHaveBeenLastCalledWith('#00ff00')
  })

  it('사각형을 클릭한 자리의 채도·명도로 바뀐다', () => {
    const onChange = vi.fn()
    render(<ColorPicker value="#ff0000" onChange={onChange} label="색" />)
    const sv = screen.getByRole('slider', { name: '색 채도·명도' })
    vi.spyOn(sv, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON() {},
    })
    fireEvent.pointerDown(sv, { clientX: 100, clientY: 0 }) // s=0.5, v=1(맨 위, 빨강 색상) → 옅은 빨강
    expect(onChange).toHaveBeenLastCalledWith('#ff8080')
    fireEvent.pointerDown(sv, { clientX: 0, clientY: 100 }) // s=0, v=0 (왼쪽 아래) → 검정
    expect(onChange).toHaveBeenLastCalledWith('#000000')
  })

  it('사각형에서 화살표 키로도 채도·명도를 조정할 수 있다', () => {
    const onChange = vi.fn()
    render(<ColorPicker value="#808080" onChange={onChange} label="색" />)
    const sv = screen.getByRole('slider', { name: '색 채도·명도' })
    fireEvent.keyDown(sv, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalled()
  })

  it('밖에서 값이 바뀌면(스와치 등) 막대·사각형도 그 색을 따라간다', () => {
    const { rerender } = render(<ColorPicker value="#ff0000" onChange={() => {}} label="색" />)
    rerender(<ColorPicker value="#0000ff" onChange={() => {}} label="색" />)
    expect(screen.getByLabelText('색 색상')).toHaveValue('240')
  })
})
