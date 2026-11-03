package com.stgv.warrisk;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    static final long AUTO_REFRESH_AFTER_MS = 10 * 60_000L;

    private GaugeView gauge;
    private TextView level, score, desc, meta, errors, refresh, interval, alertLevel, autoNote,
            articlesTitle, filter, sort, empty, trendRange;
    private ProgressBar progress;
    private LinearLayout signals;
    private TrendView trend;
    private Switch auto;

    private final ArticleAdapter adapter = new ArticleAdapter();
    private RiskReport report;
    private boolean loading;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        ListView list = findViewById(R.id.list);
        LayoutInflater inf = getLayoutInflater();
        View header = inf.inflate(R.layout.header, list, false);
        View footer = inf.inflate(R.layout.footer, list, false);
        list.addHeaderView(header, null, false);
        list.addFooterView(footer, null, false);
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, pos, id) -> {
            Object o = parent.getItemAtPosition(pos);
            if (o instanceof Article) openUrl(((Article) o).url);
        });

        gauge = header.findViewById(R.id.gauge);
        level = header.findViewById(R.id.level);
        score = header.findViewById(R.id.score);
        desc = header.findViewById(R.id.desc);
        meta = header.findViewById(R.id.meta);
        errors = header.findViewById(R.id.errors);
        refresh = header.findViewById(R.id.refresh);
        progress = header.findViewById(R.id.progress);
        signals = header.findViewById(R.id.signals);
        trend = header.findViewById(R.id.trend);
        trendRange = header.findViewById(R.id.trendRange);
        auto = header.findViewById(R.id.auto);
        interval = header.findViewById(R.id.interval);
        alertLevel = header.findViewById(R.id.alertLevel);
        autoNote = header.findViewById(R.id.autoNote);
        articlesTitle = header.findViewById(R.id.articlesTitle);
        filter = header.findViewById(R.id.filter);
        sort = header.findViewById(R.id.sort);
        empty = footer.findViewById(R.id.empty);

        refresh.setOnClickListener(v -> refreshNow());

        auto.setChecked(Store.autoEnabled(this));
        auto.setOnCheckedChangeListener((b, on) -> {
            Store.setAutoEnabled(this, on);
            if (on) askNotificationPermission();
            Checker.schedule(this);
            renderSettings();
        });
        interval.setOnClickListener(v -> {
            Store.setIntervalIndex(this, (Store.intervalIndex(this) + 1) % Store.INTERVAL_MINUTES.length);
            Checker.schedule(this);
            renderSettings();
        });
        alertLevel.setOnClickListener(v -> {
            int next = Store.alertLevel(this) + 1;
            if (next > RiskReport.LEVEL_SEVERE) next = RiskReport.LEVEL_CAUTION;
            Store.setAlertLevel(this, next);
            Store.setLastNotifiedLevel(this, -1);
            renderSettings();
        });
        filter.setOnClickListener(v -> {
            Store.setOnlyRisky(this, !Store.onlyRisky(this));
            renderArticles();
        });
        sort.setOnClickListener(v -> {
            Store.setSortBySeverity(this, !Store.sortBySeverity(this));
            renderArticles();
        });

        if (Store.autoEnabled(this)) askNotificationPermission();
        Checker.schedule(this);
        renderSettings();

        report = Store.loadReport(this);
        render();
        if (report == null || System.currentTimeMillis() - report.checkedAt > AUTO_REFRESH_AFTER_MS) {
            refreshNow();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 백그라운드 확인이 그사이 새 결과를 저장했을 수 있다
        if (!loading) {
            RiskReport saved = Store.loadReport(this);
            if (saved != null && (report == null || saved.checkedAt > report.checkedAt)) {
                report = saved;
                render();
            }
        }
    }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    private void refreshNow() {
        if (loading) return;
        loading = true;
        progress.setVisibility(View.VISIBLE);
        refresh.setText(R.string.checking);
        refresh.setEnabled(false);
        new Thread(() -> {
            RiskReport r = null;
            try {
                r = Checker.runCheck(getApplicationContext(), true);
            } catch (Exception ignored) {
            }
            final RiskReport result = r;
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                loading = false;
                progress.setVisibility(View.GONE);
                refresh.setText(R.string.refresh);
                refresh.setEnabled(true);
                if (result == null) {
                    Toast.makeText(this, "뉴스를 가져오지 못했습니다. 인터넷 연결을 확인하세요.",
                            Toast.LENGTH_LONG).show();
                } else {
                    report = result;
                }
                render();
            });
        }, "refresh").start();
    }

    // ── 화면 그리기 ─────────────────────────────────────────────────
    private void render() {
        trend.setPoints(Store.loadHistory(this));
        renderTrendRange();
        if (report == null) {
            gauge.setScore(-1);
            renderArticles();
            return;
        }
        int color = GaugeView.LEVEL_COLORS[report.level];
        gauge.setScore(report.score);
        level.setText(RiskReport.LEVEL_NAMES[report.level]);
        level.setTextColor(color);
        score.setText(report.score + " / 100");
        desc.setText(RiskReport.LEVEL_DESC[report.level]);
        meta.setText(String.format(Locale.KOREA, "%s 확인 · 기사 %d건 (위험 신호 %d건) · 언론사 %d곳 · %d개 지역",
                timeAgo(report.checkedAt), report.totalArticles, report.riskyArticles,
                report.sourceCount, report.regionCount));
        if (report.errors.isEmpty()) {
            errors.setVisibility(View.GONE);
        } else {
            errors.setVisibility(View.VISIBLE);
            errors.setText("일부 출처를 가져오지 못했습니다: " + TextUtils.join(", ", report.errors));
        }
        renderSignals();
        renderArticles();
    }

    private void renderSignals() {
        signals.removeAllViews();
        float d = getResources().getDisplayMetrics().density;
        if (report.signals.isEmpty()) {
            TextView t = smallText("잡힌 위험 신호가 없습니다.", 0xFF9AA4AF);
            signals.addView(t);
            return;
        }
        double max = 1;
        for (RiskReport.SignalHit h : report.signals) max = Math.max(max, Math.abs(h.contribution));
        for (RiskReport.SignalHit h : report.signals) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(0, (int) (5 * d), 0, (int) (5 * d));

            TextView name = smallText(h.name + "  " + h.articles + "건", 0xFFECEFF1);
            name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            row.addView(name, new LinearLayout.LayoutParams((int) (130 * d), ViewGroup.LayoutParams.WRAP_CONTENT));

            LinearLayout track = new LinearLayout(this);
            track.setOrientation(LinearLayout.HORIZONTAL);
            View fill = new View(this);
            View rest = new View(this);
            int c = h.weight < 0 ? 0xFF66BB6A : colorForWeight(h.weight);
            fill.setBackgroundColor(c);
            float frac = (float) (Math.abs(h.contribution) / max);
            track.addView(fill, new LinearLayout.LayoutParams(0, (int) (8 * d), frac));
            track.addView(rest, new LinearLayout.LayoutParams(0, (int) (8 * d), 1 - frac));
            LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0, (int) (8 * d), 1);
            row.addView(track, tp);

            String sign = h.contribution >= 0 ? "+" : "−";
            TextView pts = smallText(String.format(Locale.KOREA, "%s%.1f", sign, Math.abs(h.contribution)),
                    h.weight < 0 ? 0xFF66BB6A : 0xFF9AA4AF);
            pts.setGravity(Gravity.END);
            row.addView(pts, new LinearLayout.LayoutParams((int) (52 * d), ViewGroup.LayoutParams.WRAP_CONTENT));
            signals.addView(row);
        }
        signals.addView(smallText("막대 길이 = 지수에 더해진 점수. 여러 언론이 함께 보도할수록 커지고, 초록색(회담·대화)은 점수를 깎습니다.",
                0xFF9AA4AF));
    }

    private TextView smallText(String s, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        return t;
    }

    private void renderTrendRange() {
        List<long[]> h = Store.loadHistory(this);
        if (h.size() < 2) {
            trendRange.setText("");
            return;
        }
        SimpleDateFormat f = new SimpleDateFormat("M/d HH:mm", Locale.KOREA);
        long min = 100, max = 0;
        for (long[] p : h) {
            min = Math.min(min, p[1]);
            max = Math.max(max, p[1]);
        }
        trendRange.setText(String.format(Locale.KOREA, "%s ~ %s · %d회 확인 · 최저 %d / 최고 %d",
                f.format(new Date(h.get(0)[0])), f.format(new Date(h.get(h.size() - 1)[0])),
                h.size(), min, max));
    }

    private void renderSettings() {
        boolean on = Store.autoEnabled(this);
        interval.setText("확인 주기: " + Store.INTERVAL_NAMES[Store.intervalIndex(this)]);
        alertLevel.setText("알림: " + RiskReport.LEVEL_NAMES[Store.alertLevel(this)] + " 이상");
        interval.setAlpha(on ? 1f : 0.4f);
        alertLevel.setAlpha(on ? 1f : 0.4f);
        autoNote.setText(on
                ? "앱을 닫아도 " + Store.INTERVAL_NAMES[Store.intervalIndex(this)]
                + "마다 뉴스를 확인하고, 위험 단계가 '" + RiskReport.LEVEL_NAMES[Store.alertLevel(this)]
                + "' 이상으로 올라가면 알림을 보냅니다. 배터리 절약 모드에서는 확인이 늦어질 수 있습니다."
                : "자동 확인이 꺼져 있습니다. 앱을 열 때만 확인합니다.");
    }

    private void renderArticles() {
        boolean onlyRisky = Store.onlyRisky(this);
        boolean bySev = Store.sortBySeverity(this);
        filter.setText(onlyRisky ? "위험 신호 기사만" : "전체 기사");
        filter.setBackgroundResource(onlyRisky ? R.drawable.bg_chip_on : R.drawable.bg_chip);
        sort.setText(bySev ? "위험한 순" : "최신순");
        sort.setBackgroundResource(bySev ? R.drawable.bg_chip_on : R.drawable.bg_chip);

        List<Article> items = new ArrayList<>();
        if (report != null) {
            for (Article a : report.articles) if (!onlyRisky || a.score > 0) items.add(a);
        }
        if (bySev) {
            Collections.sort(items, (x, y) -> x.score != y.score
                    ? Integer.compare(y.score, x.score) : Long.compare(y.timeMs, x.timeMs));
        }
        adapter.set(items);
        articlesTitle.setText("수집된 기사 " + items.size() + "건");
        if (items.isEmpty()) {
            empty.setVisibility(View.VISIBLE);
            empty.setText(report == null ? "확인 중이거나 아직 결과가 없습니다." : "표시할 기사가 없습니다.");
        } else {
            empty.setVisibility(View.GONE);
        }
    }

    static int colorForWeight(int w) {
        if (w >= 35) return GaugeView.LEVEL_COLORS[3];
        if (w >= 20) return GaugeView.LEVEL_COLORS[2];
        if (w >= 8) return GaugeView.LEVEL_COLORS[1];
        return GaugeView.LEVEL_COLORS[0];
    }

    static int colorForArticle(int score) {
        if (score >= 35) return GaugeView.LEVEL_COLORS[3];
        if (score >= 20) return GaugeView.LEVEL_COLORS[2];
        if (score >= 8) return GaugeView.LEVEL_COLORS[1];
        if (score > 0) return GaugeView.LEVEL_COLORS[0];
        return 0xFF37424D;
    }

    static String timeAgo(long t) {
        if (t <= 0) return "시각 미상";
        long m = (System.currentTimeMillis() - t) / 60_000L;
        if (m < 1) return "방금";
        if (m < 60) return m + "분 전";
        if (m < 60 * 24) return (m / 60) + "시간 전";
        return (m / 60 / 24) + "일 전";
    }

    private void openUrl(String url) {
        if (url == null || url.isEmpty()) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Toast.makeText(this, "브라우저를 열 수 없습니다.", Toast.LENGTH_SHORT).show();
        }
    }

    // ── 기사 목록 ───────────────────────────────────────────────────
    class ArticleAdapter extends BaseAdapter {
        private List<Article> items = new ArrayList<>();

        void set(List<Article> list) {
            items = list;
            notifyDataSetChanged();
        }

        @Override public int getCount() { return items.size(); }
        @Override public Object getItem(int i) { return items.get(i); }
        @Override public long getItemId(int i) { return i; }

        @Override
        public View getView(int i, View v, ViewGroup parent) {
            if (v == null) v = getLayoutInflater().inflate(R.layout.item_article, parent, false);
            Article a = items.get(i);
            ((TextView) v.findViewById(R.id.title)).setText(a.title);

            StringBuilder m = new StringBuilder();
            if (a.source != null && !a.source.isEmpty()) m.append(a.source);
            if (a.region != null && !a.region.isEmpty()) {
                if (m.length() > 0) m.append(" · ");
                m.append(a.region);
            }
            if (a.lang != null && !a.lang.isEmpty()) m.append(" ").append(a.lang);
            if (m.length() > 0) m.append(" · ");
            m.append(timeAgo(a.timeMs));
            ((TextView) v.findViewById(R.id.meta)).setText(m);

            int c = colorForArticle(a.score);
            v.findViewById(R.id.bar).setBackgroundColor(c);
            TextView tags = v.findViewById(R.id.tags);
            if (a.tags.isEmpty()) {
                tags.setVisibility(View.GONE);
            } else {
                tags.setVisibility(View.VISIBLE);
                tags.setText("# " + TextUtils.join("  # ", a.tags));
                tags.setTextColor(a.score > 0 ? c : Color.rgb(102, 187, 106));
            }
            return v;
        }
    }
}
