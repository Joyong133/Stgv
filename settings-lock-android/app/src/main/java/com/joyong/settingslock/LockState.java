package com.joyong.settingslock;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.text.TextUtils;

/** 잠금 종료 시각과 옵션을 저장한다. 재부팅해도 유지된다. */
final class LockState {
    private static final String PREFS = "lock";
    private static final String KEY_END_AT = "end_at";
    private static final String KEY_BLOCK_UNINSTALL = "block_uninstall";
    private static final String KEY_APPS_ONLY = "apps_only";
    private static final String KEY_CAMERA_LOCKSCREEN = "camera_lockscreen";
    private static final String KEY_CAMERA_ALWAYS = "camera_always";
    private static final String KEY_PLAY_STORE = "block_play_store";
    private static final String KEY_KAKAO_BROWSER = "block_kakao_browser";

    private LockState() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static long endAt(Context c) {
        return prefs(c).getLong(KEY_END_AT, 0L);
    }

    static long remainingMs(Context c) {
        return Math.max(0L, endAt(c) - System.currentTimeMillis());
    }

    static boolean isLocked(Context c) {
        return remainingMs(c) > 0;
    }

    /** 시간 잠금 때 설정 전체 대신 애플리케이션 설정만 막을지. */
    static boolean appsOnly(Context c) {
        return prefs(c).getBoolean(KEY_APPS_ONLY, false);
    }

    static boolean blockUninstall(Context c) {
        return prefs(c).getBoolean(KEY_BLOCK_UNINSTALL, true);
    }

    /** 잠금화면(휴대폰이 잠긴 상태)에서 카메라를 막을지. 시간 잠금과 따로 작동한다. */
    static boolean blockCameraOnLockScreen(Context c) {
        return prefs(c).getBoolean(KEY_CAMERA_LOCKSCREEN, false);
    }

    /** 잠금을 푼 상태에서도 카메라 앱을 막을지. */
    static boolean blockCameraAlways(Context c) {
        return prefs(c).getBoolean(KEY_CAMERA_ALWAYS, false);
    }

    static void setBlockCamera(Context c, boolean onLockScreen, boolean always) {
        prefs(c).edit()
                .putBoolean(KEY_CAMERA_LOCKSCREEN, onLockScreen)
                .putBoolean(KEY_CAMERA_ALWAYS, always)
                .commit();
    }

    /** Play 스토어를 막을지. 시간 잠금과 따로 작동한다. */
    static boolean blockPlayStore(Context c) {
        return prefs(c).getBoolean(KEY_PLAY_STORE, false);
    }

    static void setBlockPlayStore(Context c, boolean block) {
        prefs(c).edit().putBoolean(KEY_PLAY_STORE, block).commit();
    }

    /** 카카오톡 인앱 브라우저를 막을지. 시간 잠금과 따로 작동한다. */
    static boolean blockKakaoBrowser(Context c) {
        return prefs(c).getBoolean(KEY_KAKAO_BROWSER, false);
    }

    static void setBlockKakaoBrowser(Context c, boolean block) {
        prefs(c).edit().putBoolean(KEY_KAKAO_BROWSER, block).commit();
    }

    /** 잠금을 시작하거나, 이미 잠겨 있으면 남은 시간에 더한다. 줄이는 방법은 없다. */
    static void addLock(Context c, long durationMs, boolean blockUninstall, boolean appsOnly) {
        long base = Math.max(System.currentTimeMillis(), endAt(c));
        SharedPreferences.Editor e = prefs(c).edit().putLong(KEY_END_AT, base + durationMs);
        if (!isLocked(c)) {
            // 삭제 막기 · 애플리케이션 설정만 잠그기는 잠금을 새로 시작할 때만 바꿀 수 있다.
            e.putBoolean(KEY_BLOCK_UNINSTALL, blockUninstall);
            e.putBoolean(KEY_APPS_ONLY, appsOnly);
        }
        e.commit();
    }

    static boolean isServiceEnabled(Context c) {
        String enabled = Settings.Secure.getString(c.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        ComponentName me = new ComponentName(c, LockService.class);
        TextUtils.SimpleStringSplitter split = new TextUtils.SimpleStringSplitter(':');
        split.setString(enabled);
        for (String s : split) {
            ComponentName cn = ComponentName.unflattenFromString(s);
            if (me.equals(cn)) return true;
        }
        return false;
    }

    /** 남은 시간을 "1시간 5분 3초" 형태로 만든다. */
    static String formatDuration(long ms) {
        long total = (ms + 999) / 1000;
        long d = total / 86400, h = (total % 86400) / 3600, m = (total % 3600) / 60, s = total % 60;
        StringBuilder b = new StringBuilder();
        if (d > 0) b.append(d).append("일 ");
        if (d > 0 || h > 0) b.append(h).append("시간 ");
        if (d > 0 || h > 0 || m > 0) b.append(m).append("분 ");
        b.append(s).append("초");
        return b.toString();
    }
}
