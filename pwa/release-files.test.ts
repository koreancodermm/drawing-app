import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import licenses from '../src/ui/licenses.json'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const bytes = (p: string) => readFileSync(join(root, p))

/** PNG 머리말에서 가로·세로를 읽는다. */
function pngSize(file: Buffer): { w: number; h: number } {
  expect(file.subarray(1, 4).toString('latin1')).toBe('PNG')
  return { w: file.readUInt32BE(16), h: file.readUInt32BE(20) }
}

describe('웹 앱 매니페스트', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'))

  it('설치에 필요한 값이 있다', () => {
    expect(manifest.name).toBe('그림 그리기')
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
    expect(manifest.display).toBe('standalone')
    expect(manifest.lang).toBe('ko')
    expect(manifest.start_url).toBe('./')
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('192·512 아이콘과 maskable 아이콘이 실제 크기대로 있다', () => {
    const purposes = manifest.icons.map((i: { purpose: string; sizes: string }) => `${i.purpose}:${i.sizes}`)
    expect(purposes).toEqual(['any:192x192', 'any:512x512', 'maskable:512x512'])
    for (const icon of manifest.icons as { src: string; sizes: string; type: string }[]) {
      expect(icon.type).toBe('image/png')
      const { w, h } = pngSize(bytes(`public/${icon.src}`))
      expect(`${w}x${h}`).toBe(icon.sizes)
    }
    expect(pngSize(bytes('public/icons/apple-touch-icon.png'))).toEqual({ w: 180, h: 180 })
  })

  it('index.html이 매니페스트·아이콘·테마 색을 연결한다', () => {
    const html = read('index.html')
    expect(html).toContain('rel="manifest"')
    expect(html).toContain('rel="apple-touch-icon"')
    expect(html).toContain('name="theme-color"')
    expect(html).toContain('viewport-fit=cover')
  })
})

describe('서비스 워커 원본', () => {
  const sw = read('pwa/sw.template.js')

  it('빌드가 채울 자리가 정확히 한 번씩 있다', () => {
    expect(sw.split("const VERSION = '__VERSION__'")).toHaveLength(2)
    expect(sw.split('const PRECACHE = __PRECACHE__')).toHaveLength(2)
  })

  it('새 버전은 사용자가 승인해야 넘어가고(자동 skipWaiting 없음), 이 앱의 옛 캐시만 지운다', () => {
    const skips = sw.match(/skipWaiting\(\)/g) ?? []
    expect(skips).toHaveLength(1)
    expect(sw).toContain("event.data.type === 'SKIP_WAITING'")
    expect(sw).toContain("k.startsWith(PREFIX) && k !== CACHE")
  })

  it('그림 저장소(IndexedDB)를 건드리지 않고 다른 사이트 요청은 가로채지 않는다', () => {
    expect(sw).not.toMatch(/indexedDB|deleteDatabase/)
    expect(sw).toContain('url.origin !== self.location.origin')
  })
})

describe('개인정보처리방침 초안 (AI를 뺀 출시)', () => {
  const html = read('public/privacy.html')

  it('핵심 사실을 담고 있다', () => {
    expect(html).toContain('lang="ko"')
    expect(html).toContain('이 기기에만 저장')
    expect(html).toContain('그림과 설정을 이용자의 기기 밖으로 보내지 않습니다')
    expect(html).toContain('광고도, 분석·통계 도구도, 추적 기술도 없습니다')
    expect(html).toContain('모든 연령이 사용할 수 있습니다')
  })

  it('AI 기능을 뺀 앱이므로 구글 전송·API 키 내용이 없다', () => {
    expect(html).not.toMatch(/Gemini|제미나이|API 키|구글로/)
  })

  it('시행일과 운영자·문의처 빈칸이 채워져 있다(더 이상 [대괄호] 안내가 없다)', () => {
    expect(html).not.toMatch(/\[[^\]<]{2,80}\]/)
    expect(html).toMatch(/시행일: \S/)
    expect(html).toMatch(/운영자: \S+ · 문의: \S+@\S+/)
  })
})

describe('안드로이드 앱(TWA) 설정과 비밀 정보', () => {
  const twa = JSON.parse(read('twa/twa-manifest.json'))

  it('서명 키 비밀번호 같은 값이 파일에 없다', () => {
    const text = JSON.stringify(twa).toLowerCase()
    expect(text).not.toContain('password')
    expect(twa.signingKey.path.startsWith('../../')).toBe(true) // 프로젝트 밖
    expect(Object.keys(twa.signingKey).sort()).toEqual(['alias', 'path'])
  })

  it('바꿔야 할 자리 표시가 남아 있어 실수로 그대로 올리지 못한다', () => {
    expect(twa.packageId).toContain('CHANGE_ME')
    expect(twa.host).toContain('CHANGE-ME')
    expect(twa.enableNotifications).toBe(false)
  })

  it('.gitignore가 키 파일과 비밀 폴더를 막는다', () => {
    const ignore = read('.gitignore')
    for (const pattern of ['*.keystore', '*.jks', 'secrets/', 'keystore.properties', '.env.local']) {
      expect(ignore).toContain(pattern)
    }
  })
})

describe('오픈소스 목록', () => {
  it('앱에 들어가는 라이브러리(dependencies와 하위 의존)가 모두 라이선스 전문과 함께 있다', () => {
    const pkg = JSON.parse(read('package.json'))
    const names = licenses.map((l) => l.name)
    for (const dep of Object.keys(pkg.dependencies)) expect(names).toContain(dep)
    expect(names).toContain('scheduler') // react-dom이 쓰는 하위 의존
    for (const lib of licenses) {
      expect(lib.license).not.toBe('UNKNOWN')
      expect(lib.text.length).toBeGreaterThan(200)
      expect(lib.version).toMatch(/^\d+\.\d+\.\d+/)
    }
  })
})
