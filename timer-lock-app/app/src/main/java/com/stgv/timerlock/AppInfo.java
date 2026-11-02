package com.stgv.timerlock;

import android.graphics.drawable.Drawable;

/** 목록에 표시할 설치된 앱 */
final class AppInfo {
    final String pkg;
    final String label;
    final Drawable icon;

    AppInfo(String pkg, String label, Drawable icon) {
        this.pkg = pkg;
        this.label = label;
        this.icon = icon;
    }
}
