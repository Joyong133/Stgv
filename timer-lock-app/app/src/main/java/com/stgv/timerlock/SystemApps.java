package com.stgv.timerlock;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.telecom.TelecomManager;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 절대 막으면 안 되는 앱(홈, 전화, 키보드, 시스템 UI 등)을 찾습니다. */
public final class SystemApps {
    private SystemApps() {}

    /**
     * 화면 앞에 와도 "앱 전환"으로 보지 않는 패키지.
     * 알림창·키보드·공유 선택창처럼 다른 앱 위에 잠깐 뜨는 창입니다.
     */
    public static Set<String> transientPackages(Context context) {
        Set<String> set = new HashSet<>();
        set.add("android");
        set.add("com.android.systemui");
        try {
            InputMethodManager imm = (InputMethodManager) context.getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) {
                for (InputMethodInfo info : imm.getEnabledInputMethodList()) {
                    set.add(info.getPackageName());
                }
            }
        } catch (RuntimeException ignored) {
        }
        return set;
    }

    /** 앞에 와도 절대 타이머를 띄우지 않는 앱: 이 앱, 홈 런처, 기본 전화 앱. */
    public static Set<String> exemptPackages(Context context) {
        Set<String> set = new HashSet<>();
        set.add(context.getPackageName());
        PackageManager pm = context.getPackageManager();
        try {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            List<ResolveInfo> homes = pm.queryIntentActivities(home, 0);
            for (ResolveInfo ri : homes) {
                if (ri.activityInfo != null) set.add(ri.activityInfo.packageName);
            }
        } catch (RuntimeException ignored) {
        }
        try {
            TelecomManager tm = (TelecomManager) context.getSystemService(Context.TELECOM_SERVICE);
            if (tm != null) {
                String dialer = tm.getDefaultDialerPackage();
                if (dialer != null) set.add(dialer);
            }
        } catch (RuntimeException ignored) {
        }
        return set;
    }
}
