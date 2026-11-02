package com.stgv.timerlock;

import android.accessibilityservice.AccessibilityService;
import android.app.ActivityManager;
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
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.text.Collator;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 화면 앞에 열린 앱을 감지해서, 타이머 대상이면 전체 화면 타이머를 덮어씌웁니다.
 *
 * 동작 방식
 * - 대상 앱을 열 때마다 1/3/5분 카운트다운 화면이 앱을 가립니다(터치 불가).
 * - 타이머가 끝나면 바로 홈 화면으로 보내고 그 앱의 프로세스를 종료합니다(앱 닫기).
 * - 다시 열면 타이머가 처음부터 다시 시작됩니다.
 * - 타이머 화면의 '화이트리스트 앱 열기'로 허용된 앱을 바로 열 수 있습니다.
 */
public class BlockerService extends AccessibilityService {

    private static final long REFRESH_INTERVAL_MS = 5 * 60_000L;
    private static final long UNKNOWN_REFRESH_MIN_MS = 10_000L;
    private static final String SETTINGS_PKG = "com.android.settings";
    /** 홈으로 보낸 뒤 앱 프로세스를 종료하기까지 기다리는 시간(완전히 백그라운드로 내려간 뒤에 종료해야 함) */
    private static final long KILL_DELAY_MS = 1_200L;
    /** 홈 화면 전환 이벤트가 오지 않을 때 타이머 화면을 강제로 닫는 시간 */
    private static final long HIDE_FALLBACK_MS = 2_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private Prefs prefs;
    private WindowManager windowManager;

    private Set<String> transientPkgs = new HashSet<>();
    private Set<String> exemptPkgs = new HashSet<>();
    private Set<String> launcherPkgs = new HashSet<>();
    private long lastRefresh;

    /** 현재 화면 앞의 앱 */
    private String foreground;
    private View overlay;
    private String overlayPkg;
    private long overlayEnd;
    private long overlayTotal;
    private TextView countdownText;
    private TextView miniCountdown;
    private CountdownRingView ring;
    private View timerPanel;
    private View whitelistPanel;

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
            String time = String.format(Locale.US, "%d:%02d", secs / 60, secs % 60);
            countdownText.setText(time);
            miniCountdown.setText(getString(R.string.whitelist_remaining, time));
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
        } else {
            refreshPackages(false);
            if (!launcherPkgs.contains(pkg) && !exemptPkgs.contains(pkg)) {
                // 새로 설치된 앱일 수 있으니 한 번 더 확인
                if (System.currentTimeMillis() - lastRefresh > UNKNOWN_REFRESH_MIN_MS) refreshPackages(true);
                // 앱 서랍에 없는 패키지(권한 창, 시스템 팝업 등)는 앱 전환으로 보지 않음
                if (!launcherPkgs.contains(pkg) && !exemptPkgs.contains(pkg)) return;
            }
        }
        onForeground(pkg);
    }

    private void onForeground(String pkg) {
        foreground = pkg;

        if (overlay != null && !pkg.equals(overlayPkg)) hideOverlay();

        int minutes = effectiveMinutes(pkg);
        if (minutes <= 0) return;
        if (overlay != null) return;          // 이미 이 앱의 타이머가 떠 있음

        long total = minutes * 60_000L;
        showOverlay(pkg, System.currentTimeMillis() + total, total);
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

        timerPanel = buildTimerPanel(label, icon);
        root.addView(timerPanel, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        whitelistPanel = buildWhitelistPanel();
        whitelistPanel.setVisibility(View.GONE);
        root.addView(whitelistPanel, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

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

    /** 카운트다운 화면: 앱 아이콘, 원형 타이머, 화이트리스트 앱 열기 버튼 */
    private View buildTimerPanel(String label, Drawable icon) {
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
        dial.addView(countdownText, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        column.addView(dial, new LinearLayout.LayoutParams(dp(230), dp(230)));

        Button whitelist = pillButton(getString(R.string.overlay_whitelist), 0xFF1E8E3E);
        whitelist.setOnClickListener(v -> showWhitelist(true));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, dp(52));
        lp.topMargin = dp(36);
        column.addView(whitelist, lp);
        return column;
    }

    /** 화이트리스트 앱 목록 화면: 누르면 그 앱이 열림 */
    private View buildWhitelistPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(20), dp(48), dp(20), dp(28));

        TextView title = text(getString(R.string.whitelist_title), 24, Color.WHITE, true);
        panel.addView(title, matchWrap());

        miniCountdown = text("", 15, 0xFFFFD54F, false);
        miniCountdown.setPadding(0, dp(6), 0, dp(16));
        panel.addView(miniCountdown, matchWrap());

        List<AppInfo> apps = loadWhitelistApps();
        if (apps.isEmpty()) {
            TextView empty = text(getString(R.string.whitelist_empty), 15, 0xFF9CA3AF, false);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
            empty.setGravity(Gravity.CENTER);
            panel.addView(empty, lp);
        } else {
            ScrollView scroll = new ScrollView(this);
            LinearLayout grid = new LinearLayout(this);
            grid.setOrientation(LinearLayout.VERTICAL);
            final int perRow = 4;
            LinearLayout row = null;
            for (int i = 0; i < apps.size(); i++) {
                if (i % perRow == 0) {
                    row = new LinearLayout(this);
                    row.setOrientation(LinearLayout.HORIZONTAL);
                    grid.addView(row, matchWrap());
                }
                row.addView(appCell(apps.get(i)),
                        new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            }
            // 마지막 줄 빈칸 채우기(아이콘 크기 맞춤)
            int rest = apps.size() % perRow;
            if (rest != 0 && row != null) {
                for (int i = rest; i < perRow; i++) {
                    row.addView(new View(this),
                            new LinearLayout.LayoutParams(0, 1, 1f));
                }
            }
            scroll.addView(grid);
            panel.addView(scroll, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        }

        Button back = pillButton(getString(R.string.whitelist_back), 0xFF374151);
        back.setOnClickListener(v -> showWhitelist(false));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, dp(52));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        lp.topMargin = dp(16);
        panel.addView(back, lp);
        return panel;
    }

    private View appCell(AppInfo app) {
        LinearLayout cell = new LinearLayout(this);
        cell.setOrientation(LinearLayout.VERTICAL);
        cell.setGravity(Gravity.CENTER_HORIZONTAL);
        cell.setPadding(dp(4), dp(10), dp(4), dp(10));
        cell.setClickable(true);
        TypedValue tv = new TypedValue();
        if (getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, tv, true)) {
            cell.setBackgroundResource(tv.resourceId);
        }

        ImageView iv = new ImageView(this);
        iv.setImageDrawable(app.icon);
        cell.addView(iv, new LinearLayout.LayoutParams(dp(52), dp(52)));

        TextView name = text(app.label, 12, Color.WHITE, false);
        name.setMaxLines(2);
        name.setEllipsize(TextUtils.TruncateAt.END);
        name.setPadding(0, dp(6), 0, 0);
        cell.addView(name, matchWrap());

        cell.setOnClickListener(v -> launch(app.pkg));
        return cell;
    }

    private List<AppInfo> loadWhitelistApps() {
        List<AppInfo> list = new ArrayList<>();
        PackageManager pm = getPackageManager();
        for (String pkg : prefs.getWhitelist()) {
            if (pkg.equals(getPackageName())) continue;
            if (pm.getLaunchIntentForPackage(pkg) == null) continue; // 지워졌거나 열 수 없는 앱
            try {
                ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                list.add(new AppInfo(pkg, pm.getApplicationLabel(ai).toString(), pm.getApplicationIcon(ai)));
            } catch (PackageManager.NameNotFoundException ignored) {
            }
        }
        Collator collator = Collator.getInstance(Locale.KOREAN);
        list.sort((a, b) -> collator.compare(a.label, b.label));
        return list;
    }

    private void launch(String pkg) {
        Intent intent = getPackageManager().getLaunchIntentForPackage(pkg);
        if (intent == null) return;
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            startActivity(intent);
            // 화이트리스트 앱이 앞에 오면 onForeground 에서 타이머 화면이 닫힘
        } catch (RuntimeException ignored) {
        }
    }

    private void showWhitelist(boolean show) {
        if (timerPanel == null || whitelistPanel == null) return;
        timerPanel.setVisibility(show ? View.GONE : View.VISIBLE);
        whitelistPanel.setVisibility(show ? View.VISIBLE : View.GONE);
    }

    /** 시간이 끝남 → 홈으로 보내고 그 앱을 닫음. 타이머 화면은 홈이 앞에 올 때까지 유지(앱이 비치지 않도록). */
    private void finishCountdown() {
        final String pkg = overlayPkg;
        handler.removeCallbacks(ticker);
        if (pkg == null) {
            hideOverlay();
            return;
        }
        countdownText.setText("0:00");
        ring.setProgress(0f);

        performGlobalAction(GLOBAL_ACTION_HOME);

        final View closingOverlay = overlay;
        handler.postDelayed(() -> {
            // 홈 전환 이벤트로 이미 닫혔으면 아무것도 안 함
            if (overlay != null && overlay == closingOverlay) hideOverlay();
        }, HIDE_FALLBACK_MS);
        handler.postDelayed(() -> killApp(pkg), KILL_DELAY_MS);

        String label = pkg;
        try {
            PackageManager pm = getPackageManager();
            label = pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (PackageManager.NameNotFoundException ignored) {
        }
        Toast.makeText(this, getString(R.string.closed_toast, label), Toast.LENGTH_SHORT).show();
    }

    /** 백그라운드로 내려간 앱의 프로세스를 종료 (다시 열면 처음부터 시작됨) */
    private void killApp(String pkg) {
        if (pkg.equals(foreground)) return; // 아직 앞에 있으면(홈 전환 실패) 종료하지 않음
        try {
            ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (am != null) am.killBackgroundProcesses(pkg);
        } catch (RuntimeException ignored) {
        }
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
        miniCountdown = null;
        ring = null;
        timerPanel = null;
        whitelistPanel = null;
    }

    // ---------------------------------------------------------------- 뷰 도우미

    private Button pillButton(String label, int color) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(26));
        b.setBackground(bg);
        b.setPadding(dp(32), 0, dp(32), 0);
        return b;
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

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
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
