# YouTube 자막 AI 번역기 (Chrome 확장 프로그램)

유튜브 자막을 **Google Gemini 최신 모델**(또는 Google Cloud Translation)로 번역해서 영상 위에 보여주는 크롬 확장 프로그램입니다.

- 자막 전체를 문맥과 함께 번역 (앞뒤 줄과 영상 제목을 참고해서 자연스러운 자막체로)
- 지금 보는 위치부터 먼저 번역하고, 나머지는 뒤에서 이어서 번역
- 자동 생성 자막(단어 단위로 잘게 쪼개진 자막)은 문장 단위로 묶어서 번역
- **번역만** / **원문 + 번역** 두 가지 표시 방식, 글자 크기 조절
- 한 번 번역한 영상은 저장해 두었다가 다시 볼 때 바로 표시 (최근 40개)
- 유튜브 자막(CC) 버튼으로 번역 자막을 함께 켜고 끔. 자막이 꺼져 있으면 자동으로 켜줌(설정 가능)
- 생방송처럼 자막 파일을 받을 수 없는 경우에는 화면에 나오는 자막을 바로바로 번역

## 설치

1. 이 폴더(`youtube-subtitle-translator`)를 내려받습니다.
2. 크롬 주소창에 `chrome://extensions` 입력
3. 오른쪽 위 **개발자 모드** 켜기
4. **압축해제된 확장 프로그램을 로드합니다** → 이 폴더 선택
5. 설치하면 설정 페이지가 열립니다. Gemini API 키를 넣으면 끝!

## API 키 받기 (Gemini · 무료)

1. <https://aistudio.google.com/apikey> 접속 → Google 계정으로 로그인
2. **API 키 만들기** → 복사
3. 확장 프로그램 아이콘을 눌러 **Gemini API 키** 칸에 붙여넣기
4. **번역 테스트** 버튼으로 잘 되는지 확인

무료 등급에는 분당 · 일일 요청 한도가 있습니다. 한도에 걸리면 확장 프로그램이 잠시 기다렸다가 자동으로 다시 시도합니다.

## 번역 엔진

| 엔진 | 필요한 것 | 특징 |
| --- | --- | --- |
| **Google Gemini** (기본) | Gemini API 키 | 최신 LLM. 문맥을 이해해서 가장 자연스러움. 모델 기본값 `gemini-flash-latest`는 항상 Google의 최신 Flash 모델을 가리킴 |
| Google Cloud Translation LLM (v3) | Cloud API 키 + 프로젝트 ID | Google Cloud의 번역 전용 LLM(`general/translation-llm`). 유료 |
| Google Cloud Translation (v2) | Cloud API 키 | 기존 신경망 번역(NMT). 빠름. 유료 |
| Google 번역 (무료) | 없음 | 키 없이 바로 사용. 비공식 엔드포인트라 많이 쓰면 막힐 수 있음 |

Gemini 모델 칸 옆의 **목록** 버튼을 누르면 내 키로 쓸 수 있는 모든 Gemini 모델을 불러옵니다. 더 좋은 품질을 원하면 `gemini-pro-latest`, 더 빠르고 저렴한 쪽을 원하면 `gemini-flash-lite-latest`를 고르세요.

> Cloud Translation v3는 Google Cloud 설정에 따라 API 키 대신 OAuth 인증을 요구할 수 있습니다. 오류가 나면 Gemini 엔진을 쓰세요.

## 사용법

1. 유튜브 영상을 엽니다.
2. 자막이 있는 영상이면 자동으로 자막을 켜고 번역을 시작합니다. 플레이어 왼쪽 위에 진행률이 잠깐 표시됩니다.
3. 유튜브 자막 설정(⚙ → 자막)에서 원문 자막 언어를 바꾸면 그 자막을 다시 번역합니다.
4. 번역을 끄려면 팝업의 스위치를 끄거나, 그 영상에서만 끄려면 CC 버튼을 누르세요.

## 동작 방식

```
유튜브 플레이어 ──(자막 요청)──▶ /api/timedtext
        │                              │
  src/inject.js 가 응답을 복사 ◀────────┘
        │
  src/content.js : 자막 해석(json3/XML) → 자동 자막은 문장으로 묶기
        │          → 현재 재생 위치부터 묶음(12줄, 이후 40줄) 단위로 번역 요청
        ▼
  src/background.js : Gemini / Cloud Translation / Google 번역 API 호출
        │
        ▼
  content.js : 영상 시간에 맞춰 번역 자막을 플레이어 위에 표시, 번역은 저장
```

플레이어가 직접 받아온 자막 응답을 그대로 쓰기 때문에 유튜브의 별도 인증 토큰이 필요 없습니다.

## 파일 구조

```
manifest.json        확장 프로그램 설정 (Manifest V3)
src/defaults.js      기본 설정 · 언어 목록
src/inject.js        페이지에서 자막 응답 가로채기
src/content.js       자막 해석 · 번역 예약 · 화면 표시
src/content.css      번역 자막 스타일
src/background.js    번역 API 호출
popup/               팝업 / 설정 화면
icons/               아이콘
```

## 개인정보

- API 키와 설정은 브라우저의 `chrome.storage.local`에만 저장됩니다.
- 자막 글과 영상 제목은 번역을 위해 선택한 번역 엔진(Google)으로만 전송됩니다.
