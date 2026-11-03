package com.stgv.warrisk;

import android.util.Xml;

import org.json.JSONArray;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.StringReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/** 전 세계 뉴스에서 북한·남북 군사 관련 기사를 모은다. */
public class NewsFetcher {

    /** Google 뉴스 지역판 하나. */
    static class Edition {
        final String region, lang, hl, gl, ceid, query;

        Edition(String region, String lang, String hl, String gl, String ceid, String query) {
            this.region = region;
            this.lang = lang;
            this.hl = hl;
            this.gl = gl;
            this.ceid = ceid;
            this.query = query;
        }
    }

    static final Edition[] EDITIONS = {
            new Edition("한국", "KO", "ko", "KR", "KR:ko",
                    "북한 (미사일 OR 도발 OR 포격 OR 군사 OR 핵 OR 교전 OR 침범 OR 전쟁 OR 합참)"),
            new Edition("미국", "EN", "en-US", "US", "US:en",
                    "\"North Korea\" (missile OR military OR artillery OR nuclear OR war OR DMZ OR troops)"),
            new Edition("영국", "EN", "en-GB", "GB", "GB:en",
                    "\"North Korea\" (missile OR military OR nuclear OR war OR border)"),
            new Edition("일본", "JA", "ja", "JP", "JP:ja",
                    "北朝鮮 (ミサイル OR 軍事 OR 核 OR 砲撃 OR 挑発)"),
            new Edition("중국", "ZH", "zh-CN", "CN", "CN:zh-Hans",
                    "朝鲜 (导弹 OR 军事 OR 核 OR 炮击 OR 半岛)"),
            new Edition("러시아", "RU", "ru", "RU", "RU:ru",
                    "КНДР (ракета OR военные OR ядерный OR Корея)"),
            new Edition("독일", "DE", "de", "DE", "DE:de",
                    "Nordkorea (Rakete OR Militär OR Atom OR Südkorea)"),
            new Edition("프랑스", "FR", "fr", "FR", "FR:fr",
                    "\"Corée du Nord\" (missile OR militaire OR nucléaire OR Séoul)"),
            new Edition("스페인어권", "ES", "es-419", "US", "US:es-419",
                    "\"Corea del Norte\" (misil OR militar OR nuclear OR Seúl)"),
    };

    static final String GDELT_QUERY =
            "(\"north korea\" OR pyongyang OR \"kim jong un\" OR \"inter-korean\" OR dprk) "
                    + "(missile OR military OR artillery OR nuclear OR war OR troops OR border OR drone)";

    static final String UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) "
            + "Chrome/126.0 Mobile Safari/537.36";

    /** 모든 경로에서 동시에 수집. 일부 실패해도 나머지 결과는 돌려준다. */
    public static List<Article> fetchAll(List<String> errors) {
        ExecutorService pool = Executors.newFixedThreadPool(5);
        List<Future<List<Article>>> futures = new ArrayList<>();
        List<String> names = new ArrayList<>();
        for (final Edition e : EDITIONS) {
            names.add("Google 뉴스 " + e.region);
            futures.add(pool.submit(() -> fetchGoogle(e)));
        }
        names.add("GDELT");
        futures.add(pool.submit(NewsFetcher::fetchGdelt));

        List<Article> all = new ArrayList<>();
        for (int i = 0; i < futures.size(); i++) {
            try {
                all.addAll(futures.get(i).get(40, TimeUnit.SECONDS));
            } catch (Exception ex) {
                Throwable c = ex.getCause() != null ? ex.getCause() : ex;
                synchronized (errors) {
                    errors.add(names.get(i) + ": " + c.getClass().getSimpleName());
                }
            }
        }
        pool.shutdownNow();
        return all;
    }

    // ── Google 뉴스 RSS ──────────────────────────────────────────────
    static List<Article> fetchGoogle(Edition e) throws Exception {
        String url = "https://news.google.com/rss/search?q="
                + URLEncoder.encode(e.query + " when:3d", "UTF-8")
                + "&hl=" + e.hl + "&gl=" + e.gl + "&ceid=" + URLEncoder.encode(e.ceid, "UTF-8");
        String xml = httpGet(url);
        return parseRss(xml, e.region, e.lang);
    }

    static List<Article> parseRss(String xml, String region, String lang) throws Exception {
        List<Article> out = new ArrayList<>();
        XmlPullParser p = Xml.newPullParser();
        p.setInput(new StringReader(xml));
        SimpleDateFormat fmt = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US);

        Article cur = null;
        String tag = null;
        StringBuilder text = new StringBuilder();
        for (int ev = p.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = p.next()) {
            if (ev == XmlPullParser.START_TAG) {
                tag = p.getName();
                text.setLength(0);
                if ("item".equals(tag)) cur = new Article();
            } else if (ev == XmlPullParser.TEXT) {
                text.append(p.getText());
            } else if (ev == XmlPullParser.END_TAG) {
                String name = p.getName();
                String v = text.toString().trim();
                if (cur != null) {
                    if ("title".equals(name)) cur.title = v;
                    else if ("link".equals(name)) cur.url = v;
                    else if ("source".equals(name)) cur.source = v;
                    else if ("pubDate".equals(name)) {
                        try {
                            cur.timeMs = fmt.parse(v).getTime();
                        } catch (Exception ignored) {
                        }
                    } else if ("item".equals(name)) {
                        cur.region = region;
                        cur.lang = lang;
                        cur.via = "Google 뉴스";
                        // "제목 - 언론사" 형식에서 언론사 꼬리 떼기
                        if (cur.title != null && cur.source != null
                                && cur.title.endsWith(" - " + cur.source)) {
                            cur.title = cur.title.substring(0, cur.title.length() - cur.source.length() - 3);
                        }
                        if (cur.title != null && cur.url != null) out.add(cur);
                        cur = null;
                    }
                }
                text.setLength(0);
            }
        }
        return out;
    }

    // ── GDELT (전 세계 65개 언어 뉴스 모니터링) ─────────────────────────
    static List<Article> fetchGdelt() throws Exception {
        String url = "https://api.gdeltproject.org/api/v2/doc/doc?query="
                + URLEncoder.encode(GDELT_QUERY, "UTF-8")
                + "&mode=artlist&maxrecords=150&timespan=3d&sort=datedesc&format=json";
        String body = httpGet(url).trim();
        List<Article> out = new ArrayList<>();
        if (!body.startsWith("{")) return out; // 오류 시 GDELT는 일반 텍스트를 돌려준다
        JSONArray arr = new JSONObject(body).optJSONArray("articles");
        if (arr == null) return out;
        SimpleDateFormat fmt = new SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            Article a = new Article();
            a.title = o.optString("title", "").trim();
            a.url = o.optString("url", "");
            a.source = o.optString("domain", "");
            String country = o.optString("sourcecountry", "");
            a.region = COUNTRY_KO.containsKey(country) ? COUNTRY_KO.get(country) : country;
            a.lang = langCode(o.optString("language", ""));
            a.via = "GDELT";
            try {
                a.timeMs = fmt.parse(o.optString("seendate", "")).getTime();
            } catch (Exception ignored) {
            }
            if (!a.title.isEmpty() && !a.url.isEmpty()) out.add(a);
        }
        return out;
    }

    static final Map<String, String> COUNTRY_KO = new HashMap<>();
    static {
        String[][] m = {
                {"South Korea", "한국"}, {"North Korea", "북한"}, {"United States", "미국"},
                {"United Kingdom", "영국"}, {"Japan", "일본"}, {"China", "중국"}, {"Russia", "러시아"},
                {"Germany", "독일"}, {"France", "프랑스"}, {"Spain", "스페인"}, {"Italy", "이탈리아"},
                {"Canada", "캐나다"}, {"Australia", "호주"}, {"India", "인도"}, {"Taiwan", "대만"},
                {"Hong Kong", "홍콩"}, {"Singapore", "싱가포르"}, {"Philippines", "필리핀"},
                {"Vietnam", "베트남"}, {"Indonesia", "인도네시아"}, {"Malaysia", "말레이시아"},
                {"Thailand", "태국"}, {"Ukraine", "우크라이나"}, {"Poland", "폴란드"},
                {"Turkey", "튀르키예"}, {"Israel", "이스라엘"}, {"Brazil", "브라질"}, {"Mexico", "멕시코"},
                {"Argentina", "아르헨티나"}, {"Netherlands", "네덜란드"}, {"Switzerland", "스위스"},
                {"Austria", "오스트리아"}, {"Belgium", "벨기에"}, {"Sweden", "스웨덴"}, {"Ireland", "아일랜드"},
                {"Pakistan", "파키스탄"}, {"Bangladesh", "방글라데시"}, {"Nigeria", "나이지리아"},
                {"South Africa", "남아공"}, {"Egypt", "이집트"}, {"Saudi Arabia", "사우디"},
                {"United Arab Emirates", "UAE"}, {"Qatar", "카타르"}, {"Iran", "이란"}, {"Mongolia", "몽골"},
                {"New Zealand", "뉴질랜드"}, {"Greece", "그리스"}, {"Portugal", "포르투갈"},
                {"Czech Republic", "체코"}, {"Romania", "루마니아"}, {"Hungary", "헝가리"},
        };
        for (String[] kv : m) COUNTRY_KO.put(kv[0], kv[1]);
    }

    static String langCode(String gdeltLang) {
        switch (gdeltLang) {
            case "English": return "EN";
            case "Korean": return "KO";
            case "Japanese": return "JA";
            case "Chinese": return "ZH";
            case "Russian": return "RU";
            case "German": return "DE";
            case "French": return "FR";
            case "Spanish": return "ES";
            case "Italian": return "IT";
            case "Portuguese": return "PT";
            case "Vietnamese": return "VI";
            case "Arabic": return "AR";
            case "Turkish": return "TR";
            case "Polish": return "PL";
            case "Ukrainian": return "UK";
            default:
                return gdeltLang.length() >= 2 ? gdeltLang.substring(0, 2).toUpperCase(Locale.ROOT) : "";
        }
    }

    // ── HTTP ─────────────────────────────────────────────────────────
    static String httpGet(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", UA);
        c.setRequestProperty("Accept-Language", "ko,en;q=0.8");
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new java.io.IOException("HTTP " + code);
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) {
                    bo.write(buf, 0, n);
                    if (bo.size() > 8 * 1024 * 1024) break;
                }
                return new String(bo.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally {
            c.disconnect();
        }
    }

    /** 수집 + 분석을 한 번에. */
    public static RiskReport check() {
        List<String> errors = Collections.synchronizedList(new ArrayList<>());
        List<Article> raw = fetchAll(errors);
        RiskReport r = RiskEngine.analyze(raw, System.currentTimeMillis());
        r.errors.addAll(errors);
        return r;
    }
}
