package com.stgv.ainews;

import org.json.JSONObject;

/** 기사 한 건. */
public class NewsItem {
    public String title = "";
    public String url = "";
    public String source = "";   // 언론사 / 블로그 이름
    public String summary = "";  // 공식 블로그 요약 (있을 때만)
    public String lang = "";     // KO / EN
    public long timeMs;
    public int companies;        // Company 비트 묶음 (여러 회사가 함께 언급될 수 있음)
    public boolean official;     // 회사 공식 블로그 글
    public boolean release;      // 모델 출시 · 공개 소식으로 보임

    /** 같은 기사를 여러 검색에서 찾았을 때 묶기 위한 키. */
    public String key() {
        String t = title.toLowerCase(java.util.Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", "");
        return t.length() > 60 ? t.substring(0, 60) : t;
    }

    JSONObject toJson() throws Exception {
        JSONObject o = new JSONObject();
        o.put("t", title);
        o.put("u", url);
        o.put("s", source);
        o.put("d", summary);
        o.put("l", lang);
        o.put("m", timeMs);
        o.put("c", companies);
        o.put("o", official);
        o.put("r", release);
        return o;
    }

    static NewsItem fromJson(JSONObject o) {
        NewsItem n = new NewsItem();
        n.title = o.optString("t");
        n.url = o.optString("u");
        n.source = o.optString("s");
        n.summary = o.optString("d");
        n.lang = o.optString("l");
        n.timeMs = o.optLong("m");
        n.companies = o.optInt("c");
        n.official = o.optBoolean("o");
        n.release = o.optBoolean("r");
        return n;
    }
}
