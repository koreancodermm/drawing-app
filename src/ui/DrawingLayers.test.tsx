import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../storage/db'
import { listDrawings, loadDrawing } from '../storage/repository'
import { installFakeCanvas } from '../test-utils/fakeCanvas'

beforeEach(async () => {
  await db.delete()
  await db.open()
  installFakeCanvas()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-theme')
})

async function openNewDrawing() {
  const view = render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: '새 그림' }))
  fireEvent.click(await screen.findByRole('button', { name: '그리기 시작' }))
  await screen.findByLabelText('그림 캔버스')
  return view
}

const viewport = () => document.querySelector('.draw__viewport') as HTMLElement
const pointerAt = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y })

function drag(from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(viewport(), pointerAt(...from))
  fireEvent.pointerMove(viewport(), pointerAt(...to))
  fireEvent.pointerUp(viewport(), pointerAt(...to))
}

const layerRows = () => within(screen.getByRole('list', { name: '레이어 목록' })).getAllByRole('listitem')
const layerNames = () => layerRows().map((r) => r.querySelector('.layer-name')!.textContent)

describe('레이어 패널', () => {
  it('처음에는 레이어 1 하나가 있다', async () => {
    await openNewDrawing()
    expect(layerNames()).toEqual(['레이어 1'])
    expect(screen.getByText('1/', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '레이어 1 위로' })).toBeDisabled()
  })

  it('추가하면 맨 위에 새 레이어가 생기고 그 레이어가 선택된다', async () => {
    await openNewDrawing()
    fireEvent.click(screen.getByRole('button', { name: '+ 추가' }))
    expect(layerNames()).toEqual(['레이어 2', '레이어 1'])
    expect(layerRows()[0]).toHaveAttribute('aria-current', 'true')
    // 레이어마다 캔버스가 있다.
    expect(document.querySelectorAll('.layers-host canvas')).toHaveLength(2)
  })

  it('보이기/숨기기, 잠금, 순서 바꾸기가 되고 모두 되돌리기로 취소된다', async () => {
    await openNewDrawing()
    fireEvent.click(screen.getByRole('button', { name: '+ 추가' }))
    const hostCanvases = () => [...document.querySelectorAll<HTMLCanvasElement>('.layers-host canvas')]

    fireEvent.click(screen.getByRole('button', { name: '레이어 2 숨기기' }))
    expect(hostCanvases()[1].style.display).toBe('none')
    fireEvent.click(screen.getByRole('button', { name: '레이어 2 잠그기' }))
    expect(screen.getByRole('button', { name: '레이어 2 잠금 해제' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '레이어 2 아래로' }))
    expect(layerNames()).toEqual(['레이어 1', '레이어 2'])

    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(layerNames()).toEqual(['레이어 1'])
    expect(screen.getByRole('button', { name: '다시하기' })).toBeEnabled()
  })

  it('숨긴 레이어와 잠근 레이어에는 그릴 수 없고 이유를 알려 준다', async () => {
    await openNewDrawing()
    fireEvent.click(screen.getByRole('button', { name: '레이어 1 잠그기' }))
    drag([40, 40], [120, 90])
    expect(screen.getByText(/잠긴 레이어에는 그릴 수 없습니다/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '레이어 1 잠금 해제' }))
    fireEvent.click(screen.getByRole('button', { name: '레이어 1 숨기기' }))
    drag([40, 40], [120, 90])
    expect(screen.getByText(/숨겨진 레이어에는 그릴 수 없습니다/)).toBeInTheDocument()

    // 잠금·숨김 조작만 기록에 있고 그림은 그려지지 않았다(되돌리기 2번이면 처음 상태).
    fireEvent.click(screen.getByRole('button', { name: '레이어 1 보이기' }))
    drag([40, 40], [120, 90])
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled()
  })

  it('삭제는 확인을 받고, 마지막 한 장은 지울 수 없다', async () => {
    await openNewDrawing()
    fireEvent.click(screen.getByRole('button', { name: '+ 추가' }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(confirm).toHaveBeenCalled()
    expect(layerNames()).toHaveLength(2)

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(layerNames()).toEqual(['레이어 1'])
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()

    // 되돌리면 살아난다.
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(layerNames()).toEqual(['레이어 2', '레이어 1'])
  })

  it('이름 바꾸기와 불투명도', async () => {
    await openNewDrawing()
    vi.spyOn(window, 'prompt').mockReturnValue('스케치')
    fireEvent.click(screen.getAllByRole('button', { name: '이름 바꾸기' })[0])
    expect(layerNames()).toEqual(['스케치'])

    const slider = screen.getByLabelText('레이어 불투명도')
    fireEvent.change(slider, { target: { value: '0.4' } })
    // 끄는 동안에는 화면에만 반영된다.
    expect((document.querySelector('.layers-host canvas') as HTMLCanvasElement).style.opacity).toBe('0.4')
    fireEvent.pointerUp(slider)
    expect(screen.getByText('40%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    expect((document.querySelector('.layers-host canvas') as HTMLCanvasElement).style.opacity).toBe('1')
  })

  it('선택한 레이어에만 그려지고 획에 레이어 아이디가 저장된다', async () => {
    await openNewDrawing()
    fireEvent.click(screen.getByRole('button', { name: '+ 추가' }))
    drag([40, 40], [120, 90])
    window.dispatchEvent(new Event('pagehide'))
    const [item] = await listDrawings()
    await waitFor(async () => {
      const { snapshot } = await loadDrawing(item.meta.id)
      const drawn = snapshot.strokes.map((s) => (s.x ? JSON.parse(s.x).layer : undefined))
      // 레이어 추가 조작 다음에 새 레이어(L0이 아님)에 그린 획이 있다.
      expect(drawn.at(-1)).toBeDefined()
      expect(drawn.at(-1)).not.toBe('L0')
    })
  })

  it('레이어 구조와 선택한 레이어가 새로고침 뒤에도 그대로다', async () => {
    const first = await openNewDrawing()
    fireEvent.click(screen.getByRole('button', { name: '+ 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '레이어 2 숨기기' }))
    fireEvent.click(screen.getByRole('button', { name: '레이어 1' }))
    window.dispatchEvent(new Event('pagehide'))
    const [item] = await listDrawings()
    await waitFor(async () => {
      expect((await loadDrawing(item.meta.id)).snapshot.ui.activeLayer).toBeDefined()
      expect((await loadDrawing(item.meta.id)).snapshot.strokes.length).toBeGreaterThanOrEqual(3)
    })
    first.unmount()

    render(<App />)
    await screen.findByLabelText('그림 캔버스')
    await waitFor(() => expect(layerNames()).toEqual(['레이어 3', '레이어 2', '레이어 1']))
    expect(screen.getByRole('button', { name: '레이어 2 보이기' })).toBeInTheDocument()
    expect(layerRows()[2]).toHaveAttribute('aria-current', 'true')
  })

  it('100획 넘게 그린 뒤에도 레이어 구조가 저장·복원된다', async () => {
    const first = await openNewDrawing()
    fireEvent.click(screen.getByRole('button', { name: '+ 추가' }))
    for (let i = 0; i < 105; i++) drag([30 + i, 30], [60 + i, 60])
    window.dispatchEvent(new Event('pagehide'))
    const [item] = await listDrawings()
    await waitFor(async () => {
      const { snapshot } = await loadDrawing(item.meta.id)
      expect(snapshot.strokes).toHaveLength(100)
      // 레이어 추가 조작은 오래되어 base 구조에 굳었다.
      expect(snapshot.layers?.map((l) => l.name)).toEqual(['레이어 1', '레이어 2'])
    })
    first.unmount()
    render(<App />)
    await screen.findByLabelText('그림 캔버스')
    await waitFor(() => expect(layerNames()).toEqual(['레이어 2', '레이어 1']))
  })
})

describe('선택 영역 복사·붙여넣기·변형', () => {
  async function selectArea() {
    await openNewDrawing()
    fireEvent.click(screen.getByRole('tab', { name: '선택·보조' }))
    fireEvent.click(screen.getByRole('button', { name: '사각 선택' }))
    drag([50, 50], [150, 120])
  }

  it('복사 후 붙여넣으면 새 레이어가 생긴다(되돌리면 사라진다)', async () => {
    await selectArea()
    expect(screen.getByRole('button', { name: '붙여넣기' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '복사' }))
    expect(screen.getByRole('button', { name: '붙여넣기' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '붙여넣기' }))
    expect(layerNames()).toEqual(['붙여넣기', '레이어 1'])
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(layerNames()).toEqual(['레이어 1'])
  })

  it('잘라내기는 복사하고 그 자리를 지운다', async () => {
    await selectArea()
    fireEvent.click(screen.getByRole('button', { name: '잘라내기' }))
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '붙여넣기' })).toBeEnabled()
  })

  it('Ctrl+C / Ctrl+V 단축키도 된다', async () => {
    await selectArea()
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    expect(layerNames()).toEqual(['붙여넣기', '레이어 1'])
  })

  it('크기·회전을 바꾸면 미리보기가 뜨고 적용하면 변형이 기록된다', async () => {
    await selectArea()
    expect(screen.getByRole('button', { name: '변형 적용' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('선택 크기'), { target: { value: '150' } })
    fireEvent.change(screen.getByLabelText('선택 회전'), { target: { value: '30' } })
    expect(document.querySelector('.selection__preview')).not.toBeNull()
    expect(screen.getByRole('button', { name: '변형 적용' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '변형 적용' }))
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeEnabled()
    // 적용하면 슬라이더는 원래대로 돌아간다.
    expect((screen.getByLabelText('선택 크기') as HTMLInputElement).value).toBe('100')
    expect(document.querySelector('.selection__preview')).toBeNull()
  })

  it('뒤집기만 켜도 변형을 적용할 수 있고, 되돌려 놓기로 취소한다', async () => {
    await selectArea()
    fireEvent.click(screen.getByLabelText('좌우 뒤집기'))
    expect(screen.getByRole('button', { name: '변형 적용' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '되돌려 놓기' }))
    expect(screen.getByRole('button', { name: '변형 적용' })).toBeDisabled()
  })
})

describe('파일 패널', () => {
  it('PNG·JPG·PDF 내보내기 버튼이 파일을 내려받는다', async () => {
    await openNewDrawing()
    const created: string[] = []
    ;(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
      created.push(b.type)
      return 'blob:test'
    }
    ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {}
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback, type?: string) =>
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type })),
    )
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    fireEvent.click(screen.getByRole('button', { name: 'PNG' }))
    await screen.findByText('PNG 내보내기 완료')
    fireEvent.click(screen.getByRole('button', { name: 'JPG' }))
    await screen.findByText('JPG 내보내기 완료')
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }))
    await screen.findByText('PDF 내보내기 완료')
    expect(created).toEqual(['image/png', 'image/jpeg', 'application/pdf'])
  })

  it('내보내기에 실패하면 이유를 보여 준다', async () => {
    await openNewDrawing()
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => cb(null))
    fireEvent.click(screen.getByRole('button', { name: 'PNG' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('이미지를 만들지 못했습니다')
  })

  it('.draw로 저장하면 그림을 저장한 뒤 파일을 내려받는다', async () => {
    await openNewDrawing()
    const created: string[] = []
    ;(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
      created.push(b.type)
      return 'blob:test'
    }
    ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {}
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: '.draw로 저장' }))
    await screen.findByText('.draw 파일 저장 완료')
    expect(created).toEqual(['application/octet-stream'])
  })

  it('이미지를 새 레이어로 불러온다', async () => {
    await openNewDrawing()
    vi.stubGlobal('createImageBitmap', async () => ({ width: 40, height: 20, close: () => {} }))
    const input = screen.getByLabelText('이미지 파일 선택') as HTMLInputElement
    const file = new File([new Uint8Array([1, 2, 3])], '풍경.png', { type: 'image/png' })
    fireEvent.click(screen.getByRole('button', { name: '새 레이어로' }))
    fireEvent.change(input, { target: { files: [file] } })
    // 사진 보정 화면이 먼저 뜬다. 보정 없이 그대로 불러온다.
    const skip = await screen.findByRole('button', { name: '보정 없이 불러오기' })
    await waitFor(() => expect(skip).toBeEnabled())
    fireEvent.click(skip)
    await screen.findByText('이미지 불러오기 완료')
    expect(layerNames()).toEqual(['풍경', '레이어 1'])
  })

  it('이미지를 배경으로 불러오면 맨 아래 레이어가 된다', async () => {
    await openNewDrawing()
    vi.stubGlobal('createImageBitmap', async () => ({ width: 40, height: 20, close: () => {} }))
    const input = screen.getByLabelText('이미지 파일 선택') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: '배경으로' }))
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], '하늘.jpg', { type: 'image/jpeg' })] } })
    const skip = await screen.findByRole('button', { name: '보정 없이 불러오기' })
    await waitFor(() => expect(skip).toBeEnabled())
    fireEvent.click(skip)
    await screen.findByText('이미지 불러오기 완료')
    expect(layerNames()).toEqual(['레이어 1', '하늘'])
  })

  it('사진 보정 화면에서 취소하면 아무것도 불러오지 않는다', async () => {
    await openNewDrawing()
    vi.stubGlobal('createImageBitmap', async () => ({ width: 40, height: 20, close: () => {} }))
    const input = screen.getByLabelText('이미지 파일 선택') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: '새 레이어로' }))
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], '메모.png', { type: 'image/png' })] } })
    fireEvent.click(await screen.findByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(layerNames()).toEqual(['레이어 1'])
  })

  it('노출을 올려 적용하면 원본보다 밝은 픽셀이 들어간다', async () => {
    await openNewDrawing()
    vi.stubGlobal('createImageBitmap', async () => ({ width: 10, height: 10, close: () => {} }))
    const input = screen.getByLabelText('이미지 파일 선택') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: '새 레이어로' }))
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], '사진.jpg', { type: 'image/jpeg' })] } })
    const apply = await screen.findByRole('button', { name: '적용해서 불러오기' })
    await waitFor(() => expect(apply).toBeEnabled())
    fireEvent.change(screen.getByLabelText('노출'), { target: { value: '2' } })
    fireEvent.click(apply)
    await screen.findByText('이미지 불러오기 완료')
    expect(layerNames()).toEqual(['사진', '레이어 1'])
  })
})

describe('테마와 좁은 화면', () => {
  it('테마 버튼을 누르면 라이트 → 다크 → 자동으로 바뀌고 저장된다', async () => {
    await openNewDrawing()
    const button = () => screen.getByRole('button', { name: /화면 테마/ })
    fireEvent.click(button())
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    fireEvent.click(button())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('drawing-app-theme')).toBe('dark')
    fireEvent.click(button())
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('좁은 화면의 아래 버튼으로 도구/패널 시트를 열고 닫는다', async () => {
    await openNewDrawing()
    const tools = document.querySelector('.sheet--tools') as HTMLElement
    const panel = document.querySelector('.sheet--panel') as HTMLElement
    expect(tools.classList.contains('is-open')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '도구' , hidden: true }))
    expect(tools.classList.contains('is-open')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '색·레이어·파일', hidden: true }))
    expect(tools.classList.contains('is-open')).toBe(false)
    expect(panel.classList.contains('is-open')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '색·레이어·파일', hidden: true }))
    expect(panel.classList.contains('is-open')).toBe(false)
  })
})
