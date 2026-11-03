package com.stgv.ainews;

/** 소식을 모으는 회사 네 곳. 비트 값으로 묶어서 저장한다. */
public enum Company {
    OPENAI(1, "OpenAI", 0xFF10A37F),
    CLAUDE(2, "Claude", 0xFFD97757),
    GOOGLE(4, "Google", 0xFF4285F4),
    GROK(8, "Grok", 0xFFB0B6C3);

    public final int bit;
    public final String label;
    public final int color;

    Company(int bit, String label, int color) {
        this.bit = bit;
        this.label = label;
        this.color = color;
    }

    /** 제목에 다른 회사 이름이 같이 나오면 그 회사 탭에도 보이도록. */
    static int detect(String text) {
        String t = text.toLowerCase(java.util.Locale.ROOT);
        int m = 0;
        if (t.contains("openai") || t.contains("오픈ai") || t.contains("chatgpt") || t.contains("챗gpt")
                || t.matches(".*\\bgpt-?\\d.*") || t.matches(".*\\bsora\\b.*")) m |= OPENAI.bit;
        if (t.contains("anthropic") || t.contains("앤트로픽") || t.contains("앤스로픽")
                || t.matches(".*\\bclaude\\b.*") || t.contains("클로드")) m |= CLAUDE.bit;
        if (t.contains("gemini") || t.contains("제미나이") || t.contains("제미니") || t.contains("deepmind")
                || t.contains("딥마인드") || t.contains("gemma")) m |= GOOGLE.bit;
        if (t.matches(".*\\bgrok\\b.*") || t.contains("그록") || t.matches(".*\\bxai\\b.*")) m |= GROK.bit;
        return m;
    }
}
