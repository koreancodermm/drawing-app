# 그림 그리기

여러 가지 도구로 그림을 그리는 설치형 웹 앱(PWA)입니다. 그림은 서버로 보내지 않고 이 기기에만 저장됩니다.

## 써 보기

**[그림 그리기 열기](https://drawing-app-xmmn.onrender.com/)**

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

## Render 배포 (지금 쓰는 방식, 자동)

Render 계정에 이 GitHub 저장소를 연결해 두었다([render.yaml](render.yaml) 설정 그대로). **`main`에 올릴 때마다 Render가 저절로 빌드·배포한다** — 별도 명령이 필요 없다. 연결을 다시 하거나 다른 계정으로 옮기고 싶으면:

1. [render.com](https://render.com)에서 계정을 만들고 GitHub 계정으로 로그인한다(본인이 직접 해야 한다).
2. 대시보드에서 "New +" → "Blueprint"를 고르고 `koreancodermm/drawing-app` 저장소를 연결한다. `render.yaml`을 자동으로 읽어 정적 사이트(Static Site) 하나를 만든다.
   - Blueprint가 안 보이면 "New +" → "Static Site"로 직접 만들고 Build Command에 `npm ci && npm run build`, Publish Directory에 `dist`를 넣는다.
   - 주소에 쓸 이름(`https://이름.onrender.com`)은 그 화면의 서비스 "Name" 칸에서 정한다. 이미 남이 쓰는 이름이면 Render가 알아서 뒤에 글자를 붙인다(지금 주소 `drawing-app-xmmn`이 그 경우다).

무료 요금제는 한동안 안 쓰면 잠들었다가 다음 방문 때 몇 초~수십 초 늦게 깨어날 수 있다.

## GitHub Pages (예전 방식, 지금도 살아있음)

`gh-pages` 브랜치로 올라간다. Render로 옮기기 전에 쓰던 방식이라 지금은 관리하지 않지만, 새 내용을 반영하려면 여전히 이렇게 하면 된다:

```bash
npm run deploy
```

테스트·검사·빌드를 하고 `dist`를 `gh-pages` 브랜치에 올린다. 몇 분 뒤 사이트에 반영된다. AI 기능은 기본 빌드에서 빠져 있다(`docs/store/build-aab.md` 참고).

이 방식을 GitHub Actions로 자동화하려던 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 파일도 있지만, 이 저장소를 만들 때 쓴 GitHub CLI 인증에 `workflow` 권한이 없어 명령줄로는 올리지 못했다(웹 화면에서 직접 추가해야 한다). Render를 쓰면 이 문제 자체가 없어진다 — Render는 GitHub Actions가 아니라 자기 GitHub 연동으로 배포하기 때문이다.
