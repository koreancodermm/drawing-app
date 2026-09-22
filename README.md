# 그림 그리기

여러 가지 도구로 그림을 그리는 설치형 웹 앱(PWA)입니다. 그림은 서버로 보내지 않고 이 기기에만 저장됩니다.

## 써 보기

메인 브랜치에 올라간 내용은 GitHub Pages로 자동 배포됩니다: **[그림 그리기 열기](https://koreancodermm.github.io/drawing-app/)**

폰이나 컴퓨터의 브라우저로 위 주소를 열고 "앱으로 설치"를 누르면 홈 화면에 추가되어 인터넷 없이도 쓸 수 있습니다.

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm run test     # 테스트
npm run lint     # 코드 검사
npm run build    # 배포용 빌드(dist)
```

자세한 규칙은 [CLAUDE.md](CLAUDE.md), 기능 명세는 [PRD.md](PRD.md)를 본다.

## 배포

GitHub Pages(`gh-pages` 브랜치)로 올라간다. 새 내용을 반영하려면:

```bash
npm run deploy
```

테스트·검사·빌드를 하고 `dist`를 `gh-pages` 브랜치에 올린다. 몇 분 뒤 사이트에 반영된다. AI 기능은 기본 빌드에서 빠져 있다(`docs/store/build-aab.md` 참고).

### 자동 배포(선택)로 바꾸기

`main`에 올릴 때마다 저절로 배포되게 하려면 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 파일을 **GitHub 웹 화면**에서 저장소에 추가한다(이 저장소는 GitHub CLI 인증에 `workflow` 권한이 없어 명령줄로는 올리지 못했다). 저장소 페이지에서 "Add file → Create new file"로 같은 경로·내용을 붙여 넣고 커밋하면 된다. 그 뒤 저장소 설정의 Pages 소스를 "GitHub Actions"로 바꾸면 `npm run deploy`는 필요 없어진다.
