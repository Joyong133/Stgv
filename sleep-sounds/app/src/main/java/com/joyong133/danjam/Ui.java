package com.joyong133.danjam;

import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.Window;
import android.view.WindowInsets;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/** 화면 곳곳에서 쓰는 색과 모양. 밤에 눈이 편하도록 어두운 남색 바탕에 달빛 노랑을 강조색으로 쓴다. */
final class Ui {
    static final int BG_TOP = 0xFF141B3A, BG_BOTTOM = 0xFF070A17;
    static final int CARD = 0xFF19214A, CARD_ON = 0xFF33408A, BAR = 0xF21C2552;
    static final int TEXT = 0xFFEAEDFF, SUB = 0xFF8E97C0, MOON = 0xFFF6D98B, SKY = 0xFF9DB4FF, INK = 0xFF151B3C;

    private Ui() {
    }

    static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }

    static GradientDrawable rounded(int color, float radiusPx) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radiusPx);
        return d;
    }

    static GradientDrawable oval(int color) {
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(color);
        return d;
    }

    static GradientDrawable night() {
        return new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{BG_TOP, BG_BOTTOM});
    }

    static TextView text(Context c, CharSequence s, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    static void style(SeekBar bar) {
        bar.setProgressTintList(ColorStateList.valueOf(MOON));
        bar.setThumbTintList(ColorStateList.valueOf(MOON));
        bar.setProgressBackgroundTintList(ColorStateList.valueOf(0x66FFFFFF));
    }

    /**
     * 화면 전체를 덮는 대화상자. 상태 표시줄 뒤까지 그리고, 시스템 막대만큼 안쪽으로 여백을 준다.
     * background 가 null 이면 밤하늘 그라데이션.
     */
    @SuppressWarnings("deprecation")
    static Dialog fullScreen(Context c, final View content, android.graphics.drawable.Drawable background) {
        Dialog d = new Dialog(c, android.R.style.Theme_Material_NoActionBar);
        d.setContentView(content);
        Window w = d.getWindow();
        w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        w.setBackgroundDrawable(background != null ? background : night());
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        content.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                int[] s = bars(insets);
                v.setPadding(s[0], s[1], s[2], s[3]);
                return insets;
            }
        });
        return d;
    }

    /** 시스템 막대(상태 표시줄·내비게이션 바·화면 구멍)가 차지하는 {왼쪽, 위, 오른쪽, 아래} */
    @SuppressWarnings("deprecation")
    static int[] bars(WindowInsets insets) {
        if (Build.VERSION.SDK_INT >= 30) {
            Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            return new int[]{i.left, i.top, i.right, i.bottom};
        }
        return new int[]{insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()};
    }

    static ColorDrawable black() {
        return new ColorDrawable(Color.BLACK);
    }

    /** 대화상자 위쪽 제목줄: 제목과 닫기 단추 */
    static LinearLayout titleBar(Context c, String title, View.OnClickListener close) {
        LinearLayout bar = new LinearLayout(c);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(c, 20), dp(c, 14), dp(c, 8), dp(c, 6));
        bar.addView(text(c, title, 22, TEXT, true), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        android.widget.ImageButton x = new android.widget.ImageButton(c);
        x.setBackground(null);
        x.setImageResource(R.drawable.ic_close);
        x.setImageTintList(ColorStateList.valueOf(SUB));
        x.setContentDescription("닫기");
        x.setOnClickListener(close);
        bar.addView(x, new LinearLayout.LayoutParams(dp(c, 48), dp(c, 48)));
        return bar;
    }

    /** 설정 항목 제목과 설명 */
    static void section(LinearLayout parent, String title, String hint) {
        Context c = parent.getContext();
        TextView t = text(c, title, 15, TEXT, true);
        t.setPadding(dp(c, 4), dp(c, 18), dp(c, 4), dp(c, 6));
        parent.addView(t);
        if (hint != null) {
            TextView h = text(c, hint, 12, SUB, false);
            h.setPadding(dp(c, 4), 0, dp(c, 4), dp(c, 8));
            parent.addView(h);
        }
    }

    /** 양 끝에 설명이 붙은 슬라이더 */
    static SeekBar slider(LinearLayout parent, String left, String right, int value, SeekBar.OnSeekBarChangeListener l) {
        Context c = parent.getContext();
        SeekBar bar = new SeekBar(c);
        bar.setMax(100);
        bar.setProgress(value);
        style(bar);
        bar.setOnSeekBarChangeListener(l);
        parent.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(c, 40)));
        if (left != null) {
            LinearLayout row = new LinearLayout(c);
            row.setPadding(dp(c, 8), 0, dp(c, 8), 0);
            TextView a = text(c, left, 11, SUB, false), b = text(c, right, 11, SUB, false);
            b.setGravity(Gravity.END);
            row.addView(a, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            row.addView(b, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            parent.addView(row);
        }
        return bar;
    }

    /** 사용자가 끌 때만 알려 주는 슬라이더 리스너 */
    abstract static class OnSlide implements SeekBar.OnSeekBarChangeListener {
        abstract void onSlide(int value);

        @Override
        public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
            if (fromUser) onSlide(progress);
        }

        @Override
        public void onStartTrackingTouch(SeekBar bar) {
        }

        @Override
        public void onStopTrackingTouch(SeekBar bar) {
        }
    }

    /** 둥근 알약 버튼 */
    static TextView pill(Context c, String label, View.OnClickListener click) {
        TextView t = text(c, label, 13, TEXT, true);
        t.setGravity(Gravity.CENTER);
        t.setSingleLine(true);
        t.setPadding(dp(c, 12), dp(c, 8), dp(c, 12), dp(c, 8));
        t.setBackground(rounded(CARD, dp(c, 18)));
        t.setOnClickListener(click);
        return t;
    }

    /** 고른 칸이 강조되는 여러 칸 선택 막대. */
    static final class Segmented {
        final LinearLayout view;
        private final List<TextView> cells = new ArrayList<>();
        private final Context c;

        interface Listener {
            void onSelect(int index);
        }

        Segmented(Context c, String[] labels, int selected, final Listener listener) {
            this.c = c;
            view = new LinearLayout(c);
            view.setPadding(dp(c, 3), dp(c, 3), dp(c, 3), dp(c, 3));
            view.setBackground(rounded(CARD, dp(c, 20)));
            for (int i = 0; i < labels.length; i++) {
                final int index = i;
                TextView t = text(c, labels[i], 13, SUB, true);
                t.setGravity(Gravity.CENTER);
                t.setSingleLine(true);
                t.setPadding(dp(c, 4), dp(c, 8), dp(c, 4), dp(c, 8));
                t.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        select(index);
                        listener.onSelect(index);
                    }
                });
                view.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
                cells.add(t);
            }
            select(selected);
        }

        void select(int index) {
            for (int i = 0; i < cells.size(); i++) {
                boolean on = i == index;
                cells.get(i).setTextColor(on ? INK : SUB);
                cells.get(i).setBackground(on ? rounded(SKY, dp(c, 17)) : null);
            }
        }
    }
}
