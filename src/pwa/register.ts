import { useSyncExternalStore } from 'react'

/**
 * 서비스 워커 등록과 "새 버전이 있어요" 알림.
 * 새 버전은 대기시켜 두었다가 사용자가 누를 때만 적용한다(그리는 도중에 앱이 바뀌지 않게).
 * 서비스 워커는 앱 파일만 다루므로 업데이트해도 IndexedDB의 그림은 그대로다.
 */

let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()

function setWaiting(worker: ServiceWorker | null) {
  waiting = worker
  listeners.forEach((l) => l())
}

export function isUpdateAvailable(): boolean {
  return waiting !== null
}

/** 대기 중인 새 버전을 적용한다. 적용되면 페이지가 한 번 새로고침된다. */
export function applyUpdate(): void {
  waiting?.postMessage({ type: 'SKIP_WAITING' })
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    isUpdateAvailable,
    () => false,
  )
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000

/** 서비스 워커를 등록한다. 만들어 둔 앱(production)에서만 동작한다. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  // 처음 방문해서 서비스 워커가 처음 자리 잡을 때(제어하던 것이 없다가 생길 때)도 controllerchange가 온다.
  // 그건 업데이트가 아니므로 새로고침하지 않는다. 이미 제어 중이던 서비스 워커가 바뀔 때만 새로고침한다.
  let controlled = navigator.serviceWorker.controller !== null
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true
      return
    }
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  const start = () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        const watch = (worker: ServiceWorker | null) => {
          if (!worker) return
          worker.addEventListener('statechange', () => {
            // 이미 앱을 제어하는 서비스 워커가 있을 때 설치가 끝난 것이 "업데이트"다.
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker)
          })
        }
        if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting)
        watch(registration.installing)
        registration.addEventListener('updatefound', () => watch(registration.installing))

        const check = () => void registration.update().catch(() => {})
        setInterval(check, CHECK_INTERVAL_MS)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check()
        })
      })
      .catch(() => {
        // 등록하지 못해도 앱은 그대로 쓸 수 있다(오프라인 실행만 안 된다).
      })
  }

  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start)
}

/** 테스트용 */
export function _setWaitingForTest(worker: ServiceWorker | null): void {
  setWaiting(worker)
}
