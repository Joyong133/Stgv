# 선셋 드라이브 (Sunset Drive)

Godot 4.5로 만든 안드로이드용 3D 자동차 드라이브·레이싱 게임입니다.
모델, 텍스처, 효과음, 음악은 모두 코드로 생성했습니다 (외부 에셋 없음, 폰트만 SIL OFL 라이선스 무료 폰트).

## 설치

`dist/SunsetDrive.apk`를 폰으로 옮겨 설치합니다. 설치 전에 "출처를 알 수 없는 앱" 설치를 허용해야 합니다.
arm64 안드로이드 7.0 이상에서 실행됩니다.

## 게임 내용

- **모드**: 레이스(AI 5대와 순위 경쟁) · 타임 어택(최고 랩 기록과 고스트 카) · 자유 주행
- **코스 3개**: 선셋 해안도로(노을·바다) · 솔숲 산악로(낮·오르막·급커브) · 네온 시티(밤·시가지)
- **자동차 3종 × 8색**: 블레이즈 GT, 썬더 V8, 스위프트 R
- 드리프트로 부스터 충전, 부스터(니트로), 역주행 경고, 트랙 복귀
- 설정: 버튼/기울기 조작, 그래픽 품질, 효과음·음악 볼륨, 진동, 난이도, 랩 수, 카메라

## 조작

| 동작 | 터치 | 키보드(PC 테스트) |
| --- | --- | --- |
| 조향 | 왼쪽 ◀ ▶ 또는 기울기 | ← → / A D |
| 가속 / 브레이크·후진 | 오른쪽 가속 / 브레이크 | ↑ / ↓ (W / S) |
| 드리프트 | 드리프트 (조향하며 누르기) | Space |
| 부스터 | 부스터 | Shift |
| 시점 / 복귀 / 일시정지 | 화면 위 버튼 | C / R / Esc |

## 빌드 방법

1. Godot 4.5.1과 Android 내보내기 템플릿, Android SDK(build-tools, platform-tools)를 설치합니다.
2. 에디터 설정에서 Android SDK 경로를 지정합니다.
3. `godot --headless --path drive-game --export-release "Android" dist/SunsetDrive.apk`

`keystore/sunsetdrive-debug.keystore`는 사이드로딩용 공개 디버그 키(비밀번호 `android`)입니다.
같은 키로 서명해야 새 버전을 기존 앱 위에 덮어 설치할 수 있습니다. Play 스토어에 올릴 때는 별도의 비공개 키를 쓰세요.

에셋 다시 만들기: `python3 tools/make_textures.py`, `python3 tools/make_audio.py`, `python3 tools/make_icons.py`,
`python3 tools/subset_fonts.py <원본 폰트 폴더>`

## 파일 구성

```
project.godot / export_presets.cfg   프로젝트·안드로이드 내보내기 설정
scenes/main.tscn                     시작 장면
scripts/main.gd                      메뉴 ↔ 주행 전환, 뒤로 가기, 자동 테스트
scripts/game.gd, sfx.gd              전역 상태(설정·기록·차 성능), 소리 (자동 로드)
scripts/track_data.gd, track.gd      코스 정의, 도로·지형 생성, 위치 계산
scripts/scenery.gd                   하늘·조명·안개, 나무·건물·바다·산
scripts/car_builder.gd, car.gd       차 모양, 아케이드 주행 물리
scripts/ai_driver.gd, race.gd        AI 운전, 랩·순위·결과·고스트
scripts/hud.gd, touch_pad.gd, speedo.gd, minimap.gd, main_menu.gd, showroom.gd, ui_kit.gd   화면 UI
tools/                               텍스처·소리·아이콘·폰트 생성 스크립트
```
