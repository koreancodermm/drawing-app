import { hash32 } from './prng'

/**
 * 종이 결(종이의 오톨도톨한 면). 획의 난수 씨앗이 아니라 "종이 위의 자리(x, y)"만으로 정해진다.
 * 진짜 종이처럼 같은 자리는 몇 번을 덧그려도 같은 결이 드러나고(연필·목탄·파스텔이 종이 결을 타고 묻는 것처럼),
 * 도장을 어떤 순서·조각으로 찍어도 결과가 같아서 "이어 그린 결과 = 처음부터 다시 그린 결과"가 지켜진다.
 */

const GRAIN_SEED = 0x2f6e2b1

/** 격자점마다 정해진 0~1 값 */
function lattice(ix: number, iy: number): number {
  return hash32(hash32(GRAIN_SEED, ix), iy) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** 값 노이즈: 격자점 사이를 부드럽게 이은 0~1 값 */
export function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const a = lattice(x0, y0)
  const b = lattice(x0 + 1, y0)
  const c = lattice(x0, y0 + 1)
  const d = lattice(x0 + 1, y0 + 1)
  const top = a + (b - a) * fx
  const bottom = c + (d - c) * fx
  return top + (bottom - top) * fy
}

/**
 * 종이의 오톨도톨함: 굵기가 다른 노이즈 세 겹(약 3px, 1.5px, 0.75px 알갱이)을 섞은 0~1 값.
 * 값이 작을수록 종이가 솟은 곳(연필이 먼저 묻는 곳), 클수록 움푹한 곳(세게 눌러야 묻는 곳)이다.
 */
export function paperGrain(x: number, y: number): number {
  return (
    valueNoise(x / 3, y / 3) * 0.5 +
    valueNoise(x / 1.5 + 17.3, y / 1.5 + 9.1) * 0.3 +
    valueNoise(x / 0.75 + 3.7, y / 0.75 + 41.9) * 0.2
  )
}

/** 물감이 고인 듯한 큰 얼룩(약 24px 크기). 수채·수묵 붓의 번짐 농도 변화에 쓴다. */
export function washCloud(x: number, y: number): number {
  return valueNoise(x / 24 + 101.7, y / 24 + 55.3) * 0.65 + valueNoise(x / 9 + 7.1, y / 9 + 23.9) * 0.35
}

/**
 * 종이 결에 걸리는 정도(0~1). level(누른 세기·진하기)이 grain(움푹한 정도)보다 크면 묻고, 작으면 안 묻는다.
 * softness는 그 경계가 얼마나 부드러운지(작을수록 알갱이가 또렷하다).
 */
export function tooth(grain: number, level: number, softness = 0.14): number {
  const lo = grain - softness
  const hi = grain + softness
  if (level <= lo) return 0
  if (level >= hi) return 1
  return smooth((level - lo) / (hi - lo))
}
