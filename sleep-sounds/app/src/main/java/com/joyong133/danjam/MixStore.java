package com.joyong133.danjam;

import android.content.Context;
import android.content.SharedPreferences;

import com.joyong133.danjam.audio.Place;
import com.joyong133.danjam.audio.SoundCatalog;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 마지막으로 듣던 조합, 사용자가 저장한 믹스, 소리 설정(3D·음량·톤 등)을 기기에 보관한다. */
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

    void renameSaved(int index, String name) {
        List<Saved> list = loadSaved();
        if (index >= 0 && index < list.size()) {
            list.set(index, new Saved(name, list.get(index).mix));
            writeSaved(list);
        }
    }

    /** 저장한 믹스를 지금 듣는 조합으로 바꾼다. */
    void replaceSaved(int index, Map<String, Integer> mix) {
        List<Saved> list = loadSaved();
        if (index >= 0 && index < list.size()) {
            list.set(index, new Saved(list.get(index).name, new LinkedHashMap<>(mix)));
            writeSaved(list);
        }
    }

    // ---- 소리 설정 ----

    static final int SPACE_AUTO = 0, SPACE_ON = 1, SPACE_OFF = 2;

    /** 3D 공간 음향: 자동(이어폰 연결 시) / 켜기 / 끄기 */
    int spaceMode() {
        return prefs.getInt("space_mode", SPACE_AUTO);
    }

    void setSpaceMode(int m) {
        prefs.edit().putInt("space_mode", m).apply();
    }

    /** 움직임: 0 멈춤, 1 살랑살랑, 2 감싸기 */
    int motion() {
        return prefs.getInt("motion", 1);
    }

    void setMotion(int m) {
        prefs.edit().putInt("motion", m).apply();
    }

    /** 공간감 0~100 */
    int room() {
        return prefs.getInt("room", 50);
    }

    void setRoom(int v) {
        prefs.edit().putInt("room", v).apply();
    }

    /** 전체 음량 0~100 */
    int volume() {
        return prefs.getInt("volume", 100);
    }

    void setVolume(int v) {
        prefs.edit().putInt("volume", v).apply();
    }

    /** 톤 0(부드럽게)~50(그대로)~100(선명하게) */
    int tone() {
        return prefs.getInt("tone", 50);
    }

    void setTone(int v) {
        prefs.edit().putInt("tone", v).apply();
    }

    boolean natural() {
        return prefs.getBoolean("natural", false);
    }

    void setNatural(boolean on) {
        prefs.edit().putBoolean("natural", on).apply();
    }

    /** 타이머가 끝날 때 소리를 줄이는 시간 (분) */
    int fadeMinutes() {
        return prefs.getInt("fade_minutes", 5);
    }

    void setFadeMinutes(int m) {
        prefs.edit().putInt("fade_minutes", m).apply();
    }

    /** 사용자가 옮긴 3D 자리. 옮긴 적이 없으면 null. */
    Place place(String id) {
        String v = prefs.getString("place_" + id, null);
        SoundCatalog.Sound s = SoundCatalog.get(id);
        if (v == null || s == null) return null;
        String[] p = v.split(",");
        try {
            return s.place.withAzDist(Float.parseFloat(p[0]), Float.parseFloat(p[1]));
        } catch (RuntimeException e) {
            return null;
        }
    }

    void setPlace(String id, Place p) {
        if (p == null) prefs.edit().remove("place_" + id).apply();
        else prefs.edit().putString("place_" + id, p.az + "," + p.dist).apply();
    }

    void clearPlaces() {
        SharedPreferences.Editor e = prefs.edit();
        for (String k : prefs.getAll().keySet()) if (k.startsWith("place_")) e.remove(k);
        e.apply();
    }

    boolean askedNotificationPermission() {
        return prefs.getBoolean("asked_notifications", false);
    }

    void setAskedNotificationPermission() {
        prefs.edit().putBoolean("asked_notifications", true).apply();
    }
}
