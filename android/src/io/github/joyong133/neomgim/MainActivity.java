package io.github.joyong133.neomgim;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.Configuration;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 넘김 뷰어 안드로이드 앱.
 * viewer/index.html 을 앱 안의 가상 주소 https://neomgim.local/ 로 띄우고,
 * 고른 파일은 https://neomgim.local/content/<번호>/<이름> 으로 웹 화면에 넘긴다.
 * 파일 내용은 휴대폰 밖으로 나가지 않는다.
 */
public class MainActivity extends Activity {
    private static final String HOST = "neomgim.local";
    private static final String BASE = "https://" + HOST + "/";
    private static final int REQ_FILES = 1;
    private static final int REQ_TREE = 2;
    private static final int REQ_CHOOSER = 3;
    private static final int MAX_FILES = 20000;
    private static final int MAX_DEPTH = 12;
    private static final String[] PICK_TYPES = {
        "image/*", "application/zip", "application/x-zip-compressed", "application/x-cbz",
        "application/vnd.comicbook+zip", "application/octet-stream"
    };
    private static final String[] EXTS = {
        ".jpg", ".jpeg", ".jfif", ".png", ".gif", ".webp", ".bmp", ".avif", ".zip", ".cbz"
    };

    private WebView web;
    private ValueCallback<Uri[]> chooserCallback;
    private final Map<String, Uri> served = new ConcurrentHashMap<String, Uri>();
    private final AtomicInteger counter = new AtomicInteger();
    private final ArrayList<Uri> pending = new ArrayList<Uri>();
    private boolean pageReady = false;
    private boolean immersive = false;
    private long lastBack = 0;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(isNight() ? 0xFF0D0E11 : 0xFFE4E5EA);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);

        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new Bridge(), "NeomgimAndroid");

        applySystemBars();
        collect(getIntent());
        web.loadUrl(BASE + "index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        collect(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applySystemBars();
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        applySystemBars();
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__onBack ? window.__onBack() : 2", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if ("1".equals(v)) return;
                if ("2".equals(v)) { finish(); return; }
                long now = SystemClock.uptimeMillis();
                if (now - lastBack < 2000) {
                    finish();
                } else {
                    lastBack = now;
                    Toast.makeText(MainActivity.this, "한 번 더 누르면 닫혀요", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    /* ---------- 상태 표시줄 · 몰입 모드 ---------- */

    private boolean isNight() {
        int m = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return m == Configuration.UI_MODE_NIGHT_YES;
    }

    @SuppressWarnings("deprecation")
    private void applySystemBars() {
        int flags = 0;
        if (!isNight()) {
            flags |= 0x00002000;                                   // SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            if (Build.VERSION.SDK_INT >= 26) flags |= 0x00000010;  // SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }
        if (immersive) {
            flags |= View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
        }
        int chrome = isNight() ? 0xFF16181D : 0xFFFBFBFD;
        getWindow().setStatusBarColor(chrome);
        getWindow().setNavigationBarColor(chrome);
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    /* ---------- 웹 화면 ↔ 앱 ---------- */

    private class Bridge {
        @JavascriptInterface
        public void ready() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pageReady = true;
                    if (!pending.isEmpty()) {
                        deliverUris(new ArrayList<Uri>(pending));
                        pending.clear();
                    }
                }
            });
        }

        @JavascriptInterface
        public void pickFiles() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startPicker(openIntent(true), REQ_FILES);
                }
            });
        }

        @JavascriptInterface
        public void pickFolder() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startPicker(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), REQ_TREE);
                }
            });
        }

        @JavascriptInterface
        public void setImmersive(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    immersive = on;
                    applySystemBars();
                }
            });
        }
    }

    private Intent openIntent(boolean multiple) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES, PICK_TYPES);
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        return i;
    }

    private void startPicker(Intent i, int req) {
        try {
            startActivityForResult(i, req);
        } catch (ActivityNotFoundException e) {
            jsToast("이 휴대폰에서는 파일 고르기 화면을 열 수 없어요");
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_CHOOSER) {
            ValueCallback<Uri[]> cb = chooserCallback;
            chooserCallback = null;
            if (cb == null) return;
            List<Uri> list = urisFrom(res, data);
            cb.onReceiveValue(list.isEmpty() ? null : list.toArray(new Uri[0]));
            return;
        }
        if (res != RESULT_OK || data == null) return;
        if (req == REQ_FILES) {
            deliverUris(urisFrom(res, data));
        } else if (req == REQ_TREE && data.getData() != null) {
            walkTreeAsync(data.getData());
        }
    }

    private static List<Uri> urisFrom(int res, Intent data) {
        ArrayList<Uri> out = new ArrayList<Uri>();
        if (res != RESULT_OK || data == null) return out;
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri u = clip.getItemAt(i).getUri();
                if (u != null) out.add(u);
            }
        } else if (data.getData() != null) {
            out.add(data.getData());
        }
        return out;
    }

    /** 다른 앱에서 "열기" 또는 "공유"로 넘어온 파일 */
    @SuppressWarnings("deprecation")
    private void collect(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        ArrayList<Uri> list = new ArrayList<Uri>();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            list.add(intent.getData());
        } else if (Intent.ACTION_SEND.equals(action)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) list.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> us = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (us != null) list.addAll(us);
        }
        if (list.isEmpty()) return;
        if (pageReady) deliverUris(list); else pending.addAll(list);
    }

    private void deliverUris(final List<Uri> uris) {
        if (uris.isEmpty()) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                JSONArray arr = new JSONArray();
                for (Uri u : uris) {
                    String[] info = describe(u);
                    arr.put(entry(u, info[0], info[0], info[1]));
                }
                sendFiles(arr);
            }
        }).start();
    }

    /** [표시 이름, MIME] */
    private String[] describe(Uri u) {
        String name = null;
        String mime = null;
        try {
            mime = getContentResolver().getType(u);
        } catch (Exception ignored) { }
        Cursor c = null;
        try {
            c = getContentResolver().query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (c != null && c.moveToFirst() && !c.isNull(0)) name = c.getString(0);
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        if (name == null) name = u.getLastPathSegment();
        if (name == null) name = "file";
        name = name.replace('/', '_');
        return new String[] { name, mime == null ? "" : mime };
    }

    private void walkTreeAsync(final Uri tree) {
        jsBusy("폴더 읽는 중…");
        new Thread(new Runnable() {
            @Override
            public void run() {
                JSONArray arr = new JSONArray();
                try {
                    String rootId = DocumentsContract.getTreeDocumentId(tree);
                    String rootName = describe(DocumentsContract.buildDocumentUriUsingTree(tree, rootId))[0];
                    walk(tree, rootId, rootName + "/", arr, 0);
                } catch (Exception e) {
                    jsToast("폴더를 읽지 못했어요. 다른 폴더를 골라 주세요");
                }
                jsBusy(null);
                sendFiles(arr);
            }
        }).start();
    }

    private void walk(Uri tree, String docId, String prefix, JSONArray out, int depth) {
        if (depth > MAX_DEPTH || out.length() >= MAX_FILES) return;
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        String[] cols = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        };
        ArrayList<String[]> dirs = new ArrayList<String[]>();
        Cursor c = null;
        try {
            c = getContentResolver().query(children, cols, null, null, null);
            while (c != null && c.moveToNext() && out.length() < MAX_FILES) {
                String id = c.getString(0);
                String name = c.getString(1);
                String mime = c.getString(2);
                if (id == null || name == null || name.startsWith(".")) continue;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    dirs.add(new String[] { id, name });
                } else if (wanted(name, mime)) {
                    Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, id);
                    out.put(entry(doc, prefix + name, name, mime == null ? "" : mime));
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        for (String[] d : dirs) walk(tree, d[0], prefix + d[1] + "/", out, depth + 1);
    }

    private static boolean wanted(String name, String mime) {
        String n = name.toLowerCase(Locale.ROOT);
        for (String e : EXTS) if (n.endsWith(e)) return true;
        return mime != null && (mime.startsWith("image/") || mime.contains("zip"));
    }

    private JSONObject entry(Uri uri, String path, String name, String mime) {
        String token = String.valueOf(counter.incrementAndGet());
        served.put(token, uri);
        JSONObject o = new JSONObject();
        try {
            o.put("url", BASE + "content/" + token + "/" + Uri.encode(name));
            o.put("path", path);
            o.put("name", name);
            o.put("type", mime);
        } catch (JSONException ignored) { }
        return o;
    }

    private void sendFiles(JSONArray arr) {
        js("window.__nativeFiles && window.__nativeFiles(" + arr.toString() + ")");
    }

    private void jsBusy(String text) {
        js("window.__nativeBusy && window.__nativeBusy(" + (text == null ? "null" : JSONObject.quote(text)) + ")");
    }

    private void jsToast(String text) {
        js("window.__nativeToast && window.__nativeToast(" + JSONObject.quote(text) + ")");
    }

    private void js(final String code) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) web.evaluateJavascript(code, null);
            }
        });
    }

    /* ---------- 앱 안의 가상 주소 ---------- */

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            try {
                if (path.startsWith("/content/")) {
                    List<String> seg = u.getPathSegments();
                    Uri target = seg.size() >= 2 ? served.get(seg.get(1)) : null;
                    if (target == null) return notFound();
                    InputStream in = getContentResolver().openInputStream(target);
                    if (in == null) return notFound();
                    String mime = null;
                    try { mime = getContentResolver().getType(target); } catch (Exception ignored) { }
                    return ok(mime == null ? "application/octet-stream" : mime, in);
                }
                return ok(mimeFor(path), getAssets().open(path.substring(1)));
            } catch (Exception e) {
                return notFound();
            }
        }

        // API 24 메서드라 android-23 으로 컴파일할 때는 @Override 를 붙이지 않는다 (minSdk 24)
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u));
            } catch (Exception ignored) { }
            return true;
        }
    }

    private static WebResourceResponse ok(String mime, InputStream in) {
        Map<String, String> h = new HashMap<String, String>();
        h.put("Cache-Control", "no-store");
        String enc = mime.startsWith("text/") ? "utf-8" : null;
        return new WebResourceResponse(mime, enc, 200, "OK", h, in);
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
            new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    private static String mimeFor(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    /* ---------- <input type="file"> 대비용 ---------- */

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (chooserCallback != null) chooserCallback.onReceiveValue(null);
            chooserCallback = cb;
            boolean multiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
            try {
                startActivityForResult(openIntent(multiple), REQ_CHOOSER);
            } catch (ActivityNotFoundException e) {
                chooserCallback = null;
                cb.onReceiveValue(null);
            }
            return true;
        }
    }
}
