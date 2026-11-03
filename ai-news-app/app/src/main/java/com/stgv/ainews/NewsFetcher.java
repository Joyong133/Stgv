package com.stgv.ainews;

import android.util.Xml;

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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/** 공식 블로그 RSS + Google 뉴스 검색으로 OpenAI · Claude · Google · Grok 소식을 모은다. */
public class NewsFetcher {

    /** 소식을 가져올 곳 하나. */
    static class Source {
        final String name;
        final Company company;
        final String url;
        final boolean official;
        final String lang;

        Source(String name, Company company, String url, boolean official, String lang) {
            this.name = name;
            this.company = company;
            this.url = url;
            this.official = official;
            this.lang = lang;
        }
    }

    static String googleNews(String query, boolean korean) {
        try {
            String q = URLEncoder.encode(query + " when:14d", "UTF-8");
            return korean
                    ? "https://news.google.com/rss/search?q=" + q + "&hl=ko&gl=KR&ceid=KR:ko"
                    : "https://news.google.com/rss/search?q=" + q + "&hl=en-US&gl=US&ceid=US:en";
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    static final Source[] SOURCES = {
            // ── 회사 공식 블로그 ──
            new Source("OpenAI 공식", Company.OPENAI, "https://openai.com/news/rss.xml", true, "EN"),
            new Source("Google AI 블로그", Company.GOOGLE, "https://blog.google/technology/ai/rss/", true, "EN"),
            new Source("Google DeepMind", Company.GOOGLE, "https://deepmind.google/blog/rss.xml", true, "EN"),
            new Source("Gemini 소식", Company.GOOGLE, "https://blog.google/products/gemini/rss/", true, "EN"),

            // ── 국내 뉴스 (Google 뉴스 한국판) ──
            new Source("뉴스", Company.OPENAI,
                    googleNews("(오픈AI OR OpenAI OR 챗GPT OR ChatGPT OR GPT-5 OR 샘 올트먼)", true), false, "KO"),
            new Source("뉴스", Company.CLAUDE,
                    googleNews("(앤트로픽 OR Anthropic OR \"클로드 AI\" OR \"Claude AI\" OR \"클로드 오퍼스\" OR \"클로드 소네트\")", true), false, "KO"),
            new Source("뉴스", Company.GOOGLE,
                    googleNews("(제미나이 OR Gemini OR 구글 딥마인드 OR \"구글 AI\")", true), false, "KO"),
            new Source("뉴스", Company.GROK,
                    googleNews("(그록 OR Grok OR xAI) (AI OR 머스크 OR 모델)", true), false, "KO"),

            // ── 해외 뉴스 (Google 뉴스 미국판) ──
            new Source("News", Company.OPENAI,
                    googleNews("(OpenAI OR ChatGPT OR \"GPT-5\" OR \"Sam Altman\") (model OR launch OR release OR AI)", false), false, "EN"),
            new Source("News", Company.CLAUDE,
                    googleNews("(Anthropic OR \"Claude AI\" OR \"Claude Opus\" OR \"Claude Sonnet\" OR \"Claude Haiku\")", false), false, "EN"),
            new Source("News", Company.GOOGLE,
                    googleNews("(\"Google Gemini\" OR \"Gemini model\" OR \"Google DeepMind\" OR \"Gemini AI\")", false), false, "EN"),
            new Source("News", Company.GROK,
                    googleNews("(Grok OR xAI) (Musk OR model OR AI OR chatbot)", false), false, "EN"),
    };

    // 모델 출시 · 공개 소식 판별: (출시 관련 단어) + (모델 이름이나 '모델')
    static final Pattern RELEASE_WORDS = Pattern.compile(
            "(출시|공개|발표|선보|선봬|런칭|론칭|업데이트|업그레이드|배포|신모델|새 모델|차세대|베타|프리뷰|"
                    + "launch|release|unveil|introduc|announc|debut|roll(s|ed|ing)? out|now available|"
                    + "available (today|now)|new model|preview|upgrade|ships|beta)",
            Pattern.CASE_INSENSITIVE);
    static final Pattern MODEL_WORDS = Pattern.compile(
            "(gpt-?\\d|\\bo\\d\\b|\\bo\\d-|chatgpt|챗gpt|sora|소라|codex|코덱스|claude|클로드|opus|오퍼스|sonnet|소네트|"
                    + "haiku|하이쿠|gemini|제미나이|제미니|gemma|젬마|veo|imagen|nano banana|나노 바나나|grok|그록|"
                    + "aurora|모델|model|llm)",
            Pattern.CASE_INSENSITIVE);

    static boolean looksLikeRelease(String text) {
        return RELEASE_WORDS.matcher(text).find() && MODEL_WORDS.matcher(text).find();
    }

    static final String UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) "
            + "Chrome/126.0 Mobile Safari/537.36";

    /** 모든 곳에서 동시에 수집하고, 겹치는 기사를 묶어 최신순으로 돌려준다. 일부 실패해도 나머지는 돌려준다. */
    public static List<NewsItem> fetchAll(List<String> errors) {
        ExecutorService pool = Executors.newFixedThreadPool(6);
        List<Future<List<NewsItem>>> futures = new ArrayList<>();
        for (final Source s : SOURCES) futures.add(pool.submit(() -> fetch(s)));

        Map<String, NewsItem> merged = new LinkedHashMap<>();
        for (int i = 0; i < futures.size(); i++) {
            List<NewsItem> got;
            try {
                got = futures.get(i).get(45, TimeUnit.SECONDS);
            } catch (Exception ex) {
                Throwable c = ex.getCause() != null ? ex.getCause() : ex;
                Source s = SOURCES[i];
                errors.add(s.company.label + " " + s.name + ": " + c.getClass().getSimpleName()
                        + (c.getMessage() != null ? " " + c.getMessage() : ""));
                continue;
            }
            for (NewsItem n : got) {
                String k = n.key();
                if (k.isEmpty()) continue;
                NewsItem old = merged.get(k);
                if (old == null) {
                    merged.put(k, n);
                } else {
                    old.companies |= n.companies;
                    old.release |= n.release;
                    if (n.official && !old.official) {
                        // 공식 글을 우선 (링크 · 요약)
                        n.companies = old.companies;
                        n.release = old.release;
                        merged.put(k, n);
                    }
                }
            }
        }
        pool.shutdownNow();

        List<NewsItem> out = new ArrayList<>(merged.values());
        long future = System.currentTimeMillis() + 6 * 3600_000L;
        for (NewsItem n : out) if (n.timeMs > future) n.timeMs = System.currentTimeMillis();
        Collections.sort(out, (a, b) -> Long.compare(b.timeMs, a.timeMs));
        return out.size() > 600 ? new ArrayList<>(out.subList(0, 600)) : out;
    }

    static List<NewsItem> fetch(Source s) throws Exception {
        List<NewsItem> items = parseFeed(httpGet(s.url));
        long cutoff = System.currentTimeMillis() - 45L * 24 * 3600_000L;
        List<NewsItem> out = new ArrayList<>();
        for (NewsItem n : items) {
            if (n.timeMs != 0 && n.timeMs < cutoff) continue;
            n.official = s.official;
            n.lang = s.lang;
            if (s.official) n.source = s.name.replace(" 공식", "");
            n.companies = s.company.bit | Company.detect(n.title);
            n.release = looksLikeRelease(n.title + " " + (s.official ? n.summary : ""));
            out.add(n);
        }
        return out;
    }

    // ── RSS 2.0 / Atom 공용 파서 ───────────────────────────────────────
    static List<NewsItem> parseFeed(String xml) throws Exception {
        List<NewsItem> out = new ArrayList<>();
        XmlPullParser p = Xml.newPullParser();
        p.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false);
        try {
            // &nbsp; 같은 HTML 엔티티가 섞인 피드도 끝까지 읽도록
            p.setFeature("http://xmlpull.org/v1/doc/features.html#relaxed", true);
        } catch (Exception ignored) {
        }
        p.setInput(new StringReader(stripBom(xml)));
        try {
            parseInto(p, out);
        } catch (Exception e) {
            if (out.isEmpty()) throw e; // 중간에 깨진 피드는 읽은 데까지만 쓴다
        }
        return out;
    }

    static void parseInto(XmlPullParser p, List<NewsItem> out) throws Exception {

        NewsItem cur = null;
        StringBuilder text = new StringBuilder();
        for (int ev = p.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = p.next()) {
            if (ev == XmlPullParser.START_TAG) {
                String name = tagName(p.getName());
                text.setLength(0);
                if ("item".equals(name) || "entry".equals(name)) {
                    cur = new NewsItem();
                } else if (cur != null && "link".equals(name)) {
                    // Atom: <link rel="alternate" href="..."/>
                    String href = p.getAttributeValue(null, "href");
                    String rel = p.getAttributeValue(null, "rel");
                    if (href != null && (rel == null || "alternate".equals(rel)) && cur.url.isEmpty()) {
                        cur.url = href.trim();
                    }
                }
            } else if (ev == XmlPullParser.TEXT || ev == XmlPullParser.CDSECT) {
                text.append(p.getText());
            } else if (ev == XmlPullParser.END_TAG) {
                String name = tagName(p.getName());
                String v = text.toString().trim();
                if (cur != null) {
                    switch (name) {
                        case "title":
                            cur.title = clean(v);
                            break;
                        case "link":
                            if (!v.isEmpty() && cur.url.isEmpty()) cur.url = v;
                            break;
                        case "source":
                            cur.source = clean(v);
                            break;
                        case "description":
                        case "summary":
                            if (cur.summary.isEmpty()) cur.summary = summarize(v);
                            break;
                        case "pubDate":
                        case "published":
                        case "updated":
                        case "date":
                            if (cur.timeMs == 0) cur.timeMs = parseDate(v);
                            break;
                        case "item":
                        case "entry":
                            // Google 뉴스: "제목 - 언론사" 꼬리 떼기
                            if (!cur.source.isEmpty() && cur.title.endsWith(" - " + cur.source)) {
                                cur.title = cur.title.substring(0, cur.title.length() - cur.source.length() - 3).trim();
                            }
                            if (!cur.title.isEmpty() && cur.url.startsWith("http")) out.add(cur);
                            cur = null;
                            break;
                        default:
                            break;
                    }
                }
                text.setLength(0);
            }
        }
    }

    /** media:title 같은 다른 이름공간 태그가 제목을 덮어쓰지 않도록, dc:date 만 풀어 쓴다. */
    static String tagName(String name) {
        return "dc:date".equals(name) ? "date" : name;
    }

    static String stripBom(String s) {
        s = s.trim();
        return s.startsWith("﻿") ? s.substring(1) : s;
    }

    static String clean(String s) {
        return android.text.Html.fromHtml(s, android.text.Html.FROM_HTML_MODE_LEGACY).toString()
                .replace("\uFFFC", "").replaceAll("\\s+", " ").trim();
    }

    static String summarize(String html) {
        String t = clean(html);
        return t.length() > 220 ? t.substring(0, 220).trim() + "…" : t;
    }

    static final String[] DATE_FORMATS = {
            "EEE, dd MMM yyyy HH:mm:ss zzz",
            "EEE, dd MMM yyyy HH:mm:ss Z",
            "EEE, d MMM yyyy HH:mm:ss zzz",
            "EEE, d MMM yyyy HH:mm:ss Z",
            "dd MMM yyyy HH:mm:ss zzz",
            "EEE, dd MMM yyyy HH:mm zzz",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd",
    };

    static long parseDate(String v) {
        if (v == null || v.isEmpty()) return 0;
        for (String f : DATE_FORMATS) {
            try {
                SimpleDateFormat fmt = new SimpleDateFormat(f, Locale.US);
                if (f.endsWith("'Z'")) fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
                fmt.setLenient(false);
                java.util.Date d = fmt.parse(v);
                if (d != null) return d.getTime();
            } catch (Exception ignored) {
            }
        }
        return 0;
    }

    // ── HTTP ─────────────────────────────────────────────────────────
    static String httpGet(String url) throws Exception {
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setInstanceFollowRedirects(true);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml, */*");
            c.setRequestProperty("Accept-Language", "ko,en;q=0.8");
            try {
                int code = c.getResponseCode();
                if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                    String loc = c.getHeaderField("Location");
                    if (loc == null) throw new java.io.IOException("HTTP " + code);
                    url = new URL(new URL(url), loc).toString(); // http↔https 이동도 따라간다
                    continue;
                }
                if (code != 200) throw new java.io.IOException("HTTP " + code);
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        bo.write(buf, 0, n);
                        if (bo.size() > 6 * 1024 * 1024) break;
                    }
                    return new String(bo.toByteArray(), StandardCharsets.UTF_8);
                }
            } finally {
                c.disconnect();
            }
        }
        throw new java.io.IOException("too many redirects");
    }
}
