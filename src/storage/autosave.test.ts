import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Autosaver, type SaveStatus } from './autosave'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(save: () => Promise<void> = () => Promise.resolve()) {
  const saveFn = vi.fn(save)
  const statuses: SaveStatus[] = []
  const saver = new Autosaver({
    save: saveFn,
    onStatus: (s) => statuses.push(s),
    delayMs: 1000,
    retryMs: 5000,
  })
  return { saver, saveFn, statuses }
}

describe('Autosaver', () => {
  it('마지막 변경 1초 뒤에 한 번만 저장한다(디바운스)', async () => {
    const { saver, saveFn } = setup()
    saver.markDirty()
    await vi.advanceTimersByTimeAsync(600)
    saver.markDirty()
    await vi.advanceTimersByTimeAsync(600)
    expect(saveFn).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(saveFn).toHaveBeenCalledTimes(1)
    saver.dispose()
  })

  it('변경이 없으면 저장하지 않는다', async () => {
    const { saver, saveFn } = setup()
    await saver.flush()
    await vi.advanceTimersByTimeAsync(5000)
    expect(saveFn).not.toHaveBeenCalled()
    saver.dispose()
  })

  it('flush는 기다리지 않고 바로 저장한다', async () => {
    const { saver, saveFn, statuses } = setup()
    saver.markDirty()
    await saver.flush()
    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(statuses.at(-1)).toBe('saved')
    expect(saver.hasUnsaved).toBe(false)
    saver.dispose()
  })

  it('탭이 숨겨지면 바로 저장한다', async () => {
    const { saver, saveFn } = setup()
    saver.markDirty()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(saveFn).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    saver.dispose()
  })

  it('탭을 닫을 때(pagehide)도 바로 저장한다', () => {
    const { saver, saveFn } = setup()
    saver.markDirty()
    window.dispatchEvent(new Event('pagehide'))
    expect(saveFn).toHaveBeenCalledTimes(1)
    saver.dispose()
  })

  it('저장에 실패하면 오류 상태가 되고 5초 뒤 다시 시도한다', async () => {
    let calls = 0
    const { saver, saveFn, statuses } = setup(() => {
      calls++
      return calls === 1 ? Promise.reject(new Error('용량 부족')) : Promise.resolve()
    })
    saver.markDirty()
    await vi.advanceTimersByTimeAsync(1000)
    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(statuses).toContain('error')
    expect(saver.hasUnsaved).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)
    expect(saveFn).toHaveBeenCalledTimes(2)
    expect(statuses.at(-1)).toBe('saved')
    expect(saver.hasUnsaved).toBe(false)
    saver.dispose()
  })

  it('dispose하면 남은 변경을 저장하고 더 이상 이벤트에 반응하지 않는다', () => {
    const { saver, saveFn } = setup()
    saver.markDirty()
    saver.dispose()
    expect(saveFn).toHaveBeenCalledTimes(1)
    saver.markDirty()
    window.dispatchEvent(new Event('pagehide'))
    expect(saveFn).toHaveBeenCalledTimes(1)
  })
})
