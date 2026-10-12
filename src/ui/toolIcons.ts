/**
 * 도구 패널의 그림(64×34 칸의 흰 카드). 획을 그려서 보여 줄 수 없는 도구(채우기·선택·번짐 등)를
 * 이모지 대신 직접 그린 그림으로 보여 준다. 이모지는 기기마다 생김새가 달라서 다른 미리보기와 어울리지 않았다.
 * 모든 그림은 같은 선 굵기·색 조합(잉크색 윤곽 + 몇 가지 고정 색)으로 그려 한 세트처럼 보이게 한다.
 */

export const ICON_W = 64
export const ICON_H = 34

const RED = '#e03131'
const BLUE = '#1971c2'
const YELLOW = '#f2c94c'
const GREEN = '#2f9e44'
const GRAY = '#b4bcc8'
const SKIN = '#f6d2b0'

type Ctx = CanvasRenderingContext2D
type Draw = (ctx: Ctx, ink: string) => void

function outline(ctx: Ctx, ink: string, width = 1.3): void {
  ctx.strokeStyle = ink
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash([])
}

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function starPath(ctx: Ctx, cx: number, cy: number, r: number, points: number, inner: number, rot = -Math.PI / 2): void {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner
    const a = rot + (i * Math.PI) / points
    const x = cx + Math.cos(a) * rad
    const y = cy + Math.sin(a) * rad
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function drop(ctx: Ctx, x: number, y: number, color: string, ink: string): void {
  ctx.beginPath()
  ctx.moveTo(x, y - 5.5)
  ctx.bezierCurveTo(x + 1.5, y - 2.5, x + 4.2, y - 0.5, x + 4.2, y + 2)
  ctx.arc(x, y + 2, 4.2, 0, Math.PI)
  ctx.bezierCurveTo(x - 4.2, y - 0.5, x - 1.5, y - 2.5, x, y - 5.5)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  outline(ctx, ink, 1.1)
  ctx.stroke()
}

function arrowHead(ctx: Ctx, x: number, y: number, dx: number, dy: number, size = 3.6): void {
  const nx = -dy
  const ny = dx
  ctx.beginPath()
  ctx.moveTo(x + dx * size, y + dy * size)
  ctx.lineTo(x + nx * size * 0.8, y + ny * size * 0.8)
  ctx.lineTo(x - nx * size * 0.8, y - ny * size * 0.8)
  ctx.closePath()
  ctx.fill()
}

function bars(ctx: Ctx, x: number, w: number): void {
  const colors = [RED, YELLOW, GREEN, BLUE]
  const bw = w / colors.length
  colors.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(x + i * bw, 6, bw + 0.3, 22)
  })
}

function finger(ctx: Ctx, x: number, y: number, ink: string): void {
  ctx.fillStyle = SKIN
  ctx.beginPath()
  ctx.arc(x, y, 5, 0, Math.PI * 2)
  ctx.fill()
  outline(ctx, ink, 1.2)
  ctx.stroke()
}

const ICONS: Record<string, Draw> = {
  bucket(ctx, ink) {
    ctx.save()
    ctx.translate(24, 18)
    ctx.rotate(-0.4)
    ctx.fillStyle = GRAY
    ctx.beginPath()
    ctx.moveTo(-9, -4)
    ctx.lineTo(9, -4)
    ctx.lineTo(6.5, 10)
    ctx.lineTo(-6.5, 10)
    ctx.closePath()
    ctx.fill()
    outline(ctx, ink)
    ctx.stroke()
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.ellipse(0, -4, 9, 2.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, -4, 11.5, Math.PI * 1.1, Math.PI * 1.9)
    ctx.stroke()
    ctx.restore()
    drop(ctx, 46, 13, RED, ink)
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.ellipse(46, 28, 8, 2.4, 0, 0, Math.PI * 2)
    ctx.fill()
  },

  gradient(ctx, ink) {
    const g = ctx.createLinearGradient(8, 0, 56, 0)
    g.addColorStop(0, BLUE)
    g.addColorStop(0.5, '#b197fc')
    g.addColorStop(1, YELLOW)
    roundedRect(ctx, 8, 6, 48, 22, 4)
    ctx.fillStyle = g
    ctx.fill()
    outline(ctx, ink)
    ctx.stroke()
  },

  pattern(ctx, ink) {
    ctx.save()
    roundedRect(ctx, 8, 6, 48, 22, 4)
    ctx.clip()
    ctx.fillStyle = '#e7f0fb'
    ctx.fillRect(8, 6, 48, 22)
    ctx.fillStyle = BLUE
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 7; col++) {
        ctx.beginPath()
        ctx.arc(12 + col * 7.5 + (row % 2) * 3.7, 11 + row * 6.5, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
    roundedRect(ctx, 8, 6, 48, 22, 4)
    outline(ctx, ink)
    ctx.stroke()
  },

  eyedropper(ctx, ink) {
    outline(ctx, GRAY, 6)
    ctx.beginPath()
    ctx.moveTo(24, 21)
    ctx.lineTo(41, 7)
    ctx.stroke()
    outline(ctx, ink, 1.3)
    ctx.beginPath()
    ctx.moveTo(24, 21)
    ctx.lineTo(41, 7)
    ctx.stroke()
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.arc(44, 6, 4.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(21, 24)
    ctx.lineTo(24, 20)
    ctx.lineTo(27, 24)
    ctx.closePath()
    ctx.fill()
    drop(ctx, 17, 27, RED, ink)
  },

  recolor(ctx, ink) {
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.arc(18, 17, 8, 0, Math.PI * 2)
    ctx.fill()
    outline(ctx, ink)
    ctx.stroke()
    ctx.fillStyle = BLUE
    ctx.beginPath()
    ctx.arc(46, 17, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.moveTo(29, 17)
    ctx.lineTo(34, 17)
    ctx.stroke()
    arrowHead(ctx, 33, 17, 1, 0, 3.4)
  },

  colorblend(ctx, ink) {
    ctx.globalAlpha = 0.85
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.arc(26, 17, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.6
    ctx.fillStyle = BLUE
    ctx.beginPath()
    ctx.arc(38, 17, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    outline(ctx, ink, 1)
    ctx.beginPath()
    ctx.arc(26, 17, 10, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(38, 17, 10, 0, Math.PI * 2)
    ctx.stroke()
  },

  coloreraser(ctx, ink) {
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.arc(45, 18, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.translate(26, 18)
    ctx.rotate(-0.45)
    roundedRect(ctx, -12, -6, 24, 12, 3)
    ctx.fillStyle = '#f4a6b7'
    ctx.fill()
    outline(ctx, ink)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-2, -6)
    ctx.lineTo(-2, 6)
    ctx.stroke()
    ctx.restore()
  },

  blur(ctx) {
    bars(ctx, 8, 22)
    // ctx.filter를 지원하지 않는 브라우저(일부 사파리)에서는 흐림 대신 옅게 그린다.
    const canFilter = typeof (ctx as { filter?: unknown }).filter === 'string'
    // 흐림 반지름은 화면 픽셀 단위라서, 확대해서 그리는 만큼(변환 배율) 키운다.
    const scale = ctx.getTransform?.()?.a || 1
    if (canFilter) ctx.filter = `blur(${2.2 * scale}px)`
    else ctx.globalAlpha = 0.55
    bars(ctx, 34, 22)
    if (canFilter) ctx.filter = 'none'
    else ctx.globalAlpha = 1
  },

  sharpen(ctx, ink) {
    starPath(ctx, 32, 17, 12, 4, 0.26)
    ctx.fillStyle = BLUE
    ctx.fill()
    outline(ctx, ink)
    ctx.stroke()
    starPath(ctx, 51, 9, 5, 4, 0.3)
    ctx.fillStyle = YELLOW
    ctx.fill()
    ctx.stroke()
    starPath(ctx, 13, 26, 4, 4, 0.3)
    ctx.fill()
    ctx.stroke()
  },

  smudge(ctx, ink) {
    const rows: [number, string][] = [
      [9, RED],
      [17, YELLOW],
      [25, BLUE],
    ]
    for (const [y, c] of rows) {
      outline(ctx, c, 5)
      ctx.beginPath()
      ctx.moveTo(9, y)
      ctx.lineTo(28, y)
      ctx.stroke()
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.moveTo(28, y)
      ctx.bezierCurveTo(36, y, 40, 17, 49, 17)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    finger(ctx, 52, 17, ink)
  },

  retouch(ctx, ink) {
    outline(ctx, GREEN, 6)
    ctx.beginPath()
    ctx.moveTo(8, 22)
    ctx.bezierCurveTo(18, 22, 20, 12, 32, 12)
    ctx.stroke()
    ctx.globalAlpha = 0.45
    outline(ctx, GREEN, 6)
    ctx.beginPath()
    ctx.moveTo(32, 12)
    ctx.bezierCurveTo(40, 12, 44, 18, 50, 20)
    ctx.stroke()
    ctx.globalAlpha = 1
    finger(ctx, 52, 21, ink)
  },

  waterbleed(ctx, ink) {
    drop(ctx, 32, 11, '#4dabf7', ink)
    outline(ctx, '#4dabf7', 1.4)
    for (const [w, a] of [
      [8, 1],
      [14, 0.65],
      [21, 0.35],
    ] as const) {
      ctx.globalAlpha = a
      ctx.beginPath()
      ctx.ellipse(32, 26, w, w * 0.2, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  },

  rectselect(ctx) {
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 1.6
    ctx.setLineDash([4, 3])
    ctx.strokeRect(10, 6, 44, 22)
    ctx.setLineDash([])
    ctx.fillStyle = BLUE
    for (const [x, y] of [
      [10, 6],
      [54, 6],
      [10, 28],
      [54, 28],
    ]) {
      ctx.fillRect(x - 2, y - 2, 4, 4)
    }
  },

  lasso(ctx) {
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(18, 25)
    ctx.bezierCurveTo(8, 12, 24, 3, 40, 6)
    ctx.bezierCurveTo(58, 9, 56, 24, 38, 27)
    ctx.bezierCurveTo(30, 28, 24, 27, 18, 25)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(18, 25)
    ctx.quadraticCurveTo(12, 29, 14, 32)
    ctx.stroke()
  },

  wand(ctx, ink) {
    outline(ctx, ink, 3.6)
    ctx.beginPath()
    ctx.moveTo(14, 29)
    ctx.lineTo(36, 11)
    ctx.stroke()
    starPath(ctx, 42, 8, 7, 5, 0.45)
    ctx.fillStyle = YELLOW
    ctx.fill()
    outline(ctx, ink, 1.1)
    ctx.stroke()
    ctx.fillStyle = BLUE
    ctx.fillRect(51, 17, 3, 3)
    ctx.fillRect(25, 5, 3, 3)
  },

  move(ctx, ink) {
    outline(ctx, ink, 1.8)
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.moveTo(32, 5)
    ctx.lineTo(32, 29)
    ctx.moveTo(18, 17)
    ctx.lineTo(46, 17)
    ctx.stroke()
    arrowHead(ctx, 32, 5, 0, -1)
    arrowHead(ctx, 32, 29, 0, 1)
    arrowHead(ctx, 18, 17, -1, 0)
    arrowHead(ctx, 46, 17, 1, 0)
  },

  text(ctx, ink) {
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 21px system-ui, "Malgun Gothic", sans-serif'
    ctx.fillText('Aa', 32, 18)
  },

  sticker(ctx, ink) {
    starPath(ctx, 30, 18, 13, 5, 0.46)
    ctx.fillStyle = YELLOW
    ctx.fill()
    outline(ctx, ink)
    ctx.stroke()
    starPath(ctx, 51, 9, 4.5, 4, 0.3)
    ctx.fillStyle = RED
    ctx.fill()
    ctx.stroke()
  },

  hand(ctx, ink) {
    outline(ctx, ink, 1.3)
    ctx.fillStyle = SKIN
    const tops = [9, 5, 4, 8]
    tops.forEach((top, i) => {
      roundedRect(ctx, 23 + i * 5.2, top, 4.6, 20 - top, 2.3)
      ctx.fill()
      ctx.stroke()
    })
    ctx.beginPath()
    ctx.ellipse(21, 21, 4.8, 2.6, -0.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    roundedRect(ctx, 22.5, 16, 20.8, 14, 6)
    ctx.fill()
    ctx.stroke()
  },
}

/** 이 도구에 그려 둔 그림이 있는지 */
export function hasToolIcon(id: string): boolean {
  return id in ICONS
}

/** 그림이 있는 도구의 ID들(테스트가 "그림 없이 이모지로 남은 도구가 없는지" 검사하는 데 쓴다) */
export const TOOL_ICON_IDS: readonly string[] = Object.keys(ICONS)

/**
 * 도구 그림을 그린다(좌표는 64×34 칸 기준, 흰 카드 위). 그림이 없는 도구면 false.
 * ink는 윤곽선 색이다.
 */
export function drawToolIcon(ctx: Ctx, id: string, ink: string): boolean {
  const draw = ICONS[id]
  if (!draw) return false
  ctx.save()
  try {
    draw(ctx, ink)
  } finally {
    ctx.restore()
  }
  return true
}
