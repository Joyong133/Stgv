package com.stgv.ainews;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** 새로 나온 모델 출시 소식을 알림으로 띄운다. */
public class Notifier {
    static final String CHANNEL = "releases";

    static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "새 AI 모델 소식",
                    NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("OpenAI · Claude · Google · Grok 의 새 모델 출시 · 공개 소식");
            nm.createNotificationChannel(ch);
        }
    }

    static boolean allowed(Context c) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                != PackageManager.PERMISSION_GRANTED) return false;
        return c.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    /** 처음 보는 출시 소식을 알리고, 목록을 '본 것'으로 기록한다. 처음 실행이면 기록만 한다. */
    static void notifyNew(Context c, List<NewsItem> items) {
        boolean baseline = Store.hasSeenBaseline(c);
        Set<String> seen = Store.seen(c);
        long recent = System.currentTimeMillis() - 2L * 24 * 3600_000L;
        List<NewsItem> fresh = new ArrayList<>();
        for (NewsItem n : items) {
            if (!n.release || seen.contains(n.key())) continue;
            if (n.timeMs != 0 && n.timeMs < recent) continue;
            fresh.add(n);
        }
        Store.markSeen(c, items);
        if (!baseline || fresh.isEmpty() || !Store.notifyEnabled(c) || !allowed(c)) return;

        ensureChannel(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        // 공식 발표를 먼저
        fresh.sort((a, b) -> Boolean.compare(b.official, a.official));
        int shown = Math.min(3, fresh.size());
        for (int i = 0; i < shown; i++) {
            NewsItem n = fresh.get(i);
            // 기사 화면에서 뒤로 가면 소식 목록으로 돌아가도록 목록 화면을 밑에 깐다
            Intent[] stack = {
                    new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    ArticleActivity.intent(c, n.url, n.title)
            };
            PendingIntent pi = PendingIntent.getActivities(c, n.key().hashCode(), stack,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            String who = MainActivity.companyNames(n.companies);
            Notification.Builder b = new Notification.Builder(c, CHANNEL)
                    .setSmallIcon(R.drawable.ic_notify)
                    .setContentTitle((n.official ? "📢 " + who + " 공식 발표" : "🚀 " + who + " 새 소식"))
                    .setContentText(n.title)
                    .setStyle(new Notification.BigTextStyle().bigText(n.title
                            + (n.source.isEmpty() ? "" : "\n— " + n.source)))
                    .setColor(colorOf(n.companies))
                    .setContentIntent(pi)
                    .setAutoCancel(true);
            nm.notify(n.key().hashCode(), b.build());
        }
        if (fresh.size() > shown) {
            Intent app = new Intent(c, MainActivity.class).putExtra("releases", true);
            PendingIntent pi = PendingIntent.getActivity(c, 1, app,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            nm.notify(1, new Notification.Builder(c, CHANNEL)
                    .setSmallIcon(R.drawable.ic_notify)
                    .setContentTitle("모델 출시 소식 " + (fresh.size() - shown) + "건 더")
                    .setContentText("앱에서 모두 보기")
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .build());
        }
    }

    static int colorOf(int companies) {
        for (Company co : Company.values()) if ((companies & co.bit) != 0) return co.color;
        return 0xFF7C9CFF;
    }
}
