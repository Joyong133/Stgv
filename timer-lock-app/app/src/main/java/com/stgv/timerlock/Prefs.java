package com.stgv.timerlock;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 설정 저장소.
 * <ul>
 *   <li>앱별 규칙: 0 = 제한 없음, 1/3/5 = 타이머(분), -1 = 화이트리스트(항상 허용)</li>
 *   <li>진행 중인 타이머의 종료 시각(앱을 나갔다 와도 남은 시간이 이어지도록)</li>
 * </ul>
 */
public final class Prefs {
    public static final int RULE_NONE = 0;
    public static final int RULE_WHITELIST = -1;
    public static final int[] DURATIONS = {1, 3, 5};

    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_STRICT = "strict";
    private static final String KEY_DEFAULT_MIN = "default_minutes";
    private static final String RULE_PREFIX = "rule_";
    private static final String END_PREFIX = "end_";

    private static Prefs instance;

    private final SharedPreferences rules;
    private final SharedPreferences state;

    private Prefs(Context context) {
        Context app = context.getApplicationContext();
        rules = app.getSharedPreferences("rules", Context.MODE_PRIVATE);
        state = app.getSharedPreferences("timer_state", Context.MODE_PRIVATE);
    }

    public static synchronized Prefs get(Context context) {
        if (instance == null) instance = new Prefs(context);
        return instance;
    }

    public boolean isEnabled() {
        return rules.getBoolean(KEY_ENABLED, true);
    }

    public void setEnabled(boolean on) {
        rules.edit().putBoolean(KEY_ENABLED, on).apply();
    }

    /** true 이면 화이트리스트를 제외한 모든 앱에 기본 타이머를 적용합니다. */
    public boolean isStrict() {
        return rules.getBoolean(KEY_STRICT, false);
    }

    public void setStrict(boolean on) {
        rules.edit().putBoolean(KEY_STRICT, on).apply();
    }

    public int getDefaultMinutes() {
        return rules.getInt(KEY_DEFAULT_MIN, 1);
    }

    public void setDefaultMinutes(int minutes) {
        rules.edit().putInt(KEY_DEFAULT_MIN, minutes).apply();
    }

    public int getRule(String pkg) {
        return rules.getInt(RULE_PREFIX + pkg, RULE_NONE);
    }

    public void setRule(String pkg, int rule) {
        SharedPreferences.Editor e = rules.edit();
        if (rule == RULE_NONE) e.remove(RULE_PREFIX + pkg);
        else e.putInt(RULE_PREFIX + pkg, rule);
        e.apply();
        // 규칙이 바뀌면 진행 중이던 타이머는 처음부터 다시 계산
        clearEnd(pkg);
    }

    /** 화이트리스트로 체크된 앱들의 패키지 이름 */
    public Set<String> getWhitelist() {
        Set<String> out = new HashSet<>();
        for (Map.Entry<String, ?> e : rules.getAll().entrySet()) {
            if (e.getKey().startsWith(RULE_PREFIX) && e.getValue() instanceof Integer
                    && (Integer) e.getValue() == RULE_WHITELIST) {
                out.add(e.getKey().substring(RULE_PREFIX.length()));
            }
        }
        return out;
    }

    public long getEnd(String pkg) {
        return state.getLong(END_PREFIX + pkg, 0L);
    }

    public void setEnd(String pkg, long endMillis) {
        state.edit().putLong(END_PREFIX + pkg, endMillis).apply();
    }

    public void clearEnd(String pkg) {
        state.edit().remove(END_PREFIX + pkg).apply();
    }
}
