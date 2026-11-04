package com.joyong.settingslock;

import android.accessibilityservice.AccessibilityService;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Toast;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 잠금 중에 설정 앱, 홈 화면 설정, (옵션) 앱 설치/삭제 화면이 앞에 뜨면 닫고 홈 화면으로 돌려보낸다.
 * 카메라 · Play 스토어 · 카카오톡 인앱 브라우저 막기 옵션을 켜면 시간 잠금과 상관없이 카메라 앱(잠금화면에서 / 항상)과 Play 스토어도 닫는다.
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

    private static final String PLAY_STORE = "com.android.vending";
    private static final String KAKAOTALK = "com.kakao.talk";

    /** 잘 알려진 기본 카메라 앱. 기기에 깔린 카메라 앱은 따로 알아내서 더한다. */
    private static final Set<String> KNOWN_CAMERAS = new HashSet<>(Arrays.asList(
            "com.sec.android.app.camera",                // 삼성
            "com.google.android.GoogleCamera",           // 픽셀
            "com.android.camera",                        // 샤오미 등
            "com.android.camera2",
            "org.codeaurora.snapcam",
            "com.huawei.camera",
            "com.oppo.camera",
            "com.oplus.camera",
            "com.oneplus.camera",
            "com.motorola.camera3",
            "com.lge.camera",
            "com.sonyericsson.android.camera"));

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long lastToastAt;
    private String defaultLauncher;
    private long defaultLauncherCheckedAt;
    private Set<String> cameras;
    private long camerasCheckedAt;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkgSeq = event.getPackageName();
        if (pkgSeq == null) return;
        String pkg = pkgSeq.toString();
        if (pkg.equals(getPackageName())) return;

        String what = blockedReason(pkg, event.getClassName());
        boolean timed = what != null && LockState.isLocked(this);
        if (!timed) {
            what = cameraBlockedReason(pkg);
            if (what == null && PLAY_STORE.equals(pkg) && LockState.blockPlayStore(this)) what = "Play 스토어";
            if (what == null && isKakaoInAppBrowser(pkg, event.getClassName())) what = "카카오톡 인앱 브라우저";
            if (what == null) return;
        }

        if (SETTINGS.contains(pkg) || INSTALLERS.contains(pkg) || PLAY_STORE.equals(pkg)) {
            performGlobalAction(GLOBAL_ACTION_HOME);
        } else if (KAKAOTALK.equals(pkg)) {
            // 인앱 브라우저만 닫고 카카오톡(대화방)은 그대로 둔다.
            performGlobalAction(GLOBAL_ACTION_BACK);
        } else {
            // 홈 화면 설정·카메라: 뒤로 가기로 닫은 다음 홈으로 (잠금화면이면 잠금화면으로 돌아감).
            performGlobalAction(GLOBAL_ACTION_BACK);
            handler.postDelayed(() -> performGlobalAction(GLOBAL_ACTION_HOME), 150);
        }

        long now = SystemClock.elapsedRealtime();
        if (now - lastToastAt > 2000) {
            lastToastAt = now;
            String msg = timed
                    ? "🔒 " + what + " 잠금 중 · 남은 시간 " + LockState.formatDuration(LockState.remainingMs(this))
                    : "🔒 " + what + "는 막혀 있어요";
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
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

    /** 카카오톡 안에서 링크를 눌러 뜨는 웹 화면(인앱 브라우저)인지. 화면(클래스) 이름으로 판단한다. */
    private boolean isKakaoInAppBrowser(String pkg, CharSequence className) {
        if (!KAKAOTALK.equals(pkg) || className == null || !LockState.blockKakaoBrowser(this)) return false;
        String c = className.toString().toLowerCase(Locale.ROOT);
        return c.contains("browser") || c.contains("webview");
    }

    /** 카메라 막기 옵션에 걸리면 그 이름을, 아니면 null. */
    private String cameraBlockedReason(String pkg) {
        boolean always = LockState.blockCameraAlways(this);
        boolean onLockScreen = LockState.blockCameraOnLockScreen(this);
        if (!always && !onLockScreen) return null;
        if (!isCamera(pkg)) return null;
        if (always) return "카메라";
        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        boolean lockedScreen = km != null && (km.isKeyguardLocked() || km.isDeviceLocked());
        return lockedScreen ? "잠금화면 카메라" : null;
    }

    private boolean isCamera(String pkg) {
        if (KNOWN_CAMERAS.contains(pkg)) return true;
        long now = SystemClock.elapsedRealtime();
        if (cameras == null || now - camerasCheckedAt > 60_000) {
            camerasCheckedAt = now;
            Set<String> found = new HashSet<>();
            PackageManager pm = getPackageManager();
            for (String action : new String[]{
                    MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA,
                    MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA_SECURE,
                    MediaStore.INTENT_ACTION_VIDEO_CAMERA}) {
                List<ResolveInfo> list = pm.queryIntentActivities(new Intent(action), 0);
                for (ResolveInfo ri : list) {
                    if (ri.activityInfo != null) found.add(ri.activityInfo.packageName);
                }
            }
            found.remove("android");
            found.remove(getPackageName());
            cameras = found;
        }
        return cameras.contains(pkg);
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
