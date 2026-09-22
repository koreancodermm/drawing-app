// 출시용 빌드(dist)를 검사한다. npm run build 다음에 실행한다.
// 실행: node scripts/check-release.mjs [--with-ai]   (기본은 "AI를 뺀 출시" 검사)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const withAi = process.argv.includes('--with-ai')
const problems = []
const notes = []

for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'privacy.html', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
  if (!existsSync(join(dist, f))) problems.push(`dist/${f}가 없습니다. npm run build를 먼저 하세요.`)
}

if (existsSync(join(dist, 'assets'))) {
  const js = readdirSync(join(dist, 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(dist, 'assets', f), 'utf8'))
    .join('\n')
  const hasAi = /generativelanguage\.googleapis\.com|x-goog-api-key/.test(js)
  if (!withAi && hasAi) problems.push('AI를 뺀 출시인데 제미나이 코드가 들어 있습니다. VITE_AI_ENABLED=false(.env)와 vite.config.ts를 확인하세요.')
  if (withAi && !hasAi) problems.push('AI 포함 빌드인데 제미나이 코드가 없습니다. npm run build:with-ai로 빌드했는지 확인하세요.')
}

const sw = existsSync(join(dist, 'sw.js')) ? readFileSync(join(dist, 'sw.js'), 'utf8') : ''
if (sw.includes('__VERSION__') || sw.includes('__PRECACHE__')) problems.push('sw.js에 채우지 않은 자리가 남아 있습니다.')

const privacy = existsSync(join(dist, 'privacy.html')) ? readFileSync(join(dist, 'privacy.html'), 'utf8') : ''
const blanks = [...privacy.matchAll(/\[[^\]<]{2,80}\]/g)]
  .map((m) => m[0])
  .filter((b) => !['[대괄호]', '[출시 전에 채울 곳]'].includes(b)) // 안내 문구는 빈칸이 아니다
if (blanks.length) notes.push(`개인정보처리방침에 아직 채울 곳이 ${blanks.length}군데 있습니다: ${[...new Set(blanks)].join(' ')}`)
if (!withAi && /Gemini|제미나이|API 키/.test(privacy)) problems.push('AI를 뺀 출시인데 개인정보처리방침에 AI 내용이 있습니다.')

const twa = join(root, 'twa/twa-manifest.json')
if (existsSync(twa) && /CHANGE[_-]ME/.test(readFileSync(twa, 'utf8'))) notes.push('twa/twa-manifest.json의 CHANGE_ME(패키지 이름·주소)는 안드로이드 앱을 만들기 전에 채워야 합니다.')

for (const n of notes) console.log('할 일:', n)
if (problems.length) {
  for (const p of problems) console.error('문제:', p)
  process.exit(1)
}
console.log(withAi ? '검사 통과 (AI 포함 빌드)' : '검사 통과 (AI를 뺀 출시 빌드: 제미나이 코드 없음)')
