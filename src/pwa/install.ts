import { useSyncExternalStore } from 'react'

/** 브라우저가 "설치 가능"이라고 알려 줄 때 주는 이벤트(크롬·엣지 등). 사파리(iOS)에는 없다. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS는 맥으로 보이지만 터치가 된다.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** main.tsx에서 한 번 부른다. 화면이 뜨기 전에 오는 이벤트도 놓치지 않는다. */
export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred
  if (!event) return 'unavailable'
  deferred = null
  notify()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome
}

export interface InstallState {
  /** 이미 설치해서 앱으로 열려 있음 */
  installed: boolean
  /** 버튼 한 번으로 설치할 수 있음 */
  canPrompt: boolean
  ios: boolean
}

let snapshot: InstallState = { installed: false, canPrompt: false, ios: false }

function getSnapshot(): InstallState {
  const next = { installed: installed || isStandalone(), canPrompt: deferred !== null, ios: isIos() }
  if (next.installed !== snapshot.installed || next.canPrompt !== snapshot.canPrompt || next.ios !== snapshot.ios) snapshot = next
  return snapshot
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getSnapshot,
    () => snapshot,
  )
}

/** 테스트용 */
export function _resetInstallForTest(): void {
  deferred = null
  installed = false
  snapshot = { installed: false, canPrompt: false, ios: false }
  notify()
}

export function _setDeferredForTest(event: unknown): void {
  deferred = event as BeforeInstallPromptEvent
  notify()
}
