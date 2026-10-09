package com.joyong133.danjam;

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
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import com.joyong133.danjam.audio.Place;
import com.joyong133.danjam.audio.SoundCatalog;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 화면이 꺼져도 소리가 계속 나도록 재생을 맡는 서비스.
 * 지금 켜 둔 소리 조합, 재생/일시정지, 잠들기 타이머, 알림과 잠금화면 컨트롤,
 * 3D 공간 음향(이어폰을 꽂으면 자동으로 켜짐)과 소리 설정, 호흡 안내 소리를 관리한다.
 * 모든 메서드는 메인 스레드에서 호출한다.
 */
public final class SoundService extends Service implements AudioManager.OnAudioFocusChangeListener {
    static final String ACTION_TOGGLE = "com.joyong133.danjam.action.TOGGLE";
    static final String ACTION_STOP = "com.joyong133.danjam.action.STOP";
    static final int DEFAULT_VOLUME = 70;

    private static final String TAG = "SoundService";
    private static final String CHANNEL = "playback";
    private static final int NOTIFICATION_ID = 1;
    private static final float DUCK = 0.3f;

    interface Listener {
        /** 켜진 소리, 재생 상태, 타이머 설정이 바뀌었다 */
        void onStateChanged();

        /** 타이머 남은 시간이 줄었다 (1초마다) */
        void onTimerTick();
    }

    final class LocalBinder extends Binder {
        SoundService service() {
            return SoundService.this;
        }
    }

    private final IBinder binder = new LocalBinder();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final LinkedHashMap<String, Integer> mix = new LinkedHashMap<>();
    private final List<Listener> listeners = new ArrayList<>();
    private AudioEngine engine;
    private MixStore store;
    private AudioManager audio;
    private NotificationManager notifications;
    private AudioFocusRequest focusRequest;
    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private boolean playing, foreground, notificationShown, noisyRegistered, resumeOnFocus, ducked, fading;
    private boolean headphones;
    /** 호흡 안내 소리 채널 id (꺼져 있으면 null) */
    private String breathId;
    private AudioDeviceCallback deviceCallback;
    /** SystemClock.elapsedRealtime 기준 타이머 종료 시각, 0이면 타이머 없음 */
    private long timerEnd;
    private long lastNotifiedMinute = -1;

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            // 이어폰을 뽑으면 스피커로 갑자기 크게 나오지 않도록 멈춘다
            pause();
        }
    };

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            onTick();
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        store = new MixStore(this);
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        notifications = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        engine = new AudioEngine();
        engine.start();
        mix.putAll(store.loadCurrent());
        // 소리 설정과 사용자가 옮겨 둔 3D 자리를 먼저 알려 준다
        for (SoundCatalog.Sound s : SoundCatalog.ALL) {
            Place p = store.place(s.id);
            if (p != null) engine.place(s.id, p);
        }
        engine.volume(store.volume() / 100f);
        engine.tone(toneOf(store.tone()));
        engine.room(store.room() / 100f);
        engine.motion(store.motion());
        engine.natural(store.natural());
        headphones = detectHeadphones();
        engine.spatial(spatialActive());
        deviceCallback = new AudioDeviceCallback() {
            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
                onDevicesChanged();
            }

            @Override
            public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
                onDevicesChanged();
            }
        };
        audio.registerAudioDeviceCallback(deviceCallback, handler);
        for (Map.Entry<String, Integer> e : mix.entrySet()) engine.set(e.getKey(), gain(e.getKey(), e.getValue()), 0f);

        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW);
            ch.setDescription(getString(R.string.channel_description));
            ch.setShowBadge(false);
            notifications.createNotificationChannel(ch);
        }
        session = new MediaSession(this, "danjam");
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                play();
            }

            @Override
            public void onPause() {
                pause();
            }

            @Override
            public void onStop() {
                stopPlayback();
            }
        });
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "danjam:playback");
        wakeLock.setReferenceCounted(false);
        updateSession();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_TOGGLE.equals(action)) {
            if (playing) pause();
            else play();
        } else if (ACTION_STOP.equals(action)) {
            stopPlayback();
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (!playing) stopPlayback();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        audio.unregisterAudioDeviceCallback(deviceCallback);
        engine.release();
        session.release();
        if (wakeLock.isHeld()) wakeLock.release();
        unregisterNoisy();
        abandonFocus();
        notifications.cancel(NOTIFICATION_ID);
        super.onDestroy();
    }

    // ---- 상태 ----

    void addListener(Listener l) {
        if (!listeners.contains(l)) listeners.add(l);
    }

    void removeListener(Listener l) {
        listeners.remove(l);
    }

    /** 켜 둔 소리와 음량(0~100). 순서는 켠 순서. */
    Map<String, Integer> mix() {
        return Collections.unmodifiableMap(mix);
    }

    boolean isPlaying() {
        return playing;
    }

    /** 타이머 남은 시간(ms). 타이머가 없으면 0. */
    long timerRemaining() {
        return timerEnd == 0 ? 0 : Math.max(0, timerEnd - SystemClock.elapsedRealtime());
    }

    static float gain(String id, int volume) {
        SoundCatalog.Sound s = SoundCatalog.get(id);
        float v = volume / 100f;
        return s == null ? 0f : s.trim() * v * v;
    }

    // ---- 조작 ----

    /** 소리 하나를 켜거나 끈다. 켤 때 재생 중이 아니면 재생을 시작한다. */
    void toggle(String id) {
        if (mix.containsKey(id)) {
            mix.remove(id);
            engine.remove(id, 1.2f);
            if (mix.isEmpty() && breathId == null) pause();
        } else {
            mix.put(id, DEFAULT_VOLUME);
            engine.set(id, gain(id, DEFAULT_VOLUME), 1.5f);
            if (!playing) play();
        }
        changed();
    }

    /** 음량 조절 (슬라이더를 끄는 동안 자주 불린다). 저장은 {@link #persist()} 에서. */
    void setVolume(String id, int volume) {
        if (!mix.containsKey(id)) return;
        mix.put(id, volume);
        engine.set(id, gain(id, volume), 0.08f);
    }

    void persist() {
        store.saveCurrent(mix);
    }

    /** 조합을 통째로 바꾸고 재생한다 (추천 믹스, 저장한 믹스). */
    void applyMix(Map<String, Integer> next) {
        for (String id : mix.keySet()) if (!next.containsKey(id)) engine.remove(id, 1.5f);
        mix.clear();
        mix.putAll(next);
        for (Map.Entry<String, Integer> e : mix.entrySet()) engine.set(e.getKey(), gain(e.getKey(), e.getValue()), 1.5f);
        changed();
        play();
    }

    /** 모든 소리를 끈다. */
    void clear() {
        for (String id : mix.keySet()) engine.remove(id, 1f);
        mix.clear();
        if (breathId == null) pause();
        changed();
    }

    void play() {
        if (mix.isEmpty() && breathId == null) return;
        if (!requestFocus()) {
            Log.w(TAG, "오디오 포커스를 받지 못해 재생하지 않음");
            return;
        }
        playing = true;
        resumeOnFocus = false;
        ducked = false;
        if (timerEnd != 0 && timerRemaining() <= 0) timerEnd = 0;
        fading = false;
        engine.master(1f, 1.5f);
        if (!wakeLock.isHeld()) wakeLock.acquire(12 * 60 * 60 * 1000L);
        registerNoisy();
        goForeground();
        handler.removeCallbacks(tick);
        if (timerEnd != 0) handler.post(tick);
        changed();
    }

    void pause() {
        pause(false);
    }

    /** keepForeground: 전화처럼 잠깐 멈췄다 다시 재생할 때는 포그라운드를 유지한다. */
    private void pause(boolean keepForeground) {
        boolean was = playing;
        playing = false;
        engine.master(0f, 0.6f);
        if (wakeLock.isHeld()) wakeLock.release();
        unregisterNoisy();
        if (!keepForeground) {
            resumeOnFocus = false;
            abandonFocus();
            leaveForeground(false);
        }
        if (was) changed();
    }

    /** 재생을 멈추고 알림까지 없앤다. 화면이 없으면 서비스도 끝난다. */
    void stopPlayback() {
        pause();
        timerEnd = 0;
        fading = false;
        handler.removeCallbacks(tick);
        leaveForeground(true);
        changed();
        stopSelf();
    }

    /** 잠들기 타이머. minutes 가 0 이면 끈다. */
    void setTimer(int minutes) {
        timerEnd = minutes > 0 ? SystemClock.elapsedRealtime() + minutes * 60_000L : 0;
        if (fading && playing) engine.master(1f, 1.5f);
        fading = false;
        lastNotifiedMinute = -1;
        handler.removeCallbacks(tick);
        if (timerEnd != 0) handler.post(tick);
        changed();
    }

    private void onTick() {
        if (timerEnd == 0) return;
        long left = timerEnd - SystemClock.elapsedRealtime();
        if (left <= 0) {
            timerEnd = 0;
            stopPlayback();
            return;
        }
        if (playing && !fading && left <= store.fadeMinutes() * 60_000L) {
            fading = true;
            engine.master(0f, left / 1000f);
        }
        long minute = (left + 59_999) / 60_000;
        if (minute != lastNotifiedMinute) {
            lastNotifiedMinute = minute;
            updateNotification();
        }
        for (Listener l : new ArrayList<>(listeners)) l.onTimerTick();
        handler.postDelayed(tick, Math.max(50, left % 1000));
    }

    private void changed() {
        store.saveCurrent(mix);
        updateNotification();
        updateSession();
        for (Listener l : new ArrayList<>(listeners)) l.onStateChanged();
    }

    // ---- 3D 공간 음향과 소리 설정 ----

    private static float toneOf(int v) {
        return (v - 50) / 50f;
    }

    private boolean detectHeadphones() {
        for (AudioDeviceInfo d : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            switch (d.getType()) {
                case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
                case AudioDeviceInfo.TYPE_USB_HEADSET:
                case AudioDeviceInfo.TYPE_HEARING_AID:
                case AudioDeviceInfo.TYPE_BLE_HEADSET:
                    return true;
                default:
                    break;
            }
        }
        return false;
    }

    private void onDevicesChanged() {
        boolean now = detectHeadphones();
        if (now == headphones) return;
        headphones = now;
        engine.spatial(spatialActive());
        changed();
    }

    /** 이어폰(유선·블루투스)이 연결되어 있는지 */
    boolean headphones() {
        return headphones;
    }

    /** 지금 3D 로 들리고 있는지 */
    boolean spatialActive() {
        int m = store.spaceMode();
        return m == MixStore.SPACE_ON || (m == MixStore.SPACE_AUTO && headphones);
    }

    int spaceMode() {
        return store.spaceMode();
    }

    void setSpaceMode(int m) {
        store.setSpaceMode(m);
        engine.spatial(spatialActive());
        changed();
    }

    int motion() {
        return store.motion();
    }

    void setMotion(int m) {
        store.setMotion(m);
        engine.motion(m);
    }

    int room() {
        return store.room();
    }

    void setRoom(int v) {
        store.setRoom(v);
        engine.room(v / 100f);
    }

    int volume() {
        return store.volume();
    }

    void setVolume(int v) {
        store.setVolume(v);
        engine.volume(v / 100f);
    }

    int tone() {
        return store.tone();
    }

    void setTone(int v) {
        store.setTone(v);
        engine.tone(toneOf(v));
    }

    boolean natural() {
        return store.natural();
    }

    void setNatural(boolean on) {
        store.setNatural(on);
        engine.natural(on);
    }

    int fadeMinutes() {
        return store.fadeMinutes();
    }

    void setFadeMinutes(int m) {
        store.setFadeMinutes(m);
    }

    /** 소리의 지금 3D 자리 (옮긴 적이 없으면 기본 자리) */
    Place placeOf(String id) {
        Place p = store.place(id);
        SoundCatalog.Sound s = SoundCatalog.get(id);
        return p != null ? p : s == null ? null : s.place;
    }

    /** 3D 자리를 옮긴다. save 가 false 면 끄는 동안처럼 소리만 바꾸고 저장은 나중에. */
    void movePlace(String id, float az, float dist, boolean save) {
        SoundCatalog.Sound s = SoundCatalog.get(id);
        if (s == null) return;
        Place p = s.place.withAzDist(az, dist);
        engine.place(id, p);
        if (save) store.setPlace(id, p);
    }

    void resetPlace(String id) {
        store.setPlace(id, null);
        engine.place(id, null);
    }

    void resetAllPlaces() {
        store.clearPlaces();
        for (SoundCatalog.Sound s : SoundCatalog.ALL) engine.place(s.id, null);
    }

    // ---- 호흡 안내 ----

    /** 호흡 안내 소리를 켠다. spec: 들이쉬기,멈추기,내쉬기,멈추기 (초) */
    void startBreath(String spec) {
        stopBreath();
        breathId = "breath:" + spec;
        // 기본 음량의 다른 소리보다 3~4dB 작게: 빗소리 위로도 숨결이 들리도록
        engine.set(breathId, 1.05f, 0.3f);
        if (!playing) play();
        changed();
    }

    void stopBreath() {
        if (breathId == null) return;
        engine.remove(breathId, 1f);
        breathId = null;
        if (mix.isEmpty() && playing) pause();
        changed();
    }

    // ---- 오디오 포커스 ----

    @SuppressWarnings("deprecation")
    private boolean requestFocus() {
        int r;
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                .build())
                        .setOnAudioFocusChangeListener(this, handler)
                        .build();
            }
            r = audio.requestAudioFocus(focusRequest);
        } else {
            r = audio.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        return r == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    @SuppressWarnings("deprecation")
    private void abandonFocus() {
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusRequest != null) audio.abandonAudioFocusRequest(focusRequest);
        } else {
            audio.abandonAudioFocus(this);
        }
    }

    @Override
    public void onAudioFocusChange(int change) {
        switch (change) {
            case AudioManager.AUDIOFOCUS_GAIN:
                if (ducked) {
                    ducked = false;
                    if (playing && !fading) engine.master(1f, 1f);
                }
                if (resumeOnFocus) {
                    resumeOnFocus = false;
                    play();
                }
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                if (playing) {
                    resumeOnFocus = true;
                    pause(true);
                }
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                ducked = true;
                if (playing && !fading) engine.master(DUCK, 0.3f);
                break;
            case AudioManager.AUDIOFOCUS_LOSS:
                pause();
                break;
            default:
                break;
        }
    }

    private void registerNoisy() {
        if (noisyRegistered) return;
        IntentFilter f = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(noisy, f);
        noisyRegistered = true;
    }

    private void unregisterNoisy() {
        if (!noisyRegistered) return;
        unregisterReceiver(noisy);
        noisyRegistered = false;
    }

    // ---- 알림 ----

    private void goForeground() {
        Notification n = buildNotification();
        if (!foreground) {
            try {
                Intent self = new Intent(this, SoundService.class);
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(self);
                else startService(self);
                if (Build.VERSION.SDK_INT >= 29) {
                    startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                } else {
                    startForeground(NOTIFICATION_ID, n);
                }
                foreground = true;
            } catch (RuntimeException e) {
                // 백그라운드에서 포그라운드 서비스를 시작할 수 없는 경우 (Android 12+): 재생은 계속한다
                Log.w(TAG, "포그라운드 전환 실패", e);
                notifications.notify(NOTIFICATION_ID, n);
            }
        } else {
            notifications.notify(NOTIFICATION_ID, n);
        }
        notificationShown = true;
    }

    private void leaveForeground(boolean remove) {
        if (foreground) {
            stopForeground(remove ? Service.STOP_FOREGROUND_REMOVE : Service.STOP_FOREGROUND_DETACH);
            foreground = false;
        }
        if (remove) {
            notifications.cancel(NOTIFICATION_ID);
            notificationShown = false;
        } else if (notificationShown) {
            notifications.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private void updateNotification() {
        if (notificationShown && !mix.isEmpty()) {
            notifications.notify(NOTIFICATION_ID, buildNotification());
        } else if (notificationShown && !playing) {
            leaveForeground(true);
        }
    }

    /** "보슬비 외 2개" */
    String title() {
        if (mix.isEmpty()) return getString(R.string.app_name);
        String first = SoundCatalog.get(mix.keySet().iterator().next()).name;
        return mix.size() == 1 ? first : first + " 외 " + (mix.size() - 1) + "개";
    }

    private String statusText() {
        String s = playing ? "재생 중" : "일시정지";
        if (spatialActive()) s += " · 3D";
        long left = timerRemaining();
        if (left > 0) s += " · " + ((left + 59_999) / 60_000) + "분 뒤 꺼짐";
        return s;
    }

    private PendingIntent servicePending(String action, int code) {
        Intent i = new Intent(this, SoundService.class).setAction(action);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification buildNotification() {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : legacyBuilder();
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        b.setSmallIcon(R.drawable.ic_stat_moon)
                .setContentTitle(title())
                .setContentText(statusText())
                .setContentIntent(open)
                .setDeleteIntent(servicePending(ACTION_STOP, 2))
                .setOngoing(playing)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(0xFF8FA8FF)
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(this, playing ? R.drawable.ic_pause : R.drawable.ic_play),
                        playing ? "일시정지" : "재생", servicePending(ACTION_TOGGLE, 1)).build())
                .addAction(new Notification.Action.Builder(
                        Icon.createWithResource(this, R.drawable.ic_close), "끄기", servicePending(ACTION_STOP, 3)).build())
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1));
        return b.build();
    }

    @SuppressWarnings("deprecation")
    private Notification.Builder legacyBuilder() {
        return new Notification.Builder(this).setPriority(Notification.PRIORITY_LOW);
    }

    private void updateSession() {
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build());
        session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title())
                .putString(MediaMetadata.METADATA_KEY_ARTIST, getString(R.string.app_name))
                .build());
        session.setActive(playing || notificationShown);
    }
}
