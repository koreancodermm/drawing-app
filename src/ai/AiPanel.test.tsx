import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AiPanel from './AiPanel'
import AiSettings from './AiSettings'
import { resetClientLimit } from './gemini'
import { getApiKey, hasConsent, setApiKey } from './keyStore'

const okBody = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })

const getCanvas = () => {
  const c = document.createElement('canvas')
  c.width = 100
  c.height = 80
  return c
}

beforeEach(() => {
  localStorage.clear()
  resetClientLimit()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('키가 없을 때', () => {
  it('AI 패널이 화면에 나오지 않는다', () => {
    const { container } = render(<AiPanel getCanvas={getCanvas} onAddColors={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('설정의 키 입력', () => {
  it('키를 저장하고 지울 수 있고, 입력칸은 가려진다', () => {
    render(<AiSettings />)
    const input = screen.getByLabelText('제미나이 API 키')
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByText(/키 없음/)).toBeInTheDocument()
    expect(screen.getByText(/18세 이상만 사용할 수 있습니다/)).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '  my-key ' } })
    fireEvent.click(screen.getByRole('button', { name: '키 저장' }))
    expect(getApiKey()).toBe('my-key')
    expect(screen.getByText(/키 저장됨/)).toBeInTheDocument()
    expect((input as HTMLInputElement).value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: '키 지우기' }))
    expect(getApiKey()).toBeNull()
    expect(screen.getByText(/키 없음/)).toBeInTheDocument()
  })

  it('키를 넣으면 같은 화면의 AI 패널이 나타난다', () => {
    render(
      <>
        <AiSettings />
        <AiPanel getCanvas={getCanvas} onAddColors={() => {}} />
      </>,
    )
    expect(screen.queryByRole('region', { name: 'AI 도우미' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('제미나이 API 키'), { target: { value: 'k' } })
    fireEvent.click(screen.getByRole('button', { name: '키 저장' }))
    expect(screen.getByRole('region', { name: 'AI 도우미' })).toBeInTheDocument()
  })
})

describe('AI 패널', () => {
  beforeEach(() => setApiKey('test-key'))

  it('처음에는 안내 대화상자가 뜨고, 취소하면 요청하지 않는다', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<AiPanel getCanvas={getCanvas} onAddColors={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/우리 동네/), { target: { value: '바다' } })
    fireEvent.click(screen.getByRole('button', { name: '아이디어 받기' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('그림은 기기에만 저장되고, AI를 쓸 때만 내용이 구글로 전송됩니다.')
    expect(dialog).toHaveTextContent('무료 요금제는 입력이 구글 서비스 개선에 쓰일 수 있습니다.')
    expect(dialog).toHaveTextContent('구글 API는 18세 이상만 사용할 수 있습니다.')
    // 확인란에 체크해야만 동의할 수 있다.
    expect(screen.getByRole('button', { name: '동의하고 시작' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(hasConsent()).toBe(false)
  })

  it('동의하면 바로 요청이 나가고 결과가 제안 패널에 나온다. 다음부터는 묻지 않는다', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => okBody('1. 바닷가의 등대'))
    vi.stubGlobal('fetch', fetchMock)
    render(<AiPanel getCanvas={getCanvas} onAddColors={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/우리 동네/), { target: { value: '바다' } })
    fireEvent.click(screen.getByRole('button', { name: '아이디어 받기' }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '동의하고 시작' }))

    expect(await screen.findByText('1. 바닷가의 등대')).toBeInTheDocument()
    expect(hasConsent()).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '아이디어 받기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('색 추천: 색을 눌러 하나씩, 또는 모두 팔레트에 넣는다(그림은 그대로)', async () => {
    localStorage.setItem('drawing-app-ai-consent', 'yes')
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => okBody('["#112233","#445566"]')))
    const onAddColors = vi.fn()
    render(<AiPanel getCanvas={getCanvas} onAddColors={onAddColors} />)
    fireEvent.click(screen.getByRole('button', { name: '색 조합' }))
    fireEvent.change(screen.getByPlaceholderText(/비 오는 날/), { target: { value: '저녁' } })
    fireEvent.click(screen.getByRole('button', { name: '색 추천받기' }))

    fireEvent.click(await screen.findByRole('button', { name: '추천 색 #445566 팔레트에 추가' }))
    expect(onAddColors).toHaveBeenLastCalledWith(['#445566'])
    fireEvent.click(screen.getByRole('button', { name: '모두 팔레트에 추가' }))
    expect(onAddColors).toHaveBeenLastCalledWith(['#112233', '#445566'])
  })

  it('그림 피드백: 현재 그림을 JPEG로 만들어 보낸다', async () => {
    localStorage.setItem('drawing-app-ai-consent', 'yes')
    const fetchMock = vi.fn().mockImplementation(async () => okBody('명암이 좋아요'))
    vi.stubGlobal('fetch', fetchMock)
    const canvas = getCanvas()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,QUJD')
    render(<AiPanel getCanvas={() => canvas} onAddColors={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '그림 피드백' }))
    expect(screen.getByText('지금 그린 그림이 구글로 전송됩니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '피드백 받기' }))
    expect(await screen.findByText('명암이 좋아요')).toBeInTheDocument()
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.contents[0].parts[0].inlineData.data).toBe('QUJD')
  })

  it('한도 초과: 안내와 남은 시간을 보여 주고 시간이 지나면 다시 누를 수 있다', async () => {
    localStorage.setItem('drawing-app-ai-consent', 'yes')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { details: [{ retryDelay: '2s' }] } }), { status: 429 }),
      ),
    )
    render(<AiPanel getCanvas={getCanvas} onAddColors={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/우리 동네/), { target: { value: '숲' } })
    fireEvent.click(screen.getByRole('button', { name: '아이디어 받기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('한도 초과, 나중에 다시 시도해 주세요.')
    const waiting = screen.getByRole('button', { name: '2초 뒤 다시 시도' })
    expect(waiting).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('button', { name: '아이디어 받기' })).toBeEnabled(), { timeout: 4000 })
  })

  it('인터넷이 끊기면 AI 버튼만 막히고 안내가 나온다', () => {
    render(<AiPanel getCanvas={getCanvas} onAddColors={() => {}} />)
    expect(screen.getByRole('button', { name: '아이디어 받기' })).toBeEnabled()
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('button', { name: '아이디어 받기' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('그리기는 그대로 쓸 수 있습니다')
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.getByRole('button', { name: '아이디어 받기' })).toBeEnabled()
  })
})
