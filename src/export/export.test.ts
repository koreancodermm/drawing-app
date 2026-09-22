import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DrawingSession } from '../canvas/session'
import { installFakeCanvas } from '../test-utils/fakeCanvas'
import { renderExport, safeFileName } from './index'
import { fitRect } from './importImage'
import { buildPdf, mmToPt } from './pdf'

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

describe('buildPdf', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9])
  const pdf = buildPdf({ jpeg, widthPx: 1240, heightPx: 1754, widthMm: 210, heightMm: 297 })
  const s = text(pdf)

  it('PDF 머리말과 끝 표시가 있다', () => {
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('쪽 크기는 용지 크기(mm)를 포인트로 바꾼 값이다(A4 = 595.28 × 841.89)', () => {
    expect(mmToPt(210)).toBeCloseTo(595.28, 1)
    expect(s).toContain('/MediaBox [0 0 595.28 841.89]')
    expect(s).toContain('q 595.28 0 0 841.89 0 0 cm /Im0 Do Q')
  })

  it('이미지는 JPEG(DCTDecode)로 원본 크기 그대로 들어 있다', () => {
    expect(s).toContain('/Width 1240 /Height 1754')
    expect(s).toContain('/Filter /DCTDecode /Length 11')
    // JPEG 바이트가 그대로 들어 있어야 한다.
    const at = s.indexOf('stream\n', s.indexOf('/DCTDecode')) + 'stream\n'.length
    expect([...pdf.slice(at, at + jpeg.length)]).toEqual([...jpeg])
  })

  it('xref 표의 위치가 실제 개체 위치와 정확히 맞는다', () => {
    const xrefAt = Number(/startxref\n(\d+)/.exec(s)![1])
    expect(s.slice(xrefAt, xrefAt + 4)).toBe('xref')
    const entries = [...s.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]))
    expect(entries).toHaveLength(5)
    entries.forEach((offset, i) => {
      expect(s.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
    })
  })

  it('B2(500×707mm)도 쪽 크기가 맞다', () => {
    const b2 = text(buildPdf({ jpeg, widthPx: 2953, heightPx: 4175, widthMm: 500, heightMm: 707 }))
    expect(b2).toContain(`/MediaBox [0 0 ${mmToPt(500).toFixed(2)} ${mmToPt(707).toFixed(2)}]`)
  })
})

describe('fitRect', () => {
  it('cover는 캔버스를 빈틈없이 채우고 가운데에 놓는다', () => {
    expect(fitRect(200, 100, 100, 100, 'cover')).toEqual({ x: -50, y: 0, w: 200, h: 100 })
  })

  it('contain은 잘리지 않게 안에 맞추고 가운데에 놓는다', () => {
    expect(fitRect(200, 100, 100, 100, 'contain')).toEqual({ x: 0, y: 25, w: 100, h: 50 })
  })

  it('작은 이미지는 캔버스에 맞춰 키운다', () => {
    const r = fitRect(10, 10, 100, 50, 'contain')
    expect(r).toEqual({ x: 25, y: 0, w: 50, h: 50 })
  })
})

describe('safeFileName', () => {
  it('파일 이름에 못 쓰는 글자를 바꾸고 비면 기본 이름을 쓴다', () => {
    expect(safeFileName('내/그림:1?')).toBe('내_그림_1_')
    expect(safeFileName('   ')).toBe('그림')
  })
})

describe('renderExport', () => {
  beforeEach(() => installFakeCanvas())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const spec = { widthPx: 100, heightPx: 80, dpi: 96, widthMm: 26.46, heightMm: 21.17, background: '#ffeecc' }

  function stubBlob(): { types: string[]; qualities: (number | undefined)[] } {
    const seen = { types: [] as string[], qualities: [] as (number | undefined)[] }
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback, type?: string, q?: number) => {
      seen.types.push(String(type))
      seen.qualities.push(q)
      cb(new Blob([new Uint8Array([0xff, 0xd8, 1, 2, 0xff, 0xd9])], { type }))
    })
    return seen
  }

  it('PNG는 기본으로 종이 색을 깔고, 투명 옵션이면 깔지 않는다', async () => {
    const seen = stubBlob()
    const session = new DrawingSession({ width: 100, height: 80 })
    const spy = vi.spyOn(session, 'flatten')
    const png = await renderExport(session, spec, 'png')
    expect(png.extension).toBe('png')
    expect(spy).toHaveBeenLastCalledWith('#ffeecc')
    await renderExport(session, spec, 'png', { transparent: true })
    expect(spy).toHaveBeenLastCalledWith(null)
    expect(seen.types).toEqual(['image/png', 'image/png'])
  })

  it('JPG는 항상 종이 색을 깔고 품질 0.92로 만든다', async () => {
    const seen = stubBlob()
    const session = new DrawingSession({ width: 100, height: 80 })
    const spy = vi.spyOn(session, 'flatten')
    const jpg = await renderExport(session, spec, 'jpg', { transparent: true })
    expect(jpg.extension).toBe('jpg')
    expect(spy).toHaveBeenLastCalledWith('#ffeecc')
    expect(seen.types).toEqual(['image/jpeg'])
    expect(seen.qualities).toEqual([0.92])
  })

  it('PDF는 JPEG를 담은 application/pdf 파일이다', async () => {
    stubBlob()
    const session = new DrawingSession({ width: 100, height: 80 })
    const pdf = await renderExport(session, spec, 'pdf')
    expect(pdf.extension).toBe('pdf')
    expect(pdf.blob.type).toBe('application/pdf')
    const bytes = new Uint8Array(await pdf.blob.arrayBuffer())
    expect(text(bytes).startsWith('%PDF-1.4')).toBe(true)
    expect(text(bytes)).toContain('/DCTDecode')
  })

  it('이미지를 만들지 못하면(캔버스가 너무 큼 등) 안내 문구로 실패한다', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => cb(null))
    const session = new DrawingSession({ width: 100, height: 80 })
    await expect(renderExport(session, spec, 'png')).rejects.toThrow(/이미지를 만들지 못했습니다/)
  })
})
