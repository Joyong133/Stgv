package com.joyong.settingslock;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Toast;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * 잠금 중에 설정 앱, 홈 화면 설정, (옵션) 앱 설치/삭제 화면이 앞에 뜨면 닫고 홈 화면으로 돌려보낸다.
 * '화면이 바뀜' 이벤트의 앱 이름과 화면(클래스) 이름만 보고, 화면 내용은 읽지 않는다.
 */
public class LockService extends AccessibilityService {

    private static final Set<String> SETTINGS = new HashSet<>(Arrays.asList(
            "com.android.settings",
            "com.android.settings.intelligence",
            "com.google.android.settings.intelligence",
            "com.samsung.android.settings",
            "com.android.tv.settings"));

    private static final Set<String> INSTALLERS = new HashSet<>(Arrays.asList(
            "com.android.packageinstaller",
            "com.google.android.packageinstaller",
            "com.samsung.android.packageinstaller"));

    /** 잘 알려진 홈 화면 앱(런처). 지금 기본으로 쓰는 런처는 따로 알아내서 더한다. */
    private static final Set<String> KNOWN_LAUNCHERS = new HashSet<>(Arrays.asList(
            "com.sec.android.app.launcher",              // 삼성 One UI 홈
            "com.google.android.apps.nexuslauncher",     // 픽셀
            "com.android.launcher3",                     // 기본 안드로이드
            "com.miui.home",                             // 샤오미
            "com.mi.android.globallauncher",             // 샤오미 (POCO)
            "com.huawei.android.launcher",
            "com.oppo.launcher",
            "com.coloros.launcher",
            "net.oneplus.launcher",
            "com.motorola.launcher3",
            "com.lge.launcher3",
            "com.teslacoilsw.launcher",                  // 노바 런처
            "com.microsoft.launcher"));

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastToastAt;
    private String defaultLauncher;
    private long defaultLauncherCheckedAt;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkgSeq = event.getPackageName();
        if (pkgSeq == null) return;
        String pkg = pkgSeq.toString();
        if (pkg.equals(getPackageName())) return;

        String what = blockedReason(pkg, event.getClassName());
        if (what == null || !LockState.isLocked(this)) return;

        if (SETTINGS.contains(pkg) || INSTALLERS.contains(pkg)) {
            performGlobalAction(GLOBAL_ACTION_HOME);
        } else {
            // 홈 화면 앱 안의 설정 화면: 뒤로 가기로 닫은 다음 홈으로.
            performGlobalAction(GLOBAL_ACTION_BACK);
            handler.postDelayed(() -> performGlobalAction(GLOBAL_ACTION_HOME), 150);
        }

        long now = SystemClock.elapsedRealtime();
        if (now - lastToastAt > 2000) {
            lastToastAt = now;
            Toast.makeText(this, "🔒 " + what + " 잠금 중 · 남은 시간 "
                    + LockState.formatDuration(LockState.remainingMs(this)), Toast.LENGTH_SHORT).show();
        }
    }

    /** 막아야 하는 화면이면 그 이름을, 아니면 null. */
    private String blockedReason(String pkg, CharSequence className) {
        if (SETTINGS.contains(pkg)) return "설정";
        if (INSTALLERS.contains(pkg)) return LockState.blockUninstall(this) ? "앱 설치/삭제" : null;
        if (isLauncher(pkg) && className != null
                && className.toString().toLowerCase(Locale.ROOT).contains("setting")) {
            return "홈 화면 설정";
        }
        return null;
    }

    private boolean isLauncher(String pkg) {
        if (KNOWN_LAUNCHERS.contains(pkg)) return true;
        long now = SystemClock.elapsedRealtime();
        if (defaultLauncher == null || now - defaultLauncherCheckedAt > 60_000) {
            defaultLauncherCheckedAt = now;
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            ResolveInfo ri = getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
            defaultLauncher = (ri != null && ri.activityInfo != null) ? ri.activityInfo.packageName : "";
            if ("android".equals(defaultLauncher)) defaultLauncher = ""; // 기본 런처를 아직 안 골랐을 때의 선택 창
        }
        return pkg.equals(defaultLauncher);
    }

    @Override
    public void onInterrupt() {}
}
