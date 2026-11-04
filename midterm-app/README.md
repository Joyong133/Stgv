# 미국 중간선거 실시간 (Android 앱)

2026년 미국 중간선거(11월 3일) 결과를 실시간으로 보여주는 안드로이드 앱입니다.
**민주당은 파란색, 공화당은 빨간색**, 무소속·기타는 보라색, 아직 확정되지 않은 곳은 회색입니다.

## 설치

1. 저장소의 **Releases → "미국 중간선거 실시간 APK"** 에서 `midterm-live.apk` 를 휴대폰으로 받습니다.
2. 파일을 열고, "출처를 알 수 없는 앱 설치"를 허용하면 설치됩니다.
3. 처음 실행할 때 알림 권한을 허용하면 새 당선 확정 소식을 알림으로 받습니다.

APK는 `midterm-app/` 아래 코드가 바뀔 때마다 GitHub Actions(`.github/workflows/midterm-apk.yml`)가 자동으로 빌드해 올립니다.

## 화면

- **상원 / 하원 / 주지사** 탭: 정당별 의석 수, 과반선이 표시된 막대, 다수당 확정 여부,
  주별 타일 지도(정당이 바뀐 곳은 노란 점), 경합별 후보와 득표율. 칸을 누르면 상세 정보.
- **속보** 탭: 앱을 켜둔 동안 새로 확정된 경합 목록. 새 확정이 나오면 알림도 보냅니다.
- 자동 새로고침: 30초 / 1분(기본) / 2분 / 5분 / 끄기.

## 자료 출처와 한계

- 영어 위키백과의 *2026 United States Senate elections*, *House of Representatives elections*,
  *gubernatorial elections* 문서를 위키백과 API로 받아, 표에서 당선 표시(✔, `{{Aye}}`)가 붙은 후보를 집계합니다.
  위키백과 편집자들은 AP 등 언론사의 당선 확정(race call) 보도를 보통 몇 분 안에 반영합니다.
- 개표율 같은 실시간 표 집계는 없습니다. "확정"된 경합만 셉니다.
- 상원은 이번에 선거가 없는 65석(민주 34 · 공화 31, 민주당 쪽 무소속 2명 포함),
  주지사는 선거가 없는 14개 주(민주 6 · 공화 8)를 더해 전체 숫자를 보여줍니다.
- 위키백과 문서의 표 형식이 바뀌면 집계가 틀어질 수 있습니다. CI의
  "Check parser against live Wikipedia" 단계가 실제 문서로 파서를 점검합니다
  (`node midterm-app/tools/probe.js`).

## 구조

```
app/src/main/java/.../MainActivity.java   WebView, 네트워크 요청, 알림
app/src/main/assets/index.html            화면
app/src/main/assets/style.css             색상·레이아웃 (다크 모드 지원)
app/src/main/assets/app.js                집계, 렌더링, 자동 새로고침, 속보
app/src/main/assets/parser.js             위키백과 표(wikitext) 파서
tools/test-parser.js                      파서 단위 테스트
tools/probe.js                            실제 위키백과 문서로 파서 점검
```

직접 빌드: Android SDK가 있는 환경에서 `gradle -p midterm-app :app:assembleRelease`.
