const MM_PER_INCH = 25.4
const PT_PER_INCH = 72

export interface PdfPageInput {
  /** JPEG로 압축된 그림 바이트(RGB) */
  jpeg?: Uint8Array
  /** CMYK 4채널 원본 바이트(압축 없음, 인쇄용 근사 내보내기에 쓴다) */
  cmyk?: Uint8Array
  widthPx: number
  heightPx: number
  /** 종이 실제 크기(mm). PDF 쪽 크기가 된다. */
  widthMm: number
  heightMm: number
}

export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH
}

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString()
}

/**
 * 그림 한 장을 종이 크기 그대로 담은 PDF를 만든다.
 * jpeg를 주면 DeviceRGB(DCTDecode) 이미지로, cmyk를 주면 DeviceCMYK(압축 없는 원본 4채널) 이미지로 담는다.
 * CMYK는 실제 인쇄소 프로파일이 아닌 표준 수식 근사치다(cmyk.ts 참고).
 */
export function buildPdf(page: PdfPageInput): Uint8Array {
  if (!page.jpeg && !page.cmyk) throw new Error('jpeg 또는 cmyk 중 하나는 있어야 한다.')
  const enc = new TextEncoder()
  const w = mmToPt(page.widthMm)
  const h = mmToPt(page.heightMm)
  const content = enc.encode(`q ${fmt(w)} 0 0 ${fmt(h)} 0 0 cm /Im0 Do Q`)

  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes)
    length += bytes.length
  }
  const text = (s: string) => push(enc.encode(s))
  const startObject = (n: number) => {
    offsets[n] = length
    text(`${n} 0 obj\n`)
  }

  // 헤더(뒤쪽 바이트 네 개는 "이 파일은 바이너리"라는 표시)
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  startObject(1)
  text('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  startObject(2)
  text('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  startObject(3)
  text(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(w)} ${fmt(h)}] ` +
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
  )
  startObject(4)
  if (page.cmyk) {
    text(
      `<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} ` +
        `/ColorSpace /DeviceCMYK /BitsPerComponent 8 /Length ${page.cmyk.length} >>\nstream\n`,
    )
    push(page.cmyk)
  } else {
    const jpeg = page.jpeg!
    text(
      `<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    )
    push(jpeg)
  }
  text('\nendstream\nendobj\n')
  startObject(5)
  text(`<< /Length ${content.length} >>\nstream\n`)
  push(content)
  text('\nendstream\nendobj\n')

  const xref = length
  text('xref\n0 6\n0000000000 65535 f \n')
  for (let n = 1; n <= 5; n++) text(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  text(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}
