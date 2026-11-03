package com.stgv.warrisk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

/** 뉴스 확인 실행, 주기 작업 예약, 알림 보내기. */
public class Checker {
    static final int JOB_ID = 4101;
    static final String CHANNEL = "risk_alerts";
    static final int NOTIF_ID = 1;

    /**
     * 뉴스를 가져와 분석하고 저장한다. 모든 수집이 실패하면 이전 결과를 지우지 않고 null을 돌려준다.
     * 네트워크를 쓰므로 반드시 백그라운드 스레드에서 호출.
     */
    public static RiskReport runCheck(Context c, boolean notify) {
        RiskReport r = NewsFetcher.check();
        if (r.totalArticles == 0 && !r.errors.isEmpty()) return null;
        Store.saveReport(c, r);
        if (notify) maybeNotify(c, r);
        return r;
    }

    /** 위험 단계가 알림 기준 이상으로 올라갔을 때만 알린다 (같은 단계로 반복 알림하지 않음). */
    static void maybeNotify(Context c, RiskReport r) {
        int last = Store.lastNotifiedLevel(c);
        int threshold = Store.alertLevel(c);
        if (r.level < threshold) {
            // 기준 아래로 내려오면 다시 올라갈 때 알릴 수 있게 초기화
            if (last >= 0) Store.setLastNotifiedLevel(c, -1);
            return;
        }
        if (r.level <= last) return;
        Store.setLastNotifiedLevel(c, r.level);

        StringBuilder why = new StringBuilder();
        for (int i = 0; i < r.signals.size() && i < 3; i++) {
            RiskReport.SignalHit h = r.signals.get(i);
            if (h.weight <= 0) continue;
            if (why.length() > 0) why.append(", ");
            why.append(h.name).append(' ').append(h.articles).append("건");
        }
        String title = "한반도 위험도 " + RiskReport.LEVEL_NAMES[r.level] + " (" + r.score + "점)";
        String text = why.length() > 0 ? "주요 신호: " + why : RiskReport.LEVEL_DESC[r.level];
        post(c, title, text);
    }

    static void post(Context c, String title, String text) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify(NOTIF_ID, n);
    }

    static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "위험 단계 알림",
                NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("한반도 위험 단계가 올라가면 알려줍니다.");
        nm.createNotificationChannel(ch);
    }

    /** 설정에 맞춰 주기 확인 작업을 예약하거나 취소한다. */
    public static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null) return;
        if (!Store.autoEnabled(c)) {
            js.cancel(JOB_ID);
            return;
        }
        long period = Store.INTERVAL_MINUTES[Store.intervalIndex(c)] * 60_000L;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, RiskJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(period)
                .setPersisted(true)
                .build();
        JobInfo existing = js.getPendingJob(JOB_ID);
        if (existing != null && existing.getIntervalMillis() == period) return;
        js.schedule(job);
    }
}
