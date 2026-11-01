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
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.widget.TextView;

public class MainActivity extends Activity {
    private AudioManager audio;
    private Button master;
    private Button dndButton;
    private Button a11yButton;
    private TextView status;
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
        // 서비스가 시스템에 의해 꺼졌어도 앱을 열면 다시 켭니다.
        if (Prefs.isEnabled(this) && !VolumeLockService.running) VolumeLockService.start(this);
        refresh();
        status.postDelayed(ticker, 1000);
    }

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            refreshStatus();
            status.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onPause() {
        status.removeCallbacks(ticker);
        super.onPause();
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                getResources().getDisplayMetrics());
    }

    private ScrollView buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(20));

        master = new Button(this);
        master.setTextSize(26);
        master.setTextColor(Color.WHITE);
        master.setPadding(dp(16), dp(28), dp(16), dp(28));
        master.setOnClickListener(v -> toggleLock());
        root.addView(master, new LinearLayout.LayoutParams(-1, -2));

        status = new TextView(this);
        status.setTextSize(16);
        status.setPadding(0, dp(4), 0, dp(4));
        root.addView(status);

        a11yButton = new Button(this);
        a11yButton.setText("① 볼륨 버튼 막기 켜기 (꼭 필요)");
        a11yButton.setOnClickListener(v -> {
            new android.app.AlertDialog.Builder(this)
                    .setTitle("볼륨 버튼 막기 켜는 법")
                    .setMessage("다음 화면에서 [설치된 앱] → [볼륨 잠금 - 볼륨 버튼 막기] → 사용 으로 켜 주세요.\n\n"
                            + "'제한된 설정'이라며 켜지지 않으면:\n"
                            + "설정 → 애플리케이션 → 볼륨 잠금 → 오른쪽 위 ⋮ → '제한된 설정 허용' 을 누른 뒤 다시 켜세요.")
                    .setPositiveButton("설정 열기", (d, w) ->
                            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)))
                    .setNeutralButton("앱 정보 열기", (d, w) ->
                            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                    android.net.Uri.parse("package:" + getPackageName()))))
                    .show();
        });
        root.addView(a11yButton);

        TextView help = new TextView(this);
        help.setText("잠금을 켜면 볼륨 내림 버튼이 막힙니다. 또 체크한 항목은 아래 막대로 정한 볼륨보다 낮아지지 않습니다.\n"
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
        boolean on = Prefs.isEnabled(this);
        master.setText(on ? "🔒 잠금 중\n(누르면 해제)" : "🔓 볼륨 잠금 시작");
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(20));
        bg.setColor(on ? Color.parseColor("#2E7D32") : Color.parseColor("#1565C0"));
        master.setBackground(bg);
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
        refreshStatus();
        refreshing = false;
    }

    private void toggleLock() {
        boolean on = !Prefs.isEnabled(this);
        if (on) {
            for (int i = 0; i < Prefs.STREAMS.length; i++) {
                Prefs.setFloor(this, Prefs.STREAMS[i],
                        checks[i].isChecked() ? bars[i].getProgress() : -1);
            }
            Prefs.setEnabled(this, true);
            VolumeLockService.start(this);
            if (!(isBlockerEnabled() && VolumeKeyBlocker.running)) {
                android.widget.Toast.makeText(this,
                        "잠금 시작! 볼륨 버튼까지 막으려면 아래 '볼륨 버튼 막기 켜기'도 해 주세요",
                        android.widget.Toast.LENGTH_LONG).show();
            }
        } else {
            Prefs.setEnabled(this, false);
            VolumeLockService.stop(this);
        }
        refresh();
    }

    private void refreshStatus() {
        boolean blocker = isBlockerEnabled() && VolumeKeyBlocker.running;
        a11yButton.setVisibility(blocker ? View.GONE : View.VISIBLE);
        String st;
        if (!Prefs.isEnabled(this)) st = "⚪ 잠금 꺼짐";
        else if (blocker) st = "🟢 잠금 작동 중 — 볼륨 내림 버튼이 막혀 있어요";
        else st = "🟡 잠금 켜짐 — 볼륨 버튼 막기(접근성)가 꺼져 있어요";
        int music = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
        st += "\n[진단] 감시 서비스: " + (VolumeLockService.running ? "실행 중" : "꺼짐")
                + " · 버튼 서비스: " + (VolumeKeyBlocker.running ? "연결됨" : "연결 안 됨")
                + "\n막은 버튼 " + VolumeKeyBlocker.blocked + "회 · 되돌린 볼륨 " + VolumeLockService.restored + "회"
                + " · 지금 미디어 볼륨 " + music + " (최소 " + Prefs.getFloor(this, AudioManager.STREAM_MUSIC) + ")";
        status.setText(st);
    }

    private boolean isBlockerEnabled() {
        String list = Settings.Secure.getString(getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        return list != null && list.contains(getPackageName() + "/");
    }

    private void updateLabel(int i) {
        values[i].setText(bars[i].getProgress() + " / " + bars[i].getMax());
    }
}
