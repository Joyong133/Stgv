package com.stgv.timerlock;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.RadioGroup;
import android.widget.Switch;
import android.widget.TextView;

import java.text.Collator;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity {

    private static final int FILTER_ALL = 0;
    private static final int FILTER_BLOCKED = 1;
    private static final int FILTER_WHITELIST = 2;

    private Prefs prefs;
    private Set<String> exempt = new HashSet<>();

    private final List<AppInfo> allApps = new ArrayList<>();
    private final List<AppInfo> shown = new ArrayList<>();
    private AppAdapter adapter;

    private View permCard;
    private TextView permTitle;
    private TextView permBody;
    private View permButtons;
    private TextView appsHeader;
    private Switch strictSwitch;
    private RadioGroup durationGroup;

    private String query = "";
    private int filter = FILTER_ALL;
    private boolean loaded;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        prefs = Prefs.get(this);

        ListView list = findViewById(R.id.list);
        View header = LayoutInflater.from(this).inflate(R.layout.header_settings, list, false);
        list.addHeaderView(header, null, false);
        adapter = new AppAdapter();
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, view, position, id) -> {
            int index = position - list.getHeaderViewsCount();
            if (index >= 0 && index < shown.size()) showRuleDialog(shown.get(index));
        });

        permCard = header.findViewById(R.id.permCard);
        permTitle = header.findViewById(R.id.permTitle);
        permBody = header.findViewById(R.id.permBody);
        permButtons = header.findViewById(R.id.permButtons);
        appsHeader = header.findViewById(R.id.appsHeader);
        Button btnAccessibility = header.findViewById(R.id.btnAccessibility);
        Button btnAppInfo = header.findViewById(R.id.btnAppInfo);
        btnAccessibility.setOnClickListener(v -> openAccessibilitySettings());
        btnAppInfo.setOnClickListener(v -> openAppInfo());

        Switch masterSwitch = header.findViewById(R.id.masterSwitch);
        masterSwitch.setChecked(prefs.isEnabled());
        masterSwitch.setOnCheckedChangeListener((b, on) -> prefs.setEnabled(on));

        strictSwitch = header.findViewById(R.id.strictSwitch);
        strictSwitch.setChecked(prefs.isStrict());
        strictSwitch.setOnCheckedChangeListener((b, on) -> {
            prefs.setStrict(on);
            applyFilter();
        });

        durationGroup = header.findViewById(R.id.durationGroup);
        int def = prefs.getDefaultMinutes();
        durationGroup.check(def == 5 ? R.id.dur5 : def == 3 ? R.id.dur3 : R.id.dur1);
        durationGroup.setOnCheckedChangeListener((g, checkedId) -> {
            int minutes = checkedId == R.id.dur5 ? 5 : checkedId == R.id.dur3 ? 3 : 1;
            prefs.setDefaultMinutes(minutes);
            adapter.notifyDataSetChanged();
        });

        EditText search = findViewById(R.id.search);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) {
                query = s.toString().trim().toLowerCase(Locale.ROOT);
                applyFilter();
            }
        });

        RadioGroup filterGroup = findViewById(R.id.filterGroup);
        filterGroup.setOnCheckedChangeListener((g, checkedId) -> {
            filter = checkedId == R.id.filterBlocked ? FILTER_BLOCKED
                    : checkedId == R.id.filterWhitelist ? FILTER_WHITELIST : FILTER_ALL;
            applyFilter();
        });

        appsHeader.setText(R.string.loading);
        loadApps();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updatePermissionCard();
        if (loaded) {
            exempt = SystemApps.exemptPackages(this);
            applyFilter();
        }
    }

    // ---------------------------------------------------------------- 권한

    private boolean isServiceEnabled() {
        String enabled = Settings.Secure.getString(getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(enabled)) return false;
        ComponentName me = new ComponentName(this, BlockerService.class);
        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(enabled);
        for (String s : splitter) {
            ComponentName cn = ComponentName.unflattenFromString(s);
            if (me.equals(cn)) return true;
        }
        return false;
    }

    private void updatePermissionCard() {
        boolean on = isServiceEnabled();
        GradientDrawable bg = (GradientDrawable) permCard.getBackground().mutate();
        bg.setColor(getColor(on ? R.color.ok_bg : R.color.warn_bg));
        permTitle.setText(on ? R.string.perm_title_on : R.string.perm_title_off);
        permTitle.setTextColor(getColor(on ? R.color.ok : R.color.warn));
        permBody.setText(on ? R.string.perm_body_on : R.string.perm_body_off);
        permButtons.setVisibility(on ? View.GONE : View.VISIBLE);
    }

    private void openAccessibilitySettings() {
        try {
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        } catch (RuntimeException e) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }

    private void openAppInfo() {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getPackageName(), null));
        startActivity(i);
    }

    // ---------------------------------------------------------------- 앱 목록

    private void loadApps() {
        new Thread(() -> {
            PackageManager pm = getPackageManager();
            Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> infos = pm.queryIntentActivities(main, 0);
            Set<String> seen = new HashSet<>();
            List<AppInfo> result = new ArrayList<>();
            for (ResolveInfo ri : infos) {
                if (ri.activityInfo == null) continue;
                String pkg = ri.activityInfo.packageName;
                if (pkg.equals(getPackageName()) || !seen.add(pkg)) continue;
                String label;
                try {
                    label = pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
                } catch (PackageManager.NameNotFoundException e) {
                    label = String.valueOf(ri.loadLabel(pm));
                }
                result.add(new AppInfo(pkg, label, ri.loadIcon(pm)));
            }
            Collator collator = Collator.getInstance(Locale.KOREAN);
            result.sort((a, b) -> collator.compare(a.label, b.label));
            Set<String> ex = SystemApps.exemptPackages(this);
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                allApps.clear();
                allApps.addAll(result);
                exempt = ex;
                loaded = true;
                applyFilter();
            });
        }).start();
    }

    private void applyFilter() {
        shown.clear();
        for (AppInfo app : allApps) {
            if (!query.isEmpty()
                    && !app.label.toLowerCase(Locale.ROOT).contains(query)
                    && !app.pkg.toLowerCase(Locale.ROOT).contains(query)) continue;
            int minutes = effectiveMinutes(app.pkg);
            int rule = prefs.getRule(app.pkg);
            if (filter == FILTER_BLOCKED && minutes <= 0) continue;
            if (filter == FILTER_WHITELIST && rule != Prefs.RULE_WHITELIST) continue;
            shown.add(app);
        }
        if (loaded) appsHeader.setText(shown.isEmpty() ? R.string.empty : R.string.apps_header);
        adapter.notifyDataSetChanged();
    }

    /** 서비스와 같은 기준으로, 이 앱에 걸리는 타이머(분)를 계산 (0 = 막지 않음) */
    private int effectiveMinutes(String pkg) {
        if (exempt.contains(pkg)) return 0;
        int rule = prefs.getRule(pkg);
        if (rule == Prefs.RULE_WHITELIST) return 0;
        if (rule > 0) return rule;
        if (prefs.isStrict() && !"com.android.settings".equals(pkg)) return prefs.getDefaultMinutes();
        return 0;
    }

    private void showRuleDialog(AppInfo app) {
        final int[] rules = {Prefs.RULE_NONE, 1, 3, 5, Prefs.RULE_WHITELIST};
        String noneLabel = prefs.isStrict()
                ? "기본값 따르기 (" + prefs.getDefaultMinutes() + "분)"
                : "제한 없음";
        String[] labels = {
                noneLabel,
                "1분 타이머",
                "3분 타이머",
                "5분 타이머",
                "화이트리스트 (항상 사용 가능)"
        };
        int current = prefs.getRule(app.pkg);
        int checked = 0;
        for (int i = 0; i < rules.length; i++) if (rules[i] == current) checked = i;

        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle(app.label)
                .setIcon(app.icon)
                .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                    prefs.setRule(app.pkg, rules[which]);
                    applyFilter();
                    dialog.dismiss();
                })
                .setNegativeButton(android.R.string.cancel, null);
        if (exempt.contains(app.pkg)) {
            b.setTitle(app.label + " (홈·전화 앱은 항상 허용)");
        }
        b.show();
    }

    private final class AppAdapter extends BaseAdapter {
        @Override public int getCount() { return shown.size(); }
        @Override public Object getItem(int position) { return shown.get(position); }
        @Override public long getItemId(int position) { return position; }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            View v = convertView;
            if (v == null) v = LayoutInflater.from(MainActivity.this).inflate(R.layout.item_app, parent, false);
            AppInfo app = shown.get(position);
            ((ImageView) v.findViewById(R.id.icon)).setImageDrawable(app.icon);
            ((TextView) v.findViewById(R.id.label)).setText(app.label);
            ((TextView) v.findViewById(R.id.pkg)).setText(app.pkg);

            TextView chip = v.findViewById(R.id.chip);
            int rule = prefs.getRule(app.pkg);
            int minutes = effectiveMinutes(app.pkg);
            String text;
            int color;
            if (exempt.contains(app.pkg)) {
                text = "항상 허용";
                color = R.color.neutral;
            } else if (rule == Prefs.RULE_WHITELIST) {
                text = "✓ 화이트리스트";
                color = R.color.ok;
            } else if (rule > 0) {
                text = "⏱ " + rule + "분";
                color = R.color.block;
            } else if (minutes > 0) {
                text = "⏱ " + minutes + "분 (기본)";
                color = R.color.block;
            } else {
                text = "제한 없음";
                color = R.color.neutral;
            }
            chip.setText(text);
            GradientDrawable bg = (GradientDrawable) chip.getBackground().mutate();
            bg.setColor(getColor(color));
            return v;
        }
    }
}
