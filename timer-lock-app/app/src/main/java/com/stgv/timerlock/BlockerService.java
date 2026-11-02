package com.stgv.timerlock;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 화면 앞에 열린 앱을 감지해서, 타이머 대상이면 전체 화면 타이머를 덮어씌웁니다.
 *
 * 동작 방식
 * - 대상 앱을 열면 1/3/5분 카운트다운 화면이 앱을 가립니다(터치 불가).
 * - 타이머가 끝나면 화면이 사라지고, 그 앱을 계속 쓰는 동안은 다시 막지 않습니다.
 * - 다른 앱으로 나가면(15초 이상) 다음에 다시 열 때 타이머가 또 시작됩니다.
 * - 카운트다운 중에 나갔다가 돌아오면 남은 시간이 이어집니다.
 * - 화이트리스트 앱은 언제나 바로 사용 가능합니다.
 */
public class BlockerService extends AccessibilityService {

    /** 사용 허가된 앱을 잠깐 벗어났다 돌아와도 다시 막지 않는 시간 */
    private static final long RETURN_GRACE_MS = 15_000L;
    /** 밖에 나가 있는 사이 타이머가 끝났을 때, 이 시간 안에 돌아오면 바로 허용 */
    private static final long EXPIRED_UNLOCK_WINDOW_MS = 120_000L;
    private static final long REFRESH_INTERVAL_MS = 5 * 60_000L;
    private static final String SETTINGS_PKG = "com.android.settings";

    private final Handler handler = new Handler(Looper.getMainLooper());

    private Prefs prefs;
    private WindowManager windowManager;

    private Set<String> transientPkgs = new HashSet<>();
    private Set<String> exemptPkgs = new HashSet<>();
    private Set<String> launcherPkgs = new HashSet<>();
    private long lastRefresh;

    /** 현재 화면 앞의 앱 */
    private String foreground;
    /** 타이머를 통과한 앱 → 벗어난 시각(0 = 지금 사용 중) */
    private final Map<String, Long> unlocked = new HashMap<>();

    private View overlay;
    private String overlayPkg;
    private long overlayEnd;
    private long overlayTotal;
    private TextView countdownText;
    private CountdownRingView ring;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (overlay == null) return;
            long remaining = overlayEnd - System.currentTimeMillis();
            if (remaining <= 0) {
                finishCountdown();
                return;
            }
            long secs = (remaining + 999) / 1000;
            countdownText.setText(String.format(Locale.US, "%d:%02d", secs / 60, secs % 60));
            ring.setProgress(remaining / (float) overlayTotal);
            handler.postDelayed(this, 200);
        }
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        prefs = Prefs.get(this);
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        refreshPackages(true);
    }

    private void refreshPackages(boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - lastRefresh < REFRESH_INTERVAL_MS) return;
        lastRefresh = now;
        transientPkgs = SystemApps.transientPackages(this);
        exemptPkgs = SystemApps.exemptPackages(this);
        Set<String> launchers = new HashSet<>();
        try {
            Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> list = getPackageManager().queryIntentActivities(main, 0);
            for (ResolveInfo ri : list) {
                if (ri.activityInfo != null) launchers.add(ri.activityInfo.packageName);
            }
        } catch (RuntimeException ignored) {
        }
        launcherPkgs = launchers;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkgSeq = event.getPackageName();
        if (pkgSeq == null) return;
        String pkg = pkgSeq.toString();

        if (pkg.equals(getPackageName())) {
            // 우리 타이머 화면(오버레이)이 뜰 때 생기는 이벤트는 무시하고, 설정 화면만 앱 전환으로 취급
            CharSequence cls = event.getClassName();
            if (cls == null || !MainActivity.class.getName().contentEquals(cls)) return;
        } else if (transientPkgs.contains(pkg)) {
            return;
        }

        refreshPackages(false);
        onForeground(pkg);
    }

    private void onForeground(String pkg) {
        long now = System.currentTimeMillis();

        if (!pkg.equals(foreground)) {
            if (foreground != null) {
                Long state = unlocked.get(foreground);
                if (state != null && state == 0L) unlocked.put(foreground, now);
            }
            foreground = pkg;
        }

        if (overlay != null && !pkg.equals(overlayPkg)) hideOverlay();

        int minutes = effectiveMinutes(pkg);
        if (minutes <= 0) return;

        Long leftAt = unlocked.get(pkg);
        if (leftAt != null && (leftAt == 0L || now - leftAt <= RETURN_GRACE_MS)) {
            unlocked.put(pkg, 0L);
            return;
        }
        unlocked.remove(pkg);

        if (overlay != null) return; // 이미 이 앱의 타이머가 떠 있음

        long total = minutes * 60_000L;
        long end = prefs.getEnd(pkg);
        if (end > 0) {
            if (now >= end) {
                if (now - end <= EXPIRED_UNLOCK_WINDOW_MS) {
                    // 나가 있는 동안 타이머가 끝났음 → 바로 사용 허가
                    prefs.clearEnd(pkg);
                    unlocked.put(pkg, 0L);
                    return;
                }
                end = 0; // 오래된 기록 → 새 타이머
            } else if (end - now > total) {
                end = 0; // 시간 설정이 줄었거나 시계가 바뀜
            }
        }
        if (end == 0) {
            end = now + total;
            prefs.setEnd(pkg, end);
        }
        showOverlay(pkg, end, total);
    }

    /** 이 앱에 걸 타이머(분). 0 이하면 막지 않음. */
    private int effectiveMinutes(String pkg) {
        if (prefs == null || !prefs.isEnabled()) return 0;
        if (exemptPkgs.contains(pkg)) return 0;
        int rule = prefs.getRule(pkg);
        if (rule == Prefs.RULE_WHITELIST) return 0;
        if (rule > 0) return rule;
        // 전체 모드: 화이트리스트가 아닌 '앱 서랍에 보이는 앱'에 기본 타이머 (설정 앱은 잠기지 않도록 제외)
        if (prefs.isStrict() && launcherPkgs.contains(pkg) && !SETTINGS_PKG.equals(pkg)) {
            return prefs.getDefaultMinutes();
        }
        return 0;
    }

    // ---------------------------------------------------------------- 타이머 화면

    private void showOverlay(String pkg, long end, long total) {
        if (windowManager == null) return;
        overlayPkg = pkg;
        overlayEnd = end;
        overlayTotal = total;

        String label = pkg;
        Drawable icon = null;
        PackageManager pm = getPackageManager();
        try {
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            label = pm.getApplicationLabel(ai).toString();
            icon = pm.getApplicationIcon(ai);
        } catch (PackageManager.NameNotFoundException ignored) {
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF111827);
        root.setClickable(true); // 아래 앱으로 터치가 전달되지 않도록
        root.setFocusable(true);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(28);
        column.setPadding(pad, pad, pad, pad);

        if (icon != null) {
            ImageView iv = new ImageView(this);
            iv.setImageDrawable(icon);
            column.addView(iv, new LinearLayout.LayoutParams(dp(64), dp(64)));
        }

        TextView name = text(label, 18, 0xFFD1D5DB, false);
        name.setPadding(0, dp(10), 0, 0);
        column.addView(name, wrap());

        TextView title = text(getString(R.string.overlay_title), 26, Color.WHITE, true);
        title.setPadding(0, dp(18), 0, 0);
        column.addView(title, wrap());

        TextView body = text(getString(R.string.overlay_body), 15, 0xFF9CA3AF, false);
        body.setPadding(0, dp(6), 0, dp(28));
        column.addView(body, wrap());

        FrameLayout dial = new FrameLayout(this);
        ring = new CountdownRingView(this);
        dial.addView(ring, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        countdownText = text("", 52, Color.WHITE, true);
        countdownText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        dial.addView(countdownText, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        column.addView(dial, new LinearLayout.LayoutParams(dp(230), dp(230)));

        Button home = new Button(this);
        home.setText(R.string.overlay_home);
        home.setAllCaps(false);
        home.setTextColor(Color.WHITE);
        home.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF3D5AFE);
        bg.setCornerRadius(dp(26));
        home.setBackground(bg);
        home.setPadding(dp(32), 0, dp(32), 0);
        home.setOnClickListener(v -> {
            performGlobalAction(GLOBAL_ACTION_HOME);
            hideOverlay();
        });
        LinearLayout.LayoutParams homeLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, dp(52));
        homeLp.topMargin = dp(36);
        column.addView(home, homeLp);

        root.addView(column, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.OPAQUE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        lp.gravity = Gravity.TOP | Gravity.START;

        try {
            windowManager.addView(root, lp);
            overlay = root;
            handler.removeCallbacks(ticker);
            ticker.run();
        } catch (RuntimeException e) {
            overlay = null;
            overlayPkg = null;
        }
    }

    private void finishCountdown() {
        String pkg = overlayPkg;
        hideOverlay();
        if (pkg == null) return;
        prefs.clearEnd(pkg);
        long now = System.currentTimeMillis();
        unlocked.put(pkg, pkg.equals(foreground) ? 0L : now);
        String label = pkg;
        try {
            PackageManager pm = getPackageManager();
            label = pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (PackageManager.NameNotFoundException ignored) {
        }
        Toast.makeText(this, getString(R.string.unlocked_toast, label), Toast.LENGTH_SHORT).show();
    }

    private void hideOverlay() {
        handler.removeCallbacks(ticker);
        if (overlay != null && windowManager != null) {
            try {
                windowManager.removeView(overlay);
            } catch (RuntimeException ignored) {
            }
        }
        overlay = null;
        overlayPkg = null;
        countdownText = null;
        ring = null;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView tv = new TextView(this);
        tv.setText(s);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        tv.setTextColor(color);
        tv.setGravity(Gravity.CENTER);
        if (bold) tv.setTypeface(Typeface.DEFAULT_BOLD);
        return tv;
    }

    private LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public boolean onUnbind(Intent intent) {
        hideOverlay();
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        hideOverlay();
        super.onDestroy();
    }
}
