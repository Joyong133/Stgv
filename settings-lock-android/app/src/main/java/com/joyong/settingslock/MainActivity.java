package com.joyong.settingslock;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.NumberPicker;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int MAX_HOURS = 168; // 최대 7일

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            refresh();
            handler.postDelayed(this, 1000);
        }
    };

    private LinearLayout statusCard;
    private TextView statusTitle;
    private TextView statusDetail;
    private LinearLayout serviceCard;
    private NumberPicker hourPicker;
    private NumberPicker minutePicker;
    private CheckBox blockUninstall;
    private CheckBox cameraLockScreen;
    private CheckBox cameraAlways;
    private Button startButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildUi());
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.post(ticker);
    }

    @Override
    protected void onPause() {
        super.onPause();
        handler.removeCallbacks(ticker);
    }

    // ───────────────────────── 화면 구성 ─────────────────────────

    private View buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        root.setPadding(pad, pad, pad, pad);

        // 현재 상태
        statusCard = card(Color.parseColor("#ECEFF1"));
        statusTitle = text(22, true);
        statusDetail = text(15, false);
        statusDetail.setPadding(0, dp(6), 0, 0);
        statusCard.addView(statusTitle);
        statusCard.addView(statusDetail);
        root.addView(statusCard);

        // 접근성 권한 안내 (꺼져 있을 때만 보임)
        serviceCard = card(Color.parseColor("#FFF3E0"));
        TextView warn = text(15, false);
        warn.setText("⚠ 먼저 접근성에서 '설정 잠금'을 켜야 잠금이 작동해요.\n"
                + "설정 앱이 열린 걸 알아채서 홈 화면으로 돌려보내는 데 필요합니다. "
                + "화면 내용은 읽지 않아요.");
        serviceCard.addView(warn);
        Button openA11y = button("접근성 설정 열기");
        openA11y.setOnClickListener(v -> startActivitySafely(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        serviceCard.addView(openA11y);
        TextView restricted = text(13, false);
        restricted.setTextColor(Color.parseColor("#5D4037"));
        restricted.setText("스위치가 회색이라 안 켜지면 (안드로이드 13 이상):\n"
                + "아래 버튼 → 오른쪽 위 ⋮ → '제한된 설정 허용' → 다시 접근성 설정에서 켜기");
        restricted.setPadding(0, dp(8), 0, 0);
        serviceCard.addView(restricted);
        Button openInfo = button("이 앱 정보 열기");
        openInfo.setOnClickListener(v -> startActivitySafely(new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))));
        serviceCard.addView(openInfo);
        root.addView(serviceCard);

        // 시간 고르기
        TextView label = text(17, true);
        label.setText("잠글 시간");
        label.setPadding(0, dp(20), 0, dp(4));
        root.addView(label);

        LinearLayout pickers = new LinearLayout(this);
        pickers.setOrientation(LinearLayout.HORIZONTAL);
        pickers.setGravity(Gravity.CENTER);
        hourPicker = picker(0, MAX_HOURS);
        minutePicker = picker(0, 59);
        minutePicker.setValue(30);
        pickers.addView(hourPicker);
        pickers.addView(unitLabel("시간"));
        pickers.addView(minutePicker);
        pickers.addView(unitLabel("분"));
        root.addView(pickers);

        root.addView(presetRow(new String[]{"10분", "30분", "1시간"}, new int[]{10, 30, 60}));
        root.addView(presetRow(new String[]{"3시간", "8시간", "하루"}, new int[]{180, 480, 1440}));

        blockUninstall = new CheckBox(this);
        blockUninstall.setText("잠금 중에는 앱 설치/삭제 화면도 막기 (이 앱을 지워서 푸는 걸 막아요)");
        blockUninstall.setTextSize(14);
        blockUninstall.setChecked(LockState.blockUninstall(this));
        blockUninstall.setPadding(0, dp(12), 0, dp(12));
        root.addView(blockUninstall);

        startButton = button("");
        startButton.setTextSize(18);
        startButton.setOnClickListener(v -> onStartClicked());
        root.addView(startButton);

        TextView note = text(13, false);
        note.setTextColor(Color.parseColor("#757575"));
        note.setText("• 잠금이 시작되면 시간이 끝날 때까지 끄거나 줄일 수 없어요. 시간을 더하는 것만 돼요.\n"
                + "• 잠금 중에 설정 앱(알림창의 톱니바퀴 포함)이나 홈 화면 설정을 열면 바로 홈 화면으로 돌아가요.\n"
                + "• 휴대폰을 껐다 켜도 잠금은 계속돼요.");
        note.setPadding(0, dp(16), 0, 0);
        root.addView(note);

        // 기타 기능
        TextView extra = text(17, true);
        extra.setText("기타 기능");
        extra.setPadding(0, dp(24), 0, dp(4));
        root.addView(extra);

        cameraLockScreen = new CheckBox(this);
        cameraLockScreen.setText("잠금화면에서 카메라 못 쓰게 하기\n(잠금화면 카메라 버튼, 전원 버튼 두 번 누르기 포함)");
        cameraLockScreen.setTextSize(14);
        cameraLockScreen.setChecked(LockState.blockCameraOnLockScreen(this));
        cameraLockScreen.setPadding(0, dp(8), 0, dp(8));
        root.addView(cameraLockScreen);

        cameraAlways = new CheckBox(this);
        cameraAlways.setText("잠금을 푼 상태에서도 카메라 앱 못 쓰게 하기");
        cameraAlways.setTextSize(14);
        cameraAlways.setChecked(LockState.blockCameraAlways(this));
        cameraAlways.setPadding(0, dp(8), 0, dp(8));
        root.addView(cameraAlways);

        CompoundButton.OnCheckedChangeListener saveCamera = (b, checked) -> {
            if (checked && !LockState.isServiceEnabled(this)) {
                Toast.makeText(this, "접근성에서 '설정 잠금'을 켜야 작동해요.", Toast.LENGTH_LONG).show();
            }
            LockState.setBlockCamera(this, cameraLockScreen.isChecked(), cameraAlways.isChecked());
            refresh();
        };
        cameraLockScreen.setOnCheckedChangeListener(saveCamera);
        cameraAlways.setOnCheckedChangeListener(saveCamera);

        TextView extraNote = text(13, false);
        extraNote.setTextColor(Color.parseColor("#757575"));
        extraNote.setText("• 체크해 두면 시간 잠금과 상관없이 계속 막아요.\n"
                + "• 시간 잠금 중에는 체크를 풀 수 없어요. (새로 켜는 건 돼요)");
        root.addView(extraNote);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        return scroll;
    }

    private LinearLayout presetRow(String[] labels, int[] minutes) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        for (int i = 0; i < labels.length; i++) {
            final int total = minutes[i];
            Button b = button(labels[i]);
            b.setOnClickListener(v -> {
                hourPicker.setValue(Math.min(MAX_HOURS, total / 60));
                minutePicker.setValue(total % 60);
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            lp.setMargins(dp(2), 0, dp(2), 0);
            row.addView(b, lp);
        }
        return row;
    }

    // ───────────────────────── 동작 ─────────────────────────

    private void refresh() {
        boolean locked = LockState.isLocked(this);
        boolean serviceOn = LockState.isServiceEnabled(this);

        if (locked) {
            statusTitle.setText("🔒 잠금 중");
            String end = new SimpleDateFormat("M월 d일 a h:mm", Locale.KOREAN).format(new Date(LockState.endAt(this)));
            statusDetail.setText("남은 시간 " + LockState.formatDuration(LockState.remainingMs(this))
                    + "\n" + end + "에 풀려요"
                    + (LockState.blockUninstall(this) ? "\n앱 설치/삭제 화면도 막는 중" : ""));
            setCardColor(statusCard, "#E8EAF6");
            startButton.setText("잠금 시간 더하기");
        } else {
            statusTitle.setText("🔓 잠금 꺼짐");
            statusDetail.setText("지금은 설정에 자유롭게 들어갈 수 있어요.");
            setCardColor(statusCard, "#ECEFF1");
            startButton.setText("잠금 시작");
        }
        blockUninstall.setEnabled(!locked);
        if (locked) blockUninstall.setChecked(LockState.blockUninstall(this));
        serviceCard.setVisibility(serviceOn ? View.GONE : View.VISIBLE);
        // 시간 잠금 중에는 켜져 있는 카메라 막기를 끌 수 없다.
        cameraLockScreen.setEnabled(!(locked && cameraLockScreen.isChecked()));
        cameraAlways.setEnabled(!(locked && cameraAlways.isChecked()));
    }

    private void onStartClicked() {
        long minutes = hourPicker.getValue() * 60L + minutePicker.getValue();
        if (minutes <= 0) {
            Toast.makeText(this, "잠글 시간을 1분 이상으로 골라 주세요.", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!LockState.isServiceEnabled(this)) {
            new AlertDialog.Builder(this)
                    .setTitle("접근성 권한이 꺼져 있어요")
                    .setMessage("접근성에서 '설정 잠금'을 먼저 켜야 설정을 막을 수 있어요.")
                    .setPositiveButton("접근성 설정 열기",
                            (d, w) -> startActivitySafely(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)))
                    .setNegativeButton("취소", null)
                    .show();
            return;
        }

        boolean locked = LockState.isLocked(this);
        String amount = (minutes >= 60 ? (minutes / 60) + "시간" : "")
                + (minutes >= 60 && minutes % 60 > 0 ? " " : "")
                + (minutes % 60 > 0 ? (minutes % 60) + "분" : "");
        String msg = locked
                ? "남은 시간에 " + amount + "을 더할까요?\n더한 시간은 되돌릴 수 없어요."
                : amount + " 동안 설정에 들어갈 수 없어요.\n시간이 끝나기 전에는 해제할 수 없어요. 시작할까요?";
        new AlertDialog.Builder(this)
                .setTitle(locked ? "잠금 시간 더하기" : "잠금 시작")
                .setMessage(msg)
                .setPositiveButton(locked ? "더하기" : "시작", (d, w) -> {
                    LockState.addLock(this, minutes * 60_000L, blockUninstall.isChecked());
                    refresh();
                })
                .setNegativeButton("취소", null)
                .show();
    }

    private void startActivitySafely(Intent i) {
        try {
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "화면을 열 수 없어요: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    // ───────────────────────── 작은 도우미 ─────────────────────────

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private TextView text(int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(sp);
        t.setTextColor(Color.parseColor("#212121"));
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        return b;
    }

    private TextView unitLabel(String s) {
        TextView t = text(18, false);
        t.setText(s);
        t.setPadding(dp(4), 0, dp(16), 0);
        return t;
    }

    private NumberPicker picker(int min, int max) {
        NumberPicker p = new NumberPicker(this);
        p.setMinValue(min);
        p.setMaxValue(max);
        p.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) p.setTextSize(dp(22));
        return p;
    }

    private LinearLayout card(int color) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        c.setPadding(pad, pad, pad, pad);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(12));
        c.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, dp(6), 0, dp(6));
        c.setLayoutParams(lp);
        return c;
    }

    private void setCardColor(LinearLayout c, String hex) {
        ((GradientDrawable) c.getBackground()).setColor(Color.parseColor(hex));
    }
}
