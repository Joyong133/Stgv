package com.stgv.timehider;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.RadioGroup;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity implements SharedPreferences.OnSharedPreferenceChangeListener {

    private static final int[] DURATION_IDS = {
            R.id.dur_0, R.id.dur_30, R.id.dur_60, R.id.dur_120, R.id.dur_240, R.id.dur_480};
    private static final int[] DURATION_MINUTES = {0, 30, 60, 120, 240, 480};

    private SharedPreferences prefs;
    private TextView status;
    private Button toggle;
    private TextView lockTopLabel;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        prefs = Prefs.get(this);

        status = findViewById(R.id.status);
        toggle = findViewById(R.id.toggle);
        lockTopLabel = findViewById(R.id.lock_top_label);

        toggle.setOnClickListener(v -> onToggle());

        RadioGroup duration = findViewById(R.id.duration);
        int savedMinutes = prefs.getInt(Prefs.KEY_DURATION_MIN, 0);
        int checkedId = R.id.dur_0;
        for (int i = 0; i < DURATION_MINUTES.length; i++) {
            if (DURATION_MINUTES[i] == savedMinutes) checkedId = DURATION_IDS[i];
        }
        duration.check(checkedId);
        duration.setOnCheckedChangeListener((group, id) -> {
            for (int i = 0; i < DURATION_IDS.length; i++) {
                if (DURATION_IDS[i] == id) {
                    prefs.edit().putInt(Prefs.KEY_DURATION_MIN, DURATION_MINUTES[i]).apply();
                }
            }
        });

        bindCheckBox(R.id.mask_status_bar, Prefs.KEY_MASK_STATUS_BAR, Prefs.DEFAULT_MASK_STATUS_BAR);
        bindCheckBox(R.id.mask_time_text, Prefs.KEY_MASK_TIME_TEXT, Prefs.DEFAULT_MASK_TIME_TEXT);
        bindCheckBox(R.id.mask_lock_top, Prefs.KEY_MASK_LOCK_TOP, Prefs.DEFAULT_MASK_LOCK_TOP);

        SeekBar lockTop = findViewById(R.id.lock_top_percent);
        int percent = prefs.getInt(Prefs.KEY_LOCK_TOP_PERCENT, Prefs.DEFAULT_LOCK_TOP_PERCENT);
        lockTop.setProgress(percent);
        showLockTopPercent(percent);
        lockTop.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int value, boolean fromUser) {
                showLockTopPercent(value);
                if (fromUser) prefs.edit().putInt(Prefs.KEY_LOCK_TOP_PERCENT, value).apply();
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
            }
        });

        findViewById(R.id.open_a11y).setOnClickListener(v -> openAccessibilitySettings());
        findViewById(R.id.open_app_info).setOnClickListener(v -> startActivity(
                new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", getPackageName(), null))));
    }

    @Override
    protected void onResume() {
        super.onResume();
        prefs.registerOnSharedPreferenceChangeListener(this);
        render();
    }

    @Override
    protected void onPause() {
        prefs.unregisterOnSharedPreferenceChangeListener(this);
        super.onPause();
    }

    @Override
    public void onSharedPreferenceChanged(SharedPreferences sharedPreferences, String key) {
        render();
    }

    private void onToggle() {
        if (Prefs.isActive(prefs)) {
            Prefs.stop(this);
            return;
        }
        Prefs.start(this);
        if (!Prefs.isServiceEnabled(this)) {
            Toast.makeText(this, R.string.toast_need_a11y, Toast.LENGTH_LONG).show();
            openAccessibilitySettings();
        }
    }

    private void render() {
        boolean serviceOn = Prefs.isServiceEnabled(this);
        boolean active = Prefs.isActive(prefs);
        if (!serviceOn) {
            status.setText(R.string.status_need_a11y);
        } else if (active) {
            status.setText(Prefs.hasTimer(prefs) ? R.string.status_on_timer : R.string.status_on);
        } else {
            status.setText(R.string.status_off);
        }
        toggle.setText(active ? R.string.toggle_stop : R.string.toggle_start);
    }

    private void bindCheckBox(int viewId, String key, boolean defaultValue) {
        CheckBox box = findViewById(viewId);
        box.setChecked(prefs.getBoolean(key, defaultValue));
        box.setOnCheckedChangeListener((b, checked) -> prefs.edit().putBoolean(key, checked).apply());
    }

    private void showLockTopPercent(int percent) {
        lockTopLabel.setText(getString(R.string.lock_top_label, percent));
    }

    private void openAccessibilitySettings() {
        try {
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        } catch (ActivityNotFoundException e) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }
}
