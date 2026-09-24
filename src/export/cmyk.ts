/**
 * 인쇄용 CMYK 근사 변환. 표준 수식으로 RGB↔CMYK를 바꾸는 것일 뿐, 실제 인쇄소·프린터의
 * ICC 색 프로파일(잉크·종이마다 다름)은 쓰지 않는다. 그래서 화면과 실제 인쇄 결과가 다를 수 있다 —
 * 정확한 인쇄 색 관리는 전문 인쇄 소프트웨어의 몫이라 이 앱은 "대략 이렇게 보일 것"만 보여준다.
 */

export interface Cmyk {
  c: number
  m: number
  y: number
  k: number
}

/** r,g,b는 0~255. 결과는 0~1. */
export function rgbToCmyk(r: number, g: number, b: number): Cmyk {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const k = 1 - Math.max(rn, gn, bn)
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 }
  const denom = 1 - k
  return { c: (1 - rn - k) / denom, m: (1 - gn - k) / denom, y: (1 - bn - k) / denom, k }
}

/** 각 값은 0~1. 결과는 0~255(정수). */
export function cmykToRgb(cmyk: Cmyk): { r: number; g: number; b: number } {
  const { c, m, y, k } = cmyk
  return {
    r: Math.round(255 * (1 - c) * (1 - k)),
    g: Math.round(255 * (1 - m) * (1 - k)),
    b: Math.round(255 * (1 - y) * (1 - k)),
  }
}

/** RGBA 픽셀 배열을 CMYK로 바꿨다가 다시 RGB로 되돌린다("잉크로는 못 내는 색"이 뭉개지는 것을 보여준다). */
export function softProofRgb(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const { r, g, b } = cmykToRgb(rgbToCmyk(data[i], data[i + 1], data[i + 2]))
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

/** RGBA(알파는 흰 배경에 미리 섞음) → CMYK 4채널(각 0~255, 알파 없음) 바이트 배열. PDF의 DeviceCMYK 이미지로 쓴다. */
export function rgbaToCmykBytes(data: Uint8ClampedArray, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount * 4)
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4
    const a = data[i + 3] / 255
    // 알파가 있으면 흰 종이 위에 놓인 것처럼 미리 섞는다.
    const r = data[i] * a + 255 * (1 - a)
    const g = data[i + 1] * a + 255 * (1 - a)
    const b = data[i + 2] * a + 255 * (1 - a)
    const { c, m, y, k } = rgbToCmyk(r, g, b)
    const o = p * 4
    out[o] = Math.round(c * 255)
    out[o + 1] = Math.round(m * 255)
    out[o + 2] = Math.round(y * 255)
    out[o + 3] = Math.round(k * 255)
  }
  return out
}
