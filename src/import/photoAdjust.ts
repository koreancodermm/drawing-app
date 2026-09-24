/**
 * 사진(JPG·PNG) 불러오기 전에 하는 기본 보정. 카메라 RAW 파일 자체를 복원하는 것은 아니다 —
 * 그러려면 카메라마다 다른 색 보정표와 디모자이킹이라는 전용 엔진이 필요해서 이 앱(브라우저 캔버스)으로는
 * 할 수 없다. 대신 이미 8비트 이미지로 바뀐 사진의 밝기·색을 조정한다(노출·화이트밸런스·명암·톤).
 *
 * 값 하나(0~255)마다 결과가 똑같이 정해지므로(입력이 같으면 출력도 같다), 채널마다 256칸짜리 표(LUT)를
 * 한 번만 만들어 모든 픽셀에 재사용한다. 그래서 큰 사진도 빠르게 처리된다.
 */

export interface PhotoAdjustments {
  /** 노출(EV). 0이면 그대로, 1 올리면 밝기가 두 배가 된다. */
  exposureEv: number
  /** 빨강·초록·파랑 채널 배수(화이트밸런스). 1이면 그대로. */
  wbR: number
  wbG: number
  wbB: number
  /** 이 값 이하는 검정이 된다(0~254). */
  blackPoint: number
  /** 이 값 이상은 흰색이 된다(1~255). blackPoint보다 커야 한다. */
  whitePoint: number
  /** 중간톤 감마. 1이면 그대로, 클수록 밝아진다. */
  gamma: number
  /** 어두운 영역 밝기(-100~100). 양수면 밝아진다. */
  shadows: number
  /** 밝은 영역 밝기(-100~100). 음수면 밝은 부분을 눌러 살린다(하이라이트 복구). */
  highlights: number
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  exposureEv: 0,
  wbR: 1,
  wbG: 1,
  wbB: 1,
  blackPoint: 0,
  whitePoint: 255,
  gamma: 1,
  shadows: 0,
  highlights: 0,
}

export function isIdentity(a: PhotoAdjustments): boolean {
  return (
    a.exposureEv === 0 &&
    a.wbR === 1 &&
    a.wbG === 1 &&
    a.wbB === 1 &&
    a.blackPoint === 0 &&
    a.whitePoint === 255 &&
    a.gamma === 1 &&
    a.shadows === 0 &&
    a.highlights === 0
  )
}

/** 채널 값 하나(0~1)에 노출·레벨·감마·명암 조정을 적용해 0~1로 돌려준다. */
function curve(x0: number, a: PhotoAdjustments, channelMul: number): number {
  let x = x0 * channelMul
  x *= 2 ** a.exposureEv
  const black = a.blackPoint / 255
  const white = a.whitePoint / 255
  x = (x - black) / Math.max(1 / 255, white - black)
  x = Math.min(1, Math.max(0, x))
  if (a.gamma !== 1) x = x ** (1 / a.gamma)
  const shadowAmt = a.shadows / 100
  const highlightAmt = a.highlights / 100
  if (x <= 0.5) {
    const w = (0.5 - x) * 2
    x += shadowAmt * w * 0.5
  } else {
    const w = (x - 0.5) * 2
    x += highlightAmt * w * 0.5
  }
  return Math.min(1, Math.max(0, x))
}

function buildChannelLUT(a: PhotoAdjustments, channelMul: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) lut[v] = Math.round(curve(v / 255, a, channelMul) * 255)
  return lut
}

export interface AdjustLUTs {
  r: Uint8ClampedArray
  g: Uint8ClampedArray
  b: Uint8ClampedArray
}

export function buildAdjustLUTs(a: PhotoAdjustments): AdjustLUTs {
  return { r: buildChannelLUT(a, a.wbR), g: buildChannelLUT(a, a.wbG), b: buildChannelLUT(a, a.wbB) }
}

/** RGBA 픽셀 배열에 보정을 그대로(in-place) 적용한다. 알파는 건드리지 않는다. */
export function applyAdjustments(data: Uint8ClampedArray, a: PhotoAdjustments): void {
  if (isIdentity(a)) return
  const { r: lutR, g: lutG, b: lutB } = buildAdjustLUTs(a)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lutR[data[i]]
    data[i + 1] = lutG[data[i + 1]]
    data[i + 2] = lutB[data[i + 2]]
  }
}

/**
 * 그레이 월드 자동 화이트밸런스: 사진 전체의 평균이 무채색(회색)이 되도록 채널 배수를 정한다.
 * 배수는 너무 크게 틀어지지 않도록 0.4~2.2 사이로 제한한다.
 */
export function grayWorldWhiteBalance(data: Uint8ClampedArray): Pick<PhotoAdjustments, 'wbR' | 'wbG' | 'wbB'> {
  let sr = 0
  let sg = 0
  let sb = 0
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    sr += data[i]
    sg += data[i + 1]
    sb += data[i + 2]
    n++
  }
  if (n === 0 || sr === 0 || sg === 0 || sb === 0) return { wbR: 1, wbG: 1, wbB: 1 }
  const avg = (sr + sg + sb) / (3 * n)
  const clamp = (v: number) => Math.min(2.2, Math.max(0.4, v))
  return { wbR: clamp(avg / (sr / n)), wbG: clamp(avg / (sg / n)), wbB: clamp(avg / (sb / n)) }
}
