/** 32비트 정수 두 개를 섞어 잘 흩어진 32비트 정수를 만든다. */
export function hash32(a: number, b = 0): number {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * (씨앗, 번호, 부번호)마다 정해진 0 이상 1 미만의 값.
 * 그린 순서와 상관없이 같은 입력이면 항상 같은 값이 나오므로,
 * 획을 다시 그려도 질감이 그대로다.
 */
export function rand01(seed: number, i: number, j = 0): number {
  return hash32(hash32(seed, i), j) / 4294967296
}
