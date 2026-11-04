package com.joyong.touchlock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * 다른 앱 위에 떠 있는 잠금 버튼(🔒)과 터치 차단 화면을 관리한다.
 *  - 🔒 버튼을 두 번 누르면 화면 전체를 덮는 투명한 막이 생겨 모든 터치를 먹는다.
 *  - 막 오른쪽의 해제 버튼을 두 번 누르면 막이 사라지고 다시 터치할 수 있다.
 */
public class LockService extends Service {
    static final String ACTION_STOP = "com.joyong.touchlock.STOP";
    static final String ACTION_UNLOCK = "com.joyong.touchlock.UNLOCK";
    static final String CHANNEL = "lock";
    static final long DOUBLE_TAP_MS = 400;
    static final int COLOR_PANEL = 0xDD1D2236;
    static final int COLOR_ARMED = 0xFFD9620B;
    static final int COLOR_MAPLE = 0xFFFF9A1F;

    static boolean running;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager wm;
    private TextView bubble;
    private WindowManager.LayoutParams bubbleLp;
    private FrameLayout shield;
    private boolean locked;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        startForeground(1, buildNotification());
        if (Settings.canDrawOverlays(this)) {
            showBubble();
        } else {
            stopSelf();
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopSelf();
        } else if (ACTION_UNLOCK.equals(action)) {
            unlock();
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        handler.removeCallbacksAndMessages(null);
        removeView(shield);
        removeView(bubble);
        shield = null;
        bubble = null;
        super.onDestroy();
    }

    // ───────────── 🔒 떠 있는 버튼 ─────────────

    private void showBubble() {
        int size = dp(56);
        bubble = new TextView(this);
        bubble.setText("🔒");
        bubble.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
        bubble.setGravity(Gravity.CENTER);
        bubble.setBackground(round(COLOR_PANEL, size / 2f));
        bubble.setContentDescription("터치 잠금 버튼. 두 번 누르면 잠깁니다");

        bubbleLp = new WindowManager.LayoutParams(size, size,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        bubbleLp.gravity = Gravity.TOP | Gravity.START;
        bubbleLp.x = getResources().getDisplayMetrics().widthPixels - size - dp(8);
        bubbleLp.y = getResources().getDisplayMetrics().heightPixels / 3;

        final int slop = ViewConfiguration.get(this).getScaledTouchSlop();
        bubble.setOnTouchListener(new View.OnTouchListener() {
            float startX, startY;
            int origX, origY;
            boolean moved;
            long lastTap;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = e.getRawX();
                        startY = e.getRawY();
                        origX = bubbleLp.x;
                        origY = bubbleLp.y;
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - startX, dy = e.getRawY() - startY;
                        if (!moved && Math.hypot(dx, dy) > slop) moved = true;
                        if (moved) {
                            // 끌어서 원하는 위치로 옮길 수 있다
                            bubbleLp.x = origX + (int) dx;
                            bubbleLp.y = origY + (int) dy;
                            wm.updateViewLayout(bubble, bubbleLp);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moved) {
                            long now = SystemClock.uptimeMillis();
                            if (now - lastTap < DOUBLE_TAP_MS) {
                                lastTap = 0;
                                lock();
                            } else {
                                lastTap = now;
                                armFlash(bubble, size / 2f);
                            }
                        }
                        return true;
                }
                return false;
            }
        });
        wm.addView(bubble, bubbleLp);
    }

    // ───────────── 잠금 / 해제 ─────────────

    private void lock() {
        if (locked) return;
        locked = true;
        if (bubble != null) bubble.setVisibility(View.GONE);

        shield = new FrameLayout(this);
        shield.setBackgroundColor(0x1A000000); // 아주 살짝 어둡게: 영상 시청 중에도 잘 보이도록
        // 막 위의 모든 터치를 여기서 먹어 버려서 뒤쪽 앱으로 전달되지 않게 한다
        shield.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent e) {
                return true;
            }
        });

        // 잠깐 보였다 사라지는 안내 문구
        final TextView notice = new TextView(this);
        notice.setText("터치 잠금 중\n오른쪽 🔓 버튼을 두 번 누르면 풀려요");
        notice.setTextColor(0xFFFFFFFF);
        notice.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        notice.setGravity(Gravity.CENTER);
        notice.setPadding(dp(18), dp(10), dp(18), dp(10));
        notice.setBackground(round(COLOR_PANEL, dp(14)));
        FrameLayout.LayoutParams nlp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        nlp.topMargin = dp(72);
        shield.addView(notice, nlp);
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                notice.animate().alpha(0f).setDuration(600);
            }
        }, 2500);

        // 오른쪽 가장자리 해제 버튼
        final TextView unlockBtn = new TextView(this);
        unlockBtn.setText("🔓\n두 번");
        unlockBtn.setTextColor(0xFFFFFFFF);
        unlockBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        unlockBtn.setGravity(Gravity.CENTER);
        unlockBtn.setBackground(round(COLOR_PANEL, dp(16)));
        unlockBtn.setContentDescription("잠금 해제 버튼. 두 번 누르면 풀립니다");
        FrameLayout.LayoutParams ulp = new FrameLayout.LayoutParams(dp(64), dp(110),
                Gravity.END | Gravity.CENTER_VERTICAL);
        ulp.rightMargin = dp(10);
        shield.addView(unlockBtn, ulp);
        unlockBtn.setOnTouchListener(new View.OnTouchListener() {
            long lastTap;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                if (e.getActionMasked() == MotionEvent.ACTION_UP) {
                    long now = SystemClock.uptimeMillis();
                    if (now - lastTap < DOUBLE_TAP_MS) {
                        lastTap = 0;
                        unlock();
                    } else {
                        lastTap = now;
                        armFlash(unlockBtn, dp(16));
                    }
                }
                return true;
            }
        });

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        if (Build.VERSION.SDK_INT >= 28) {
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        wm.addView(shield, lp);
        vibrate();
    }

    private void unlock() {
        if (!locked) return;
        locked = false;
        removeView(shield);
        shield = null;
        if (bubble != null) bubble.setVisibility(View.VISIBLE);
        vibrate();
    }

    // ───────────── 도우미 ─────────────

    /** 첫 번째 누름: 버튼을 잠깐 주황색으로 바꿔 "한 번 더"를 알려 준다. */
    private void armFlash(final View v, final float radius) {
        v.setBackground(round(COLOR_ARMED, radius));
        handler.removeCallbacksAndMessages(v);
        handler.postAtTime(new Runnable() {
            @Override
            public void run() {
                v.setBackground(round(COLOR_PANEL, radius));
            }
        }, v, SystemClock.uptimeMillis() + DOUBLE_TAP_MS);
    }

    private void vibrate() {
        View v = shield != null ? shield : bubble;
        if (v != null) v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS,
                android.view.HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING);
    }

    private GradientDrawable round(int color, float radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        d.setStroke(dp(2), COLOR_MAPLE);
        return d;
    }

    private void removeView(View v) {
        if (v != null && v.isAttachedToWindow()) wm.removeView(v);
    }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "터치 잠금",
                NotificationManager.IMPORTANCE_LOW));
        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class), flags);
        PendingIntent unlock = PendingIntent.getService(this, 1,
                new Intent(this, LockService.class).setAction(ACTION_UNLOCK), flags);
        PendingIntent stop = PendingIntent.getService(this, 2,
                new Intent(this, LockService.class).setAction(ACTION_STOP), flags);
        Icon icon = Icon.createWithResource(this, android.R.drawable.ic_lock_lock);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentTitle("터치 잠금 버튼 켜짐")
                .setContentText("🔒 버튼을 두 번 누르면 화면 터치가 잠겨요")
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(icon, "잠금 해제", unlock).build())
                .addAction(new Notification.Action.Builder(icon, "끄기", stop).build())
                .build();
    }
}
