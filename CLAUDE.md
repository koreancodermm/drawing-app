# 그림 그리기 앱 작업 규칙

이 프로젝트는 PRD.md에 설명된 그림 그리기 웹 앱(PWA)이다. 작업을 시작하기 전에 PRD.md를 읽는다.

## 기술 스택

Vite + React + TypeScript, 패키지 관리는 npm. 테스트는 Vitest, 코드 검사는 oxlint(`npm run lint`).

## 폴더 구조

- `src/canvas` 그리기 엔진
- `src/tools` 도구(브러시 프리셋)
- `src/storage` 저장(IndexedDB, Dexie): 저장본·복구·백업·자동 저장
- `src/ai` 제미나이 연동
- `src/ui` 화면 컴포넌트

## 규칙

- 모든 화면 글은 한국어로 쓴다.
- 그림 데이터는 서버로 보내지 않고 이 기기의 IndexedDB에만 저장한다.
- AI 기능은 사용자가 설정에서 API 키를 넣었을 때만 켜지고, 키가 없어도 앱이 완전히 동작해야 한다. `src/ai` 폴더를 지워도 앱이 빌드되고 동작해야 한다.
- 도구는 브러시 엔진 하나와 프리셋(설정값)으로 구현해서 새 도구를 쉽게 늘릴 수 있게 한다.
- 한 단계가 끝날 때마다 `npm run test`, `npm run lint`, `npm run build`를 실행해서 결과를 확인하고 보고한다.
- API 키, 서명 키, 비밀번호를 코드나 로그, 저장소에 넣지 않는다.

## 저장 규칙 (src/storage, src/canvas/session.ts)

- 그림은 자동 저장한다. 변경 1초 뒤(디바운스), 탭이 숨겨지거나 닫힐 때(visibilitychange, pagehide)는 즉시 저장한다. 저장할 내용은 저장 함수가 불리는 순간 동기적으로 모은다.
- 저장본에는 최근 100획(되돌리기·다시하기 기록), 화면 상태, 그리고 base 캔버스의 바뀐 타일만 담는다. 100획을 넘겨 밀려난 획만 base 캔버스(타일)에 굳는다.
- 저장은 한 트랜잭션에서 메타·저장본·타일을 함께 쓴다. 최신 저장본(current)과 직전 저장본(previous)을 남기고, 둘 다 쓰지 않는 옛 타일만 지운다.
- 불러올 때는 저장본의 검사값을 확인하고, 손상됐으면 직전 저장본으로 연다. 복구한 뒤 첫 저장은 타일을 통째로 다시 쓴다(`fullTiles`).
- 그림을 열기만 해서는 저장이 일어나면 안 된다(수정 시각이 바뀌어 목록 순서가 흔들린다).
- 저장 형식(`snapshot.ts`, `db.ts`)을 바꾸면 Dexie 버전과 기존 데이터 이전 방법을 함께 정한다.

## 도구 규칙 (src/tools)

- 도구 50가지는 `src/tools/registry.ts`의 표 하나에 정의한다. 새 도구는 이 표에 한 항목을 추가하고 필요한 엔진 설정(line/stamp/shape/pixel/fill)만 채우면 된다.
- 획(`Stroke`)에는 그릴 때 쓴 옵션(`opts`)과 난수 씨앗(`seed`)을 모두 담는다. 같은 획은 언제 다시 그려도 같은 결과여야 하므로, 질감에는 `Math.random` 대신 `prng.ts`의 `rand01(seed, 번호)`만 쓴다.
- 획 조각을 따라 그리는 도구(선·도장·픽셀)는 "그리는 도중에 이어 그린 결과 = 처음부터 다시 그린 결과"가 항상 같아야 한다(`draw.test.ts`가 검사한다). 도장 위치는 `walkStamps`가 정한다.
- 그리는 동안 보여 주는 방식은 도구의 `live`가 정한다: direct(바로), layer(임시 층에 그렸다가 합침), preview(끌 때마다 다시 그림), instant(손을 뗄 때 한 번).
- 번짐·블러·채우기처럼 픽셀을 읽는 도구가 있어서 그림 캔버스는 `willReadFrequently`로 만든다(그렇지 않으면 그래픽 카드에서 읽어 오느라 매우 느리다).
- 선택 영역은 다각형 목록(`Region`)이고, 있으면 획의 `opts.clip`에 담겨 그 안쪽에서만 그려진다.

## 레이어·내보내기·테마 규칙 (단계 5)

- 그림은 레이어 여러 장이고 레이어마다 그림 크기의 캔버스가 있다. 레이어 추가·삭제·순서·보이기·불투명도·잠금·이름 변경은 모두 되돌리기 기록에 들어간다(`_layer` 도구의 획으로 저장). 구조와 모양은 `src/canvas/layers.ts`, 실행은 `DrawingSession`이 맡는다.
- 다시 그릴 때는 항상 base(오래된 것을 굳힌 구조 + 레이어별 캔버스)에서 시작해 기록을 처음부터 적용한다. 레이어 조작도 기록 항목이므로 이 규칙을 지켜야 되돌리기 결과가 일정하다.
- 저장 타일 키는 `레이어|tx,ty`이고 DB 타일 저장소는 `layerTiles`(버전 2). 레이어 도입 전 저장본(`layers` 없음, 타일 키 `tx,ty`)은 첫 레이어 `L0` 하나로 열린다. 저장 형식을 바꾸면 이 호환을 깨지 말고 Dexie 버전과 이전 코드를 함께 쓴다.
- 이미지 불러오기·붙여넣기는 그림을 레이어의 base 캔버스에 바로 굳히고 "레이어 추가"만 기록한다(되돌리면 레이어째 사라진다). 이런 그림은 저장 시 타일로 함께 저장된다.
- 큰 용지는 메모리 때문에 레이어 수를 제한한다(`maxLayersFor`).
- 내보내기는 `src/export`: 보이는 레이어를 불투명도대로 합쳐(`session.flatten`) PNG·JPG·PDF로 만든다. PDF는 외부 라이브러리 없이 `pdf.ts`가 직접 만든다(쪽 크기 = 용지 mm).
- 화면 색은 CSS 변수(`--bg`, `--surface`, `--text` …)만 쓴다. 라이트/다크는 `:root[data-theme]`와 `prefers-color-scheme`으로 바뀐다. 새 색을 넣을 때 두 테마의 값을 모두 정의한다.
- 좁은 화면(720px 이하)에서는 도구·색·레이어·파일 패널이 아래에서 올라오는 시트가 된다. 버튼은 높이 44px 이상으로 둔다.

## AI 기능 규칙 (단계 6, src/ai)

- AI 코드는 `src/ai`에만 둔다. 앱의 다른 곳은 `src/ui/aiHost.ts`의 `aiPlugin`(폴더가 없으면 null)만 알고 `src/ai`를 직접 가져오지 않는다. 그래서 `src/ai`를 지워도 빌드·테스트가 통과한다(폴더를 옮겨 놓고 `npm run build`·`npm run test`로 확인했다). 새 AI 코드도 이 규칙을 지킨다.
- **출시는 AI를 뺀 모든 연령용으로 결정했다.** 기본 빌드(`npm run build`)는 `.env`의 `VITE_AI_ENABLED=false`에 따라 AI 코드를 배포 파일에서 완전히 뺀다(`vite.config.ts`의 `aiFeaturePlugin`이 `virtual:ai-plugin`을 빈 값으로 만든다). AI를 넣은 빌드는 `npm run build:with-ai`(`.env.with-ai`), 테스트는 `.env.test`로 AI가 켜진다. 출시 전에 `node scripts/check-release.mjs`로 배포 파일에 제미나이 코드가 없는지 확인한다.
- 구글 API는 만 18세 이상만 쓸 수 있어서 AI를 넣으면 대상 연령을 18세 이상으로 올려야 한다. 모델 이름, 요청 한도, 이미지 크기, 안내 글의 나이(`MIN_AGE`)는 `src/ai/config.ts`에 있다.
- API 키는 `localStorage`(`keyStore.ts`)에만 두고, 요청 헤더(`x-goog-api-key`)로만 보낸다. 주소·오류 문구·로그에 넣지 않는다.
- 처음 AI를 쓸 때 안내 대화상자(`AiConsent`)에 동의해야 요청이 나간다(만 18세 이상 확인란 포함). 결과는 제안 패널에만 보이고 그림은 자동으로 바뀌지 않는다(색은 사용자가 눌러야 팔레트에 들어간다).
- 한도 초과(429)는 `AiError('rate-limit')`와 재시도 초로 알린다. 인터넷이 없으면 AI만 막고 그리기는 그대로 동작한다.
- AI 테스트는 실제 호출 없이 `fetch`를 가짜로 바꿔서 한다.

## 설치·오프라인·출시 준비 규칙 (단계 7)

- PWA: `public/manifest.webmanifest`(경로는 모두 상대 경로 `./`, Vite `base: './'`)와 서비스 워커. 서비스 워커 원본은 `pwa/sw.template.js`이고, 빌드 때 `vite.config.ts`의 `serviceWorkerPlugin`이 `dist` 파일 목록과 해시 버전을 채워 `dist/sw.js`를 만든다. 원본의 `const VERSION`·`const PRECACHE` 두 줄은 그대로 둔다(테스트가 검사한다).
- 서비스 워커는 앱 파일 캐시만 다루고 IndexedDB(그림)는 절대 건드리지 않는다. 새 버전은 대기시켰다가 사용자가 "지금 업데이트"를 누르면 적용한다(`src/pwa/register.ts`, `src/ui/InstallGuide.tsx`). 자동 `skipWaiting`을 넣지 않는다(그리는 도중 앱이 바뀌면 안 된다). 다른 사이트(구글 AI)로 가는 요청은 가로채지 않는다.
- 서비스 워커가 처음 자리 잡을 때(제어하던 것이 없었을 때)의 `controllerchange`는 새로고침하지 않는다. 이미 제어 중이던 것이 새 버전으로 바뀔 때만 새로고침한다(`register.ts`, `register.test.ts`).
- 서비스 워커는 production 빌드에서만 등록된다. 오프라인·업데이트를 확인할 때는 `npm run build` 후 `vite preview`로 열고, 옛 서비스 워커가 남아 있으면 브라우저에서 등록 해제·캐시 삭제 후 다시 연다.
- 아이콘은 `node scripts/make-icons.mjs`가 만든다(외부 라이브러리 없음). 오픈소스 고지 목록은 `node scripts/collect-licenses.mjs`가 `src/ui/licenses.json`으로 만든다. 라이브러리를 추가·업데이트하면 다시 실행한다.
- 개인정보처리방침 초안은 `public/privacy.html`(앱에서 설정 → 개인정보처리방침으로 연다). 앱이 데이터를 다루는 방식(저장 위치, AI 전송 내용)을 바꾸면 방침과 `docs/store/data-safety.md`를 같이 고친다.
- 스토어 준비 문서는 `docs/store/`(AAB 만들기, 데이터 보안 답변, 등록 정보, 출시 전 점검표), 성능 결과는 `docs/performance-report.md`. 안드로이드 앱 설정 예시는 `twa/twa-manifest.json`(자리 표시 `CHANGE_ME`를 채워 쓴다).
- 서명 키(`*.keystore`, `*.jks`)와 비밀번호는 저장소나 프로젝트 폴더에 두지 않는다(`.gitignore`가 막고 `pwa/release-files.test.ts`가 설정 파일에 비밀번호가 없는지 검사한다). 스토어 업로드와 계정 입력은 사람이 직접 한다.
- 픽셀을 읽는 도구(`src/tools/engines/pixel.ts`)는 도장마다 큰 배열을 새로 만들지 않는다(작업 배열 재사용). 이 도구들은 획 하나에 도장이 수십~수백 개라 작은 낭비도 프레임을 넘긴다.

## 배포 (GitHub Pages)

- 사이트 주소: https://koreancodermm.github.io/drawing-app/ (저장소 `koreancodermm/drawing-app`, 공개 저장소, `gh-pages` 브랜치를 GitHub Pages가 그대로 보여준다).
- 새 내용을 올리려면 `npm run deploy`(`scripts/deploy.mjs`)를 쓴다: 테스트·lint·빌드·`check-release.mjs`를 거쳐 `dist`를 `gh-pages` 브랜치에 올린다.
- `main` 브랜치를 GitHub Actions로 자동 배포하려는 워크플로 파일이 `.github/workflows/deploy.yml`에 있지만, 이 저장소를 만들 때 쓴 GitHub CLI 인증에 `workflow` 권한이 없어 명령줄로는 올리지 못했다(웹 화면에서 직접 추가해야 한다, README 참고). 이 권한 제약이 없는 환경에서는 이 파일을 그대로 커밋해 자동 배포로 바꿀 수 있다.
- base 경로는 상대 경로(`vite.config.ts`의 `base: './'`)라서 루트든 `/drawing-app/` 같은 하위 경로든 그대로 동작한다.
