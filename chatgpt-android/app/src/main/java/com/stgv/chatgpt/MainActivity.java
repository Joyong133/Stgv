package com.stgv.chatgpt;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

/**
 * chatgpt.com 웹사이트를 앱 화면에 띄우는 WebView 앱.
 * 로그인은 사용자가 직접 하고, 로그인 상태(쿠키)는 앱에 저장되어 유지됩니다.
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://chatgpt.com/";
    private static final int REQ_FILE = 1;
    private static final int REQ_MIC = 2;

    // 앱 안에서 열어도 되는 사이트 (ChatGPT와 로그인 화면). 나머지는 기본 브라우저로 엽니다.
    private static final String[] INTERNAL_HOSTS = {
            "chatgpt.com", "openai.com", "oaiusercontent.com", "oaistatic.com",
            "challenges.cloudflare.com",
            "login.microsoftonline.com", "login.live.com", "appleid.apple.com",
    };

    private WebView web;
    private ProgressBar progress;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(isNight() ? Color.parseColor("#212121") : Color.WHITE);

        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.parseColor("#10A37F")));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP);
        root.addView(progress, lp);
        setContentView(root);

        // Android 15+ 은 화면이 상태바 밑까지 확장되므로, 상태바 · 내비게이션바 · 키보드만큼 여백을 줍니다.
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
                v.setPadding(i.left, i.top, i.right, i.bottom);
                return WindowInsets.CONSUMED;
            });
        }

        setupWebView();

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            String shared = sharedText(getIntent());
            web.loadUrl(shared != null ? askUrl(shared) : HOME);
        }
    }

    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setSupportMultipleWindows(false); // target=_blank 링크도 같은 화면에서 처리

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isInternal(uri)) return false;
                openOutside(uri);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progress.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showErrorPage(String.valueOf(error.getDescription()));
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
            }

            // 사진 · 파일 첨부
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = params.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(Intent.createChooser(intent, "파일 선택"), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    toast("파일을 고를 수 있는 앱이 없어요");
                    return false;
                }
                return true;
            }

            // 음성 입력 (마이크)
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean wantsMic = false;
                    for (String r : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
                    }
                    if (!wantsMic || !isInternal(request.getOrigin())) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        pendingPermission = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                    }
                });
            }
        });

        // 파일 다운로드는 기본 브라우저에 맡깁니다.
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            Uri uri = Uri.parse(url);
            if ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) {
                openOutside(uri);
            } else {
                toast("이 파일은 앱에서 내려받을 수 없어요. 브라우저에서 ChatGPT를 열어 받아 주세요.");
            }
        });
    }

    // ---------- 공유 / 텍스트 선택 메뉴로 받은 질문 ----------

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String shared = sharedText(intent);
        if (shared != null) web.loadUrl(askUrl(shared));
    }

    private static String sharedText(Intent intent) {
        if (intent == null) return null;
        CharSequence text = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        } else if (Intent.ACTION_PROCESS_TEXT.equals(intent.getAction())) {
            text = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
        }
        if (text == null) return null;
        String t = text.toString().trim();
        return t.isEmpty() ? null : t;
    }

    /** chatgpt.com/?q=질문 으로 열면 ChatGPT가 그 질문을 바로 보냅니다. */
    private static String askUrl(String question) {
        return HOME + "?q=" + Uri.encode(question);
    }

    // ---------- 링크 처리 ----------

    private static boolean isInternal(Uri uri) {
        if (uri == null || !"https".equals(uri.getScheme()) || uri.getHost() == null) return false;
        String host = uri.getHost().toLowerCase();
        for (String h : INTERNAL_HOSTS) {
            if (host.equals(h) || host.endsWith("." + h)) return true;
        }
        return false;
    }

    private void openOutside(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        try {
            if (scheme.equals("intent")) {
                Intent i = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                startActivity(i);
            } else if (scheme.equals("http") || scheme.equals("https") || scheme.equals("mailto") || scheme.equals("tel")) {
                startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
            }
        } catch (Exception e) {
            toast("링크를 열 수 있는 앱이 없어요");
        }
    }

    // ---------- 연결 실패 화면 ----------

    private void showErrorPage(String detail) {
        boolean night = isNight();
        String html = "<!doctype html><html lang=ko><meta charset=utf-8>"
                + "<meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
                + "font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box;"
                + (night ? "background:#212121;color:#eee" : "background:#fff;color:#222") + "}"
                + "p,small{color:#888}a{display:inline-block;margin-top:16px;padding:12px 24px;border-radius:10px;"
                + "background:#10a37f;color:#fff;text-decoration:none}</style>"
                + "<div><h2>ChatGPT에 연결할 수 없어요</h2><p>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</p>"
                + "<small>" + detail.replaceAll("[<>&]", "") + "</small><br>"
                + "<a href='" + HOME + "'>다시 시도</a></div></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    // ---------- 뒤로 가기 ----------

    private void handleBack() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            moveTaskToBack(true); // 앱을 끄지 않고 뒤로 보내서 대화 화면을 유지
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack(); // Android 12 이하 (13 이상은 onCreate에서 등록한 콜백이 처리)
    }

    // ---------- 결과 처리 ----------

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                result = new Uri[n];
                for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_MIC || pendingPermission == null) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            pendingPermission.deny();
            toast("음성 입력을 쓰려면 마이크 권한이 필요해요");
        }
        pendingPermission = null;
    }

    // ---------- 생명주기 ----------

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush(); // 로그인 상태 저장
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    // ---------- 도우미 ----------

    private boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }
}
