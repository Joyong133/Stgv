package com.stgv.warrisk;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.View;

/**
 * 전쟁 가능성 막대. 0.1%~90%를 로그 눈금으로 그려 0.2%(평시)와 5%의 차이도 눈에 보이게 한다.
 * 눈금: 평시(0.2%) · 1% · 10% · 50%.
 */
public class ProbBarView extends View {
    static final double MIN = 0.001, MAX = 0.9;
    static final double[] TICKS = {0.002, 0.01, 0.1, 0.5};
    static final String[] TICK_NAMES = {"평시", "1%", "10%", "50%"};

    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint tick = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF();
    private double p = -1;

    public ProbBarView(Context c, AttributeSet a) {
        super(c, a);
        track.setColor(0xFF26303A);
        tick.setColor(0xFF9AA4AF);
        text.setColor(0xFF9AA4AF);
        text.setTextAlign(Paint.Align.CENTER);
    }

    public void setProbability(double prob) {
        p = prob;
        invalidate();
    }

    static float pos(double prob) {
        double v = Math.max(MIN, Math.min(MAX, prob));
        return (float) ((Math.log(v) - Math.log(MIN)) / (Math.log(MAX) - Math.log(MIN)));
    }

    /** 확률 구간 색 (게이지와 같은 4색). */
    static int colorFor(double prob) {
        if (prob >= 0.1) return GaugeView.LEVEL_COLORS[3];
        if (prob >= 0.03) return GaugeView.LEVEL_COLORS[2];
        if (prob >= 0.008) return GaugeView.LEVEL_COLORS[1];
        return GaugeView.LEVEL_COLORS[0];
    }

    @Override
    protected void onDraw(Canvas c) {
        float d = getResources().getDisplayMetrics().density;
        float w = getWidth();
        float barH = 10 * d, top = 2 * d;
        r.set(0, top, w, top + barH);
        c.drawRoundRect(r, barH / 2, barH / 2, track);

        if (p >= 0) {
            float x = Math.max(barH, pos(p) * w);
            fill.setShader(new LinearGradient(0, 0, w, 0,
                    new int[]{GaugeView.LEVEL_COLORS[0], GaugeView.LEVEL_COLORS[1],
                            GaugeView.LEVEL_COLORS[2], GaugeView.LEVEL_COLORS[3]},
                    new float[]{pos(0.002), pos(0.01), pos(0.04), pos(0.15)}, Shader.TileMode.CLAMP));
            r.set(0, top, x, top + barH);
            c.drawRoundRect(r, barH / 2, barH / 2, fill);
        }

        text.setTextSize(10 * d);
        tick.setStrokeWidth(1 * d);
        for (int i = 0; i < TICKS.length; i++) {
            float x = pos(TICKS[i]) * w;
            c.drawLine(x, top + barH + 2 * d, x, top + barH + 6 * d, tick);
            c.drawText(TICK_NAMES[i], x, top + barH + 17 * d, text);
        }
    }
}
