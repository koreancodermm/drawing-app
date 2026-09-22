export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'drawing-app-theme'

export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: '기기 설정 따르기',
  light: '라이트',
  dark: '다크',
}

export function getStoredTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    // 저장소를 쓸 수 없으면(사생활 보호 모드 등) 기기 설정을 따른다.
    return 'system'
  }
}

/** 화면에 테마를 적용한다. system이면 data-theme을 지워 기기 설정(prefers-color-scheme)을 따른다. */
export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function setTheme(theme: ThemeChoice): void {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // 저장하지 못해도 이번 화면에는 적용한다.
  }
  applyTheme(theme)
}

/** 라이트 → 다크 → 기기 설정 순서로 바꾼다. */
export function nextTheme(theme: ThemeChoice): ThemeChoice {
  return theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
}
