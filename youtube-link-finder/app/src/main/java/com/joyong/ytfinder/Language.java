package com.joyong.ytfinder;

/** 검색 대상 언어. code는 번역/hl 값, region은 YouTube 지역(gl) 값. */
public final class Language {
    public final String label;
    public final String code;
    public final String region;

    private Language(String label, String code, String region) {
        this.label = label;
        this.code = code;
        this.region = region;
    }

    public static final Language[] ALL = {
            new Language("한국어", "ko", "KR"),
            new Language("English", "en", "US"),
            new Language("日本語 (일본어)", "ja", "JP"),
            new Language("中文简体 (중국어 간체)", "zh-CN", "CN"),
            new Language("中文繁體 (중국어 번체)", "zh-TW", "TW"),
            new Language("Español (스페인어)", "es", "ES"),
            new Language("Français (프랑스어)", "fr", "FR"),
            new Language("Deutsch (독일어)", "de", "DE"),
            new Language("Русский (러시아어)", "ru", "RU"),
            new Language("Português (포르투갈어)", "pt", "BR"),
            new Language("Italiano (이탈리아어)", "it", "IT"),
            new Language("Tiếng Việt (베트남어)", "vi", "VN"),
            new Language("ไทย (태국어)", "th", "TH"),
            new Language("Bahasa Indonesia (인도네시아어)", "id", "ID"),
            new Language("हिन्दी (힌디어)", "hi", "IN"),
            new Language("العربية (아랍어)", "ar", "SA"),
            new Language("Türkçe (튀르키예어)", "tr", "TR"),
    };

    /** 언어 코드의 기본 부분 (zh-CN → zh). */
    public String base() {
        int i = code.indexOf('-');
        return i < 0 ? code : code.substring(0, i);
    }

    /** YouTube hl 파라미터 값. */
    public String hl() {
        return code;
    }

    public static String labelOf(String code) {
        if (code == null) return "알 수 없음";
        for (Language l : ALL) {
            if (l.code.equalsIgnoreCase(code)) return l.label;
        }
        String base = code.contains("-") ? code.substring(0, code.indexOf('-')) : code;
        for (Language l : ALL) {
            if (l.base().equalsIgnoreCase(base)) return l.label;
        }
        return code;
    }

    @Override
    public String toString() {
        return label;
    }
}
