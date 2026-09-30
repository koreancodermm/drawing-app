import { hexToRgb } from '../tools/geom'

/** "#abc", "abc", "#aabbcc" 형태를 "#aabbcc"로 바꾼다. 형식이 틀리면 null. */
export function normalizeHex(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!match) return null
  let hex = match[1].toLowerCase()
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('')
  return `#${hex}`
}

export interface Hsv {
  /** 0~360 */
  h: number
  /** 0~1(채도) */
  s: number
  /** 0~1(명도) */
  v: number
}

/** r,g,b는 0~255. */
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / d + 2)
    else h = 60 * ((rn - gn) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = v - c
  let [r, g, b] = [0, 0, 0]
  if (hh < 60) [r, g, b] = [c, x, 0]
  else if (hh < 120) [r, g, b] = [x, c, 0]
  else if (hh < 180) [r, g, b] = [0, c, x]
  else if (hh < 240) [r, g, b] = [0, x, c]
  else if (hh < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHsv(r, g, b)
}

export function hsvToHex(h: number, s: number, v: number): string {
  return rgbToHex(...hsvToRgb(h, s, v))
}

export function addRecentColor(list: readonly string[], color: string, max = 10): string[] {
  const c = color.toLowerCase()
  return [c, ...list.filter((x) => x !== c)].slice(0, max)
}
