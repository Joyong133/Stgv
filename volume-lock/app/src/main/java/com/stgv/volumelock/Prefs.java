package com.stgv.volumelock;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioManager;

/** 잠금 설정 저장소. 스트림마다 "최소 볼륨"을 저장하며, -1이면 그 스트림은 잠그지 않습니다. */
final class Prefs {
    static final int[] STREAMS = {
            AudioManager.STREAM_MUSIC,
            AudioManager.STREAM_RING,
            AudioManager.STREAM_NOTIFICATION,
            AudioManager.STREAM_ALARM,
            AudioManager.STREAM_VOICE_CALL,
    };
    static final String[] LABELS = {"미디어", "벨소리", "알림", "알람", "통화"};

    private static final String FILE = "volume_lock";
    private static final String KEY_ENABLED = "enabled";

    private Prefs() {}

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context c) {
        return sp(c).getBoolean(KEY_ENABLED, false);
    }

    static void setEnabled(Context c, boolean on) {
        sp(c).edit().putBoolean(KEY_ENABLED, on).apply();
    }

    /** 잠긴 최소 볼륨. 잠기지 않았으면 -1. 처음 실행 시에는 미디어만 잠금 대상입니다. */
    static int getFloor(Context c, int stream) {
        int def = stream == AudioManager.STREAM_MUSIC ? -2 : -1; // -2 = 현재 볼륨 사용
        int v = sp(c).getInt("floor_" + stream, def);
        if (v == -2) {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            v = am.getStreamVolume(stream);
        }
        return v;
    }

    static void setFloor(Context c, int stream, int floor) {
        sp(c).edit().putInt("floor_" + stream, floor).apply();
    }
}
