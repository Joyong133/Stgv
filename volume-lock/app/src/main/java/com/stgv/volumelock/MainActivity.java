package com.stgv.volumelock;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;

public class MainActivity extends Activity {
    private AudioManager audio;
    private Switch master;
    private Button dndButton;
    private boolean refreshing;
    private final CheckBox[] checks = new CheckBox[Prefs.STREAMS.length];
    private final SeekBar[] bars = new SeekBar[Prefs.STREAMS.length];
    private final TextView[] values = new TextView[Prefs.STREAMS.length];

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        setContentView(buildUi());

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                getResources().getDisplayMetrics());
    }

    private ScrollView buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(20));

        master = new Switch(this);
        master.setText("볼륨 잠금 켜기");
        master.setTextSize(22);
        master.setPadding(0, dp(8), 0, dp(8));
        master.setOnCheckedChangeListener((b, on) -> {
            if (refreshing || on == Prefs.isEnabled(this)) return;
            Prefs.setEnabled(this, on);
            if (on) {
                for (int i = 0; i < Prefs.STREAMS.length; i++) {
                    Prefs.setFloor(this, Prefs.STREAMS[i],
                            checks[i].isChecked() ? bars[i].getProgress() : -1);
                }
                VolumeLockService.start(this);
            }
            if (!on) VolumeLockService.stop(this);
        });
        root.addView(master);

        TextView help = new TextView(this);
        help.setText("체크한 항목은 아래 막대로 정한 볼륨보다 낮아지지 않습니다.\n"
                + "볼륨 버튼이나 다른 앱이 소리를 줄여도 바로 원래대로 돌아옵니다. "
                + "소리를 올리는 것은 자유롭게 됩니다.");
        help.setPadding(0, dp(4), 0, dp(16));
        root.addView(help);

        for (int i = 0; i < Prefs.STREAMS.length; i++) {
            final int idx = i;
            final int stream = Prefs.STREAMS[i];

            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);

            checks[i] = new CheckBox(this);
            checks[i].setText(Prefs.LABELS[i] + " 잠금");
            checks[i].setTextSize(17);
            row.addView(checks[i], new LinearLayout.LayoutParams(0, -2, 1));

            values[i] = new TextView(this);
            values[i].setTextSize(17);
            row.addView(values[i]);
            root.addView(row);

            bars[i] = new SeekBar(this);
            bars[i].setMax(audio.getStreamMaxVolume(stream));
            bars[i].setPadding(dp(16), dp(8), dp(16), dp(20));
            root.addView(bars[i]);

            checks[i].setOnCheckedChangeListener((b, on) -> {
                if (refreshing) return;
                Prefs.setFloor(this, stream, on ? bars[idx].getProgress() : -1);
                bars[idx].setEnabled(on);
                updateLabel(idx);
            });
            bars[i].setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                    if (fromUser && checks[idx].isChecked()) {
                        Prefs.setFloor(MainActivity.this, stream, p);
                        // 막대로 올린 만큼 실제 볼륨도 바로 맞춰 줍니다.
                        if (audio.getStreamVolume(stream) < p) {
                            try {
                                audio.setStreamVolume(stream, p, 0);
                            } catch (SecurityException ignored) {
                            }
                        }
                    }
                    updateLabel(idx);
                }

                @Override
                public void onStartTrackingTouch(SeekBar s) {}

                @Override
                public void onStopTrackingTouch(SeekBar s) {}
            });
        }

        Button current = new Button(this);
        current.setText("지금 볼륨을 최소 볼륨으로 정하기");
        current.setOnClickListener(v -> {
            for (int i = 0; i < Prefs.STREAMS.length; i++) {
                if (checks[i].isChecked()) {
                    Prefs.setFloor(this, Prefs.STREAMS[i], audio.getStreamVolume(Prefs.STREAMS[i]));
                }
            }
            refresh();
        });
        root.addView(current);

        Button dnd = dndButton = new Button(this);
        dnd.setText("방해 금지 권한 허용 (벨소리·알림 잠금용)");
        dnd.setOnClickListener(v -> {
            if (Build.VERSION.SDK_INT >= 23) {
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
            }
        });
        root.addView(dnd);

        TextView note = new TextView(this);
        note.setText("\n※ 잠금이 갑자기 꺼진다면 설정 > 애플리케이션 > 볼륨 잠금 > 배터리에서 "
                + "'제한 없음(최적화 안 함)'으로 바꿔 주세요.");
        root.addView(note);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        return scroll;
    }

    private void refresh() {
        refreshing = true;
        master.setChecked(Prefs.isEnabled(this));
        for (int i = 0; i < Prefs.STREAMS.length; i++) {
            int floor = Prefs.getFloor(this, Prefs.STREAMS[i]);
            boolean locked = floor >= 0;
            bars[i].setProgress(locked ? floor : audio.getStreamVolume(Prefs.STREAMS[i]));
            bars[i].setEnabled(locked);
            checks[i].setChecked(locked);
            updateLabel(i);
        }
        if (Build.VERSION.SDK_INT >= 23) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            dndButton.setVisibility(nm.isNotificationPolicyAccessGranted() ? View.GONE : View.VISIBLE);
        } else {
            dndButton.setVisibility(View.GONE);
        }
        refreshing = false;
    }

    private void updateLabel(int i) {
        values[i].setText(bars[i].getProgress() + " / " + bars[i].getMax());
    }
}
