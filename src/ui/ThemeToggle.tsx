import { useState } from 'react'
import { THEME_LABELS, getStoredTheme, nextTheme, setTheme } from './theme'

function ThemeIcon({ theme }: { theme: string }) {
  return (
    <svg className="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {theme === 'dark' ? (
        <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
      ) : theme === 'light' ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 000 18z" fill="currentColor" />
        </>
      )}
    </svg>
  )
}

/** 라이트 → 다크 → 기기 설정 순서로 화면 테마를 바꾸는 버튼 */
export default function ThemeToggle() {
  const [theme, setThemeState] = useState(getStoredTheme)

  return (
    <button
      className="btn ibtn"
      onClick={() => {
        const next = nextTheme(theme)
        setTheme(next)
        setThemeState(next)
      }}
      title="화면 테마 바꾸기"
      aria-label={`화면 테마: ${THEME_LABELS[theme]}. 누르면 바뀝니다`}
    >
      <ThemeIcon theme={theme} />
      <span className="ibtn__t">{theme === 'dark' ? '다크' : theme === 'light' ? '라이트' : '자동'}</span>
    </button>
  )
}
