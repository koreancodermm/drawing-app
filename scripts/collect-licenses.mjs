// 앱에 실제로 들어가는 라이브러리(package.json의 dependencies와 그 하위 의존)의 라이선스를 모아
// src/ui/licenses.json으로 만든다. 라이브러리를 추가·업데이트한 뒤에 다시 실행한다.
// 실행: node scripts/collect-licenses.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const rootPkg = readJson(join(root, 'package.json'))

const seen = new Map()
function visit(name) {
  if (seen.has(name)) return
  const dir = join(root, 'node_modules', name)
  if (!existsSync(join(dir, 'package.json'))) throw new Error(`${name}이(가) 설치되어 있지 않습니다. npm install을 먼저 하세요.`)
  const pkg = readJson(join(dir, 'package.json'))
  const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying)(\.(md|txt))?$/i.test(f))
  if (!file) throw new Error(`${name}의 라이선스 파일을 찾지 못했습니다. 직접 확인해서 넣어 주세요.`)
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  seen.set(name, {
    name,
    version: pkg.version,
    license: typeof pkg.license === 'string' ? pkg.license : 'UNKNOWN',
    homepage: pkg.homepage ?? (repo ? repo.replace(/^git\+/, '').replace(/\.git$/, '') : ''),
    text: readFileSync(join(dir, file), 'utf8').trim(),
  })
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep)
}
for (const dep of Object.keys(rootPkg.dependencies ?? {})) visit(dep)

const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
writeFileSync(join(root, 'src/ui/licenses.json'), JSON.stringify(list, null, 2) + '\n')
console.log(`${list.length}개 라이브러리:`)
for (const l of list) console.log(`- ${l.name}@${l.version} (${l.license})`)
