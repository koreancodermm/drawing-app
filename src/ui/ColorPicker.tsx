import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { hexToHsv, hsvToHex, type Hsv } from '../canvas/color'

interface Props {
  value: string
  onChange: (hex: string) => void
  label: string
}

/**
 * 채도·명도 사각형과 색상(hue) 막대로 된 색 고르기. 네모 안에서 끌면 색이 바로 바뀐다.
 * OS마다 다르게 생긴 기본 색상 선택창 대신, 어느 브라우저·기기에서나 똑같이 움직이는 화면이다.
 */
export default function ColorPicker({ value, onChange, label }: Props) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  const dragging = useRef<'sv' | null>(null)
  const svRef = useRef<HTMLDivElement>(null)

  // 밖에서 값이 바뀌면(스와치·스포이드·되돌리기 등) 맞춰 준다. 끄는 도중에는 덮어쓰지 않는다.
  useEffect(() => {
    if (dragging.current) return
    setHsv(hexToHsv(value))
  }, [value])

  const commit = (next: Hsv) => {
    setHsv(next)
    onChange(hsvToHex(next.h, next.s, next.v))
  }

  const pickSv = (clientX: number, clientY: number) => {
    const el = svRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const s = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const v = Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height))
    commit({ ...hsv, s, v })
  }

  const onSvDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // 무시해도 그려지는 데는 문제없다.
    }
    dragging.current = 'sv'
    pickSv(e.clientX, e.clientY)
  }
  const onSvMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current !== 'sv') return
    pickSv(e.clientX, e.clientY)
  }
  const endDrag = () => {
    dragging.current = null
  }

  const move = (dx: number, dy: number) => {
    commit({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + dx)), v: Math.min(1, Math.max(0, hsv.v + dy)) })
  }

  return (
    <div className="color-picker">
      <div
        ref={svRef}
        className="color-picker__sv"
        role="slider"
        tabIndex={0}
        aria-label={`${label} 채도·명도`}
        aria-valuetext={`채도 ${Math.round(hsv.s * 100)}%, 명도 ${Math.round(hsv.v * 100)}%`}
        style={{ '--hue': hsv.h } as React.CSSProperties}
        onPointerDown={onSvDown}
        onPointerMove={onSvMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02
          if (e.key === 'ArrowRight') move(step, 0)
          else if (e.key === 'ArrowLeft') move(-step, 0)
          else if (e.key === 'ArrowUp') move(0, step)
          else if (e.key === 'ArrowDown') move(0, -step)
          else return
          e.preventDefault()
        }}
      >
        <div className="color-picker__thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <input
        type="range"
        className="color-picker__hue"
        aria-label={`${label} 색상`}
        min={0}
        max={359}
        value={Math.round(hsv.h)}
        onChange={(e) => commit({ ...hsv, h: Number(e.target.value) })}
      />
    </div>
  )
}
