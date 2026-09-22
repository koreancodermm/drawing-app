import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetInstallForTest, _setDeferredForTest } from '../pwa/install'
import { _setWaitingForTest } from '../pwa/register'
import { InstallGuide, UpdateBanner } from './InstallGuide'

beforeEach(() => _resetInstallForTest())

afterEach(() => {
  cleanup()
  _setWaitingForTest(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('UpdateBanner', () => {
  it('새 버전이 없으면 아무것도 보이지 않는다', () => {
    const { container } = render(<UpdateBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('새 버전이 준비되면 알리고, 누를 때만 서비스 워커에 적용하라고 알린다', () => {
    const postMessage = vi.fn()
    render(<UpdateBanner />)
    act(() => _setWaitingForTest({ postMessage } as unknown as ServiceWorker))
    expect(screen.getByRole('status')).toHaveTextContent('그림은 그대로 남습니다')
    expect(postMessage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '지금 업데이트' }))
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })
})

describe('InstallGuide', () => {
  it('설치 이벤트가 없어도 홈 화면에 추가하는 방법을 안내한다', () => {
    render(<InstallGuide />)
    expect(screen.getByText('앱으로 설치하기')).toBeInTheDocument()
    expect(screen.getByText(/사파리/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '앱으로 설치' })).not.toBeInTheDocument()
  })

  it('브라우저가 설치를 허용하면 설치 버튼이 나오고, 누르면 설치 창을 띄운다', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    render(<InstallGuide />)
    act(() => _setDeferredForTest({ prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) }))
    fireEvent.click(await screen.findByRole('button', { name: '앱으로 설치' }))
    await waitFor(() => expect(prompt).toHaveBeenCalled())
    expect(await screen.findByText(/설치했습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '앱으로 설치' })).not.toBeInTheDocument()
  })

  it('이미 설치된 앱(standalone)에서는 보이지 않는다', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {} }))
    const { container } = render(<InstallGuide />)
    expect(container).toBeEmptyDOMElement()
  })
})
