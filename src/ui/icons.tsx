import type { ReactNode } from 'react'

/** 상단 툴바에 쓰는 선 그림(한 세트). 색은 글자 색(currentColor)을 따른다. */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="ico"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const HomeIcon = () => (
  <Svg>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h5v-6h4v6h5V10" />
  </Svg>
)

export const UndoIcon = () => (
  <Svg>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 010 12h-3" />
  </Svg>
)

export const RedoIcon = () => (
  <Svg>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 000 12h3" />
  </Svg>
)

export const ZoomOutIcon = () => (
  <Svg>
    <path d="M5 12h14" />
  </Svg>
)

export const ZoomInIcon = () => (
  <Svg>
    <path d="M5 12h14M12 5v14" />
  </Svg>
)

export const FitIcon = () => (
  <Svg>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
)
