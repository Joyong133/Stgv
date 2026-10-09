package com.joyong133.danjam;

import android.content.Context;
import android.content.SharedPreferences;

import com.joyong133.danjam.audio.SoundCatalog;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 마지막으로 듣던 조합과 사용자가 저장한 믹스를 기기에 보관한다. */
final class MixStore {
    private static final String PREFS = "danjam";
    private static final String CURRENT = "current_mix";
    private static final String SAVED = "saved_mixes";

    static final class Saved {
        final String name;
        final LinkedHashMap<String, Integer> mix;

        Saved(String name, LinkedHashMap<String, Integer> mix) {
            this.name = name;
            this.mix = mix;
        }
    }

    private final SharedPreferences prefs;

    MixStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** "id:음량,id:음량" 형식 */
    static String encode(Map<String, Integer> mix) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Integer> e : mix.entrySet()) {
            if (sb.length() > 0) sb.append(',');
            sb.append(e.getKey()).append(':').append(e.getValue());
        }
        return sb.toString();
    }

    static LinkedHashMap<String, Integer> decode(String s) {
        LinkedHashMap<String, Integer> mix = new LinkedHashMap<>();
        if (s == null || s.isEmpty()) return mix;
        for (String part : s.split(",")) {
            int c = part.indexOf(':');
            if (c <= 0) continue;
            String id = part.substring(0, c);
            if (SoundCatalog.get(id) == null) continue;
            try {
                mix.put(id, Math.max(0, Math.min(100, Integer.parseInt(part.substring(c + 1)))));
            } catch (NumberFormatException ignored) {
            }
        }
        return mix;
    }

    LinkedHashMap<String, Integer> loadCurrent() {
        return decode(prefs.getString(CURRENT, ""));
    }

    void saveCurrent(Map<String, Integer> mix) {
        prefs.edit().putString(CURRENT, encode(mix)).apply();
    }

    List<Saved> loadSaved() {
        List<Saved> list = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs.getString(SAVED, "[]"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                LinkedHashMap<String, Integer> mix = decode(o.optString("mix"));
                if (!mix.isEmpty()) list.add(new Saved(o.optString("name", "내 믹스"), mix));
            }
        } catch (JSONException ignored) {
        }
        return list;
    }

    private void writeSaved(List<Saved> list) {
        JSONArray a = new JSONArray();
        try {
            for (Saved s : list) a.put(new JSONObject().put("name", s.name).put("mix", encode(s.mix)));
        } catch (JSONException ignored) {
        }
        prefs.edit().putString(SAVED, a.toString()).apply();
    }

    void addSaved(String name, Map<String, Integer> mix) {
        List<Saved> list = loadSaved();
        list.add(0, new Saved(name, new LinkedHashMap<>(mix)));
        writeSaved(list);
    }

    void deleteSaved(int index) {
        List<Saved> list = loadSaved();
        if (index >= 0 && index < list.size()) {
            list.remove(index);
            writeSaved(list);
        }
    }

    boolean askedNotificationPermission() {
        return prefs.getBoolean("asked_notifications", false);
    }

    void setAskedNotificationPermission() {
        prefs.edit().putBoolean("asked_notifications", true).apply();
    }
}
