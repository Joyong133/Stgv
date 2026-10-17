# 유튜브 링크 찾기 (YouTube Link Finder) — Android 앱

키워드 · 언어 · 개수를 입력하면, 키워드를 분석해 그 언어에 맞는 유튜브 영상 링크를 원하는 개수만큼 **랜덤으로** 찾아 주는 안드로이드 앱입니다.

**APK 다운로드:** [`release/youtube-link-finder.apk`](release/youtube-link-finder.apk) (Android 7.0 이상)

## 사용법

1. 키워드 입력 (예: `고양이 영상`)
2. 언어 선택 (한국어, English, 日本語, 中文, Español 등 17개)
3. 개수 입력 (1~200)
4. **링크 찾기** → 결과 목록
   - 항목을 누르면 유튜브 앱/브라우저로 열림
   - 길게 누르면 링크 복사
   - **링크 전체 복사** / **공유** 버튼으로 목록 전체를 한 번에 내보내기

## 동작 방식

1. **키워드 분석** — 키워드의 언어를 감지합니다. 선택한 언어와 다르면(옵션 켜짐 시) 그 언어로 번역해 검색합니다.
   예: `고양이 영상` + English → `cat video` 로 검색
2. **유튜브 검색** — 선택한 언어/지역(`hl`, `gl`)으로 유튜브 동영상 검색 결과를 읽고, 다음 페이지를 이어서 가져옵니다.
3. **랜덤 선택** — "랜덤으로 찾기"(기본 켜짐)를 켜면 매번 정렬 기준(관련성 · 업로드 날짜 · 조회수 · 평점) 중 하나를 무작위로 골라 검색하고,
   요청 개수보다 많은 후보(약 3배, 최대 +100개)를 모은 뒤 섞어서 요청한 개수만 고릅니다. 같은 키워드라도 검색할 때마다 다른 링크가 나옵니다.
4. **언어 검사** — "제목이 선택한 언어인 영상만" 옵션을 켜면 제목의 언어를 확인해 맞지 않는 영상은 뺍니다.
   한글·일본어·중국어·러시아어·태국어·힌디어·아랍어는 글자 체계로, 라틴 문자 언어(영어·스페인어 등)는 번역기의 언어 감지로 판단합니다.
5. 요청한 개수(랜덤 모드에서는 후보 개수)가 모이면 멈춥니다.

### API 키 (선택)

키 없이도 동작합니다. **고급 설정**에 YouTube Data API v3 키를 넣으면 공식 API(`relevanceLanguage`, `regionCode`)로 검색합니다.

## 빌드

Gradle 없이 Android SDK 도구만으로 빌드합니다 (`aapt2` → `javac` → `dx` → zipalign → `apksig`).

```bash
# TOOLS 디렉터리에 android.jar(API 34), aapt2, dalvik-dx-*.jar, apksig-*.jar 를 둡니다
TOOLS=/path/to/tools ./tools/build_apk.sh
# 결과: build/app-release.apk
```

서명 키가 없으면 `keystore/release.p12`를 새로 만듭니다 (git에는 올리지 않음). 다른 키로 서명한 APK로 업데이트하려면 기존 앱을 먼저 지워야 합니다.

## 구조

| 파일 | 역할 |
| --- | --- |
| `MainActivity.java` | 화면, 입력 저장, 결과 목록 · 복사 · 공유 |
| `LinkFinder.java` | 키워드 분석 → 검색 → 언어 검사 → 개수 맞추기 |
| `YouTubeSearcher.java` | 유튜브 웹 검색 / 내부 검색 API / Data API v3 |
| `Translator.java` | 키워드 번역, 제목 언어 감지 |
| `LangDetect.java` | 글자 체계로 언어 추정 |
| `Language.java` | 지원 언어 목록 (코드, 지역) |
