/** "#abc", "abc", "#aabbcc" 형태를 "#aabbcc"로 바꾼다. 형식이 틀리면 null. */
export function normalizeHex(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!match) return null
  let hex = match[1].toLowerCase()
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('')
  return `#${hex}`
}

export function addRecentColor(list: readonly string[], color: string, max = 10): string[] {
  const c = color.toLowerCase()
  return [c, ...list.filter((x) => x !== c)].slice(0, max)
}
