package com.joyong.ytfinder;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.IOException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 유튜브 검색. API 키가 없으면 유튜브 웹 검색 결과(ytInitialData)와
 * 내부 검색 API(youtubei)를 읽고, API 키가 있으면 YouTube Data API v3를 쓴다.
 */
class YouTubeSearcher {
    static final class Page {
        final List<VideoItem> items;
        final String next;

        Page(List<VideoItem> items, String next) {
            this.items = items;
            this.next = next;
        }
    }

    /** 검색 정렬. filter는 유튜브 검색 필터(동영상만 + 정렬), apiOrder는 Data API의 order 값. */
    enum Order {
        RELEVANCE("관련성순", "EgIQAQ%3D%3D", "relevance"),
        DATE("업로드 날짜순", "CAISAhAB", "date"),
        VIEWS("조회수순", "CAMSAhAB", "viewCount"),
        RATING("평점순", "CAESAhAB", "rating");

        final String label;
        final String filter;
        final String apiOrder;

        Order(String label, String filter, String apiOrder) {
            this.label = label;
            this.filter = filter;
            this.apiOrder = apiOrder;
        }
    }

    private static final String DEFAULT_CLIENT_VERSION = "2.20260901.00.00";
    private static final Pattern CLIENT_VERSION =
            Pattern.compile("\"INNERTUBE_CLIENT_VERSION\"\\s*:\\s*\"([0-9.]+)\"");

    private final Language lang;
    private final String apiKey;
    private final Order order;
    private String clientVersion = DEFAULT_CLIENT_VERSION;

    YouTubeSearcher(Language lang, String apiKey, Order order) {
        this.lang = lang;
        this.order = order;
        this.apiKey = apiKey == null || apiKey.trim().isEmpty() ? null : apiKey.trim();
    }

    boolean usesApiKey() {
        return apiKey != null;
    }

    /** 첫 페이지는 continuation == null. */
    Page search(String query, String continuation) throws IOException {
        if (apiKey != null) return searchDataApi(query, continuation);
        if (continuation == null) {
            try {
                return searchWebPage(query);
            } catch (IOException | JSONException e) {
                // 웹 페이지 구조가 바뀌었거나 막혔을 때는 내부 API로 다시 시도
            }
        }
        return searchInnertube(query, continuation);
    }

    // ---- 유튜브 웹 검색 페이지 ----

    private Page searchWebPage(String query) throws IOException, JSONException {
        String url = "https://www.youtube.com/results?search_query=" + URLEncoder.encode(query, "UTF-8")
                + "&sp=" + URLEncoder.encode(order.filter, "UTF-8")
                + "&hl=" + lang.hl() + "&gl=" + lang.region;
        String html = Http.get(url, browserHeaders());
        Matcher m = CLIENT_VERSION.matcher(html);
        if (m.find()) clientVersion = m.group(1);
        JSONObject data = extractInitialData(html);
        if (data == null) throw new IOException("ytInitialData 없음");
        return parseResults(data);
    }

    static JSONObject extractInitialData(String html) throws JSONException {
        String[] markers = {"var ytInitialData = ", "window[\"ytInitialData\"] = ", "ytInitialData = "};
        for (String marker : markers) {
            int i = html.indexOf(marker);
            if (i < 0) continue;
            int start = i + marker.length();
            if (start < html.length() && html.charAt(start) == '{') {
                Object v = new JSONTokener(html.substring(start)).nextValue();
                if (v instanceof JSONObject) return (JSONObject) v;
            }
        }
        return null;
    }

    // ---- 유튜브 내부 검색 API ----

    private Page searchInnertube(String query, String continuation) throws IOException {
        try {
            JSONObject client = new JSONObject()
                    .put("clientName", "WEB")
                    .put("clientVersion", clientVersion)
                    .put("hl", lang.hl())
                    .put("gl", lang.region);
            JSONObject body = new JSONObject().put("context", new JSONObject().put("client", client));
            if (continuation != null) {
                body.put("continuation", continuation);
            } else {
                body.put("query", query).put("params", order.filter);
            }
            Map<String, String> h = browserHeaders();
            h.put("Content-Type", "application/json");
            h.put("X-YouTube-Client-Name", "1");
            h.put("X-YouTube-Client-Version", clientVersion);
            h.put("Origin", "https://www.youtube.com");
            String res = Http.post("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", h, body.toString());
            return parseResults(new JSONObject(res));
        } catch (JSONException e) {
            throw new IOException("유튜브 응답을 읽지 못했습니다", e);
        }
    }

    private Map<String, String> browserHeaders() {
        Map<String, String> h = new HashMap<>();
        h.put("Accept-Language", lang.code + "," + lang.base() + ";q=0.9");
        h.put("Cookie", "CONSENT=YES+cb; SOCS=CAI");
        return h;
    }

    /** 응답 JSON 전체를 훑어 videoRenderer와 다음 페이지 토큰을 모은다. */
    static Page parseResults(JSONObject root) {
        List<VideoItem> items = new ArrayList<>();
        String[] next = new String[1];
        walk(root, items, next);
        return new Page(items, next[0]);
    }

    private static void walk(Object node, List<VideoItem> items, String[] next) {
        if (node instanceof JSONObject) {
            JSONObject o = (JSONObject) node;
            JSONObject vr = o.optJSONObject("videoRenderer");
            if (vr != null) {
                VideoItem v = parseVideoRenderer(vr);
                if (v != null) items.add(v);
            }
            JSONObject cc = o.optJSONObject("continuationCommand");
            if (cc != null && cc.has("token")) next[0] = cc.optString("token");
            Iterator<String> keys = o.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                if ("videoRenderer".equals(k)) continue;
                walk(o.opt(k), items, next);
            }
        } else if (node instanceof JSONArray) {
            JSONArray a = (JSONArray) node;
            for (int i = 0; i < a.length(); i++) walk(a.opt(i), items, next);
        }
    }

    private static VideoItem parseVideoRenderer(JSONObject vr) {
        String id = vr.optString("videoId", "");
        if (id.isEmpty()) return null;
        String title = text(vr.optJSONObject("title"));
        String channel = text(vr.optJSONObject("ownerText"));
        if (channel.isEmpty()) channel = text(vr.optJSONObject("longBylineText"));
        String views = text(vr.optJSONObject("shortViewCountText"));
        if (views.isEmpty()) views = text(vr.optJSONObject("viewCountText"));
        return new VideoItem(id, title, channel,
                text(vr.optJSONObject("lengthText")), views,
                text(vr.optJSONObject("publishedTimeText")));
    }

    private static String text(JSONObject t) {
        if (t == null) return "";
        if (t.has("simpleText")) return t.optString("simpleText");
        JSONArray runs = t.optJSONArray("runs");
        if (runs == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < runs.length(); i++) {
            JSONObject r = runs.optJSONObject(i);
            if (r != null) sb.append(r.optString("text"));
        }
        return sb.toString();
    }

    // ---- YouTube Data API v3 ----

    private Page searchDataApi(String query, String pageToken) throws IOException {
        StringBuilder url = new StringBuilder("https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50")
                .append("&q=").append(URLEncoder.encode(query, "UTF-8"))
                .append("&relevanceLanguage=").append(relevanceLanguage())
                .append("&regionCode=").append(lang.region)
                .append("&order=").append(order.apiOrder)
                .append("&key=").append(URLEncoder.encode(apiKey, "UTF-8"));
        if (pageToken != null) url.append("&pageToken=").append(URLEncoder.encode(pageToken, "UTF-8"));
        String res;
        try {
            res = Http.get(url.toString(), null);
        } catch (Http.HttpException e) {
            throw new IOException("YouTube API 오류 (" + e.code + "): " + apiError(e.body));
        }
        try {
            return parseDataApi(new JSONObject(res));
        } catch (JSONException e) {
            throw new IOException("YouTube API 응답을 읽지 못했습니다", e);
        }
    }

    private String relevanceLanguage() {
        if ("zh-CN".equals(lang.code)) return "zh-Hans";
        if ("zh-TW".equals(lang.code)) return "zh-Hant";
        return lang.base();
    }

    static Page parseDataApi(JSONObject root) {
        List<VideoItem> items = new ArrayList<>();
        JSONArray arr = root.optJSONArray("items");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.optJSONObject(i);
                if (it == null) continue;
                JSONObject id = it.optJSONObject("id");
                JSONObject sn = it.optJSONObject("snippet");
                String vid = id == null ? "" : id.optString("videoId", "");
                if (vid.isEmpty() || sn == null) continue;
                String date = sn.optString("publishedAt", "");
                if (date.length() >= 10) date = date.substring(0, 10);
                items.add(new VideoItem(vid, unescapeHtml(sn.optString("title")),
                        unescapeHtml(sn.optString("channelTitle")), "", "", date));
            }
        }
        String next = root.optString("nextPageToken", "");
        return new Page(items, next.isEmpty() ? null : next);
    }

    private static String apiError(String body) {
        try {
            return new JSONObject(body).getJSONObject("error").optString("message", body);
        } catch (JSONException e) {
            return body;
        }
    }

    static String unescapeHtml(String s) {
        if (s == null || s.indexOf('&') < 0) return s;
        StringBuilder sb = new StringBuilder();
        int i = 0;
        while (i < s.length()) {
            char c = s.charAt(i);
            int semi = c == '&' ? s.indexOf(';', i) : -1;
            if (semi > i && semi - i <= 10) {
                String ent = s.substring(i + 1, semi);
                String rep = null;
                if ("amp".equals(ent)) rep = "&";
                else if ("quot".equals(ent)) rep = "\"";
                else if ("apos".equals(ent)) rep = "'";
                else if ("lt".equals(ent)) rep = "<";
                else if ("gt".equals(ent)) rep = ">";
                else if (ent.startsWith("#x") || ent.startsWith("#X")) {
                    try {
                        rep = new String(Character.toChars(Integer.parseInt(ent.substring(2), 16)));
                    } catch (IllegalArgumentException ignored) {
                    }
                } else if (ent.startsWith("#")) {
                    try {
                        rep = new String(Character.toChars(Integer.parseInt(ent.substring(1))));
                    } catch (IllegalArgumentException ignored) {
                    }
                }
                if (rep != null) {
                    sb.append(rep);
                    i = semi + 1;
                    continue;
                }
            }
            sb.append(c);
            i++;
        }
        return sb.toString();
    }
}
