# 메이플 모험기 — 안드로이드 APK 래퍼

저장소 루트의 웹 게임(`index.html`, `css/`, `js/`)을 그대로 담아 **오프라인으로 도는 WebView 앱**입니다.
웹 소스가 유일한 원본이고, 빌드할 때 `syncWeb` 태스크가 `app/src/main/assets/www/` 로 자동 복사합니다.
`localStorage`가 켜져 있어 **게임 저장과 "소리 고정" 상태가 그대로 유지**됩니다.

## APK 받는 법 (GitHub Actions, 추천)

이 컨테이너에는 Android SDK가 없어 CI에서 빌드합니다.

1. `index.html`/`css`/`js`/`android` 가 바뀌어 푸시되면 **Build Android APK** 워크플로가 자동 실행됩니다.
   (수동 실행: GitHub → **Actions** 탭 → Build Android APK → **Run workflow**)
2. 실행이 끝나면 해당 실행 페이지 하단 **Artifacts** 의 `maple-adventure-debug-apk` 를 내려받습니다.
3. 압축을 풀면 `app-debug.apk` 가 나옵니다. 폰에 복사해 설치하세요
   (설정에서 "출처를 알 수 없는 앱 설치" 허용 필요).

> 이 APK는 **디버그 서명**입니다. 개인용 설치엔 충분하지만, 스토어 배포나 안정적 업데이트 서명이
> 필요하면 릴리스 키스토어로 서명해야 합니다 — 필요하면 요청하세요.

## 로컬 빌드 (Android SDK가 있는 PC)

```bash
cd android
gradle assembleDebug          # 또는 ./gradlew assembleDebug (래퍼가 있을 때)
# 결과: app/build/outputs/apk/debug/app-debug.apk
```

- JDK 17, Android SDK(platform 34, build-tools 34.0.0) 필요
- `local.properties` 에 `sdk.dir=/path/to/Android/sdk` 지정(또는 `ANDROID_HOME` 환경변수)

## 구성

| 항목 | 값 |
| --- | --- |
| applicationId | `com.maple.adventure` |
| minSdk / targetSdk / compileSdk | 21 / 34 / 34 |
| Android Gradle Plugin | 8.5.2 |
| 화면 | 세로 고정, 몰입형 전체화면 |
