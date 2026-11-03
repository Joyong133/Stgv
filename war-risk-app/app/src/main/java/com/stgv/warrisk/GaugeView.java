package com.stgv.warrisk;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.View;

/** 반원 위험 게이지: 관심·주의·경계·심각 네 구간과 현재 점수 바늘. */
public class GaugeView extends View {
    public static final int[] LEVEL_COLORS = {0xFF42A5F5, 0xFFFDD835, 0xFFFB8C00, 0xFFE53935};
    static final int[] BOUNDS = {0, 25, 50, 75, 100};

    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint needle = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();
    private int score = -1;

    public GaugeView(Context c, AttributeSet a) {
        super(c, a);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeCap(Paint.Cap.BUTT);
        needle.setStrokeCap(Paint.Cap.ROUND);
        label.setTextAlign(Paint.Align.CENTER);
        label.setColor(0xFF9AA4AF);
    }

    /** -1이면 아직 결과 없음. */
    public void setScore(int s) {
        score = s;
        invalidate();
    }

    @Override
    protected void onMeasure(int w, int h) {
        int width = MeasureSpec.getSize(w);
        setMeasuredDimension(width, (int) (width * 0.56f));
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight();
        float d = getResources().getDisplayMetrics().density;
        float stroke = 18 * d;
        float r = Math.min(w / 2f - stroke, h - stroke * 1.4f);
        float cx = w / 2f, cy = h - stroke * 0.8f;
        box.set(cx - r, cy - r, cx + r, cy + r);
        arc.setStrokeWidth(stroke);

        for (int i = 0; i < 4; i++) {
            arc.setColor(LEVEL_COLORS[i]);
            arc.setAlpha(score < 0 || RiskReport.levelFor(Math.max(score, 0)) == i ? 255 : 90);
            float start = 180 + BOUNDS[i] * 1.8f;
            float sweep = (BOUNDS[i + 1] - BOUNDS[i]) * 1.8f - 1.5f;
            c.drawArc(box, start, sweep, false, arc);
        }

        label.setTextSize(11 * d);
        for (int i = 0; i < 4; i++) {
            double mid = Math.toRadians(180 + (BOUNDS[i] + BOUNDS[i + 1]) * 0.9);
            float lr = r - stroke * 1.4f;
            c.drawText(RiskReport.LEVEL_NAMES[i], cx + (float) (Math.cos(mid) * lr),
                    cy + (float) (Math.sin(mid) * lr) + 4 * d, label);
        }

        if (score >= 0) {
            double ang = Math.toRadians(180 + score * 1.8);
            float nr = r - stroke * 0.2f;
            needle.setColor(0xFFECEFF1);
            needle.setStrokeWidth(4 * d);
            c.drawLine(cx, cy, cx + (float) (Math.cos(ang) * nr), cy + (float) (Math.sin(ang) * nr), needle);
            c.drawCircle(cx, cy, 7 * d, needle);
        }
    }
}
