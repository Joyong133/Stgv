# AI 모델 소식 (안드로이드 앱)

OpenAI · Claude(Anthropic) · Google(Gemini · DeepMind) · Grok(xAI)의 **새 모델 출시 소식과 관련 뉴스**를 한곳에 모아 보여 주는 앱입니다.

## 다운로드

[Releases → `ai-news-latest`](https://github.com/Joyong133/Stgv/releases/tag/ai-news-latest)에서 `AiNews.apk`를 휴대폰으로 받아 설치하세요.
(처음 설치할 때 "출처를 알 수 없는 앱 설치"를 허용해야 합니다.)

## 기능

- **회사별 탭**: 전체 / OpenAI / Claude / Google / Grok (탭마다 기사 수 표시)
- **🚀 모델 출시**: "출시 · 공개 · launch · release …" 같은 말과 모델 이름(GPT, Claude Opus/Sonnet/Haiku, Gemini, Grok …)이 함께 나온 기사만 보기
- **📢 공식 발표**: 회사 공식 블로그 글만 보기 (OpenAI News, Google AI 블로그, Google DeepMind, Gemini 블로그)
- **언어**: 전체 / 한국어 / English
- **검색**: 제목 · 언론사 · 요약에서 찾기 (예: `GPT-5`, `Opus`, `Gemini`)
- **🔔 새 모델 알림**: 3시간마다 확인해서 처음 보는 출시 소식이 있으면 알림 (🔔 버튼으로 켜고 끄기)
- 기사를 누르면 **앱 안에서 바로 읽기** (위쪽 막대에서 새로고침 · 공유 · 브라우저로 열기, 뒤로 가기는 페이지 뒤로)
- 기사를 **길게 누르면** 브라우저로 열기 · 공유 · 링크 복사 · 영어 제목 번역
- 마지막으로 받은 목록을 저장해 두어서 앱을 열면 바로 보임 (10분 지나면 자동 새로고침)

## 소식을 가져오는 곳

| 구분 | 출처 |
| --- | --- |
| 공식 | OpenAI News RSS, Google AI 블로그 RSS, Google DeepMind 블로그 RSS, Gemini 블로그 RSS |
| 뉴스 | Google 뉴스 검색 RSS (한국판 · 미국판, 최근 14일) — 회사마다 한국어 · 영어 검색 |

Anthropic과 xAI는 공식 RSS가 없어서 뉴스 검색으로 모읍니다. 출처나 검색어는
`app/src/main/java/com/stgv/ainews/NewsFetcher.java`의 `SOURCES`에서 바꿀 수 있습니다.

## 빌드

`ai-news-app/` 아래를 고쳐서 푸시하면 GitHub Actions(`.github/workflows/ai-news-apk.yml`)가 APK를 빌드해
`ai-news-latest` 릴리스에 올립니다. 직접 빌드하려면 Android SDK가 있는 환경에서:

```
cd ai-news-app
./gradlew assembleRelease
```

서명 키 `app/ainews.keystore`(비밀번호 `android`)는 개인 설치용 공개 키입니다. 같은 키로 서명되므로 새 버전을 덮어 설치할 수 있습니다.
