// dist를 만들어 gh-pages 브랜치에 올린다(GitHub Pages가 이 브랜치를 보여 준다).
// 실행: node scripts/deploy.mjs
//
// GitHub Actions로 자동 배포하고 싶으면 이 스크립트 대신
// .github/workflows/deploy.yml을 저장소에 추가하면 된다(README 참고).
// 그 파일은 CLI 인증 권한(workflow scope) 문제로 이 프로젝트에서 자동으로 올리지 못해
// GitHub 웹 화면에서 직접 추가해야 했다.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
// 윈도에서는 npm이 npm.cmd라서 shell 없이 spawn하면 못 찾는다(ENOENT).
const shell = process.platform === 'win32'
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, shell, ...opts })
const runIn = (cwd, cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', cwd, shell })

console.log('1) 검사와 빌드')
run('npm', ['run', 'test'])
run('npm', ['run', 'lint'])
run('npm', ['run', 'build'])
run('node', ['scripts/check-release.mjs'])

const dist = join(root, 'dist')
if (!existsSync(dist)) throw new Error('dist가 없습니다. 빌드가 실패한 것 같습니다.')

console.log('2) gh-pages 브랜치 준비')
const worktree = mkdtempSync(join(tmpdir(), 'gh-pages-'))
try {
  execFileSync('git', ['worktree', 'add', '-B', 'gh-pages', worktree], { cwd: root, stdio: 'inherit' })
} catch {
  // 이미 gh-pages 워크트리가 있을 수 있다.
}
runIn(worktree, 'git', ['rm', '-rf', '--quiet', '.'])
cpSync(dist, worktree, { recursive: true })
writeFileSync(join(worktree, '.nojekyll'), '')
runIn(worktree, 'git', ['add', '-A'])
try {
  runIn(worktree, 'git', ['commit', '-m', '배포: dist 새로 올림'])
} catch {
  console.log('바뀐 내용이 없어 새 커밋 없이 넘어갑니다.')
}

console.log('3) 올리기')
runIn(worktree, 'git', ['push', '-u', 'origin', 'gh-pages'])

run('git', ['worktree', 'remove', worktree, '--force'])
rmSync(worktree, { recursive: true, force: true })
console.log('완료. 몇 분 안에 사이트에 반영됩니다.')
