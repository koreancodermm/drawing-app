import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { defaultLayers } from './canvas/layers'
import { db } from './storage/db'
import { createDrawing, getLastOpened, listDrawings, loadDrawing } from './storage/repository'
import { decodeStroke } from './storage/snapshot'
import { installFakeCanvas } from './test-utils/fakeCanvas'
import NewDrawing from './ui/NewDrawing'

const spec = {
  widthPx: 1240,
  heightPx: 1754,
  dpi: 150,
  widthMm: 210,
  heightMm: 297,
  background: '#ffffff',
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  installFakeCanvas()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function drawOneStroke() {
  const viewport = document.querySelector('.draw__viewport') as HTMLElement
  const point = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y })
  fireEvent.pointerDown(viewport, point(100, 100))
  fireEvent.pointerMove(viewport, point(140, 120))
  fireEvent.pointerMove(viewport, point(180, 100))
  fireEvent.pointerUp(viewport, point(180, 100))
}

describe('App 시작 화면', () => {
  it('그림이 없으면 홈에 안내 문구를 보여준다', async () => {
    render(<App />)
    expect(await screen.findByText(/아직 그림이 없습니다/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새 그림' })).toBeEnabled()
  })

  it('새 그림을 만들면 그리기 화면이 열리고, 홈으로 나가면 목록에 나온다', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '새 그림' }))
    expect(await screen.findByRole('heading', { name: '새 그림' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '그리기 시작' }))

    expect(await screen.findByLabelText('그림 캔버스')).toBeInTheDocument()
    expect(await getLastOpened()).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '홈' }))
    expect(await screen.findByRole('heading', { name: '내 그림' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /새 그림 1 열기/ })).toBeInTheDocument()
    // 홈으로 나가면 "마지막으로 연 그림" 표시가 지워진다.
    expect(await getLastOpened()).toBeNull()
  })
})

describe('새로고침해도 그림이 남는다', () => {
  it('그리던 그림은 앱을 다시 열면 자동으로 열리고 되돌리기 기록도 남아 있다', async () => {
    const first = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '새 그림' }))
    fireEvent.click(await screen.findByRole('button', { name: '그리기 시작' }))
    await screen.findByLabelText('그림 캔버스')

    await drawOneStroke()
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeEnabled()

    // 탭이 닫히는 상황(pagehide)을 흉내 낸다. 1초를 기다리지 않고 바로 저장돼야 한다.
    window.dispatchEvent(new Event('pagehide'))
    const [item] = await listDrawings()
    await waitFor(async () => {
      expect((await loadDrawing(item.meta.id)).snapshot.strokes).toHaveLength(1)
    })
    first.unmount()

    // 새로고침: 앱을 처음부터 다시 그린다.
    render(<App />)
    expect(await screen.findByLabelText('그림 캔버스')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '되돌리기' })).toBeEnabled())
    expect(screen.getByRole('button', { name: '다시하기' })).toBeDisabled()
  })

  it('화면 상태(도구·두께)도 함께 저장된다', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '새 그림' }))
    fireEvent.click(await screen.findByRole('button', { name: '그리기 시작' }))
    await screen.findByLabelText('그림 캔버스')

    fireEvent.click(screen.getByRole('tab', { name: '지우기·편집' }))
    fireEvent.click(screen.getByRole('button', { name: '지우개' }))
    fireEvent.change(screen.getByLabelText('두께'), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: '홈' }))
    // 저장을 마치고 홈으로 가므로, 전체 테스트를 한꺼번에 돌릴 때는 기본 1초로 모자랄 수 있다.
    await screen.findByRole('heading', { name: '내 그림' }, { timeout: 15_000 })

    const [item] = await listDrawings()
    const loaded = await loadDrawing(item.meta.id)
    expect(loaded.snapshot.ui).toMatchObject({ tool: 'eraser', size: 42 })
    expect(loaded.snapshot.ui.settings?.eraser).toMatchObject({ size: 42 })
  })

  it('저장된 상태로 그림을 열면 도구와 두께가 복원된다', async () => {
    const meta = await createDrawing('복원 시험', spec)
    const { saveSnapshot } = await import('./storage/repository')
    await saveSnapshot(meta.id, { strokes: [], redo: [], layers: defaultLayers(), ui: { tool: 'pencil', color: '#ff0000', size: 33, view: { zoom: 0.5, x: 10, y: 20 }, settings: { pencil: { size: 33 } } } }, [])

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /복원 시험 열기/ }))
    await screen.findByLabelText('그림 캔버스')
    expect(screen.getByRole('button', { name: '연필' })).toHaveAttribute('aria-pressed', 'true')
    expect((screen.getByLabelText('두께') as HTMLInputElement).value).toBe('33')
    expect((screen.getByLabelText('HEX 색 코드') as HTMLInputElement).value).toBe('#ff0000')
    expect(screen.getByLabelText('확대 비율')).toHaveTextContent('50%')
  })

  it('그림을 열기만 하면 다시 저장하지 않는다(수정 시각·순서가 바뀌지 않는다)', async () => {
    const meta = await createDrawing('열기만 할 그림', spec)
    const seqBefore = (await db.snapshots.get(meta.id))!.current.seq
    const updatedBefore = (await db.drawings.get(meta.id))!.updatedAt

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /열기만 할 그림 열기/ }))
    await screen.findByLabelText('그림 캔버스')
    // 자동 저장 대기 시간(1초)보다 오래 기다려도 저장이 일어나지 않아야 한다.
    await new Promise((resolve) => setTimeout(resolve, 1300))

    expect((await db.snapshots.get(meta.id))!.current.seq).toBe(seqBefore)
    expect((await db.drawings.get(meta.id))!.updatedAt).toBe(updatedBefore)
    expect(document.querySelector('.draw__status')?.textContent).toBe('')
  })
})

describe('손상된 저장 데이터', () => {
  it('최신 저장본이 손상되면 직전 저장본으로 열고 안내를 보여준다', async () => {
    const meta = await createDrawing('손상 시험', spec)
    const { saveSnapshot } = await import('./storage/repository')
    const ui = { tool: 'pen' as const, color: '#000000', size: 8, view: null }
    await saveSnapshot(meta.id, { strokes: [], redo: [], layers: defaultLayers(), ui }, [])
    await saveSnapshot(meta.id, { strokes: [], redo: [], layers: defaultLayers(), ui }, [])
    const record = (await db.snapshots.get(meta.id))!
    record.current.checksum += 1
    await db.snapshots.put(record)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /손상 시험 열기/ }))
    expect(await screen.findByLabelText('그림 캔버스')).toBeInTheDocument()
    expect(screen.getByText(/직전 저장본으로 열었습니다/)).toBeInTheDocument()

    // 복구한 상태가 새 최신 저장본으로 다시 저장된다.
    window.dispatchEvent(new Event('pagehide'))
    await waitFor(async () => {
      const again = await loadDrawing(meta.id)
      expect(again.recovered).toBe(false)
    })
  })

  it('두 저장본이 모두 손상되면 열지 못하고 홈에 안내한다', async () => {
    const meta = await createDrawing('완전 손상', spec)
    const record = (await db.snapshots.get(meta.id))!
    record.current.checksum += 1
    await db.snapshots.put(record)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /완전 손상 열기/ }))
    expect(await screen.findByText(/손상되어 그림을 열 수 없습니다/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '내 그림' })).toBeInTheDocument()
  })
})

describe('내 그림 목록', () => {
  it('복제·이름 바꾸기·삭제(확인 창)를 할 수 있다', async () => {
    await createDrawing('원본', spec)
    render(<App />)
    await screen.findByRole('button', { name: /원본 열기/ })

    fireEvent.click(screen.getByRole('button', { name: '복제' }))
    expect(await screen.findByRole('button', { name: /원본 복사본 열기/ })).toBeInTheDocument()

    vi.spyOn(window, 'prompt').mockReturnValue('새 이름')
    const copyCard = screen.getByRole('button', { name: /원본 복사본 열기/ }).closest('li') as HTMLElement
    fireEvent.click(within(copyCard).getByRole('button', { name: '이름 바꾸기' }))
    expect(await screen.findByRole('button', { name: /새 이름 열기/ })).toBeInTheDocument()

    // 확인 창에서 취소하면 지워지지 않는다.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const card = screen.getByRole('button', { name: /새 이름 열기/ }).closest('li') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: '삭제' }))
    expect(confirm).toHaveBeenCalled()
    expect(await listDrawings()).toHaveLength(2)

    confirm.mockReturnValue(true)
    fireEvent.click(within(card).getByRole('button', { name: '삭제' }))
    await waitFor(async () => expect(await listDrawings()).toHaveLength(1))
    expect(screen.queryByRole('button', { name: /새 이름 열기/ })).not.toBeInTheDocument()
  })
})

describe('NewDrawing', () => {
  it('기본값은 A4 150DPI(1240 × 1754 px)다', () => {
    render(<NewDrawing onCreate={() => {}} />)
    expect(screen.getByText(/1240 × 1754 px/)).toBeInTheDocument()
  })

  it('B2를 고르면 2953 × 4175 px이고 큰 크기 경고가 뜬다', () => {
    render(<NewDrawing onCreate={() => {}} />)
    fireEvent.change(screen.getByLabelText('용지 크기'), { target: { value: 'B2' } })
    expect(screen.getByText(/2953 × 4175 px/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('메모리를 많이 씁니다')
  })

  it('가로를 고르면 가로와 세로가 바뀐다', () => {
    render(<NewDrawing onCreate={() => {}} />)
    fireEvent.click(screen.getByLabelText('가로'))
    expect(screen.getByText(/1754 × 1240 px/)).toBeInTheDocument()
  })

  it('너무 큰 크기는 오류를 보여주고 시작 버튼이 꺼진다', () => {
    render(<NewDrawing onCreate={() => {}} />)
    fireEvent.change(screen.getByLabelText('용지 크기'), { target: { value: 'A0' } })
    fireEvent.change(screen.getByLabelText(/해상도/), { target: { value: '300' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '그리기 시작' })).toBeDisabled()
  })

  it('시작 버튼을 누르면 만든 크기와 이름으로 onCreate가 불린다', () => {
    const onCreate = vi.fn()
    render(<NewDrawing onCreate={onCreate} defaultName="내 그림" />)
    fireEvent.click(screen.getByRole('button', { name: '그리기 시작' }))
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ widthPx: 1240, heightPx: 1754, dpi: 150 }),
      '내 그림',
    )
  })

  it('저장된 획을 복원하는 데 쓰는 decodeStroke가 내보내진다', () => {
    expect(typeof decodeStroke).toBe('function')
  })
})
