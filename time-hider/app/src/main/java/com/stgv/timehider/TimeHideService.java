package com.stgv.timehider;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.Process;
import android.util.Log;
import android.view.Gravity;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.Collections;
import java.util.List;

/**
 * 접근성 오버레이로 시간 표시를 가린다.
 * 접근성 오버레이는 상태표시줄 · 알림창 · 잠금화면보다 위에 그려지므로 그곳의 시계도 덮을 수 있다.
 *
 * <p>화면을 훑는 일은 {@link TimeScanner}가 전용 스레드에서 하고, 이 클래스는 메인 스레드에서 그리기만 한다.
 */
public class TimeHideService extends AccessibilityService
        implements SharedPreferences.OnSharedPreferenceChangeListener {

    private static final String TAG = "TimeHider";
    private static final long TICK_MS = 3000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private HandlerThread scanThread;
    private Handler scanHandler;
    private TimeScanner scanner;

    private SharedPreferences prefs;
    private WindowManager windowManager;
    private KeyguardManager keyguardManager;
    private MaskView mask;
    private boolean screenOff;
    private boolean locked;
    private boolean receiverRegistered;

    // 아래 값들은 메인 스레드에서만 다룬다.
    private boolean scanEnabled;
    private List<Rect> textRects = Collections.emptyList();
    private int topStrip;
    private int lockTop;

    private final Runnable tickRunnable = this::onTick;

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            // 화면이 꺼지면 미리 잠금화면용 가리개를 깔아 둬서, 켜지는 순간에도 시계가 안 보이게 한다.
            screenOff = Intent.ACTION_SCREEN_OFF.equals(intent.getAction());
            refresh();
            if (scanEnabled) onScanThread(scanner::rescanAll);
        }
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        keyguardManager = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        prefs = Prefs.get(this);
        prefs.registerOnSharedPreferenceChangeListener(this);

        scanThread = new HandlerThread("time-scan", Process.THREAD_PRIORITY_FOREGROUND);
        scanThread.start();
        scanHandler = new Handler(scanThread.getLooper());
        scanner = new TimeScanner(this, scanHandler, rects -> handler.post(() -> onRectsFound(rects)));

        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(screenReceiver, filter);
        }
        receiverRegistered = true;

        refresh();
        Prefs.updateTile(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (mask == null) return;
        int type = event.getEventType();
        if (type == AccessibilityEvent.TYPE_WINDOWS_CHANGED
                || type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            // 잠금화면이 열리거나 닫혔으면 잠금화면 가리개를 바로 맞춘다.
            boolean nowLocked = screenOff || keyguardManager.isKeyguardLocked();
            if (nowLocked != locked) refresh();
        }
        if (!scanEnabled) return;

        int windowId = event.getWindowId();
        if (type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                && event.getContentChangeTypes() == AccessibilityEvent.CONTENT_CHANGE_TYPE_TEXT) {
            AccessibilityNodeInfo source = event.getSource();
            if (source != null) {
                onScanThread(() -> scanner.onTextChanged(windowId, source));
                return;
            }
        } else if (type == AccessibilityEvent.TYPE_VIEW_SCROLLED) {
            AccessibilityNodeInfo source = event.getSource();
            int dx = 0;
            int dy = 0;
            if (Build.VERSION.SDK_INT >= 28) {
                // -1은 "모름"을 뜻한다.
                dx = event.getScrollDeltaX() == -1 ? 0 : event.getScrollDeltaX();
                dy = event.getScrollDeltaY() == -1 ? 0 : event.getScrollDeltaY();
            }
            int scrollX = dx;
            int scrollY = dy;
            onScanThread(() -> scanner.onScrolled(windowId, source, scrollX, scrollY));
            return;
        }
        onScanThread(() -> scanner.onWindowChanged(windowId));
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onSharedPreferenceChanged(SharedPreferences sharedPreferences, String key) {
        refresh();
    }

    @Override
    public boolean onUnbind(Intent intent) {
        shutdown();
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        shutdown();
        super.onDestroy();
    }

    private void shutdown() {
        handler.removeCallbacksAndMessages(null);
        setScanEnabled(false);
        if (scanThread != null) {
            scanThread.quitSafely();
            scanThread = null;
            scanHandler = null;
        }
        if (prefs != null) {
            prefs.unregisterOnSharedPreferenceChangeListener(this);
        }
        if (receiverRegistered) {
            try {
                unregisterReceiver(screenReceiver);
            } catch (IllegalArgumentException ignored) {
            }
            receiverRegistered = false;
        }
        detachMask();
        Prefs.updateTile(this);
    }

    private void onScanThread(Runnable task) {
        if (scanHandler != null) scanHandler.post(task);
    }

    private void onRectsFound(List<Rect> rects) {
        if (!scanEnabled) return;
        textRects = rects;
        applyMask();
    }

    private void applyMask() {
        if (mask != null) mask.update(topStrip, lockTop, textRects);
    }

    private void setScanEnabled(boolean enabled) {
        if (enabled == scanEnabled || scanner == null) return;
        scanEnabled = enabled;
        textRects = Collections.emptyList();
        onScanThread(enabled ? scanner::rescanAll : scanner::reset);
    }

    /** 이벤트 없이 바뀌는 화면도 있어서, 화면이 켜져 있는 동안은 가끔 전체를 다시 훑는다. */
    private void onTick() {
        refresh();
        if (scanEnabled) {
            onScanThread(() -> {
                if (!scanner.isScrolling()) scanner.rescanAll();
            });
        }
    }

    /** 켜고 끄기, 상태표시줄 · 잠금화면 가리개처럼 화면을 훑지 않아도 되는 부분을 맞춘다. */
    private void refresh() {
        if (prefs == null) return;
        if (Prefs.isExpired(prefs)) {
            Prefs.stop(this);
        }
        if (!Prefs.isActive(prefs)) {
            handler.removeCallbacks(tickRunnable);
            setScanEnabled(false);
            detachMask();
            return;
        }
        if (!attachMask()) return;

        locked = screenOff || keyguardManager.isKeyguardLocked();
        topStrip = prefs.getBoolean(Prefs.KEY_MASK_STATUS_BAR, Prefs.DEFAULT_MASK_STATUS_BAR)
                ? statusBarHeight() : 0;
        lockTop = 0;
        if (locked && prefs.getBoolean(Prefs.KEY_MASK_LOCK_TOP, Prefs.DEFAULT_MASK_LOCK_TOP)) {
            lockTop = prefs.getInt(Prefs.KEY_LOCK_TOP_PERCENT, Prefs.DEFAULT_LOCK_TOP_PERCENT);
            // 화면이 꺼진 동안(AOD)은 더 넓게 덮고, 켜지는 순간에도 잠금화면 시계가 보이지 않게 한다.
            if (screenOff) lockTop = Math.max(lockTop, Prefs.SCREEN_OFF_TOP_PERCENT);
        }
        setScanEnabled(prefs.getBoolean(Prefs.KEY_MASK_TIME_TEXT, Prefs.DEFAULT_MASK_TIME_TEXT));
        applyMask();

        handler.removeCallbacks(tickRunnable);
        if (!screenOff) {
            handler.postDelayed(tickRunnable, TICK_MS);
        }
    }

    private boolean attachMask() {
        if (mask != null) return true;
        MaskView view = new MaskView(this);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                        | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        if (Build.VERSION.SDK_INT >= 30) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            lp.setFitInsetsTypes(0);
        } else if (Build.VERSION.SDK_INT >= 28) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        try {
            windowManager.addView(view, lp);
        } catch (RuntimeException e) {
            Log.w(TAG, "가리개 창을 띄우지 못했습니다", e);
            return false;
        }
        mask = view;
        // 창이 붙고 나면 실제 상태표시줄 높이를 알 수 있으니 한 번 더 그린다.
        view.post(this::refresh);
        return true;
    }

    private void detachMask() {
        if (mask == null) return;
        try {
            windowManager.removeView(mask);
        } catch (RuntimeException ignored) {
        }
        mask = null;
    }

    private int statusBarHeight() {
        float density = getResources().getDisplayMetrics().density;
        int height = mask != null ? mask.statusBarInset() : 0;
        int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (id != 0) {
            height = Math.max(height, getResources().getDimensionPixelSize(id));
        }
        if (height == 0) {
            height = Math.round(24 * density);
        }
        return height + Math.round(2 * density);
    }
}
