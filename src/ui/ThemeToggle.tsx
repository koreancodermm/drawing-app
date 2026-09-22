import { useState } from 'react'
import { THEME_LABELS, getStoredTheme, nextTheme, setTheme } from './theme'

/** 라이트 → 다크 → 기기 설정 순서로 화면 테마를 바꾸는 버튼 */
export default function ThemeToggle() {
  const [theme, setThemeState] = useState(getStoredTheme)

  return (
    <button
      className="btn"
      onClick={() => {
        const next = nextTheme(theme)
        setTheme(next)
        setThemeState(next)
      }}
      title="화면 테마 바꾸기"
      aria-label={`화면 테마: ${THEME_LABELS[theme]}. 누르면 바뀝니다`}
    >
      {theme === 'dark' ? '🌙 다크' : theme === 'light' ? '☀️ 라이트' : '🌓 자동'}
    </button>
  )
}
