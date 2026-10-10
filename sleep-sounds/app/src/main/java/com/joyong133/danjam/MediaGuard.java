package com.joyong133.danjam;

import android.content.ComponentName;
import android.content.Context;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.provider.Settings;
import android.util.Log;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 단잠이 재생되는 동안 다른 앱(유튜브, 음악 앱, 브라우저 영상 …)이 재생을 시작하면 바로 일시정지시킨다.
 * 안드로이드의 미디어 세션으로 각 앱의 재생 버튼을 대신 눌러 멈추는 방식이라 '알림 접근' 권한이 필요하다.
 * 권한이 없으면 아무것도 하지 않는다 (오디오 포커스로 막는 기본 방식은 {@link SoundService} 가 맡는다).
 */
final class MediaGuard {
    private static final String TAG = "MediaGuard";

    interface Listener {
        /** pkg 앱의 재생을 멈췄다 */
        void onBlocked(String pkg);
    }

    private final Context context;
    private final Handler handler;
    private final Listener listener;
    private final MediaSessionManager sessions;
    private final ComponentName component;
    private final Map<MediaSession.Token, MediaController> watched = new HashMap<>();
    private final Map<MediaSession.Token, MediaController.Callback> callbacks = new HashMap<>();
    private boolean active;

    private final MediaSessionManager.OnActiveSessionsChangedListener changes =
            new MediaSessionManager.OnActiveSessionsChangedListener() {
                @Override
                public void onActiveSessionsChanged(List<MediaController> controllers) {
                    watch(controllers);
                }
            };

    MediaGuard(Context context, Handler handler, Listener listener) {
        this.context = context;
        this.handler = handler;
        this.listener = listener;
        sessions = (MediaSessionManager) context.getSystemService(Context.MEDIA_SESSION_SERVICE);
        component = new ComponentName(context, MediaGuardListener.class);
    }

    /** 사용자가 설정에서 '알림 접근'을 허용했는지 */
    static boolean hasAccess(Context c) {
        String flat = Settings.Secure.getString(c.getContentResolver(), "enabled_notification_listeners");
        return flat != null && flat.contains(new ComponentName(c, MediaGuardListener.class).flattenToString());
    }

    boolean active() {
        return active;
    }

    void start() {
        if (active || !hasAccess(context)) return;
        try {
            active = true;
            sessions.addOnActiveSessionsChangedListener(changes, component, handler);
            watch(sessions.getActiveSessions(component));
        } catch (SecurityException e) {
            Log.w(TAG, "알림 접근 권한이 없어 다른 앱을 멈출 수 없음", e);
            stop();
        }
    }

    void stop() {
        if (!active) return;
        active = false;
        try {
            sessions.removeOnActiveSessionsChangedListener(changes);
        } catch (RuntimeException ignored) {
        }
        for (Map.Entry<MediaSession.Token, MediaController> e : watched.entrySet()) {
            e.getValue().unregisterCallback(callbacks.get(e.getKey()));
        }
        watched.clear();
        callbacks.clear();
    }

    private void watch(List<MediaController> controllers) {
        if (!active || controllers == null) return;
        List<MediaSession.Token> alive = new ArrayList<>();
        for (final MediaController c : controllers) {
            if (context.getPackageName().equals(c.getPackageName())) continue;
            final MediaSession.Token token = c.getSessionToken();
            alive.add(token);
            if (!watched.containsKey(token)) {
                MediaController.Callback cb = new MediaController.Callback() {
                    @Override
                    public void onPlaybackStateChanged(PlaybackState state) {
                        check(c, state);
                    }

                    @Override
                    public void onSessionDestroyed() {
                        forget(token);
                    }
                };
                c.registerCallback(cb, handler);
                watched.put(token, c);
                callbacks.put(token, cb);
            }
            check(c, c.getPlaybackState());
        }
        for (MediaSession.Token t : new ArrayList<>(watched.keySet())) if (!alive.contains(t)) forget(t);
    }

    private void forget(MediaSession.Token token) {
        MediaController c = watched.remove(token);
        MediaController.Callback cb = callbacks.remove(token);
        if (c != null && cb != null) c.unregisterCallback(cb);
    }

    private void check(MediaController c, PlaybackState state) {
        if (!active || state == null) return;
        int s = state.getState();
        if (s == PlaybackState.STATE_PLAYING || s == PlaybackState.STATE_BUFFERING) {
            c.getTransportControls().pause();
            listener.onBlocked(c.getPackageName());
        }
    }
}
