# 앱 숨기기 (App Hider)

선택한 앱을 **이 앱의 서랍(목록)에서 숨기고**, **PIN**으로 잠금을 해제해야 다시 보이게 하는 간단한 안드로이드 앱입니다.

## 동작 방식

- 처음 실행하면 **PIN(4자리 이상)** 을 설정합니다.
- 목록에서 **숨김 관리 → PIN 입력** 후, 숨기고 싶은 앱을 체크합니다.
- **잠그기**를 누르거나 앱을 나갔다 들어오면, 체크한 앱은 서랍에서 **사라집니다**.
- 숨긴 앱을 다시 보려면 **숨김 관리**에서 PIN을 입력합니다.
- 목록에서 앱을 **탭하면 실행**됩니다.

## ⚠️ 꼭 알아두세요 — 시스템 설정에서는 숨길 수 없습니다

일반 안드로이드 앱은 **다른 앱을 시스템 "설정 → 앱" 목록에서 숨길 수 없습니다.** 이는 안드로이드가 의도적으로 막아둔 보안 경계입니다(임의의 앱이 다른 앱을 설정에서 감출 수 있다면 악성앱 은폐에 악용됩니다).

- 이 앱은 **자신의 서랍 안에서만** 앱을 감춥니다. 숨긴 앱도 **시스템 설정, 다른 런처, Play 스토어에는 그대로 보입니다.**
- 설정에서까지 앱을 숨기려면 **기기 관리자(Device Owner / MDM)** 로 프로비저닝하거나 **루팅**이 필요하며, 이 프로젝트는 그 방식을 사용하지 않습니다.

## 빌드 방법

### GitHub Actions (권장 — APK 자동 생성)

브랜치에 푸시하면 `.github/workflows/android-apk.yml` 워크플로가 **디버그 APK를 자동으로 빌드**해 아티팩트로 올립니다.
- GitHub 저장소 → **Actions** 탭 → 최근 실행 → **Artifacts**의 `app-hider-debug-apk` 다운로드.
- 또는 Actions 탭에서 **Run workflow**(workflow_dispatch)로 수동 실행.

### 로컬 빌드 (Android SDK 필요)

```bash
cd android-app-hider
./gradlew assembleDebug
# 결과: app/build/outputs/apk/debug/app-debug.apk
```

Android Studio에서 `android-app-hider` 폴더를 열어 빌드/실행해도 됩니다.

## 기술 구성

- Kotlin · minSdk 26 · targetSdk 34 · AGP 8.5.2 · Gradle 8.14.3
- `queries`로 런처 가능한 앱 목록 조회(Android 11+ 패키지 가시성 준수)
- PIN은 평문 저장이 아니라 임의 salt + SHA-256 해시로 저장
