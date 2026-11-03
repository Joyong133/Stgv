package com.stgv.ainews;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 마지막으로 받은 기사 목록 · 설정 · 이미 알린 기사 기록. */
public class Store {
    static final String PREFS = "ainews";
    static final String CACHE_FILE = "news_cache.json";

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ── 기사 캐시 (앱을 열면 바로 보이도록) ──
    static synchronized void saveNews(Context c, List<NewsItem> items) {
        try {
            JSONArray arr = new JSONArray();
            for (NewsItem n : items) arr.put(n.toJson());
            File tmp = new File(c.getFilesDir(), CACHE_FILE + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(arr.toString().getBytes(StandardCharsets.UTF_8));
            }
            tmp.renameTo(new File(c.getFilesDir(), CACHE_FILE));
            prefs(c).edit().putLong("updated", System.currentTimeMillis()).apply();
        } catch (Exception ignored) {
        }
    }

    static synchronized List<NewsItem> loadNews(Context c) {
        List<NewsItem> out = new ArrayList<>();
        File f = new File(c.getFilesDir(), CACHE_FILE);
        if (!f.exists()) return out;
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[(int) f.length()];
            int off = 0, n;
            while (off < buf.length && (n = in.read(buf, off, buf.length - off)) > 0) off += n;
            JSONArray arr = new JSONArray(new String(buf, 0, off, StandardCharsets.UTF_8));
            for (int i = 0; i < arr.length(); i++) out.add(NewsItem.fromJson(arr.getJSONObject(i)));
        } catch (Exception ignored) {
        }
        return out;
    }

    static long updatedAt(Context c) {
        return prefs(c).getLong("updated", 0);
    }

    // ── 설정 ──
    static boolean notifyEnabled(Context c) {
        return prefs(c).getBoolean("notify", true);
    }

    static void setNotifyEnabled(Context c, boolean on) {
        prefs(c).edit().putBoolean("notify", on).apply();
    }

    static int getInt(Context c, String key, int def) {
        return prefs(c).getInt(key, def);
    }

    static void putInt(Context c, String key, int v) {
        prefs(c).edit().putInt(key, v).apply();
    }

    static boolean getBool(Context c, String key, boolean def) {
        return prefs(c).getBoolean(key, def);
    }

    static void putBool(Context c, String key, boolean v) {
        prefs(c).edit().putBoolean(key, v).apply();
    }

    // ── 이미 본 · 알린 출시 소식 ──
    static synchronized Set<String> seen(Context c) {
        return new HashSet<>(prefs(c).getStringSet("seen", new HashSet<>()));
    }

    static synchronized boolean hasSeenBaseline(Context c) {
        return prefs(c).getBoolean("seen_init", false);
    }

    /** 현재 목록의 출시 소식을 모두 '본 것'으로 기록 (너무 커지지 않게 지금 목록 기준으로 정리). */
    static synchronized void markSeen(Context c, List<NewsItem> items) {
        Set<String> keep = new HashSet<>();
        for (NewsItem n : items) if (n.release) keep.add(n.key());
        prefs(c).edit().putStringSet("seen", keep).putBoolean("seen_init", true).apply();
    }
}
