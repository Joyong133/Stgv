package com.stgv.warrisk;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.util.AttributeSet;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

/** 최근 위험 지수 추이 (가로: 확인 시각, 세로: 0~100, 배경에 단계 구간). */
public class TrendView extends View {
    private final Paint band = new Paint();
    private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private List<long[]> points = new ArrayList<>();

    public TrendView(Context c, AttributeSet a) {
        super(c, a);
        line.setStyle(Paint.Style.STROKE);
        line.setColor(0xFFECEFF1);
        line.setStrokeJoin(Paint.Join.ROUND);
        text.setColor(0xFF9AA4AF);
    }

    public void setPoints(List<long[]> p) {
        points = p;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas c) {
        float d = getResources().getDisplayMetrics().density;
        float w = getWidth(), h = getHeight();
        float top = 4 * d, bottom = h - 4 * d;

        for (int i = 0; i < 4; i++) {
            band.setColor(GaugeView.LEVEL_COLORS[i]);
            band.setAlpha(28);
            float y0 = bottom - (bottom - top) * GaugeView.BOUNDS[i + 1] / 100f;
            float y1 = bottom - (bottom - top) * GaugeView.BOUNDS[i] / 100f;
            c.drawRect(0, y0, w, y1, band);
        }

        if (points.size() < 2) {
            text.setTextSize(12 * d);
            text.setTextAlign(Paint.Align.CENTER);
            c.drawText("확인 기록이 쌓이면 추이가 표시됩니다", w / 2f, h / 2f + 4 * d, text);
            return;
        }
        long t0 = points.get(0)[0], t1 = points.get(points.size() - 1)[0];
        long span = Math.max(1, t1 - t0);
        Path path = new Path();
        line.setStrokeWidth(2 * d);
        for (int i = 0; i < points.size(); i++) {
            float x = (points.get(i)[0] - t0) / (float) span * (w - 8 * d) + 4 * d;
            float y = bottom - (bottom - top) * points.get(i)[1] / 100f;
            if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
        }
        c.drawPath(path, line);
        long[] last = points.get(points.size() - 1);
        dot.setColor(GaugeView.LEVEL_COLORS[RiskReport.levelFor((int) last[1])]);
        c.drawCircle(w - 4 * d, bottom - (bottom - top) * last[1] / 100f, 4 * d, dot);
    }
}
