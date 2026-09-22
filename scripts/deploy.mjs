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
// 윈도에서는 npm이 npm.cmd라서 shell 없이 spawn하면 못 찾는다(ENOENT). git·node는 .exe라 그대로 찾아지므로
// npm만 shell로 돌린다(shell을 쓰면 인자의 공백이 그대로 나뉠 수 있어 다른 명령에는 쓰지 않는다).
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts })
const runNpm = (args) => execFileSync('npm', args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' })
const runIn = (cwd, cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', cwd })

console.log('1) 검사와 빌드')
runNpm(['run', 'test'])
runNpm(['run', 'lint'])
runNpm(['run', 'build'])
run('node', ['scripts/check-release.mjs'])

const dist = join(root, 'dist')
if (!existsSync(dist)) throw new Error('dist가 없습니다. 빌드가 실패한 것 같습니다.')

console.log('2) gh-pages 브랜치 준비')
// 이전 실행이 도중에 실패해 워크트리가 남아 있을 수 있으니 먼저 정리한다.
try {
  execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root })
    .toString()
    .split('\n\n')
    .filter((b) => b.includes('branch refs/heads/gh-pages'))
    .forEach((b) => {
      const dir = b.match(/^worktree (.+)$/m)?.[1]
      if (dir) execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: root, stdio: 'inherit' })
    })
} catch {
  // 없으면 넘어간다.
}
execFileSync('git', ['worktree', 'prune'], { cwd: root })
const worktree = mkdtempSync(join(tmpdir(), 'gh-pages-'))
rmSync(worktree, { recursive: true, force: true }) // git worktree add가 빈 새 디렉터리를 만들게 한다
execFileSync('git', ['worktree', 'add', '-B', 'gh-pages', worktree], { cwd: root, stdio: 'inherit' })
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
// gh-pages는 매번 dist로 통째로 다시 만드는 배포용 브랜치라 강제 푸시한다(사람이 직접 손댈 일이 없다).
runIn(worktree, 'git', ['push', '-u', 'origin', 'gh-pages', '--force'])

run('git', ['worktree', 'remove', worktree, '--force'])
rmSync(worktree, { recursive: true, force: true })
console.log('완료. 몇 분 안에 사이트에 반영됩니다.')
