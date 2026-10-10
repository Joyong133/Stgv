package com.stgv.timehider;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** 알림창 빠른 설정에서 한 번에 켜고 끄는 타일. */
public class HideTileService extends TileService {

    @Override
    public void onStartListening() {
        super.onStartListening();
        updateTile();
    }

    @Override
    public void onClick() {
        super.onClick();
        if (!Prefs.isServiceEnabled(this)) {
            openApp();
            return;
        }
        SharedPreferences prefs = Prefs.get(this);
        if (Prefs.isActive(prefs)) {
            Prefs.stop(this);
        } else {
            Prefs.start(this);
        }
        updateTile();
    }

    private void updateTile() {
        Tile tile = getQsTile();
        if (tile == null) return;
        boolean active = Prefs.isActive(Prefs.get(this)) && Prefs.isServiceEnabled(this);
        tile.setState(active ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        tile.setLabel(getString(R.string.tile_label));
        if (Build.VERSION.SDK_INT >= 29) {
            tile.setSubtitle(active ? "켜짐" : "꺼짐");
        }
        tile.updateTile();
    }

    @SuppressWarnings("deprecation")
    private void openApp() {
        Intent intent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= 34) {
            PendingIntent pi = PendingIntent.getActivity(
                    this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            startActivityAndCollapse(pi);
        } else {
            startActivityAndCollapse(intent);
        }
    }
}
