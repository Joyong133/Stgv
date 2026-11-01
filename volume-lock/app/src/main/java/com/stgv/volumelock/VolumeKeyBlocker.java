package com.stgv.volumelock;

import android.accessibilityservice.AccessibilityService;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;

/**
 * 볼륨 내림 버튼 입력 자체를 가로채서 버리는 접근성 서비스.
 * 잠금이 켜져 있으면 볼륨 내림 버튼을 눌러도 소리가 전혀 줄어들지 않습니다.
 */
public class VolumeKeyBlocker extends AccessibilityService {
    static volatile boolean running;
    static volatile int blocked;

    @Override
    protected void onServiceConnected() {
        running = true;
        android.util.Log.i("VolumeLock", "key blocker connected, flags=" + getServiceInfo().flags);
        if (Prefs.isEnabled(this)) VolumeLockService.start(this);
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        running = false;
        return super.onUnbind(intent);
    }

    @Override
    protected boolean onKeyEvent(KeyEvent event) {
        if (!Prefs.isEnabled(this)) return false;
        int code = event.getKeyCode();
        // 음소거 버튼과 볼륨 내림 버튼을 막습니다. (true = 시스템에 전달하지 않음)
        if (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_MUTE) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) blocked++;
            android.util.Log.i("VolumeLock", "volume key blocked: " + code);
            return true;
        }
        return false;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}
}
