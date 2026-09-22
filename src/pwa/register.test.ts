import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './register'

/** 서비스 워커 컨테이너 흉내: controllerchange를 직접 일으킬 수 있다. */
function fakeContainer(controller: object | null) {
  const target = new EventTarget()
  const container = Object.assign(target, {
    controller,
    register: vi.fn().mockResolvedValue({
      waiting: null,
      installing: null,
      addEventListener: () => {},
      update: () => Promise.resolve(),
    }),
  })
  return container
}

const reload = vi.fn()

beforeEach(() => {
  vi.stubEnv('PROD', true)
  reload.mockClear()
  vi.stubGlobal('location', { ...window.location, reload })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('registerServiceWorker', () => {
  it('개발 중(production이 아님)에는 서비스 워커를 등록하지 않는다', () => {
    vi.stubEnv('PROD', false)
    const sw = fakeContainer(null)
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: sw })
    registerServiceWorker()
    expect(sw.register).not.toHaveBeenCalled()
  })

  it('등록은 상대 경로 ./sw.js로 한다', () => {
    const sw = fakeContainer(null)
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: sw })
    registerServiceWorker()
    expect(sw.register).toHaveBeenCalledWith('./sw.js')
  })

  it('처음 방문해서 서비스 워커가 처음 자리 잡을 때는 새로고침하지 않는다', () => {
    const sw = fakeContainer(null)
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: sw })
    registerServiceWorker()
    sw.controller = {} as never
    sw.dispatchEvent(new Event('controllerchange'))
    expect(reload).not.toHaveBeenCalled()
  })

  it('이미 앱을 제어하던 서비스 워커가 새 버전으로 바뀔 때는 한 번만 새로고침한다', () => {
    const sw = fakeContainer({})
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: sw })
    registerServiceWorker()
    sw.dispatchEvent(new Event('controllerchange'))
    sw.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('처음 자리 잡은 뒤에 나중에 업데이트가 적용되면 그때는 새로고침한다', () => {
    const sw = fakeContainer(null)
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: sw })
    registerServiceWorker()
    sw.dispatchEvent(new Event('controllerchange')) // 처음 설치
    expect(reload).not.toHaveBeenCalled()
    sw.dispatchEvent(new Event('controllerchange')) // 나중의 업데이트
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
