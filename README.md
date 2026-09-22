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

`main` 브랜치에 푸시하면 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)이 테스트·빌드 후 GitHub Pages에 올린다. AI 기능은 기본 빌드에서 빠져 있다(`docs/store/build-aab.md` 참고).
