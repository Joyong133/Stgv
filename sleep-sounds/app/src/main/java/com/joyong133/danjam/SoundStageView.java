package com.joyong133.danjam;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

/**
 * 3D 소리 배치판: 위에서 내려다본 머리를 가운데 두고, 켜 둔 소리들을 둘레에 동그라미로 보여 준다.
 * 끌어서 방향(각도)과 거리(가운데서 떨어진 정도)를 바꾸고, 두 번 누르면 원래 자리로 돌아간다.
 * 넓게 퍼지는 소리는 반투명한 띠로 차지하는 폭을 함께 그린다.
 */
final class SoundStageView extends View {
    private static final float MIN_DIST = 0.3f, MAX_DIST = 30f;

    interface Listener {
        void onMove(String id, float az, float dist, boolean done);

        void onReset(String id);
    }

    static final class Item {
        final String id, emoji;
        float az, dist;
        final float width;
        float x, y;

        Item(String id, String emoji, float az, float dist, float width) {
            this.id = id;
            this.emoji = emoji;
            this.az = az;
            this.dist = dist;
            this.width = width;
        }
    }

    private final List<Item> items = new ArrayList<>();
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG), stroke = new Paint(Paint.ANTI_ALIAS_FLAG),
            label = new Paint(Paint.ANTI_ALIAS_FLAG), emoji = new Paint(Paint.ANTI_ALIAS_FLAG),
            band = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path nose = new Path();
    private final RectF oval = new RectF();
    private final GestureDetector gestures;
    private Listener listener;
    private Item dragging;
    private boolean moved;
    private final float bubble;

    SoundStageView(Context c) {
        super(c);
        bubble = Ui.dp(c, 23);
        stroke.setStyle(Paint.Style.STROKE);
        label.setColor(Ui.SUB);
        label.setTextSize(Ui.dp(c, 11));
        label.setTextAlign(Paint.Align.CENTER);
        emoji.setTextSize(Ui.dp(c, 22));
        emoji.setTextAlign(Paint.Align.CENTER);
        band.setStyle(Paint.Style.STROKE);
        band.setStrokeCap(Paint.Cap.ROUND);
        gestures = new GestureDetector(c, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDoubleTap(MotionEvent e) {
                Item it = hit(e.getX(), e.getY());
                if (it != null && listener != null) listener.onReset(it.id);
                return it != null;
            }
        });
        setContentDescription("소리 배치판: 소리를 끌어서 방향과 거리를 바꿔요");
    }

    void setListener(Listener l) {
        listener = l;
    }

    void setItems(List<Item> list) {
        items.clear();
        items.addAll(list);
        invalidate();
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        int w = MeasureSpec.getSize(widthSpec);
        int h = Math.min(w, Ui.dp(getContext(), 420));
        setMeasuredDimension(w, h);
    }

    private float radius() {
        return Math.min(getWidth(), getHeight()) / 2f - Ui.dp(getContext(), 14);
    }

    private static final double SPAN = Math.log(MAX_DIST / MIN_DIST);

    /** 거리(m) → 화면 반지름. 가까운 쪽을 넓게 보여 주려고 로그 눈금을 쓴다. */
    private float radiusOf(float dist) {
        double k = Math.log(Math.max(MIN_DIST, Math.min(MAX_DIST, dist)) / MIN_DIST) / SPAN;
        return radius() * (float) (0.22 + 0.78 * k);
    }

    private float distOf(float r) {
        double k = (r / radius() - 0.22) / 0.78;
        k = Math.max(0, Math.min(1, k));
        return (float) (MIN_DIST * Math.exp(k * SPAN));
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float cx = getWidth() / 2f, cy = getHeight() / 2f, R = radius();
        fill.setShader(new RadialGradient(cx, cy, R, 0xFF27326E, 0xFF111735, Shader.TileMode.CLAMP));
        canvas.drawCircle(cx, cy, R, fill);
        fill.setShader(null);

        stroke.setStrokeWidth(Ui.dp(getContext(), 1));
        stroke.setColor(0x30FFFFFF);
        for (float d : new float[]{1f, 3f, 10f}) {
            float r = radiusOf(d);
            canvas.drawCircle(cx, cy, r, stroke);
            canvas.drawText((int) d + "m", cx + r * 0.71f + Ui.dp(getContext(), 10), cy - r * 0.71f, label);
        }
        float lh = label.getTextSize();
        canvas.drawText("앞", cx, cy - R + lh + Ui.dp(getContext(), 4), label);
        canvas.drawText("뒤", cx, cy + R - Ui.dp(getContext(), 8), label);
        canvas.drawText("왼쪽", cx - R + Ui.dp(getContext(), 22), cy + lh / 3, label);
        canvas.drawText("오른쪽", cx + R - Ui.dp(getContext(), 26), cy + lh / 3, label);

        // 넓게 퍼지는 소리가 차지하는 폭
        band.setStrokeWidth(Ui.dp(getContext(), 9));
        for (Item it : items) {
            if (it.width < 15f) continue;
            float r = radiusOf(it.dist);
            band.setColor(it == dragging ? 0x55F6D98B : 0x26F6D98B);
            oval.set(cx - r, cy - r, cx + r, cy + r);
            if (it.width >= 200f) canvas.drawCircle(cx, cy, r, band);
            else canvas.drawArc(oval, it.az - it.width / 2 - 90, it.width, false, band);
        }

        // 머리 (위에서 본 모습: 코가 앞을 향한다)
        float head = Ui.dp(getContext(), 20);
        fill.setColor(0xFF3B4688);
        canvas.drawOval(cx - head - head * 0.28f, cy - head * 0.32f, cx - head + head * 0.12f, cy + head * 0.32f, fill);
        canvas.drawOval(cx + head - head * 0.12f, cy - head * 0.32f, cx + head + head * 0.28f, cy + head * 0.32f, fill);
        nose.reset();
        nose.moveTo(cx - head * 0.28f, cy - head * 0.9f);
        nose.lineTo(cx, cy - head * 1.32f);
        nose.lineTo(cx + head * 0.28f, cy - head * 0.9f);
        nose.close();
        canvas.drawPath(nose, fill);
        canvas.drawCircle(cx, cy, head, fill);
        stroke.setColor(0x66F6D98B);
        stroke.setStrokeWidth(Ui.dp(getContext(), 1.5f));
        canvas.drawCircle(cx, cy, head, stroke);

        layoutItems(cx, cy);
        for (Item it : items) {
            fill.setColor(it == dragging ? Ui.MOON : Ui.CARD_ON);
            canvas.drawCircle(it.x, it.y, bubble, fill);
            stroke.setColor(Ui.MOON);
            canvas.drawCircle(it.x, it.y, bubble, stroke);
            Paint.FontMetrics fm = emoji.getFontMetrics();
            canvas.drawText(it.emoji, it.x, it.y - (fm.ascent + fm.descent) / 2, emoji);
        }
    }

    /** 자리가 같은 소리끼리 겹치지 않게 조금씩 비켜서 그린다. */
    private void layoutItems(float cx, float cy) {
        for (int i = 0; i < items.size(); i++) {
            Item it = items.get(i);
            float r = radiusOf(it.dist);
            float az = it.az;
            for (int tries = 0; tries < 14; tries++) {
                double a = Math.toRadians(az);
                it.x = cx + r * (float) Math.sin(a);
                it.y = cy - r * (float) Math.cos(a);
                boolean clash = false;
                for (int j = 0; j < i; j++) {
                    Item o = items.get(j);
                    if (Math.hypot(o.x - it.x, o.y - it.y) < bubble * 1.8f) {
                        clash = true;
                        break;
                    }
                }
                if (!clash || it == dragging) break;
                az += (tries % 2 == 0 ? 1 : -1) * 16f * (tries / 2 + 1);
            }
        }
    }

    private Item hit(float x, float y) {
        Item best = null;
        double bestD = bubble * 1.4f;
        for (Item it : items) {
            double d = Math.hypot(it.x - x, it.y - y);
            if (d < bestD) {
                bestD = d;
                best = it;
            }
        }
        return best;
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        gestures.onTouchEvent(e);
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                dragging = hit(e.getX(), e.getY());
                moved = false;
                if (dragging != null) {
                    getParent().requestDisallowInterceptTouchEvent(true);
                    invalidate();
                    return true;
                }
                return false;
            case MotionEvent.ACTION_MOVE:
                if (dragging == null) return false;
                float dx = e.getX() - cx, dy = e.getY() - cy;
                float r = Math.min((float) Math.hypot(dx, dy), radius());
                dragging.az = (float) Math.toDegrees(Math.atan2(dx, -dy));
                dragging.dist = distOf(r);
                moved = true;
                if (listener != null) listener.onMove(dragging.id, dragging.az, dragging.dist, false);
                invalidate();
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (dragging == null) return false;
                if (moved && listener != null) listener.onMove(dragging.id, dragging.az, dragging.dist, true);
                dragging = null;
                invalidate();
                return true;
            default:
                return dragging != null;
        }
    }
}
