package com.stgv.timerlock;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

/** 남은 시간을 원형 게이지로 그리는 뷰. */
public class CountdownRingView extends View {
    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF bounds = new RectF();
    private float progress = 1f;

    public CountdownRingView(Context context) {
        super(context);
        float stroke = 12 * context.getResources().getDisplayMetrics().density;
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(stroke);
        track.setColor(0x33FFFFFF);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeWidth(stroke);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setColor(0xFFFFD54F);
    }

    /** @param value 1(가득) ~ 0(끝) */
    public void setProgress(float value) {
        progress = Math.max(0f, Math.min(1f, value));
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float half = track.getStrokeWidth() / 2f;
        bounds.set(half, half, getWidth() - half, getHeight() - half);
        canvas.drawOval(bounds, track);
        canvas.drawArc(bounds, -90f, 360f * progress, false, arc);
    }
}
