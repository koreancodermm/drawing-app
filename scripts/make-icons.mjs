// 앱 아이콘(연필 그림)을 PNG와 SVG로 만든다. 외부 라이브러리 없이 zlib만 쓴다.
// 실행: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public')
mkdirSync(join(out, 'icons'), { recursive: true })

const BG = '#1971c2'
const GLOW = '#3b8fe0'

// 연필: 가로축(-0.5~0.5) 기준 도형. 각 도형은 [색, 꼭짓점들].
const H = 0.11
const cone = (x) => H * ((0.5 - x) / 0.28)
const PENCIL = [
  ['#e03131', [[-0.5, -H], [-0.4, -H], [-0.4, H], [-0.5, H]]],
  ['#b0b7c3', [[-0.4, -H], [-0.32, -H], [-0.32, H], [-0.4, H]]],
  ['#f2c94c', [[-0.32, -H], [0.22, -H], [0.22, H], [-0.32, H]]],
  ['#e0a82e', [[-0.32, H * 0.45], [0.22, H * 0.45], [0.22, H], [-0.32, H]]],
  ['#f5d7a1', [[0.22, -H], [0.5, 0], [0.22, H]]],
  ['#3a3f47', [[0.41, -cone(0.41)], [0.5, 0], [0.41, cone(0.41)]]],
]

/** 연필을 (cx,cy)를 중심으로 scale만큼 키우고 45도 돌려 놓은 뒤의 꼭짓점 좌표 */
function place(points, cx, cy, scale) {
  const a = Math.PI / 4
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return points.map(([x, y]) => [cx + (x * cos - y * sin) * scale, cy + (x * sin + y * cos) * scale])
}

function inside(poly, x, y) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/**
 * @param size 한 변(px)
 * @param opts.maskable 가장자리를 꽉 채우는 배경(안전 영역 안에 연필을 둔다)
 * @param opts.round 모서리를 둥글게 깎고 바깥은 투명하게
 */
function render(size, { maskable = false, round = false }) {
  const scale = maskable ? 0.6 : 0.72
  const shapes = PENCIL.map(([color, pts]) => [rgb(color), place(pts, 0.5, 0.5, scale)])
  const bg = rgb(BG)
  const glow = rgb(GLOW)
  const SS = 3
  const px = Buffer.alloc(size * size * 4)
  const radius = 0.22
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size
          const v = (y + (sy + 0.5) / SS) / size
          let color = null
          let alpha = 1
          if (round) {
            const dx = Math.max(Math.abs(u - 0.5) - (0.5 - radius), 0)
            const dy = Math.max(Math.abs(v - 0.5) - (0.5 - radius), 0)
            if (dx * dx + dy * dy > radius * radius) alpha = 0
          }
          if (alpha) {
            const d = Math.hypot(u - 0.5, v - 0.5)
            color = d < 0.36 ? glow : bg
            for (const [c, poly] of shapes) if (inside(poly, u, v)) color = c
          }
          if (color) {
            r += color[0]
            g += color[1]
            b += color[2]
            a += 1
          }
        }
      }
      const i = (y * size + x) * 4
      const n = SS * SS
      px[i] = a ? Math.round(r / a) : 0
      px[i + 1] = a ? Math.round(g / a) : 0
      px[i + 2] = a ? Math.round(b / a) : 0
      px[i + 3] = Math.round((a / n) * 255)
    }
  }
  return px
}

// ---- PNG 쓰기 ----
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(size, rgba) {
  const head = Buffer.alloc(13)
  head.writeUInt32BE(size, 0)
  head.writeUInt32BE(size, 4)
  head[8] = 8
  head[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const files = [
  ['icons/icon-192.png', 192, { round: true }],
  ['icons/icon-512.png', 512, { round: true }],
  ['icons/icon-maskable-512.png', 512, { maskable: true }],
  ['icons/apple-touch-icon.png', 180, { maskable: true }],
]
for (const [name, size, opts] of files) {
  writeFileSync(join(out, name), png(size, render(size, opts)))
  console.log('만듦', name)
}

// ---- SVG(브라우저 탭 아이콘) ----
const S = 100
const svgShapes = PENCIL.map(([color, pts]) => {
  const p = place(pts, 0.5, 0.5, 0.72).map(([x, y]) => `${(x * S).toFixed(2)},${(y * S).toFixed(2)}`)
  return `<polygon fill="${color}" points="${p.join(' ')}"/>`
}).join('')
writeFileSync(
  join(out, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" rx="22" fill="${BG}"/><circle cx="50" cy="50" r="36" fill="${GLOW}"/>${svgShapes}</svg>\n`,
)
console.log('만듦 favicon.svg')
