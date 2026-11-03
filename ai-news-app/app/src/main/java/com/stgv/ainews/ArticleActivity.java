package com.stgv.ainews;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/** 기사를 앱 안에서 보여 주는 화면. */
public class ArticleActivity extends Activity {

    static final String EXTRA_URL = "url", EXTRA_TITLE = "title";

    static Intent intent(Context c, String url, String title) {
        return new Intent(c, ArticleActivity.class)
                .putExtra(EXTRA_URL, url)
                .putExtra(EXTRA_TITLE, title);
    }

    private WebView web;
    private ProgressBar progress;
    private TextView titleView, hostView;
    private String articleTitle;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        String url = getIntent().getStringExtra(EXTRA_URL);
        articleTitle = getIntent().getStringExtra(EXTRA_TITLE);
        if (url == null) {
            finish();
            return;
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(MainActivity.BG);

        // 위쪽 막대: 닫기 · 제목 · 공유 · 브라우저
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(4), dp(6), dp(4), dp(6));
        bar.addView(button("✕", "닫기", v -> finish()));

        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        titles.setPadding(dp(4), 0, dp(4), 0);
        titleView = label(articleTitle != null ? articleTitle : "", 15, MainActivity.TEXT, true);
        hostView = label(host(url), 12, MainActivity.SUB, false);
        titles.addView(titleView);
        titles.addView(hostView);
        bar.addView(titles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        bar.addView(button("↻", "새로고침", v -> web.reload()));
        bar.addView(button("⤴", "공유", v -> share()));
        bar.addView(button("🌐", "브라우저로 열기", v -> openExternal(currentUrl())));
        root.addView(bar);

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleSpecialUrl(req.getUrl().toString());
            }

            @Override
            public void onPageStarted(WebView view, String u, Bitmap favicon) {
                hostView.setText(host(u));
                progress.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String u) {
                hostView.setText(host(u));
                progress.setVisibility(View.INVISIBLE);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                progress.setProgress(p);
                progress.setVisibility(p >= 100 ? View.INVISIBLE : View.VISIBLE);
            }

            @Override
            public void onReceivedTitle(WebView view, String t) {
                // Google 뉴스 중간 페이지 제목 대신 기사 제목을 유지하다가, 기사 페이지 제목이 오면 바꾼다
                if (t != null && !t.isEmpty() && !t.startsWith("http") && !t.contains("Google News")
                        && !host(view.getUrl()).contains("news.google.")) {
                    titleView.setText(t);
                }
            }
        });
        web.setDownloadListener((u, ua, cd, mime, len) -> openExternal(u));

        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(url);
    }

    /** http(s)가 아닌 링크(앱 열기, 전화, 메일 …)는 해당 앱으로 넘긴다. */
    private boolean handleSpecialUrl(String u) {
        if (u.startsWith("http://") || u.startsWith("https://")) return false;
        try {
            if (u.startsWith("intent:")) {
                Intent i = Intent.parseUri(u, Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                try {
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    String fallback = i.getStringExtra("browser_fallback_url");
                    if (fallback != null && fallback.startsWith("http")) web.loadUrl(fallback);
                }
            } else {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
            }
        } catch (Exception ignored) {
        }
        return true;
    }

    private String currentUrl() {
        String u = web.getUrl();
        return u != null ? u : getIntent().getStringExtra(EXTRA_URL);
    }

    private void share() {
        String t = titleView.getText().toString();
        Intent send = new Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_SUBJECT, t)
                .putExtra(Intent.EXTRA_TEXT, t + "\n" + currentUrl());
        startActivity(Intent.createChooser(send, "공유"));
    }

    private void openExternal(String u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "링크를 열 브라우저가 없어요", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // ── 도우미 ──
    static String host(String u) {
        try {
            String h = Uri.parse(u).getHost();
            if (h == null) return "";
            return h.startsWith("www.") ? h.substring(4) : h;
        } catch (Exception e) {
            return "";
        }
    }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private TextView label(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private TextView button(String icon, String desc, View.OnClickListener l) {
        TextView b = new TextView(this);
        b.setText(icon);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        b.setTextColor(MainActivity.TEXT);
        b.setGravity(Gravity.CENTER);
        b.setContentDescription(desc);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(MainActivity.CHIP);
        b.setBackground(bg);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(40), dp(40));
        lp.leftMargin = dp(4);
        lp.rightMargin = dp(4);
        b.setLayoutParams(lp);
        return b;
    }
}
