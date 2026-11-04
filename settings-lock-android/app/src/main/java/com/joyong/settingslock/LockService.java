package com.joyong.settingslock;

import android.accessibilityservice.AccessibilityService;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Toast;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * 잠금 중에 설정 앱(또는 앱 삭제 화면)이 앞에 뜨면 홈 화면으로 돌려보낸다.
 * 어떤 앱에서 온 이벤트를 받을지는 res/xml/lock_service.xml 의 packageNames 로 제한한다.
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

    private long lastToastAt;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkg = event.getPackageName();
        if (pkg == null) return;
        String p = pkg.toString();

        boolean blocked = SETTINGS.contains(p)
                || (INSTALLERS.contains(p) && LockState.blockUninstall(this));
        if (!blocked || !LockState.isLocked(this)) return;

        performGlobalAction(GLOBAL_ACTION_HOME);

        long now = SystemClock.elapsedRealtime();
        if (now - lastToastAt > 2000) {
            lastToastAt = now;
            Toast.makeText(this, "🔒 설정 잠금 중 · 남은 시간 "
                    + LockState.formatDuration(LockState.remainingMs(this)), Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onInterrupt() {}
}
