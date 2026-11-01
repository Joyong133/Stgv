package com.stgv.volumelock;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 휴대폰을 껐다 켜도 잠금이 켜져 있었다면 자동으로 다시 시작합니다. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Prefs.isEnabled(context)) {
            VolumeLockService.start(context);
        }
    }
}
