package com.stgv.volumelock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.database.ContentObserver;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;

/**
 * 볼륨이 설정한 최소값 아래로 내려가면 즉시 되돌리는 포그라운드 서비스.
 * 볼륨 버튼, 알림창 슬라이더, 다른 앱이 볼륨을 낮추는 경우 모두 되돌립니다.
 */
public class VolumeLockService extends Service {
    private static final String CHANNEL_ID = "volume_lock";
    private static final int NOTIFICATION_ID = 1;
    private static final long POLL_MS = 500;

    private AudioManager audio;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final ContentObserver observer = new ContentObserver(handler) {
        @Override
        public void onChange(boolean selfChange) {
            enforce();
        }
    };

    private final BroadcastReceiver volumeReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            enforce();
        }
    };

    // 일부 기기는 볼륨 변경 시 설정 변경 알림을 보내지 않으므로 주기적으로도 확인합니다.
    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            enforce();
            handler.postDelayed(this, POLL_MS);
        }
    };

    static void start(Context c) {
        Intent i = new Intent(c, VolumeLockService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            c.startForegroundService(i);
        } else {
            c.startService(i);
        }
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, VolumeLockService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        startInForeground();

        getContentResolver().registerContentObserver(Settings.System.CONTENT_URI, true, observer);
        IntentFilter f = new IntentFilter();
        f.addAction("android.media.VOLUME_CHANGED_ACTION");
        f.addAction("android.media.STREAM_MUTE_CHANGED_ACTION");
        f.addAction(AudioManager.RINGER_MODE_CHANGED_ACTION);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(volumeReceiver, f, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(volumeReceiver, f);
        }
        handler.post(poll);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!Prefs.isEnabled(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        enforce();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        getContentResolver().unregisterContentObserver(observer);
        try {
            unregisterReceiver(volumeReceiver);
        } catch (IllegalArgumentException ignored) {
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void enforce() {
        if (!Prefs.isEnabled(this)) return;
        boolean ringLocked = false;
        for (int stream : Prefs.STREAMS) {
            int floor = Prefs.getFloor(this, stream);
            if (floor < 0) continue;
            if (stream == AudioManager.STREAM_RING && floor > 0) ringLocked = true;
            try {
                if (Build.VERSION.SDK_INT >= 23 && floor > 0 && audio.isStreamMute(stream)) {
                    audio.adjustStreamVolume(stream, AudioManager.ADJUST_UNMUTE, 0);
                }
                if (audio.getStreamVolume(stream) < floor) {
                    audio.setStreamVolume(stream, floor, 0);
                }
            } catch (SecurityException ignored) {
                // 방해 금지 모드에서는 '방해 금지 권한'이 없으면 벨소리/알림을 바꿀 수 없습니다.
            }
        }
        if (ringLocked && audio.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) {
            try {
                audio.setRingerMode(AudioManager.RINGER_MODE_NORMAL);
            } catch (SecurityException ignored) {
            }
        }
    }

    private void startInForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "볼륨 잠금", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        Notification n = b.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle("볼륨 잠금 작동 중")
                .setContentText("설정한 볼륨 아래로 내려가지 않습니다")
                .setContentIntent(open)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }
}
