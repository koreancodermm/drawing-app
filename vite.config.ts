import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * 빌드가 끝난 dist 폴더의 파일 목록으로 서비스 워커(dist/sw.js)를 만든다.
 * 파일 내용이 하나라도 바뀌면 버전(해시)이 바뀌어 새 캐시가 만들어진다.
 */
function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'drawing-app-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const files: string[] = []
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name)
          if (statSync(full).isDirectory()) walk(full)
          else files.push(relative(outDir, full).split(sep).join('/'))
        }
      }
      walk(outDir)
      const precache = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).sort()
      const hash = createHash('sha256')
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)))
      const urls = ['./', ...precache.map((f) => `./${f}`)]
      const template = readFileSync('pwa/sw.template.js', 'utf8')
      const versionLine = "const VERSION = '__VERSION__'"
      const listLine = 'const PRECACHE = __PRECACHE__'
      if (!template.includes(versionLine) || !template.includes(listLine)) {
        throw new Error('pwa/sw.template.js에서 채울 자리를 찾지 못했습니다.')
      }
      const source = template
        .replace(versionLine, `const VERSION = '${hash.digest('hex').slice(0, 12)}'`)
        .replace(listLine, `const PRECACHE = ${JSON.stringify(urls, null, 2)}`)
      writeFileSync(join(outDir, 'sw.js'), source)
    },
  }
}

/**
 * `virtual:ai-plugin`이 무엇을 가리킬지 정한다.
 * AI 스위치(VITE_AI_ENABLED)가 꺼져 있거나 src/ai 폴더가 없으면 빈 값(null)이 되어,
 * 제미나이 코드가 배포 파일에 아예 들어가지 않는다.
 */
function aiFeaturePlugin(): Plugin {
  const id = 'virtual:ai-plugin'
  const resolved = 'drawing-app:' + id
  let source = 'export const aiPlugin = null'
  return {
    name: 'drawing-app-ai-feature',
    enforce: 'pre',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_')
      const entry = resolve(config.root, 'src/ai/index.ts')
      if (env.VITE_AI_ENABLED !== 'false' && existsSync(entry)) {
        source = `export { aiPlugin } from ${JSON.stringify(entry.split(sep).join('/'))}`
      }
    },
    resolveId: (name) => (name === id ? resolved : null),
    load: (name) => (name === resolved ? source : null),
  }
}

// https://vite.dev/config/
export default defineConfig({
  // 상대 경로로 만들어 어느 주소(루트나 하위 폴더)에 올려도 동작하게 한다.
  base: './',
  plugins: [react(), aiFeaturePlugin(), serviceWorkerPlugin()],
  test: {
    environment: 'jsdom',
    pool: 'threads',
    // 화면 테스트는 파일마다 워커를 새로 띄워 전체를 한꺼번에 돌리면 느려진다(기본 5초로는 부족).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['./src/test-setup.ts'],
  },
})
