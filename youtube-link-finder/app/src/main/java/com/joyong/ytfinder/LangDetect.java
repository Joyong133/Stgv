package com.joyong.ytfinder;

/**
 * 글자 체계(스크립트)로 텍스트 언어를 추정한다.
 * 한글·일본어·중국어·러시아어·태국어·힌디어·아랍어는 글자만으로 구분하고,
 * 라틴 문자 언어(영어·스페인어 등)는 "latin"을 돌려주어 번역기 감지로 넘긴다.
 */
final class LangDetect {
    static final String LATIN = "latin";

    private LangDetect() {}

    /** 스크립트로 추정한 언어 코드(ko, ja, zh, ru, th, hi, ar), 라틴이면 "latin", 모르면 null. */
    static String scriptGuess(String text) {
        if (text == null) return null;
        int hangul = 0, kana = 0, han = 0, cyr = 0, thai = 0, deva = 0, arab = 0, latin = 0;
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            i += Character.charCount(cp);
            if ((cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0x1100 && cp <= 0x11FF) || (cp >= 0x3130 && cp <= 0x318F)) {
                hangul++;
            } else if (cp >= 0x3040 && cp <= 0x30FF) {
                kana++;
            } else if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF)) {
                han++;
            } else if (cp >= 0x0400 && cp <= 0x04FF) {
                cyr++;
            } else if (cp >= 0x0E00 && cp <= 0x0E7F) {
                thai++;
            } else if (cp >= 0x0900 && cp <= 0x097F) {
                deva++;
            } else if ((cp >= 0x0600 && cp <= 0x06FF) || (cp >= 0x0750 && cp <= 0x077F)) {
                arab++;
            } else if (cp < 0x0250 && Character.isLetter(cp)) {
                latin++;
            } else if (cp >= 0x1E00 && cp <= 0x1EFF) {
                latin++; // 베트남어 성조 문자 등 라틴 확장
            }
        }
        if (hangul >= 2) return "ko";
        if (kana >= 1) return "ja";
        if (han >= 2) return "zh";
        if (cyr >= 3) return "ru";
        if (thai >= 2) return "th";
        if (deva >= 2) return "hi";
        if (arab >= 2) return "ar";
        if (latin >= 3) return LATIN;
        return null;
    }

    /** 라틴 문자로 쓰는 언어인지. */
    static boolean isLatinLanguage(String base) {
        return !("ko".equals(base) || "ja".equals(base) || "zh".equals(base) || "ru".equals(base)
                || "th".equals(base) || "hi".equals(base) || "ar".equals(base));
    }

    /** 코드의 기본 부분 (zh-CN → zh, 번역기의 옛 코드 정리 포함). */
    static String base(String code) {
        if (code == null) return null;
        String b = code.toLowerCase();
        int i = b.indexOf('-');
        if (i >= 0) b = b.substring(0, i);
        if ("in".equals(b)) return "id";
        return b;
    }
}
