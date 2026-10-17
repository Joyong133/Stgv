package com.joyong.ytfinder;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class MainActivity extends Activity {
    private static final int MAX_COUNT = 200;

    private EditText keywordInput;
    private Spinner languageSpinner;
    private EditText countInput;
    private CheckBox translateBox;
    private CheckBox strictBox;
    private CheckBox randomBox;
    private EditText apiKeyInput;
    private Button searchButton;
    private TextView statusText;
    private View actions;
    private ResultAdapter adapter;

    private final Handler main = new Handler(Looper.getMainLooper());
    private LinkFinder running;
    private String analysis = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        keywordInput = findViewById(R.id.keyword);
        languageSpinner = findViewById(R.id.language);
        countInput = findViewById(R.id.count);
        translateBox = findViewById(R.id.opt_translate);
        strictBox = findViewById(R.id.opt_strict);
        randomBox = findViewById(R.id.opt_random);
        apiKeyInput = findViewById(R.id.api_key);
        searchButton = findViewById(R.id.search);
        statusText = findViewById(R.id.status);
        actions = findViewById(R.id.actions);

        ArrayAdapter<Language> langAdapter =
                new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, Language.ALL);
        langAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        languageSpinner.setAdapter(langAdapter);

        adapter = new ResultAdapter(this);
        ListView list = findViewById(R.id.results);
        list.setAdapter(adapter);
        list.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                openLink(adapter.getItem(position).url());
            }
        });
        list.setOnItemLongClickListener(new AdapterView.OnItemLongClickListener() {
            @Override
            public boolean onItemLongClick(AdapterView<?> parent, View view, int position, long id) {
                copy(adapter.getItem(position).url(), "링크를 복사했습니다");
                return true;
            }
        });

        final TextView advanced = findViewById(R.id.advanced_toggle);
        advanced.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                apiKeyInput.setVisibility(apiKeyInput.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
            }
        });

        searchButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (running != null) stopSearch();
                else startSearch();
            }
        });
        keywordInput.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                if (actionId == EditorInfo.IME_ACTION_SEARCH && running == null) {
                    startSearch();
                    return true;
                }
                return false;
            }
        });

        findViewById(R.id.copy_all).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                copy(resultText(), adapter.getCount() + "개 링크를 복사했습니다");
            }
        });
        findViewById(R.id.share).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_TEXT, resultText());
                startActivity(Intent.createChooser(send, getString(R.string.share)));
            }
        });

        loadPrefs();
    }

    @Override
    protected void onDestroy() {
        if (running != null) running.cancel();
        super.onDestroy();
    }

    private void startSearch() {
        String keyword = keywordInput.getText().toString().trim();
        if (keyword.isEmpty()) {
            keywordInput.setError("키워드를 입력하세요");
            return;
        }
        int count;
        try {
            count = Integer.parseInt(countInput.getText().toString().trim());
        } catch (NumberFormatException e) {
            count = 10;
        }
        count = Math.max(1, Math.min(MAX_COUNT, count));
        countInput.setText(String.valueOf(count));
        savePrefs();
        hideKeyboard();

        LinkFinder.Options opt = new LinkFinder.Options();
        opt.keyword = keyword;
        opt.language = (Language) languageSpinner.getSelectedItem();
        opt.count = count;
        opt.translate = translateBox.isChecked();
        opt.strict = strictBox.isChecked();
        opt.random = randomBox.isChecked();

        YouTubeSearcher.Order[] orders = YouTubeSearcher.Order.values();
        final YouTubeSearcher.Order order = opt.random
                ? orders[new Random().nextInt(orders.length)] : YouTubeSearcher.Order.RELEVANCE;
        final boolean random = opt.random;
        final YouTubeSearcher searcher = new YouTubeSearcher(opt.language, apiKeyInput.getText().toString(), order);
        LinkFinder.Source source = new LinkFinder.Source() {
            @Override
            public YouTubeSearcher.Page search(String query, String continuation) throws IOException {
                return searcher.search(query, continuation);
            }
        };
        final int target = count;
        final LinkFinder finder = new LinkFinder(opt, source, new Translator(), new LinkFinder.Listener() {
            @Override
            public void onAnalysis(final String text) {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        analysis = text
                                + (random ? "\n랜덤 모드 · 이번 정렬: " + order.label : "")
                                + (searcher.usesApiKey() ? "\n(YouTube Data API 사용)" : "");
                        statusText.setText(analysis + "\n검색 중…");
                    }
                });
            }

            @Override
            public void onProgress(final List<VideoItem> shown, final int collected, final int goal,
                                   final int checked, final int rejected) {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (running == null) return;
                        adapter.setItems(shown);
                        actions.setVisibility(shown.isEmpty() ? View.GONE : View.VISIBLE);
                        statusText.setText(analysis
                                + (random ? "\n랜덤으로 고를 후보 모으는 중… " : "\n검색 중… ") + collected + "/" + goal
                                + " (확인 " + checked + "개, 언어 불일치 제외 " + rejected + "개)");
                    }
                });
            }
        });

        running = finder;
        adapter.setItems(new ArrayList<VideoItem>());
        actions.setVisibility(View.GONE);
        analysis = "";
        statusText.setText("키워드 분석 중…");
        searchButton.setText(R.string.stop);

        new Thread(new Runnable() {
            @Override
            public void run() {
                List<VideoItem> result = null;
                String error = null;
                try {
                    result = finder.run();
                } catch (IOException e) {
                    error = e.getMessage();
                } catch (RuntimeException e) {
                    error = e.toString();
                }
                final List<VideoItem> r = result;
                final String err = error;
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        if (running != finder) return;
                        onSearchDone(r, err, target, finder.isCancelled());
                    }
                });
            }
        }, "link-finder").start();
    }

    private void stopSearch() {
        running.cancel();
        statusText.setText(analysis + "\n멈추는 중…");
    }

    private void onSearchDone(List<VideoItem> result, String error, int target, boolean cancelled) {
        running = null;
        searchButton.setText(R.string.search);
        if (result != null) adapter.setItems(result);
        int n = adapter.getCount();
        actions.setVisibility(n == 0 ? View.GONE : View.VISIBLE);
        String head = analysis.isEmpty() ? "" : analysis + "\n";
        if (error != null) {
            statusText.setText(head + "검색 실패: " + error + "\n인터넷 연결을 확인하고 다시 시도하세요.");
        } else if (cancelled) {
            statusText.setText(head + "중지됨 · " + n + "개 찾음");
        } else if (n < target) {
            statusText.setText(head + "완료 · " + n + "개만 찾았습니다 (요청 " + target + "개). "
                    + "키워드를 바꾸거나 '제목 언어' 옵션을 끄면 더 찾을 수 있어요.");
        } else {
            statusText.setText(head + "완료 · " + n + "개 링크를 찾았습니다. "
                    + "누르면 열리고, 길게 누르면 복사됩니다.");
        }
    }

    private String resultText() {
        StringBuilder sb = new StringBuilder();
        List<VideoItem> items = adapter.getItems();
        for (int i = 0; i < items.size(); i++) {
            VideoItem v = items.get(i);
            sb.append(i + 1).append(". ").append(v.title).append('\n').append(v.url()).append('\n');
        }
        return sb.toString().trim();
    }

    private void openLink(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            copy(url, "열 수 있는 앱이 없어 링크를 복사했습니다");
        }
    }

    private void copy(String text, String toast) {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("YouTube", text));
        Toast.makeText(this, toast, Toast.LENGTH_SHORT).show();
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        imm.hideSoftInputFromWindow(keywordInput.getWindowToken(), 0);
    }

    private void loadPrefs() {
        SharedPreferences p = getPreferences(MODE_PRIVATE);
        int lang = p.getInt("lang", 0);
        if (lang >= 0 && lang < Language.ALL.length) languageSpinner.setSelection(lang);
        countInput.setText(String.valueOf(p.getInt("count", 10)));
        translateBox.setChecked(p.getBoolean("translate", true));
        strictBox.setChecked(p.getBoolean("strict", true));
        randomBox.setChecked(p.getBoolean("random", true));
        String key = p.getString("api_key", "");
        apiKeyInput.setText(key);
        if (!key.isEmpty()) apiKeyInput.setVisibility(View.VISIBLE);
    }

    private void savePrefs() {
        int count;
        try {
            count = Integer.parseInt(countInput.getText().toString().trim());
        } catch (NumberFormatException e) {
            count = 10;
        }
        getPreferences(MODE_PRIVATE).edit()
                .putInt("lang", languageSpinner.getSelectedItemPosition())
                .putInt("count", count)
                .putBoolean("translate", translateBox.isChecked())
                .putBoolean("strict", strictBox.isChecked())
                .putBoolean("random", randomBox.isChecked())
                .putString("api_key", apiKeyInput.getText().toString().trim())
                .apply();
    }
}
