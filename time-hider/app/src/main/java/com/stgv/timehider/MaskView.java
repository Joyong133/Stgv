package com.stgv.timehider;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;

import java.util.ArrayList;
import java.util.List;

/** 화면 전체를 덮는 투명한 창. 가려야 할 곳에만 검은 상자를 그린다. 터치는 그대로 통과한다. */
final class MaskView extends View {
    private final Paint paint = new Paint();
    private final List<Rect> rects = new ArrayList<>();
    private final int[] location = new int[2];
    private int topStrip;
    private int lockTopPercent;

    MaskView(Context context) {
        super(context);
        paint.setColor(Color.BLACK);
        paint.setStyle(Paint.Style.FILL);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    }

    /**
     * @param topStrip       화면 맨 위에서부터 가릴 높이(px). 0이면 안 가림.
     * @param lockTopPercent 화면 위에서부터 가릴 비율(%). 0이면 안 가림.
     * @param newRects       가릴 상자들(화면 좌표).
     */
    void update(int topStrip, int lockTopPercent, List<Rect> newRects) {
        if (this.topStrip == topStrip && this.lockTopPercent == lockTopPercent
                && rects.equals(newRects)) {
            return;
        }
        this.topStrip = topStrip;
        this.lockTopPercent = lockTopPercent;
        rects.clear();
        rects.addAll(newRects);
        invalidate();
    }

    /** 이 창이 받은 상태표시줄 높이. 아직 모르면 0. */
    int statusBarInset() {
        WindowInsets insets = getRootWindowInsets();
        if (insets == null) return 0;
        if (Build.VERSION.SDK_INT >= 30) {
            return insets.getInsetsIgnoringVisibility(
                    WindowInsets.Type.statusBars() | WindowInsets.Type.displayCutout()).top;
        }
        return insets.getStableInsetTop();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        getLocationOnScreen(location);
        int dx = location[0];
        int dy = location[1];
        int screenBottom = dy + getHeight();

        int top = topStrip;
        if (lockTopPercent > 0) {
            top = Math.max(top, screenBottom * lockTopPercent / 100);
        }
        if (top > 0) {
            canvas.drawRect(0, 0, getWidth(), top - dy, paint);
        }
        for (Rect r : rects) {
            canvas.drawRect(r.left - dx, r.top - dy, r.right - dx, r.bottom - dy, paint);
        }
    }
}
