import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.resetModules()
})

const getCanvas = () => document.createElement('canvas')

describe('기능 스위치(VITE_AI_ENABLED)', () => {
  it('꺼 두면 키가 있어도 AI 패널과 설정 영역이 나오지 않는다', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'false')
    const { setApiKey } = await import('./keyStore')
    setApiKey('key')
    const { aiPlugin } = await import('./index')
    const { Panel, SettingsSection } = aiPlugin
    const a = render(<Panel getCanvas={getCanvas} onAddColors={() => {}} />)
    expect(a.container).toBeEmptyDOMElement()
    const b = render(<SettingsSection />)
    expect(b.container).toBeEmptyDOMElement()
  })

  it('켜 두면(기본) 키가 있을 때 AI 패널이 나온다', async () => {
    const { setApiKey } = await import('./keyStore')
    setApiKey('key')
    const { aiPlugin } = await import('./index')
    const { Panel } = aiPlugin
    const { container } = render(<Panel getCanvas={getCanvas} onAddColors={() => {}} />)
    expect(container.querySelector('.ai-panel')).not.toBeNull()
  })
})
