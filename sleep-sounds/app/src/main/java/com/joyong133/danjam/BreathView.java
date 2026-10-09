package com.joyong133.danjam;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.os.SystemClock;
import android.view.View;

/** 호흡 안내 원: 들이쉴 때 커지고, 멈출 때 머물고, 내쉴 때 작아진다. 가운데에 할 일과 남은 초를 보여 준다. */
final class BreathView extends View {
    private static final String[] WORDS = {"들이쉬세요", "멈추세요", "내쉬세요", "멈추세요"};

    private float[] phase = {4, 7, 8, 0};
    private long start;
    private boolean running;
    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG), ring = new Paint(Paint.ANTI_ALIAS_FLAG),
            word = new Paint(Paint.ANTI_ALIAS_FLAG), count = new Paint(Paint.ANTI_ALIAS_FLAG);
    private int cycles;

    BreathView(Context c) {
        super(c);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(Ui.dp(c, 1.5f));
        ring.setColor(0x55F6D98B);
        word.setColor(Ui.TEXT);
        word.setTextSize(Ui.dp(c, 22));
        word.setTextAlign(Paint.Align.CENTER);
        word.setFakeBoldText(true);
        count.setColor(Ui.SUB);
        count.setTextSize(Ui.dp(c, 16));
        count.setTextAlign(Paint.Align.CENTER);
        setContentDescription("호흡 안내 원");
    }

    void setPattern(float[] p) {
        phase = p;
        invalidate();
    }

    void start() {
        start = SystemClock.uptimeMillis();
        running = true;
        postInvalidateOnAnimation();
    }

    void stop() {
        running = false;
        invalidate();
    }

    int cycles() {
        return cycles;
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        int w = MeasureSpec.getSize(widthSpec);
        setMeasuredDimension(w, Math.min(w, Ui.dp(getContext(), 340)));
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        float max = Math.min(cx, cy) * 0.92f, min = max * 0.38f;
        float level = 0f;
        String w = "시작을 누르세요", sub = "";
        if (running) {
            float total = phase[0] + phase[1] + phase[2] + phase[3];
            float t = (SystemClock.uptimeMillis() - start) / 1000f;
            cycles = (int) (t / total);
            float x = t % total;
            int k = 0;
            while (k < 3 && x >= phase[k]) {
                x -= phase[k];
                k++;
            }
            float p = phase[k] > 0 ? x / phase[k] : 1f;
            switch (k) {
                case 0: level = (float) (0.5 - 0.5 * Math.cos(Math.PI * p)); break;
                case 1: level = 1f; break;
                case 2: level = (float) (0.5 + 0.5 * Math.cos(Math.PI * p)); break;
                default: level = 0f; break;
            }
            w = WORDS[k];
            sub = String.valueOf((int) Math.ceil(phase[k] - x));
            postInvalidateOnAnimation();
        }
        float r = min + (max - min) * level;
        glow.setShader(new RadialGradient(cx, cy, Math.max(1f, r), new int[]{0x80F6D98B, 0x339DB4FF, 0x00000000},
                new float[]{0f, 0.7f, 1f}, Shader.TileMode.CLAMP));
        canvas.drawCircle(cx, cy, r, glow);
        canvas.drawCircle(cx, cy, max, ring);
        canvas.drawCircle(cx, cy, min, ring);
        canvas.drawText(w, cx, cy, word);
        canvas.drawText(sub, cx, cy + Ui.dp(getContext(), 30), count);
    }
}
