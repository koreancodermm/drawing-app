import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, getStoredTheme, nextTheme, setTheme } from './theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('theme', () => {
  it('처음에는 기기 설정을 따른다(data-theme 없음)', () => {
    expect(getStoredTheme()).toBe('system')
    applyTheme(getStoredTheme())
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('다크/라이트를 고르면 data-theme이 바뀌고 저장된다', () => {
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(getStoredTheme()).toBe('dark')
    setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(getStoredTheme()).toBe('light')
  })

  it('기기 설정으로 되돌리면 data-theme과 저장값이 지워진다', () => {
    setTheme('dark')
    setTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem('drawing-app-theme')).toBeNull()
  })

  it('이상한 저장값은 무시한다', () => {
    localStorage.setItem('drawing-app-theme', '핑크')
    expect(getStoredTheme()).toBe('system')
  })

  it('버튼은 자동 → 라이트 → 다크 → 자동 순서로 바뀐다', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })
})
