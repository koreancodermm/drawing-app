import { vi } from 'vitest'

/** jsdom에는 그림 그리는 기능이 없으므로, 부른 횟수만 세는 가짜 2D 컨텍스트를 끼워 넣는다. */
export interface FakeCtx {
  calls: Record<string, number>
  /** true면 getImageData가 "그려진 픽셀이 있는" 데이터를 돌려준다 */
  filled: boolean
}

const contexts = new WeakMap<HTMLCanvasElement, FakeCtx & CanvasRenderingContext2D>()

function fakeContext(): FakeCtx & CanvasRenderingContext2D {
  const state: Record<string, unknown> = { calls: {} as Record<string, number>, filled: false }
  const calls = state.calls as Record<string, number>
  return new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'getImageData') {
        return (_x: number, _y: number, w: number, h: number) => {
          calls.getImageData = (calls.getImageData ?? 0) + 1
          const data = new Uint8ClampedArray(w * h * 4)
          if (target.filled) data[3] = 255
          return { data, width: w, height: h }
        }
      }
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return () => {
          calls[prop] = (calls[prop] ?? 0) + 1
          return { addColorStop: () => {} }
        }
      }
      if (prop === 'measureText') return () => ({ width: 10 })
      return () => {
        calls[prop] = (calls[prop] ?? 0) + 1
      }
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  }) as unknown as FakeCtx & CanvasRenderingContext2D
}

export function contextOf(canvas: HTMLCanvasElement): FakeCtx & CanvasRenderingContext2D {
  let ctx = contexts.get(canvas)
  if (!ctx) {
    ctx = fakeContext()
    contexts.set(canvas, ctx)
  }
  return ctx
}

export function installFakeCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return contextOf(this) as never
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => {
    callback(null)
  })
  if (typeof globalThis.ImageData === 'undefined') {
    class FakeImageData {
      data: Uint8ClampedArray
      width: number
      height: number
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data
        this.width = width
        this.height = height
      }
    }
    vi.stubGlobal('ImageData', FakeImageData)
  }
}
