import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../storage/db'
import { listDrawings, loadDrawing } from '../storage/repository'
import { installFakeCanvas } from '../test-utils/fakeCanvas'

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

async function openNewDrawing() {
  const view = render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: '새 그림' }))
  fireEvent.click(await screen.findByRole('button', { name: '그리기 시작' }))
  await screen.findByLabelText('그림 캔버스')
  return view
}

function pointerAt(x: number, y: number) {
  return { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y }
}

const viewport = () => document.querySelector('.draw__viewport') as HTMLElement

function drag(from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(viewport(), pointerAt(...from))
  fireEvent.pointerMove(viewport(), pointerAt(...to))
  fireEvent.pointerUp(viewport(), pointerAt(...to))
}

function chooseTool(tab: string, tool: string) {
  fireEvent.click(screen.getByRole('tab', { name: tab }))
  fireEvent.click(screen.getByRole('button', { name: tool }))
}

describe('도구 고르기와 쓰기', () => {
  it('도형 도구를 골라 끌면 그려지고 되돌릴 수 있다', async () => {
    await openNewDrawing()
    chooseTool('도형·선', '사각형')
    expect(screen.getByLabelText('채우기')).toBeInTheDocument()
    drag([40, 40], [120, 90])
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeEnabled()
  })

  it('도구별 옵션을 따로 기억한다(연필 20, 볼펜 9)', async () => {
    await openNewDrawing()
    fireEvent.click(screen.getByRole('button', { name: '연필' }))
    fireEvent.change(screen.getByLabelText('두께'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: '볼펜' }))
    fireEvent.change(screen.getByLabelText('두께'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: '연필' }))
    expect((screen.getByLabelText('두께') as HTMLInputElement).value).toBe('20')
    fireEvent.click(screen.getByRole('button', { name: '볼펜' }))
    expect((screen.getByLabelText('두께') as HTMLInputElement).value).toBe('9')
  })

  it('스포이드로 누른 곳의 색을 가져온다(투명하면 종이 색). 그림은 바뀌지 않는다', async () => {
    await openNewDrawing()
    chooseTool('채우기·색', '스포이드')
    fireEvent.pointerDown(viewport(), pointerAt(30, 30))
    fireEvent.pointerUp(viewport(), pointerAt(30, 30))
    expect((screen.getByLabelText('HEX 색 코드') as HTMLInputElement).value).toBe('#ffffff')
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled()
  })

  it('사각 선택을 하면 선택 영역 안내가 나오고 Esc로 풀린다', async () => {
    await openNewDrawing()
    chooseTool('선택·보조', '사각 선택')
    drag([50, 50], [150, 120])
    expect(screen.getByRole('heading', { name: '선택 영역' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('heading', { name: '선택 영역' })).not.toBeInTheDocument()
  })

  it('선택 영역이 있을 때 Delete를 누르면 그 안을 지우는 획이 기록된다', async () => {
    await openNewDrawing()
    chooseTool('선택·보조', '사각 선택')
    drag([50, 50], [150, 120])
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeEnabled()
  })

  it('선택 없이 이동 도구를 쓰면 먼저 선택하라고 안내한다', async () => {
    await openNewDrawing()
    chooseTool('선택·보조', '이동')
    fireEvent.pointerDown(viewport(), pointerAt(50, 50))
    expect(screen.getByText(/먼저 사각·올가미·마술봉 선택/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled()
  })

  it('선택한 영역을 끌어 옮기면 이동이 기록된다', async () => {
    await openNewDrawing()
    chooseTool('선택·보조', '사각 선택')
    drag([50, 50], [150, 120])
    fireEvent.click(screen.getByRole('button', { name: '이동' }))
    drag([80, 80], [130, 100])
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeEnabled()
  })

  it('텍스트 도구: 누른 곳에 입력칸이 뜨고 Enter로 글자가 들어간다', async () => {
    await openNewDrawing()
    chooseTool('선택·보조', '텍스트 입력')
    fireEvent.pointerDown(viewport(), pointerAt(60, 70))
    fireEvent.pointerUp(viewport(), pointerAt(60, 70))
    const input = await screen.findByLabelText('넣을 글자')
    fireEvent.change(input, { target: { value: '안녕하세요' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByLabelText('넣을 글자')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeEnabled()
  })

  it('텍스트 도구: 빈 글자는 넣지 않는다', async () => {
    await openNewDrawing()
    chooseTool('선택·보조', '텍스트 입력')
    fireEvent.pointerDown(viewport(), pointerAt(60, 70))
    fireEvent.pointerUp(viewport(), pointerAt(60, 70))
    const input = await screen.findByLabelText('넣을 글자')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled()
  })

  it('스티커는 한 번 누르면 찍힌다', async () => {
    await openNewDrawing()
    chooseTool('선택·보조', '스티커/도장')
    fireEvent.click(screen.getByRole('button', { name: '하트' }))
    fireEvent.pointerDown(viewport(), pointerAt(80, 80))
    fireEvent.pointerUp(viewport(), pointerAt(80, 80))
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeEnabled()
  })

  it('페인트 통, 지우개, 대칭 그리기도 그려진다', async () => {
    await openNewDrawing()
    chooseTool('채우기·색', '페인트 통')
    fireEvent.pointerDown(viewport(), pointerAt(40, 40))
    fireEvent.pointerUp(viewport(), pointerAt(40, 40))
    chooseTool('지우기·편집', '지우개')
    drag([20, 20], [90, 60])
    chooseTool('선택·보조', '대칭 그리기')
    drag([20, 20], [90, 60])
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다시하기' })).toBeEnabled()
  })

  it('손 도구로는 그려지지 않는다', async () => {
    await openNewDrawing()
    chooseTool('선택·보조', '손 도구')
    drag([40, 40], [90, 90])
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled()
  })

  it('도구를 바꾸고 새로고침해도 마지막 도구와 옵션이 그대로다', async () => {
    const first = await openNewDrawing()
    chooseTool('붓·회화', '수채 붓')
    fireEvent.change(screen.getByLabelText('진하기'), { target: { value: '0.3' } })
    window.dispatchEvent(new Event('pagehide'))
    const [item] = await listDrawings()
    await waitFor(async () => {
      expect((await loadDrawing(item.meta.id)).snapshot.ui.tool).toBe('watercolor')
    })
    first.unmount()

    render(<App />)
    await screen.findByLabelText('그림 캔버스')
    expect(screen.getByRole('button', { name: '수채 붓' })).toHaveAttribute('aria-pressed', 'true')
    expect((screen.getByLabelText('진하기') as HTMLInputElement).value).toBe('0.3')
  })

  it('그린 획에는 그때의 도구 옵션이 저장된다', async () => {
    await openNewDrawing()
    chooseTool('도형·선', '별')
    fireEvent.change(screen.getByLabelText('꼭짓점 수'), { target: { value: '7' } })
    drag([100, 100], [140, 100])
    window.dispatchEvent(new Event('pagehide'))
    const [item] = await listDrawings()
    await waitFor(async () => {
      const { snapshot } = await loadDrawing(item.meta.id)
      expect(snapshot.strokes).toHaveLength(1)
      expect(snapshot.strokes[0].t).toBe('star')
      expect(JSON.parse(snapshot.strokes[0].x!)).toMatchObject({ sides: 7, fill: 1 })
    })
  })
})
