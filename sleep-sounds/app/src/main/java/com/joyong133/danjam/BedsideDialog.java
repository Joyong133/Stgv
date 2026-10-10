package com.joyong133.danjam;

import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Random;

/**
 * 취침 화면: 검은 바탕에 아주 어둡게 시계와 남은 타이머만 보여 준다.
 * 화면 밝기를 최저로 낮추고, 화면 자국이 남지 않게 1분마다 위치를 살짝 옮긴다.
 * 두 번 누르면 돌아간다. 화면은 평소처럼 저절로 꺼진다.
 */
final class BedsideDialog implements SoundService.Listener {
    private static final int DIM = 0xFF5A6290, DIMMER = 0xFF3A4068;

    private final SoundService service;
    private final Dialog dialog;
    private final LinearLayout box;
    private final TextView clock, date, status, toggle;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Random random = new Random();
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            update();
            handler.postDelayed(this, 1000);
        }
    };
    private int lastMinute = -1;

    static Dialog show(Context c, SoundService service) {
        Dialog d = new BedsideDialog(c, service).dialog;
        d.show();
        return d;
    }

    private BedsideDialog(Context c, SoundService s) {
        service = s;
        FrameLayout root = new FrameLayout(c);
        dialog = Ui.fullScreen(c, root, Ui.black());
        WindowManager.LayoutParams lp = dialog.getWindow().getAttributes();
        lp.screenBrightness = 0.01f;
        dialog.getWindow().setAttributes(lp);

        box = new LinearLayout(c);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        clock = Ui.text(c, "", 80, DIM, false);
        clock.setTypeface(Typeface.create("sans-serif-thin", Typeface.NORMAL));
        box.addView(clock);
        date = Ui.text(c, "", 15, DIMMER, false);
        box.addView(date);
        status = Ui.text(c, "", 14, DIMMER, false);
        status.setGravity(Gravity.CENTER);
        status.setPadding(Ui.dp(c, 24), Ui.dp(c, 28), Ui.dp(c, 24), Ui.dp(c, 18));
        box.addView(status);
        toggle = Ui.text(c, "", 15, DIM, true);
        toggle.setPadding(Ui.dp(c, 22), Ui.dp(c, 10), Ui.dp(c, 22), Ui.dp(c, 10));
        android.graphics.drawable.GradientDrawable ring = Ui.rounded(0xFF000000, Ui.dp(c, 22));
        ring.setStroke(Ui.dp(c, 1), DIMMER);
        toggle.setBackground(ring);
        toggle.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (service.isPlaying() && !service.focusMuted()) service.pause();
                else service.play();
            }
        });
        box.addView(toggle);
        root.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        TextView hint = Ui.text(c, "두 번 누르면 돌아가요 · 화면은 평소처럼 저절로 꺼져요", 12, DIMMER, false);
        FrameLayout.LayoutParams hp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        hp.bottomMargin = Ui.dp(c, 28);
        root.addView(hint, hp);

        final GestureDetector g = new GestureDetector(c, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDoubleTap(MotionEvent e) {
                dialog.dismiss();
                return true;
            }

            @Override
            public boolean onDown(MotionEvent e) {
                return true;
            }
        });
        root.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent e) {
                return g.onTouchEvent(e);
            }
        });

        service.addListener(this);
        dialog.setOnDismissListener(new DialogInterface.OnDismissListener() {
            @Override
            public void onDismiss(DialogInterface d) {
                handler.removeCallbacks(tick);
                service.removeListener(BedsideDialog.this);
            }
        });
        handler.post(tick);
    }

    private void update() {
        Date now = new Date();
        clock.setText(new SimpleDateFormat("HH:mm", Locale.KOREA).format(now));
        date.setText(new SimpleDateFormat("M월 d일 EEEE", Locale.KOREA).format(now));
        int minute = (int) (now.getTime() / 60_000);
        if (minute != lastMinute) {
            // 화면 자국이 남지 않도록 조금씩 옮긴다
            lastMinute = minute;
            box.setTranslationX((random.nextFloat() - 0.5f) * Ui.dp(box.getContext(), 40));
            box.setTranslationY((random.nextFloat() - 0.5f) * Ui.dp(box.getContext(), 60));
        }
        StringBuilder sb = new StringBuilder();
        if (service.mix().isEmpty()) sb.append("켜 둔 소리가 없어요");
        else sb.append(service.title());
        long left = service.timerRemaining();
        boolean locked = service.locked();
        if (locked) sb.append("\n🎯 집중 ").append((service.focusRemaining() + 59_999) / 60_000).append("분 남음");
        else if (left > 0) sb.append("\n").append((left + 59_999) / 60_000).append("분 뒤에 꺼져요");
        status.setText(sb.toString());
        boolean sounding = service.isPlaying() && !service.focusMuted();
        toggle.setText(sounding ? "❚❚  일시정지" : "▶  재생");
        // 집중 중에는 멈출 수 없으니 단추를 숨긴다 (이어폰이 빠졌거나 전화로 멈췄을 때만 '재생')
        toggle.setVisibility(service.mix().isEmpty() || (locked && sounding) ? View.GONE : View.VISIBLE);
    }

    @Override
    public void onStateChanged() {
        update();
    }

    @Override
    public void onTimerTick() {
    }
}
