package com.joyong133.danjam;

import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.res.ColorStateList;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

/**
 * 호흡 안내: 원을 따라 숨을 쉬며 몸을 가라앉힌다.
 * 4-7-8 호흡, 편안한 호흡(4초 들이쉬고 6초 내쉬기), 상자 호흡(4-4-4-4) 가운데 고른다.
 * '소리로 안내'를 켜 두면 눈을 감고도 숨결 소리를 따라 할 수 있다.
 */
final class BreathDialog {
    private static final String[] NAMES = {"4-7-8 호흡", "편안한 호흡", "상자 호흡"};
    private static final float[][] PATTERNS = {{4, 7, 8, 0}, {4, 0, 6, 0}, {4, 4, 4, 4}};
    private static final String[] ABOUT = {
            "4초 동안 코로 들이쉬고, 7초 멈추고, 8초 동안 입으로 천천히 내쉬어요. 네댓 번만 해도 몸이 차분해져요.",
            "4초 들이쉬고 6초 내쉬어요. 내쉬는 숨을 길게 하면 심장 박동이 느려지고 마음이 가라앉아요.",
            "4초씩 들이쉬고, 멈추고, 내쉬고, 다시 멈춰요. 생각이 많을 때 머리를 비우기 좋아요."};

    private final SoundService service;
    private final Dialog dialog;
    private final BreathView view;
    private final TextView about, button;
    private boolean sound = true, running;
    private int pattern;

    static Dialog show(Context c, SoundService service) {
        Dialog d = new BreathDialog(c, service).dialog;
        d.show();
        return d;
    }

    private static String spec(float[] p) {
        return (int) p[0] + "," + (int) p[1] + "," + (int) p[2] + "," + (int) p[3];
    }

    private BreathDialog(Context c, SoundService s) {
        service = s;
        LinearLayout root = new LinearLayout(c);
        root.setOrientation(LinearLayout.VERTICAL);
        dialog = Ui.fullScreen(c, root, null);
        root.addView(Ui.titleBar(c, "🌬️ 호흡 안내", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
            }
        }));
        ScrollView scroll = new ScrollView(c);
        LinearLayout body = new LinearLayout(c);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(Ui.dp(c, 18), Ui.dp(c, 4), Ui.dp(c, 18), Ui.dp(c, 24));
        scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        body.addView(new Ui.Segmented(c, NAMES, 0, new Ui.Segmented.Listener() {
            @Override
            public void onSelect(int index) {
                pattern = index;
                view.setPattern(PATTERNS[index]);
                about.setText(ABOUT[index]);
                if (running) begin();
            }
        }).view);
        about = Ui.text(c, ABOUT[0], 13, Ui.SUB, false);
        about.setPadding(Ui.dp(c, 4), Ui.dp(c, 12), Ui.dp(c, 4), Ui.dp(c, 6));
        body.addView(about);

        view = new BreathView(c);
        body.addView(view);

        LinearLayout row = new LinearLayout(c);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(Ui.dp(c, 4), Ui.dp(c, 8), 0, Ui.dp(c, 8));
        row.addView(Ui.text(c, "소리로 안내", 15, Ui.TEXT, true), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Switch sw = new Switch(c);
        sw.setChecked(true);
        sw.setThumbTintList(ColorStateList.valueOf(Ui.MOON));
        sw.setTrackTintList(ColorStateList.valueOf(0x66F6D98B));
        sw.setContentDescription("소리로 안내");
        sw.setOnCheckedChangeListener(new android.widget.CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(android.widget.CompoundButton b, boolean on) {
                sound = on;
                if (running) {
                    if (on) begin();
                    else service.stopBreath();
                }
            }
        });
        row.addView(sw);
        body.addView(row);

        button = Ui.text(c, "시작하기", 16, Ui.INK, true);
        button.setGravity(Gravity.CENTER);
        button.setPadding(0, Ui.dp(c, 14), 0, Ui.dp(c, 14));
        button.setBackground(Ui.rounded(Ui.MOON, Ui.dp(c, 26)));
        button.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (running) end();
                else begin();
            }
        });
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bp.topMargin = Ui.dp(c, 8);
        body.addView(button, bp);

        dialog.setOnDismissListener(new DialogInterface.OnDismissListener() {
            @Override
            public void onDismiss(DialogInterface d) {
                end();
            }
        });
    }

    /** 원과 소리를 같은 순간에 시작한다. */
    private void begin() {
        running = true;
        if (sound) service.startBreath(spec(PATTERNS[pattern]));
        view.start();
        button.setText("그만하기");
    }

    private void end() {
        running = false;
        service.stopBreath();
        view.stop();
        button.setText("시작하기");
    }
}
