export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export interface AutosaverOptions {
  /**
   * 저장을 한 번 실행한다. 저장할 내용은 이 함수가 불리는 순간 동기적으로 모아야 한다
   * (탭이 닫히는 도중에도 내용을 놓치지 않기 위해서).
   */
  save: () => Promise<void>
  onStatus?: (status: SaveStatus, error?: unknown) => void
  /** 마지막 변경 뒤 저장까지 기다리는 시간(ms). 기본 1000 */
  delayMs?: number
  /** 저장에 실패했을 때 다시 시도하기까지의 시간(ms). 기본 5000 */
  retryMs?: number
}

/**
 * 변경이 생기면 잠시 기다렸다가(디바운스) 저장하고,
 * 탭이 숨겨지거나 닫힐 때는 기다리지 않고 바로 저장한다.
 */
export class Autosaver {
  private readonly save: () => Promise<void>
  private readonly onStatus: (status: SaveStatus, error?: unknown) => void
  private readonly delayMs: number
  private readonly retryMs: number
  private dirty = false
  private inflight = 0
  private failed = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(options: AutosaverOptions) {
    this.save = options.save
    this.onStatus = options.onStatus ?? (() => {})
    this.delayMs = options.delayMs ?? 1000
    this.retryMs = options.retryMs ?? 5000
    document.addEventListener('visibilitychange', this.handleVisibility)
    window.addEventListener('pagehide', this.handlePageHide)
  }

  /** 아직 저장되지 않은 변경이 있는지 */
  get hasUnsaved(): boolean {
    return this.dirty || this.inflight > 0 || this.failed
  }

  markDirty(): void {
    if (this.disposed) return
    this.dirty = true
    this.onStatus('pending')
    this.schedule(this.delayMs)
  }

  /** 기다리지 않고 지금 저장한다. 저장이 끝나면(실패하면 reject) 돌려준다. */
  async flush(): Promise<void> {
    this.clearTimer()
    if (!this.dirty) {
      // 이미 저장 중인 것이 있으면 끝나기를 기다린다.
      while (this.inflight > 0) await new Promise((resolve) => setTimeout(resolve, 10))
      if (this.failed) throw new Error('저장하지 못했습니다.')
      return
    }
    this.dirty = false
    this.inflight++
    this.onStatus('saving')
    try {
      await this.save()
      this.failed = false
      if (this.inflight === 1 && !this.dirty) this.onStatus('saved')
    } catch (error) {
      this.failed = true
      this.dirty = true
      this.onStatus('error', error)
      if (!this.disposed) this.schedule(this.retryMs)
      throw error
    } finally {
      this.inflight--
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearTimer()
    document.removeEventListener('visibilitychange', this.handleVisibility)
    window.removeEventListener('pagehide', this.handlePageHide)
    if (this.dirty) void this.flush().catch(() => {})
  }

  private schedule(ms: number): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush().catch(() => {})
    }, ms)
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private handleVisibility = (): void => {
    if (document.visibilityState === 'hidden' && this.dirty) void this.flush().catch(() => {})
  }

  private handlePageHide = (): void => {
    if (this.dirty) void this.flush().catch(() => {})
  }
}
