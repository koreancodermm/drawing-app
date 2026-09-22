# 안드로이드 앱(AAB) 만들기 — Bubblewrap(TWA)

구글 플레이에는 웹 앱을 그대로 감싼 안드로이드 앱(TWA)으로 올린다. 이 문서는 **준비 방법**이며, 실제 업로드와 계정 입력은 부모님(보호자)과 함께 직접 한다.

> **이 프로젝트에서 AAB 파일은 아직 만들지 않았다.** AAB를 만들려면 자바(JDK 17)와 안드로이드 SDK가 필요한데 이 컴퓨터에는 설치돼 있지 않고(`keytool`·`java` 없음), 웹 앱을 올릴 주소(도메인)와 패키지 이름, 서명 키도 아직 정해지지 않았다. 아래 순서대로 하면 만들 수 있다.

## 0. 먼저 정할 것 (한 번 정하면 바꿀 수 없는 것 포함)

| 항목 | 설명 |
| --- | --- |
| **웹 주소(HTTPS)** | 앱이 실제로 올라가 있어야 한다. TWA는 이 주소의 웹 앱을 연다. 무료 정적 호스팅(Cloudflare Pages, Netlify, GitHub Pages 등)을 쓸 수 있다. 주소는 반드시 `https://`여야 한다. |
| **패키지 이름** | 예: `com.내이름.drawingapp`. **플레이에 한 번 올리면 절대 바꿀 수 없다.** 소문자·숫자·점만 쓰고, 다른 사람이 쓰는 이름은 안 된다. |
| **AI 포함 여부** | **결정됨: AI를 뺀 출시(모든 연령 대상).** `npm run build`가 기본으로 AI 코드를 뺀다. |

## 1. 웹 앱 빌드해서 올리기

```bash
npm run build
node scripts/check-release.mjs
```

`check-release.mjs`가 "제미나이 코드가 들어 있지 않은지", 필요한 파일이 다 있는지, 방침에 남은 빈칸이 있는지를 알려 준다. **"검사 통과"가 나와야 올린다.**

`dist` 폴더 안의 파일 전부를 정한 주소의 루트에 올린다(`index.html`, `sw.js`, `manifest.webmanifest`, `privacy.html`, `icons/` 등). 올린 뒤 크롬에서 주소를 열어 개발자도구 → Application → Manifest에 오류가 없는지, "설치 가능"인지 확인한다.

## 2. 개발 도구 설치

```bash
npm install -g @bubblewrap/cli
bubblewrap doctor
```

`bubblewrap doctor`가 JDK와 안드로이드 SDK 위치를 묻거나 내려받게 해 준다(용량이 크다). 도구 버전에 따라 질문이 조금 다를 수 있다.

## 3. 프로젝트 만들기

`twa` 폴더에서 실행한다. `twa/twa-manifest.json`은 값 예시(`CHANGE_ME` 부분을 바꿔야 함)이고, 처음에는 Bubblewrap이 웹 앱의 매니페스트를 읽어 직접 만들게 하는 것이 안전하다.

```bash
cd twa
bubblewrap init --manifest=https://내주소/manifest.webmanifest
```

물어보는 것에 답한다.

- 패키지 이름: 0단계에서 정한 것
- 앱 이름 `그림 그리기`, 짧은 이름 `그림`
- **서명 키**: 키가 없으면 새로 만들지 묻는다. → 아래 4단계

## 4. 서명 키 만들기와 보관 (가장 중요)

서명 키는 "이 앱이 내 것"임을 증명하는 열쇠다. **잃어버리거나 남에게 넘어가면 큰일**이라 아래를 지킨다.

- 키 파일(`*.keystore`, `*.jks`)과 **비밀번호는 저장소·프로젝트 폴더·채팅·이메일에 넣지 않는다.** 이 프로젝트의 `.gitignore`는 키 파일 형식을 막아 두었지만 실수는 사람이 한다. 프로젝트 밖(예: `C:\Users\내이름\secrets\`)에 두는 것을 권한다.
- 키 파일은 **최소 2곳**에 백업한다(예: USB와 부모님이 관리하는 비밀번호 관리자). 비밀번호는 키 파일과 다른 곳에 적는다.
- 구글 플레이에서는 **"Play 앱 서명"을 켠다(기본값).** 그러면 지금 만드는 키는 "업로드 키"가 되고, 실제 배포용 키는 구글이 보관한다. 업로드 키를 잃어도 구글에 재설정을 요청할 수 있어 훨씬 안전하다.
- 키를 새로 만드는 명령(Bubblewrap이 대신 물어보지만, 직접 만들 때는 JDK의 `keytool`을 쓴다):

```bash
keytool -genkeypair -v -keystore drawing-app-upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

  비밀번호와 이름 같은 질문에 답하며, 만든 파일을 위 방법대로 보관한다. `twa-manifest.json`의 `signingKey.path`를 그 위치로 고친다.
- 비밀번호는 `bubblewrap build`를 할 때 직접 입력한다. 파일에 적어 두지 않는다.

## 5. AAB 만들기

```bash
bubblewrap build
```

성공하면 `twa` 폴더에 `app-release-bundle.aab`(구글 플레이에 올릴 파일)와 테스트용 `app-release-signed.apk`가 생긴다. APK는 안드로이드 폰에 직접 설치해 확인할 때 쓴다.

버전을 올려 다시 올릴 때는 `twa-manifest.json`의 `appVersionCode`를 **반드시 1씩 올린다**(같으면 플레이가 거절한다).

## 6. 주소와 앱 연결(Digital Asset Links)

이 연결이 없으면 앱 위쪽에 주소창이 보이는 "브라우저 모양"으로 열린다.

1. 플레이 콘솔에 앱을 만들고 첫 AAB를 올린 뒤(내부 테스트 트랙 가능) **앱 무결성(App integrity) → 앱 서명 키 인증서**의 SHA-256 지문을 복사한다.
2. 웹 앱의 `public/.well-known/assetlinks.json`을 만들어 다시 빌드·업로드한다.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.내이름.drawingapp",
      "sha256_cert_fingerprints": ["AA:BB:...구글이 보여 준 지문..."]
    }
  }
]
```

3. `https://내주소/.well-known/assetlinks.json`이 브라우저에서 열리는지 확인한다.

## 7. 확인

- 폰에 APK를 설치해 열어 본다: 주소창 없이 전체 화면인가? 그림이 그려지고, 앱을 닫았다 열어도 남는가? 비행기 모드에서 열리는가?
- 웹에서 만든 그림과 앱에서 만든 그림은 **저장소가 다르다**(브라우저와 앱은 각자 저장). 이미 웹으로 쓰던 그림은 "백업 내보내기 → 앱에서 백업 불러오기"로 옮긴다.

## 8. 하지 말 것

- 키·비밀번호를 코드, 저장소, 로그, 스크린샷, 채팅에 올리지 않는다.
- 이 문서의 어떤 단계도 구글 계정에 대신 로그인하거나 자동으로 업로드하지 않는다. 플레이 콘솔 작업은 부모님과 함께 직접 한다.
