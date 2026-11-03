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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 뉴스 확인 실행, 주기 작업 예약, 알림 보내기. */
public class Checker {
    static final int JOB_ID = 4101;
    static final String CHANNEL = "risk_alerts";
    static final int NOTIF_ID = 1;
    static final int NOTIF_EMBASSY_ID = 2;

    /**
     * 뉴스를 가져와 분석하고 저장한다. 모든 수집이 실패하면 이전 결과를 지우지 않고 null을 돌려준다.
     * 네트워크를 쓰므로 반드시 백그라운드 스레드에서 호출.
     */
    public static RiskReport runCheck(Context c, boolean notify) {
        RiskReport r = NewsFetcher.check(Store.loadHistory(c));
        if (r.totalArticles == 0 && !r.errors.isEmpty()) return null;
        Store.saveReport(c, r);
        if (notify) {
            maybeNotify(c, r);
            maybeNotifyEmbassy(c, r);
        }
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
        String text = "전쟁 가능성(30일) " + WarOdds.percent(r.warProb) + " · "
                + (why.length() > 0 ? "주요 신호: " + why : RiskReport.LEVEL_DESC[r.level]);
        post(c, NOTIF_ID, title, text);
    }

    static String eventKey(RiskReport.EmbassyEvent e) {
        return e.type + "|" + e.location + "|" + e.country;
    }

    /** 처음 보는 나라의 대사관·자국민 철수 소식이 잡히면 알린다. */
    static void maybeNotifyEmbassy(Context c, RiskReport r) {
        Set<String> current = new HashSet<>();
        for (RiskReport.EmbassyEvent e : r.embassyEvents) current.add(eventKey(e));
        if (!Store.embassyAlert(c)) {
            Store.setNotifiedEmbassy(c, current);
            return;
        }
        Set<String> seen = Store.notifiedEmbassy(c);
        List<RiskReport.EmbassyEvent> fresh = new ArrayList<>();
        for (RiskReport.EmbassyEvent e : r.embassyEvents) if (!seen.contains(eventKey(e))) fresh.add(e);
        // 지금 보도되지 않는 소식은 목록에서 빼서, 나중에 다시 나오면 또 알린다
        Store.setNotifiedEmbassy(c, current);
        if (fresh.isEmpty()) return;

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < fresh.size() && i < 4; i++) {
            RiskReport.EmbassyEvent e = fresh.get(i);
            if (sb.length() > 0) sb.append(" / ");
            sb.append(e.country).append(" ").append(e.typeName()).append("(").append(e.location).append(")");
        }
        if (fresh.size() > 4) sb.append(" 외 ").append(fresh.size() - 4).append("건");
        String first = fresh.get(0).title;
        String text = sb + (first != null ? "\n\n“" + first + "”" : "")
                + "\n전쟁 가능성(30일) " + WarOdds.percent(r.warProb);
        post(c, NOTIF_EMBASSY_ID, "대사관·자국민 철수 소식 " + fresh.size() + "건", text);
    }

    static void post(Context c, int id, String title, String text) {
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
        PendingIntent pi = PendingIntent.getActivity(c, id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify(id, n);
    }

    static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "위험 단계 알림",
                NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("한반도 위험 단계가 올라가거나 각국 대사관 철수 소식이 나오면 알려줍니다.");
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
