package com.joyong.touchlock;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** 설명 화면: 권한을 허용하고 떠 있는 잠금 버튼을 켜고 끈다. */
public class MainActivity extends Activity {
    private TextView status;
    private Button permBtn, toggleBtn;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(24);
        box.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("🔒 터치 잠금");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        box.addView(title);

        TextView how = new TextView(this);
        how.setText("\n사용법\n"
                + "• 화면 가장자리에 뜨는 🔒 버튼을 두 번 누르면 화면 터치가 잠겨요.\n"
                + "• 잠긴 동안에는 오른쪽에 생기는 🔓 버튼을 두 번 눌러야 다시 터치할 수 있어요.\n"
                + "• 🔒 버튼은 끌어서 원하는 곳으로 옮길 수 있어요.\n"
                + "• 🔓 버튼이 안 눌릴 땐 알림창을 내려 [잠금 해제]를 누르세요.\n"
                + "• 홈·뒤로가기 버튼과 알림창은 안드로이드 정책상 막을 수 없어요.\n");
        how.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        how.setLineSpacing(0, 1.25f);
        box.addView(how);

        status = new TextView(this);
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        status.setTypeface(Typeface.DEFAULT_BOLD);
        status.setPadding(0, dp(8), 0, dp(16));
        box.addView(status);

        permBtn = new Button(this);
        permBtn.setText("1단계: 다른 앱 위에 표시 허용하기");
        permBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName())));
            }
        });
        box.addView(permBtn);

        toggleBtn = new Button(this);
        toggleBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent svc = new Intent(MainActivity.this, LockService.class);
                if (LockService.running) {
                    stopService(svc);
                    LockService.running = false;
                } else {
                    startForegroundService(svc);
                    LockService.running = true;
                    moveTaskToBack(true); // 바로 쓰던 앱으로 돌아가서 잠금 버튼을 쓸 수 있게
                }
                refresh();
            }
        });
        box.addView(toggleBtn);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(box);
        setContentView(scroll);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void refresh() {
        boolean allowed = Settings.canDrawOverlays(this);
        permBtn.setVisibility(allowed ? View.GONE : View.VISIBLE);
        toggleBtn.setEnabled(allowed);
        toggleBtn.setText(LockService.running ? "잠금 버튼 끄기" : (allowed ? "잠금 버튼 켜기" : "2단계: 잠금 버튼 켜기"));
        if (!allowed) {
            status.setText("먼저 '다른 앱 위에 표시' 권한을 허용해 주세요.");
        } else if (LockService.running) {
            status.setText("✅ 잠금 버튼이 켜져 있어요. 다른 앱을 쓰다가 🔒 버튼을 두 번 누르세요.");
        } else {
            status.setText("준비 완료! 아래 버튼을 눌러 잠금 버튼을 켜세요.");
        }
    }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
