package com.stgv.timehider;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.service.quicksettings.TileService;

/** 설정값 저장소. 화면·접근성 서비스·빠른 설정 타일이 모두 이 값을 보고 움직인다. */
final class Prefs {
    static final String KEY_ENABLED = "enabled";
    static final String KEY_UNTIL = "until";
    static final String KEY_DURATION_MIN = "duration_min";
    static final String KEY_MASK_STATUS_BAR = "mask_status_bar";
    static final String KEY_MASK_TIME_TEXT = "mask_time_text";
    static final String KEY_MASK_LOCK_TOP = "mask_lock_top";
    static final String KEY_LOCK_TOP_PERCENT = "lock_top_percent";

    static final boolean DEFAULT_MASK_STATUS_BAR = true;
    static final boolean DEFAULT_MASK_TIME_TEXT = true;
    static final boolean DEFAULT_MASK_LOCK_TOP = true;
    static final int DEFAULT_LOCK_TOP_PERCENT = 35;
    /** 화면이 꺼져 있을 때(AOD) 가릴 비율. 아래쪽 지문 센서 자리는 남겨 둔다. */
    static final int SCREEN_OFF_TOP_PERCENT = 70;

    private Prefs() {}

    static SharedPreferences get(Context c) {
        return c.getSharedPreferences("time_hider", Context.MODE_PRIVATE);
    }

    /** 숨기기가 켜져 있고, 정해 둔 시간이 아직 안 지났는지. */
    static boolean isActive(SharedPreferences p) {
        return p.getBoolean(KEY_ENABLED, false) && !isExpired(p);
    }

    /** 켜져 있지만 정해 둔 시간이 지나서 꺼야 하는지. */
    static boolean isExpired(SharedPreferences p) {
        long until = p.getLong(KEY_UNTIL, 0);
        return p.getBoolean(KEY_ENABLED, false) && until > 0 && System.currentTimeMillis() >= until;
    }

    static boolean hasTimer(SharedPreferences p) {
        return p.getLong(KEY_UNTIL, 0) > 0;
    }

    static void start(Context c) {
        SharedPreferences p = get(c);
        int minutes = p.getInt(KEY_DURATION_MIN, 0);
        long until = minutes > 0 ? System.currentTimeMillis() + minutes * 60_000L : 0;
        p.edit().putBoolean(KEY_ENABLED, true).putLong(KEY_UNTIL, until).apply();
        updateTile(c);
    }

    static void stop(Context c) {
        get(c).edit().putBoolean(KEY_ENABLED, false).putLong(KEY_UNTIL, 0).apply();
        updateTile(c);
    }

    /** 접근성 설정에서 이 앱의 서비스가 켜져 있는지. */
    static boolean isServiceEnabled(Context c) {
        String enabled = Settings.Secure.getString(
                c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null || enabled.isEmpty()) return false;
        ComponentName mine = new ComponentName(c, TimeHideService.class);
        for (String s : enabled.split(":")) {
            if (mine.equals(ComponentName.unflattenFromString(s))) return true;
        }
        return false;
    }

    static void updateTile(Context c) {
        try {
            TileService.requestListeningState(c, new ComponentName(c, HideTileService.class));
        } catch (RuntimeException ignored) {
            // 타일을 추가하지 않은 경우 등
        }
    }
}
