package com.stgv.ainews;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.format.DateFormat;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {

    // 색
    static final int BG = 0xFF0F1115, CARD = 0xFF181B22, CARD_LINE = 0xFF252A35, TEXT = 0xFFECEFF4,
            SUB = 0xFF9AA3B2, ACCENT = 0xFF7C9CFF, RELEASE = 0xFFFFA94D, CHIP = 0xFF1F232C;

    static final String[] LANG_LABEL = {"언어: 전체", "한국어", "English"};

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final List<NewsItem> all = new ArrayList<>();
    private final List<NewsItem> shown = new ArrayList<>();
    private final List<String> lastErrors = new ArrayList<>();

    private int companyFilter;          // 0 = 전체, 아니면 Company.bit
    private boolean releaseOnly, officialOnly;
    private int langMode;               // 0 전체, 1 한국어, 2 English
    private String query = "";
    private boolean loading, destroyed;

    private TextView status, refreshBtn, notifyChip, releaseChip, officialChip, langChip, emptyView;
    private final List<TextView> companyChips = new ArrayList<>();
    private ProgressBar progress;
    private ListView list;
    private Adapter adapter;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        companyFilter = Store.getInt(this, "company", 0);
        releaseOnly = Store.getBool(this, "releaseOnly", false);
        officialOnly = Store.getBool(this, "officialOnly", false);
        langMode = Store.getInt(this, "lang", 0);
        if (getIntent() != null && getIntent().getBooleanExtra("releases", false)) releaseOnly = true;

        setContentView(buildUi());

        all.addAll(Store.loadNews(this));
        applyFilters();
        updateStatus();

        long age = System.currentTimeMillis() - Store.updatedAt(this);
        if (all.isEmpty() || age > 10 * 60_000L) refresh();

        if (Store.notifyEnabled(this)) {
            askNotificationPermission();
            NewsJobService.schedule(this);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getBooleanExtra("releases", false)) {
            releaseOnly = true;
            companyFilter = 0;
            applyFilters();
            refresh();
        }
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        super.onDestroy();
    }

    // ── 화면 구성 ─────────────────────────────────────────────────────
    private View buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setPadding(dp(14), dp(14), dp(14), 0);

        // 제목 줄
        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        TextView title = text("AI 모델 소식", 22, TEXT, true);
        status = text("", 12, SUB, false);
        status.setOnClickListener(v -> showErrors());
        titles.addView(title);
        titles.addView(status);
        head.addView(titles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        notifyChip = chip("", false);
        notifyChip.setOnClickListener(v -> toggleNotify());
        head.addView(notifyChip);
        refreshBtn = chip("↻ 새로고침", false);
        refreshBtn.setOnClickListener(v -> refresh());
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rp.leftMargin = dp(6);
        head.addView(refreshBtn, rp);
        root.addView(head);

        // 검색
        EditText search = new EditText(this);
        search.setHint("검색  (예: GPT-5, Opus, Gemini, Grok 4)");
        search.setHintTextColor(0xFF6B7385);
        search.setTextColor(TEXT);
        search.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        search.setSingleLine(true);
        search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.setBackground(round(CHIP, dp(12), CARD_LINE));
        search.setPadding(dp(14), dp(10), dp(14), dp(10));
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(Editable e) {
                query = e.toString().trim().toLowerCase(Locale.ROOT);
                applyFilters();
            }
        });
        search.setOnEditorActionListener((v, id, ev) -> {
            InputMethodManager imm = getSystemService(InputMethodManager.class);
            imm.hideSoftInputFromWindow(v.getWindowToken(), 0);
            return true;
        });
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sp.topMargin = dp(12);
        root.addView(search, sp);

        // 회사 탭
        LinearLayout companies = row();
        String[] names = {"전체", "OpenAI", "Claude", "Google", "Grok"};
        final int[] bits = {0, Company.OPENAI.bit, Company.CLAUDE.bit, Company.GOOGLE.bit, Company.GROK.bit};
        for (int i = 0; i < names.length; i++) {
            final int bit = bits[i];
            TextView c = chip(names[i], false);
            c.setTag(bit);
            c.setOnClickListener(v -> {
                companyFilter = bit;
                Store.putInt(this, "company", bit);
                applyFilters();
                list.setSelection(0);
            });
            companyChips.add(c);
            addChip(companies, c);
        }
        root.addView(scroll(companies), rowParams(10));

        // 필터
        LinearLayout filters = row();
        releaseChip = chip("🚀 모델 출시", false);
        releaseChip.setOnClickListener(v -> {
            releaseOnly = !releaseOnly;
            Store.putBool(this, "releaseOnly", releaseOnly);
            applyFilters();
        });
        officialChip = chip("📢 공식 발표", false);
        officialChip.setOnClickListener(v -> {
            officialOnly = !officialOnly;
            Store.putBool(this, "officialOnly", officialOnly);
            applyFilters();
        });
        langChip = chip("", false);
        langChip.setOnClickListener(v -> {
            langMode = (langMode + 1) % 3;
            Store.putInt(this, "lang", langMode);
            applyFilters();
        });
        addChip(filters, releaseChip);
        addChip(filters, officialChip);
        addChip(filters, langChip);
        root.addView(scroll(filters), rowParams(8));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setIndeterminate(true);
        progress.setVisibility(View.INVISIBLE);
        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(6));
        pp.topMargin = dp(6);
        root.addView(progress, pp);

        // 목록
        android.widget.FrameLayout frame = new android.widget.FrameLayout(this);
        list = new ListView(this);
        list.setDivider(null);
        list.setDividerHeight(0);
        list.setSelector(android.R.color.transparent);
        list.setClipToPadding(false);
        list.setPadding(0, dp(2), 0, dp(24));
        adapter = new Adapter();
        list.setAdapter(adapter);
        list.setOnItemClickListener((p, v, pos, id) -> open(shown.get(pos).url));
        list.setOnItemLongClickListener((p, v, pos, id) -> {
            itemMenu(shown.get(pos));
            return true;
        });
        emptyView = text("", 14, SUB, false);
        emptyView.setGravity(Gravity.CENTER);
        emptyView.setPadding(dp(24), dp(40), dp(24), dp(40));
        frame.addView(list);
        frame.addView(emptyView, new android.widget.FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        root.addView(frame, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        return root;
    }

    // ── 데이터 ───────────────────────────────────────────────────────
    private void refresh() {
        if (loading) return;
        loading = true;
        progress.setVisibility(View.VISIBLE);
        refreshBtn.setEnabled(false);
        refreshBtn.setAlpha(0.5f);
        updateStatus();
        new Thread(() -> {
            List<String> errors = Collections.synchronizedList(new ArrayList<>());
            List<NewsItem> items;
            try {
                items = NewsFetcher.fetchAll(errors);
            } catch (Throwable t) {
                items = new ArrayList<>();
                errors.add(t.toString());
            }
            if (!items.isEmpty()) {
                Store.saveNews(this, items);
                Store.markSeen(this, items); // 앱에서 본 소식은 다시 알리지 않는다
            }
            final List<NewsItem> got = items;
            final List<String> errs = new ArrayList<>(errors);
            ui.post(() -> {
                if (destroyed) return;
                loading = false;
                progress.setVisibility(View.INVISIBLE);
                refreshBtn.setEnabled(true);
                refreshBtn.setAlpha(1f);
                lastErrors.clear();
                lastErrors.addAll(errs);
                if (!got.isEmpty()) {
                    all.clear();
                    all.addAll(got);
                    applyFilters();
                } else {
                    Toast.makeText(this, "소식을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.",
                            Toast.LENGTH_LONG).show();
                    applyFilters();
                }
                updateStatus();
            });
        }).start();
    }

    private boolean passesExceptCompany(NewsItem n) {
        if (releaseOnly && !n.release) return false;
        if (officialOnly && !n.official) return false;
        if (langMode == 1 && !"KO".equals(n.lang)) return false;
        if (langMode == 2 && !"EN".equals(n.lang)) return false;
        if (!query.isEmpty()) {
            String hay = (n.title + " " + n.source + " " + n.summary).toLowerCase(Locale.ROOT);
            for (String w : query.split("\\s+")) if (!hay.contains(w)) return false;
        }
        return true;
    }

    private void applyFilters() {
        shown.clear();
        int[] counts = new int[companyChips.size()];
        for (NewsItem n : all) {
            if (!passesExceptCompany(n)) continue;
            for (int i = 0; i < companyChips.size(); i++) {
                int bit = (Integer) companyChips.get(i).getTag();
                if (bit == 0 || (n.companies & bit) != 0) counts[i]++;
            }
            if (companyFilter == 0 || (n.companies & companyFilter) != 0) shown.add(n);
        }
        String[] names = {"전체", "OpenAI", "Claude", "Google", "Grok"};
        for (int i = 0; i < companyChips.size(); i++) {
            TextView c = companyChips.get(i);
            int bit = (Integer) c.getTag();
            c.setText(all.isEmpty() ? names[i] : names[i] + "  " + counts[i]);
            styleChip(c, bit == companyFilter, bit == 0 ? ACCENT : colorFor(bit));
        }
        styleChip(releaseChip, releaseOnly, RELEASE);
        styleChip(officialChip, officialOnly, ACCENT);
        langChip.setText(LANG_LABEL[langMode]);
        styleChip(langChip, langMode != 0, ACCENT);
        boolean notifyOn = Store.notifyEnabled(this);
        notifyChip.setText(notifyOn ? "🔔" : "🔕");
        styleChip(notifyChip, notifyOn, RELEASE);

        adapter.notifyDataSetChanged();
        if (!shown.isEmpty()) emptyView.setVisibility(View.GONE);
        else {
            emptyView.setVisibility(View.VISIBLE);
            emptyView.setText(all.isEmpty()
                    ? (loading ? "소식을 모으는 중…" : "아직 받은 소식이 없어요.\n↻ 새로고침을 눌러 주세요.")
                    : "조건에 맞는 소식이 없어요.\n필터를 바꿔 보세요.");
        }
    }

    private void updateStatus() {
        long t = Store.updatedAt(this);
        String s;
        if (loading) s = "새 소식을 모으는 중…";
        else if (t == 0) s = "OpenAI · Claude · Google · Grok 소식";
        else s = "업데이트 " + DateFormat.getTimeFormat(this).format(t) + " (" + ago(t) + ")";
        if (!loading && !lastErrors.isEmpty()) s += "  ·  ⚠ " + lastErrors.size() + "곳 실패";
        status.setText(s);
    }

    private void showErrors() {
        if (lastErrors.isEmpty()) return;
        new AlertDialog.Builder(this)
                .setTitle("불러오지 못한 곳")
                .setMessage(TextUtils.join("\n\n", lastErrors))
                .setPositiveButton("확인", null)
                .show();
    }

    // ── 동작 ─────────────────────────────────────────────────────────
    private void open(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "링크를 열 브라우저가 없어요", Toast.LENGTH_SHORT).show();
        }
    }

    private void itemMenu(NewsItem n) {
        String[] actions = "EN".equals(n.lang)
                ? new String[]{"브라우저로 열기", "제목 번역 (Google 번역)", "공유", "링크 복사"}
                : new String[]{"브라우저로 열기", "공유", "링크 복사"};
        new AlertDialog.Builder(this)
                .setTitle(n.title)
                .setItems(actions, (d, which) -> {
                    String a = actions[which];
                    if (a.startsWith("브라우저")) open(n.url);
                    else if (a.startsWith("제목 번역")) {
                        open("https://translate.google.com/?sl=auto&tl=ko&op=translate&text=" + Uri.encode(n.title));
                    } else if (a.equals("공유")) {
                        Intent send = new Intent(Intent.ACTION_SEND)
                                .setType("text/plain")
                                .putExtra(Intent.EXTRA_SUBJECT, n.title)
                                .putExtra(Intent.EXTRA_TEXT, n.title + "\n" + n.url);
                        startActivity(Intent.createChooser(send, "공유"));
                    } else {
                        ClipboardManager cm = getSystemService(ClipboardManager.class);
                        cm.setPrimaryClip(ClipData.newPlainText("link", n.url));
                        Toast.makeText(this, "링크를 복사했어요", Toast.LENGTH_SHORT).show();
                    }
                })
                .show();
    }

    private void toggleNotify() {
        boolean on = !Store.notifyEnabled(this);
        Store.setNotifyEnabled(this, on);
        if (on) askNotificationPermission();
        NewsJobService.schedule(this);
        Toast.makeText(this, on
                ? "새 모델 출시 소식을 3시간마다 확인해서 알려 드려요"
                : "알림을 껐어요", Toast.LENGTH_SHORT).show();
        applyFilters();
    }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1);
        }
    }

    // ── 목록 칸 ──────────────────────────────────────────────────────
    private class Adapter extends BaseAdapter {
        @Override public int getCount() { return shown.size(); }
        @Override public Object getItem(int i) { return shown.get(i); }
        @Override public long getItemId(int i) { return i; }

        @Override
        public View getView(int pos, View convert, ViewGroup parent) {
            Holder h;
            if (convert == null) {
                h = new Holder();
                LinearLayout card = new LinearLayout(MainActivity.this);
                card.setOrientation(LinearLayout.VERTICAL);
                card.setBackground(round(CARD, dp(14), CARD_LINE));
                card.setPadding(dp(14), dp(12), dp(14), dp(12));
                h.tags = new LinearLayout(MainActivity.this);
                h.tags.setGravity(Gravity.CENTER_VERTICAL);
                h.title = text("", 15.5f, TEXT, true);
                h.title.setLineSpacing(0, 1.15f);
                h.summary = text("", 13, SUB, false);
                h.summary.setMaxLines(3);
                h.summary.setEllipsize(TextUtils.TruncateAt.END);
                h.meta = text("", 12, SUB, false);
                card.addView(h.tags);
                LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                tp.topMargin = dp(8);
                card.addView(h.title, tp);
                LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                sp.topMargin = dp(6);
                card.addView(h.summary, sp);
                LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                mp.topMargin = dp(8);
                card.addView(h.meta, mp);

                android.widget.FrameLayout wrap = new android.widget.FrameLayout(MainActivity.this);
                wrap.setPadding(0, dp(5), 0, dp(5));
                wrap.addView(card);
                wrap.setTag(h);
                convert = wrap;
            } else {
                h = (Holder) convert.getTag();
            }

            NewsItem n = shown.get(pos);
            h.tags.removeAllViews();
            for (Company co : Company.values()) {
                if ((n.companies & co.bit) != 0) h.tags.addView(pill(co.label, co.color, false));
            }
            if (n.official) h.tags.addView(pill("공식", ACCENT, true));
            if (n.release) h.tags.addView(pill("출시", RELEASE, true));
            h.title.setText(n.title);
            h.summary.setText(n.summary);
            h.summary.setVisibility(n.official && !n.summary.isEmpty() ? View.VISIBLE : View.GONE);
            StringBuilder meta = new StringBuilder();
            if (!n.source.isEmpty()) meta.append(n.source);
            if (n.timeMs != 0) {
                if (meta.length() > 0) meta.append("  ·  ");
                meta.append(ago(n.timeMs));
            }
            if (!n.lang.isEmpty()) meta.append("  ·  ").append("KO".equals(n.lang) ? "한국어" : "영어");
            h.meta.setText(meta);
            return convert;
        }
    }

    static class Holder {
        LinearLayout tags;
        TextView title, summary, meta;
    }

    // ── 도우미 ───────────────────────────────────────────────────────
    static String companyNames(int bits) {
        List<String> names = new ArrayList<>();
        for (Company co : Company.values()) if ((bits & co.bit) != 0) names.add(co.label);
        return names.isEmpty() ? "AI" : TextUtils.join(" · ", names);
    }

    static int colorFor(int bit) {
        for (Company co : Company.values()) if (co.bit == bit) return co.color;
        return ACCENT;
    }

    static String ago(long t) {
        long d = System.currentTimeMillis() - t;
        if (d < 60_000L) return "방금";
        if (d < 3600_000L) return (d / 60_000L) + "분 전";
        if (d < 24 * 3600_000L) return (d / 3600_000L) + "시간 전";
        if (d < 7 * 24 * 3600_000L) return (d / (24 * 3600_000L)) + "일 전";
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        return (c.get(Calendar.MONTH) + 1) + "월 " + c.get(Calendar.DAY_OF_MONTH) + "일";
    }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private GradientDrawable round(int fill, int radius, int stroke) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(radius);
        if (stroke != 0) g.setStroke(dp(1), stroke);
        return g;
    }

    private TextView chip(String s, boolean on) {
        TextView c = text(s, 13.5f, TEXT, false);
        c.setGravity(Gravity.CENTER);
        c.setPadding(dp(14), dp(8), dp(14), dp(8));
        c.setSingleLine(true);
        styleChip(c, on, ACCENT);
        return c;
    }

    private void styleChip(TextView c, boolean on, int color) {
        if (on) {
            c.setBackground(round((color & 0x00FFFFFF) | 0x33000000, dp(20), color));
            c.setTextColor(TEXT);
            c.setTypeface(Typeface.DEFAULT_BOLD);
        } else {
            c.setBackground(round(CHIP, dp(20), CARD_LINE));
            c.setTextColor(SUB);
            c.setTypeface(Typeface.DEFAULT);
        }
    }

    private TextView pill(String s, int color, boolean filled) {
        TextView p = text(s, 11, filled ? 0xFF111318 : color, true);
        p.setPadding(dp(8), dp(2), dp(8), dp(2));
        p.setBackground(filled ? round(color, dp(8), 0) : round((color & 0x00FFFFFF) | 0x26000000, dp(8), 0));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.rightMargin = dp(6);
        p.setLayoutParams(lp);
        return p;
    }

    private LinearLayout row() {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        return r;
    }

    private void addChip(LinearLayout r, TextView c) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.rightMargin = dp(8);
        r.addView(c, lp);
    }

    private HorizontalScrollView scroll(View content) {
        HorizontalScrollView h = new HorizontalScrollView(this);
        h.setHorizontalScrollBarEnabled(false);
        h.addView(content);
        return h;
    }

    private LinearLayout.LayoutParams rowParams(int topDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(topDp);
        return lp;
    }
}
