package com.stgv.warrisk;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 마지막 결과, 위험 지수 기록, 설정을 휴대폰에 저장한다. */
public class Store {
    static final String PREFS = "warrisk";
    static final int MAX_HISTORY = 120;
    static final int MAX_SAVED_ARTICLES = 200;

    public static final int[] INTERVAL_MINUTES = {30, 60, 180, 360};
    public static final String[] INTERVAL_NAMES = {"30분", "1시간", "3시간", "6시간"};

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ── 설정 ──────────────────────────────────────────────────────
    public static boolean autoEnabled(Context c) { return prefs(c).getBoolean("auto", true); }
    public static void setAutoEnabled(Context c, boolean v) { prefs(c).edit().putBoolean("auto", v).apply(); }

    public static int intervalIndex(Context c) { return prefs(c).getInt("interval", 1); }
    public static void setIntervalIndex(Context c, int v) { prefs(c).edit().putInt("interval", v).apply(); }

    /** 이 단계 이상이 되면 알림 (기본: 경계). */
    public static int alertLevel(Context c) { return prefs(c).getInt("alertLevel", RiskReport.LEVEL_ALERT); }
    public static void setAlertLevel(Context c, int v) { prefs(c).edit().putInt("alertLevel", v).apply(); }

    /** 기사 목록 필터: 0 전체, 1 위험 신호 기사만, 2 대사관 철수 소식만. */
    public static final int FILTER_ALL = 0, FILTER_RISKY = 1, FILTER_EMBASSY = 2;
    public static int filterMode(Context c) { return prefs(c).getInt("filter", FILTER_ALL); }
    public static void setFilterMode(Context c, int v) { prefs(c).edit().putInt("filter", v).apply(); }

    /** 새 나라의 대사관·자국민 철수 소식이 잡히면 알림 (기본: 켬). */
    public static boolean embassyAlert(Context c) { return prefs(c).getBoolean("embassyAlert", true); }
    public static void setEmbassyAlert(Context c, boolean v) { prefs(c).edit().putBoolean("embassyAlert", v).apply(); }

    public static boolean sortBySeverity(Context c) { return prefs(c).getBoolean("sortSev", false); }
    public static void setSortBySeverity(Context c, boolean v) { prefs(c).edit().putBoolean("sortSev", v).apply(); }

    // ── 결과 저장 ─────────────────────────────────────────────────
    public static synchronized void saveReport(Context c, RiskReport r) {
        try {
            JSONObject o = new JSONObject();
            o.put("checkedAt", r.checkedAt);
            o.put("score", r.score);
            o.put("level", r.level);
            o.put("total", r.totalArticles);
            o.put("risky", r.riskyArticles);
            o.put("sources", r.sourceCount);
            o.put("regions", r.regionCount);
            o.put("war", r.warProb);
            JSONArray wf = new JSONArray();
            for (RiskReport.OddsFactor f : r.warFactors) {
                JSONObject j = new JSONObject();
                j.put("n", f.name);
                j.put("m", f.multiplier);
                wf.put(j);
            }
            o.put("warFactors", wf);
            JSONArray emb = new JSONArray();
            for (RiskReport.EmbassyEvent e : r.embassyEvents) {
                JSONObject j = new JSONObject();
                j.put("ty", e.type);
                j.put("lo", e.location);
                j.put("co", e.country);
                j.put("n", e.articles);
                j.put("m", e.latestMs);
                j.put("t", e.title);
                j.put("u", e.url);
                emb.put(j);
            }
            o.put("embassy", emb);
            JSONArray sig = new JSONArray();
            for (RiskReport.SignalHit h : r.signals) {
                JSONObject s = new JSONObject();
                s.put("n", h.name);
                s.put("w", h.weight);
                s.put("a", h.articles);
                s.put("c", h.contribution);
                sig.put(s);
            }
            o.put("signals", sig);
            JSONArray arts = new JSONArray();
            for (int i = 0; i < r.articles.size() && i < MAX_SAVED_ARTICLES; i++) {
                Article a = r.articles.get(i);
                JSONObject j = new JSONObject();
                j.put("t", a.title);
                j.put("u", a.url);
                j.put("s", a.source);
                j.put("r", a.region);
                j.put("l", a.lang);
                j.put("v", a.via);
                j.put("m", a.timeMs);
                j.put("sc", a.score);
                j.put("tg", new JSONArray(a.tags));
                if (a.embassy != null) j.put("em", a.embassy);
                arts.put(j);
            }
            o.put("articles", arts);
            JSONArray err = new JSONArray(r.errors);
            o.put("errors", err);

            JSONArray hist = loadHistoryJson(c);
            JSONArray point = new JSONArray();
            point.put(r.checkedAt);
            point.put(r.score);
            hist.put(point);
            while (hist.length() > MAX_HISTORY) hist.remove(0);

            prefs(c).edit()
                    .putString("report", o.toString())
                    .putString("history", hist.toString())
                    .apply();
        } catch (Exception ignored) {
        }
    }

    public static synchronized RiskReport loadReport(Context c) {
        String s = prefs(c).getString("report", null);
        if (s == null) return null;
        try {
            JSONObject o = new JSONObject(s);
            RiskReport r = new RiskReport();
            r.checkedAt = o.optLong("checkedAt");
            r.score = o.optInt("score");
            r.level = o.optInt("level");
            r.totalArticles = o.optInt("total");
            r.riskyArticles = o.optInt("risky");
            r.sourceCount = o.optInt("sources");
            r.regionCount = o.optInt("regions");
            r.warProb = o.optDouble("war", WarOdds.baseProbability());
            JSONArray wf = o.optJSONArray("warFactors");
            if (wf != null) for (int i = 0; i < wf.length(); i++) {
                JSONObject j = wf.getJSONObject(i);
                r.warFactors.add(new RiskReport.OddsFactor(j.optString("n"), j.optDouble("m", 1)));
            }
            JSONArray emb = o.optJSONArray("embassy");
            if (emb != null) for (int i = 0; i < emb.length(); i++) {
                JSONObject j = emb.getJSONObject(i);
                RiskReport.EmbassyEvent e = new RiskReport.EmbassyEvent();
                e.type = j.optInt("ty");
                e.location = j.optString("lo");
                e.country = j.optString("co");
                e.articles = j.optInt("n");
                e.latestMs = j.optLong("m");
                e.title = j.optString("t");
                e.url = j.optString("u");
                r.embassyEvents.add(e);
            }
            JSONArray sig = o.optJSONArray("signals");
            if (sig != null) for (int i = 0; i < sig.length(); i++) {
                JSONObject h = sig.getJSONObject(i);
                r.signals.add(new RiskReport.SignalHit(h.optString("n"), h.optInt("w"),
                        h.optInt("a"), h.optDouble("c")));
            }
            JSONArray arts = o.optJSONArray("articles");
            if (arts != null) for (int i = 0; i < arts.length(); i++) {
                JSONObject j = arts.getJSONObject(i);
                Article a = new Article(j.optString("t"), j.optString("u"), j.optString("s"),
                        j.optString("r"), j.optString("l"), j.optString("v"), j.optLong("m"));
                a.score = j.optInt("sc");
                JSONArray tg = j.optJSONArray("tg");
                if (tg != null) for (int k = 0; k < tg.length(); k++) a.tags.add(tg.optString(k));
                if (j.has("em")) a.embassy = j.optString("em");
                r.articles.add(a);
            }
            JSONArray err = o.optJSONArray("errors");
            if (err != null) for (int i = 0; i < err.length(); i++) r.errors.add(err.optString(i));
            return r;
        } catch (Exception e) {
            return null;
        }
    }

    static JSONArray loadHistoryJson(Context c) {
        try {
            return new JSONArray(prefs(c).getString("history", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** [시각, 점수] 목록 (오래된 것부터). */
    public static List<long[]> loadHistory(Context c) {
        List<long[]> out = new ArrayList<>();
        JSONArray h = loadHistoryJson(c);
        for (int i = 0; i < h.length(); i++) {
            JSONArray p = h.optJSONArray(i);
            if (p != null) out.add(new long[]{p.optLong(0), p.optLong(1)});
        }
        return out;
    }

    // ── 알림 상태 ─────────────────────────────────────────────────
    public static int lastNotifiedLevel(Context c) { return prefs(c).getInt("lastNotified", -1); }
    public static void setLastNotifiedLevel(Context c, int v) { prefs(c).edit().putInt("lastNotified", v).apply(); }

    /** 이미 알린 철수 소식 (유형|장소|나라). */
    public static Set<String> notifiedEmbassy(Context c) {
        return new HashSet<>(prefs(c).getStringSet("notifiedEmbassy", new HashSet<>()));
    }
    public static void setNotifiedEmbassy(Context c, Set<String> v) {
        prefs(c).edit().putStringSet("notifiedEmbassy", new HashSet<>(v)).apply();
    }
}
