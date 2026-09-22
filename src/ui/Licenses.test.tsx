import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../storage/db'
import { installFakeCanvas } from '../test-utils/fakeCanvas'
import Licenses from './Licenses'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('오픈소스 고지 화면', () => {
  it('앱에 들어간 라이브러리와 버전·라이선스를 보여 주고, 눌러서 전문을 볼 수 있다', () => {
    render(<Licenses onBack={() => {}} />)
    const list = screen.getByRole('list', { name: '오픈소스 라이브러리 목록' })
    const items = within(list).getAllByRole('listitem')
    expect(items.length).toBeGreaterThanOrEqual(4)
    for (const name of ['dexie', 'react', 'react-dom', 'scheduler']) {
      expect(within(list).getByText(name, { selector: 'strong' })).toBeInTheDocument()
    }
    expect(within(list).getByText(/Apache-2.0/)).toBeInTheDocument()
    expect(within(list).getAllByText(/MIT/).length).toBeGreaterThanOrEqual(3)
    // 라이선스 전문이 들어 있다.
    expect(list.textContent).toContain('Permission is hereby granted, free of charge')
    expect(screen.getByText(/직접 그린 것/)).toBeInTheDocument()
  })

  it('돌아가기 버튼이 있다', () => {
    const onBack = vi.fn()
    render(<Licenses onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: '돌아가기' }))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('설정에서 정보 열기', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    installFakeCanvas()
  })

  it('개인정보처리방침 링크와 오픈소스 고지 화면으로 갈 수 있다', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '설정·백업' }))
    const link = await screen.findByRole('link', { name: '개인정보처리방침' })
    expect(link).toHaveAttribute('href', './privacy.html')
    expect(link).toHaveAttribute('target', '_blank')

    fireEvent.click(screen.getByRole('button', { name: '오픈소스 고지' }))
    expect(await screen.findByRole('heading', { name: '오픈소스 고지' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '돌아가기' }))
    expect(await screen.findByRole('heading', { name: '설정·백업' })).toBeInTheDocument()
  })
})
