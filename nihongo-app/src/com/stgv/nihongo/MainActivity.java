package com.stgv.nihongo;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/**
 * 일본어 말하기 연습 앱.
 * 화면은 assets/index.html(WebView)로 그리고, 음성 합성(TTS)과
 * 음성 인식(STT)은 안드로이드 기능을 JS 브리지(window.Android)로 제공한다.
 */
public class MainActivity extends Activity implements TextToSpeech.OnInitListener {

    private static final int REQ_MIC = 1001;
    private static final int REQ_STT_INTENT = 1002;

    private WebView web;
    private TextToSpeech tts;
    private int ttsState = 0; // 0: 준비 중, 1: 사용 가능, -1: 일본어 음성 없음, -2: TTS 없음
    private SpeechRecognizer recognizer;
    private boolean listening = false;
    private boolean pendingListen = false;
    private long lastRms = 0;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 21) {
            getWindow().setStatusBarColor(Color.parseColor("#E8455B"));
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#FFF7F4"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient());
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);

        tts = new TextToSpeech(this, this);
    }

    // ---------------- TTS ----------------

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) {
            ttsState = -2;
            notifyTts();
            return;
        }
        int r = tts.setLanguage(Locale.JAPAN);
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
            ttsState = -1;
        } else {
            ttsState = 1;
            pickBestVoice();
        }
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { js("window.onSpeakStart&&onSpeakStart(" + JSONObject.quote(id) + ")"); }
            @Override public void onDone(String id) { js("window.onSpeakDone&&onSpeakDone(" + JSONObject.quote(id) + ")"); }
            @Override public void onError(String id) { js("window.onSpeakDone&&onSpeakDone(" + JSONObject.quote(id) + ")"); }
        });
        notifyTts();
    }

    /** 네트워크가 필요 없는 일본어 음성 중 품질이 가장 좋은 것을 고른다. */
    private void pickBestVoice() {
        if (Build.VERSION.SDK_INT < 21) return;
        try {
            Voice best = null;
            for (Voice v : tts.getVoices()) {
                Locale l = v.getLocale();
                if (l == null || !"ja".equals(l.getLanguage())) continue;
                if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                if (best == null) { best = v; continue; }
                boolean bNet = best.isNetworkConnectionRequired();
                boolean vNet = v.isNetworkConnectionRequired();
                if (bNet && !vNet) { best = v; continue; }
                if (bNet == vNet && v.getQuality() > best.getQuality()) best = v;
            }
            if (best != null) tts.setVoice(best);
        } catch (Exception ignored) { }
    }

    private void notifyTts() {
        js("window.onTtsState&&onTtsState(" + ttsState + ")");
    }

    // ---------------- STT ----------------

    private boolean hasMic() {
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private Intent sttIntent() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ja-JP");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ja-JP");
        i.putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "일본어로 말해 보세요");
        return i;
    }

    private void startListening() {
        if (!hasMic()) {
            pendingListen = true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            return;
        }
        if (tts != null) tts.stop();
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            startIntentRecognizer();
            return;
        }
        try {
            if (recognizer == null) {
                recognizer = SpeechRecognizer.createSpeechRecognizer(this);
                recognizer.setRecognitionListener(new Listener());
            }
            if (listening) recognizer.cancel();
            listening = true;
            recognizer.startListening(sttIntent());
            js("window.onSttState&&onSttState('listening')");
        } catch (Exception e) {
            listening = false;
            startIntentRecognizer();
        }
    }

    private void startIntentRecognizer() {
        try {
            startActivityForResult(sttIntent(), REQ_STT_INTENT);
            js("window.onSttState&&onSttState('listening')");
        } catch (ActivityNotFoundException e) {
            js("window.onSttError&&onSttError(-100)");
        }
    }

    private void stopListening() {
        if (recognizer != null && listening) {
            recognizer.stopListening();
        }
    }

    private void cancelListening() {
        if (recognizer != null) {
            recognizer.cancel();
        }
        listening = false;
        js("window.onSttState&&onSttState('idle')");
    }

    private class Listener implements RecognitionListener {
        @Override public void onReadyForSpeech(Bundle params) { js("window.onSttState&&onSttState('ready')"); }
        @Override public void onBeginningOfSpeech() { js("window.onSttState&&onSttState('speaking')"); }
        @Override public void onRmsChanged(float rmsdB) {
            long now = System.currentTimeMillis();
            if (now - lastRms < 90) return;
            lastRms = now;
            js("window.onSttLevel&&onSttLevel(" + rmsdB + ")");
        }
        @Override public void onBufferReceived(byte[] buffer) { }
        @Override public void onEndOfSpeech() { js("window.onSttState&&onSttState('processing')"); }
        @Override public void onError(int error) {
            listening = false;
            js("window.onSttError&&onSttError(" + error + ")");
        }
        @Override public void onResults(Bundle results) {
            listening = false;
            sendResults(results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION), true);
        }
        @Override public void onPartialResults(Bundle partial) {
            sendResults(partial.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION), false);
        }
        @Override public void onEvent(int eventType, Bundle params) { }
    }

    private void sendResults(ArrayList<String> list, boolean fin) {
        JSONArray arr = new JSONArray();
        if (list != null) for (String t : list) arr.put(t);
        if (fin) js("window.onSttResult&&onSttResult(" + arr.toString() + ")");
        else js("window.onSttPartial&&onSttPartial(" + arr.toString() + ")");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_STT_INTENT) {
            if (resultCode == RESULT_OK && data != null) {
                sendResults(data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS), true);
            } else {
                js("window.onSttError&&onSttError(7)");
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_MIC) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (ok && pendingListen) startListening();
            else if (!ok) js("window.onSttError&&onSttError(9)");
            pendingListen = false;
        }
    }

    // ---------------- JS 브리지 ----------------

    private void js(final String code) {
        ui.post(new Runnable() {
            @Override public void run() {
                if (web != null) web.evaluateJavascript(code, null);
            }
        });
    }

    private class Bridge {
        @JavascriptInterface
        public int ttsState() { return ttsState; }

        @JavascriptInterface
        public void speak(final String text, final float rate, final String id) {
            ui.post(new Runnable() {
                @Override public void run() {
                    if (tts == null || ttsState != 1) {
                        js("window.onSpeakDone&&onSpeakDone(" + JSONObject.quote(id) + ")");
                        return;
                    }
                    tts.setSpeechRate(rate);
                    Bundle p = new Bundle();
                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, p, id);
                }
            });
        }

        @JavascriptInterface
        public void stopSpeak() {
            ui.post(new Runnable() {
                @Override public void run() { if (tts != null) tts.stop(); }
            });
        }

        @JavascriptInterface
        public void listen() {
            ui.post(new Runnable() { @Override public void run() { startListening(); } });
        }

        @JavascriptInterface
        public void stopListen() {
            ui.post(new Runnable() { @Override public void run() { stopListening(); } });
        }

        @JavascriptInterface
        public void cancelListen() {
            ui.post(new Runnable() { @Override public void run() { cancelListening(); } });
        }

        @JavascriptInterface
        public boolean sttAvailable() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this)
                    || getPackageManager().queryIntentActivities(sttIntent(), 0).size() > 0;
        }

        @JavascriptInterface
        public void openTtsSettings() {
            ui.post(new Runnable() {
                @Override public void run() {
                    try {
                        startActivity(new Intent("com.android.settings.TTS_SETTINGS"));
                    } catch (Exception e) {
                        try {
                            Intent i = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
                            startActivity(i);
                        } catch (Exception ignored) { }
                    }
                }
            });
        }

        @JavascriptInterface
        public void openAppSettings() {
            ui.post(new Runnable() {
                @Override public void run() {
                    try {
                        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        i.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(i);
                    } catch (Exception ignored) { }
                }
            });
        }

        @JavascriptInterface
        public void exitApp() {
            ui.post(new Runnable() { @Override public void run() { finish(); } });
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.handleBack?handleBack():false", new ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                if (!"true".equals(value)) MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (tts != null) tts.stop();
        if (recognizer != null && listening) cancelListening();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        if (recognizer != null) recognizer.destroy();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
