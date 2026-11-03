// 확장 프로그램 전체(백그라운드 · 콘텐츠 스크립트 · 팝업)가 함께 쓰는 기본 설정과 언어 목록.
self.YST_DEFAULTS = {
  enabled: true,
  provider: 'gemini', // gemini | cloud-llm | cloud-v2 | free
  geminiApiKey: '',
  geminiModel: 'gemini-flash-latest', // 항상 최신 Flash 모델을 가리키는 별칭
  cloudApiKey: '',
  cloudProjectId: '',
  targetLang: 'ko',
  displayMode: 'translated', // translated | dual
  fontScale: 1,
  autoEnableCC: true,
};

// [코드, 표시 이름, 영어 이름(모델 프롬프트용)]
self.YST_LANGS = [
  ['ko', '한국어', 'Korean'],
  ['en', 'English', 'English'],
  ['ja', '日本語', 'Japanese'],
  ['zh-CN', '中文(简体)', 'Simplified Chinese'],
  ['zh-TW', '中文(繁體)', 'Traditional Chinese'],
  ['es', 'Español', 'Spanish'],
  ['fr', 'Français', 'French'],
  ['de', 'Deutsch', 'German'],
  ['pt', 'Português', 'Portuguese'],
  ['it', 'Italiano', 'Italian'],
  ['ru', 'Русский', 'Russian'],
  ['vi', 'Tiếng Việt', 'Vietnamese'],
  ['th', 'ไทย', 'Thai'],
  ['id', 'Bahasa Indonesia', 'Indonesian'],
  ['tr', 'Türkçe', 'Turkish'],
  ['ar', 'العربية', 'Arabic'],
  ['hi', 'हिन्दी', 'Hindi'],
];

self.YST_PROVIDERS = [
  ['gemini', 'Google Gemini (최신 LLM · 권장)'],
  ['cloud-llm', 'Google Cloud Translation LLM (v3)'],
  ['cloud-v2', 'Google Cloud Translation (v2 · NMT)'],
  ['free', 'Google 번역 (무료 · 키 불필요)'],
];
