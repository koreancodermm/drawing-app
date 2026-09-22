/* 서비스 워커 원본. 빌드할 때 vite.config.ts가 아래 두 상수(버전·미리 담을 파일 목록)를 채워 dist/sw.js로 만든다.
 *
 * 하는 일: 앱 파일(HTML·JS·CSS·아이콘)을 캐시에 담아 인터넷 없이도 앱이 열리게 한다.
 * 하지 않는 일: IndexedDB(그림 저장소)는 건드리지 않는다. 그래서 앱을 업데이트해도 그림은 그대로다.
 * 다른 사이트(예: 구글 AI)로 가는 요청은 가로채지 않는다.
 */
const VERSION = '__VERSION__'
const PREFIX = 'drawing-app-'
const CACHE = PREFIX + VERSION
const PRECACHE = __PRECACHE__

self.addEventListener('install', (event) => {
  // 새 버전은 "대기" 상태로 두고, 사용자가 업데이트를 누르면 그때 넘어간다(그리는 도중에 바뀌지 않게).
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 이 앱의 예전 캐시만 지운다.
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      // 화면 이동 요청은 캐시된 index.html로 답한다(앱은 한 페이지짜리다).
      if (request.mode === 'navigate') {
        const cached = (await cache.match(request, { ignoreSearch: true })) || (await cache.match(new URL('./', self.registration.scope).href))
        if (cached) return cached
        try {
          return await fetch(request)
        } catch {
          return new Response('인터넷에 연결되어 있지 않고, 저장된 앱 파일도 아직 없습니다.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }
      }
      const cached = await cache.match(request, { ignoreSearch: true })
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok && response.type === 'basic') cache.put(request, response.clone()).catch(() => {})
      return response
    })(),
  )
})
