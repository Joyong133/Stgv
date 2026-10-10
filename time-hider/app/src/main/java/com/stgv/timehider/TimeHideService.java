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
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 접근성 오버레이로 시간 표시를 가린다.
 * 접근성 오버레이는 상태표시줄 · 알림창 · 잠금화면보다 위에 그려지므로 그곳의 시계도 덮을 수 있다.
 */
public class TimeHideService extends AccessibilityService
        implements SharedPreferences.OnSharedPreferenceChangeListener {

    private static final String TAG = "TimeHider";
    private static final long SCAN_DELAY_MS = 60;
    private static final long TICK_MS = 2000;
    private static final int MAX_NODES_PER_WINDOW = 3000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private WindowManager windowManager;
    private KeyguardManager keyguardManager;
    private MaskView mask;
    private boolean scanPending;
    private boolean screenOff;
    private boolean receiverRegistered;

    private final Runnable scanRunnable = () -> {
        scanPending = false;
        refresh();
    };

    private final Runnable tickRunnable = this::refresh;

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            // 화면이 꺼지면 미리 잠금화면용 가리개를 깔아 둬서, 켜지는 순간에도 시계가 안 보이게 한다.
            screenOff = Intent.ACTION_SCREEN_OFF.equals(intent.getAction());
            refresh();
        }
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        keyguardManager = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        prefs = Prefs.get(this);
        prefs.registerOnSharedPreferenceChangeListener(this);

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
        if (mask == null || scanPending) return;
        scanPending = true;
        handler.postDelayed(scanRunnable, SCAN_DELAY_MS);
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
        scanPending = false;
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

    private void refresh() {
        if (prefs == null) return;
        if (Prefs.isExpired(prefs)) {
            Prefs.stop(this);
        }
        if (!Prefs.isActive(prefs)) {
            handler.removeCallbacks(tickRunnable);
            detachMask();
            return;
        }
        if (!attachMask()) return;

        boolean locked = screenOff || keyguardManager.isKeyguardLocked();
        int topStrip = prefs.getBoolean(Prefs.KEY_MASK_STATUS_BAR, Prefs.DEFAULT_MASK_STATUS_BAR)
                ? statusBarHeight() : 0;
        int lockTop = locked && prefs.getBoolean(Prefs.KEY_MASK_LOCK_TOP, Prefs.DEFAULT_MASK_LOCK_TOP)
                ? prefs.getInt(Prefs.KEY_LOCK_TOP_PERCENT, Prefs.DEFAULT_LOCK_TOP_PERCENT) : 0;
        List<Rect> rects = new ArrayList<>();
        if (prefs.getBoolean(Prefs.KEY_MASK_TIME_TEXT, Prefs.DEFAULT_MASK_TIME_TEXT)) {
            collectTimeRects(rects);
        }
        mask.update(topStrip, lockTop, rects);

        // 이벤트 없이 바뀌는 화면도 있어서, 화면이 켜져 있는 동안은 주기적으로 다시 확인한다.
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
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
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

    /** 지금 화면에 떠 있는 모든 창(상태표시줄 · 알림창 · 잠금화면 · 앱)에서 시간 글자의 위치를 찾는다. */
    private void collectTimeRects(List<Rect> out) {
        List<AccessibilityWindowInfo> windows;
        try {
            windows = getWindows();
        } catch (RuntimeException e) {
            windows = Collections.emptyList();
        }
        boolean scanned = false;
        for (AccessibilityWindowInfo window : windows) {
            if (window.getType() == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY) continue;
            AccessibilityNodeInfo root = window.getRoot();
            if (root == null) continue;
            scanned = true;
            collectFrom(root, out);
        }
        if (!scanned) {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null) collectFrom(root, out);
        }
    }

    private void collectFrom(AccessibilityNodeInfo root, List<Rect> out) {
        int screenHeight = getResources().getDisplayMetrics().heightPixels;
        int pad = Math.round(2 * getResources().getDisplayMetrics().density);
        ArrayDeque<AccessibilityNodeInfo> stack = new ArrayDeque<>();
        stack.push(root);
        int visited = 0;
        while (!stack.isEmpty() && visited++ < MAX_NODES_PER_WINDOW) {
            AccessibilityNodeInfo node = stack.pop();
            if (!node.isVisibleToUser()) continue;
            int childCount = node.getChildCount();

            boolean textHit = TimePatterns.containsTime(node.getText());
            // 설명(contentDescription)은 여러 내용을 묶어 둔 큰 묶음에도 붙기 때문에 맨 끝 요소에서만 본다.
            boolean descHit = !textHit && childCount == 0
                    && TimePatterns.containsTime(node.getContentDescription());
            if (textHit || descHit) {
                Rect r = new Rect();
                node.getBoundsInScreen(r);
                if (!r.isEmpty() && (textHit || r.height() < screenHeight / 2)) {
                    r.inset(-pad, -pad);
                    out.add(r);
                    continue;
                }
            }
            for (int i = childCount - 1; i >= 0; i--) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) stack.push(child);
            }
        }
    }
}
