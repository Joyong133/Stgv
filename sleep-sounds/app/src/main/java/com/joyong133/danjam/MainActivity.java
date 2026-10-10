package com.joyong133.danjam;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ComponentName;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import com.joyong133.danjam.audio.Presets;
import com.joyong133.danjam.audio.SoundCatalog;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.joyong133.danjam.Ui.CARD;
import static com.joyong133.danjam.Ui.CARD_ON;
import static com.joyong133.danjam.Ui.INK;
import static com.joyong133.danjam.Ui.MOON;
import static com.joyong133.danjam.Ui.SKY;
import static com.joyong133.danjam.Ui.SUB;
import static com.joyong133.danjam.Ui.TEXT;

/** 소리 고르기 화면: 분류별 소리 타일, 추천·내 믹스, 위쪽 바로가기(소리 공간·집중·호흡·취침 화면), 아래쪽 재생 막대. */
public final class MainActivity extends Activity implements SoundService.Listener {
    private static final int TAB_MIXES = SoundCatalog.CATEGORIES.length;
    private static final int[] TIMER_MINUTES = {0, 10, 15, 20, 30, 45, 60, 90, 120, 180, 480};

    private static final class Tile {
        final View box;
        final SeekBar volume;

        Tile(View box, SeekBar volume) {
            this.box = box;
            this.volume = volume;
        }
    }

    private SoundService service;
    private boolean bound;
    /** 열려 있는 전체 화면 대화상자 (소리 공간·호흡·취침 화면) */
    private Dialog openDialog;
    private MixStore store;
    private int tab;
    private boolean updating;

    private LinearLayout column, content;
    private ScrollView scroll;
    private final List<TextView> tabs = new ArrayList<>();
    private final Map<String, Tile> tiles = new HashMap<>();
    private ImageButton playButton, clearButton;
    private TextView barTitle, barSub, timerButton, spaceButton, focusButton;

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            service = ((SoundService.LocalBinder) binder).service();
            service.addListener(MainActivity.this);
            // 앱이 꺼져 있던 사이에도 집중 시간은 흘렀다: 남아 있으면 이어서 들려준다
            if (service.locked() && !service.isPlaying()) service.play();
            onStateChanged();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            service = null;
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        store = new MixStore(this);
        tab = state == null ? 0 : state.getInt("tab", 0);
        setupWindow();
        setContentView(buildRoot());
        showTab(tab);
    }

    @Override
    protected void onStart() {
        super.onStart();
        bound = bindService(new Intent(this, SoundService.class), connection, Context.BIND_AUTO_CREATE);
    }

    @Override
    protected void onStop() {
        // 재생 중이 아니면 화면을 떠난 사이 서비스가 끝날 수 있으니 대화상자도 닫는다
        if (openDialog != null && (service == null || !service.isPlaying())) openDialog.dismiss();
        if (service != null) service.removeListener(this);
        if (bound) unbindService(connection);
        bound = false;
        service = null;
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        if (openDialog != null) openDialog.dismiss();
        super.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putInt("tab", tab);
    }

    // ---- 화면 구성 ----

    private int dp(float v) {
        return Ui.dp(this, v);
    }

    private TextView text(CharSequence s, float sp, int color, boolean bold) {
        return Ui.text(this, s, sp, color, bold);
    }

    private static GradientDrawable rounded(int color, float radiusPx) {
        return Ui.rounded(color, radiusPx);
    }

    @SuppressWarnings("deprecation")
    private void setupWindow() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) w.setNavigationBarContrastEnforced(false);
    }

    private View buildRoot() {
        FrameLayout root = new FrameLayout(this);
        root.setBackground(Ui.night());

        column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        root.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(22), dp(18), dp(22), dp(8));
        header.addView(text("단잠 🌙", 28, TEXT, true));
        TextView subtitle = text("빗소리와 자연의 소리를 섞어 나만의 잠자리를 만들어 보세요", 13, SUB, false);
        subtitle.setPadding(0, dp(4), 0, 0);
        header.addView(subtitle);
        column.addView(header);

        // 바로가기: 소리 공간(3D·설정), 집중 소리, 호흡 안내, 취침 화면
        LinearLayout actions = new LinearLayout(this);
        actions.setPadding(dp(14), dp(4), dp(14), dp(8));
        spaceButton = Ui.pill(this, "🎧 소리 공간", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (service != null) openDialog = SpaceDialog.show(MainActivity.this, service);
            }
        });
        spaceButton.setContentDescription("소리 공간: 3D 공간 음향과 소리 설정");
        focusButton = Ui.pill(this, "🎯 집중", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (service == null) return;
                openDialog = FocusDialog.show(MainActivity.this, service, new Runnable() {
                    @Override
                    public void run() {
                        askNotificationPermission();
                    }
                });
            }
        });
        focusButton.setContentDescription("집중 소리: 정한 시간 동안 고른 소리만 듣기");
        TextView breath = Ui.pill(this, "🌬️ 호흡", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (service != null) openDialog = BreathDialog.show(MainActivity.this, service);
            }
        });
        breath.setContentDescription("호흡 안내");
        TextView bedside = Ui.pill(this, "🌙 취침", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (service != null) openDialog = BedsideDialog.show(MainActivity.this, service);
            }
        });
        bedside.setContentDescription("취침 화면");
        View[] pills = {spaceButton, focusButton, breath, bedside};
        float[] weights = {1.3f, 1f, 1f, 1f};
        for (int i = 0; i < pills.length; i++) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, weights[i]);
            if (i > 0) lp.leftMargin = dp(6);
            pills[i].setPadding(dp(6), dp(8), dp(6), dp(8));
            actions.addView(pills[i], lp);
        }
        column.addView(actions);

        // 분류 탭: 화면 너비를 똑같이 나눠 좁은 폰에서도 모두 보이게 한다
        LinearLayout tabRow = new LinearLayout(this);
        tabRow.setPadding(dp(14), dp(2), dp(14), dp(10));
        String[] labels = new String[TAB_MIXES + 1];
        System.arraycopy(SoundCatalog.CATEGORIES, 0, labels, 0, TAB_MIXES);
        labels[TAB_MIXES] = "★ 믹스";
        for (int i = 0; i < labels.length; i++) {
            final int index = i;
            TextView chip = text(labels[i], 13, SUB, true);
            chip.setGravity(Gravity.CENTER);
            chip.setSingleLine(true);
            chip.setPadding(dp(2), dp(8), dp(2), dp(8));
            chip.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showTab(index);
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            if (i > 0) lp.leftMargin = dp(5);
            tabRow.addView(chip, lp);
            tabs.add(chip);
        }
        column.addView(tabRow);

        scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setClipToPadding(false);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(14), dp(2), dp(14), dp(20));
        scroll.addView(content);
        column.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        column.addView(buildBar());

        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                int[] b = Ui.bars(insets);
                column.setPadding(b[0], b[1], b[2], b[3]);
                return insets;
            }
        });
        return root;
    }

    private View buildBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(10), dp(10), dp(8), dp(10));
        bar.setBackground(rounded(Ui.BAR, dp(30)));
        bar.setElevation(dp(8));

        playButton = new ImageButton(this);
        playButton.setBackground(Ui.oval(MOON));
        playButton.setImageResource(R.drawable.ic_play);
        playButton.setImageTintList(ColorStateList.valueOf(INK));
        playButton.setContentDescription("재생");
        playButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (service == null) return;
                if (service.isPlaying() && !service.focusMuted()) {
                    service.pause();
                } else {
                    askNotificationPermission();
                    service.play();
                }
            }
        });
        bar.addView(playButton, new LinearLayout.LayoutParams(dp(56), dp(56)));

        LinearLayout info = new LinearLayout(this);
        info.setOrientation(LinearLayout.VERTICAL);
        info.setPadding(dp(14), 0, dp(8), 0);
        barTitle = text("", 15, TEXT, true);
        barTitle.setSingleLine(true);
        barTitle.setEllipsize(TextUtils.TruncateAt.END);
        barSub = text("", 12, SUB, false);
        barSub.setSingleLine(true);
        barSub.setEllipsize(TextUtils.TruncateAt.END);
        info.addView(barTitle);
        info.addView(barSub);
        info.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showCurrentMix();
            }
        });
        bar.addView(info, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        timerButton = text("타이머", 13, TEXT, true);
        timerButton.setGravity(Gravity.CENTER);
        timerButton.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_timer, 0, 0, 0);
        timerButton.setCompoundDrawablePadding(dp(4));
        timerButton.setCompoundDrawableTintList(ColorStateList.valueOf(SKY));
        timerButton.setPadding(dp(12), dp(9), dp(12), dp(9));
        timerButton.setBackground(rounded(0x33FFFFFF, dp(20)));
        timerButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (service != null && service.refuseIfLocked()) return;
                showTimerDialog();
            }
        });
        bar.addView(timerButton);

        clearButton = new ImageButton(this);
        clearButton.setBackground(null);
        clearButton.setImageResource(R.drawable.ic_close);
        clearButton.setImageTintList(ColorStateList.valueOf(SUB));
        clearButton.setContentDescription("모든 소리 끄기");
        clearButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (service != null) service.clear();
            }
        });
        bar.addView(clearButton, new LinearLayout.LayoutParams(dp(44), dp(44)));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(12), dp(4), dp(12), dp(12));
        bar.setLayoutParams(lp);
        return bar;
    }

    private void showTab(int index) {
        tab = index;
        for (int i = 0; i < tabs.size(); i++) {
            TextView t = tabs.get(i);
            boolean on = i == index;
            t.setTextColor(on ? INK : SUB);
            t.setBackground(rounded(on ? SKY : CARD, dp(20)));
        }
        content.removeAllViews();
        tiles.clear();
        if (index == TAB_MIXES) buildMixes();
        else buildGrid(index);
        scroll.scrollTo(0, 0);
        refresh();
    }

    private int columns() {
        float widthDp = getResources().getConfiguration().screenWidthDp;
        return widthDp >= 720 ? 6 : widthDp >= 560 ? 5 : widthDp >= 420 ? 4 : 3;
    }

    private void buildGrid(int category) {
        List<SoundCatalog.Sound> sounds = new ArrayList<>();
        for (SoundCatalog.Sound s : SoundCatalog.ALL) if (s.category == category) sounds.add(s);
        int cols = columns();
        LinearLayout row = null;
        for (int i = 0; i < sounds.size(); i++) {
            if (i % cols == 0) {
                row = new LinearLayout(this);
                content.addView(row);
            }
            row.addView(buildTile(sounds.get(i)), tileParams());
        }
        if (row != null) {
            for (int i = sounds.size() % cols; i != 0 && i < cols; i++) row.addView(new View(this), tileParams());
        }
        TextView note = text(category == SoundCatalog.CALM
                ? "델타파·세타파는 왼쪽·오른쪽 귀에 조금 다른 음을 들려주는 소리라 이어폰으로 들어야 효과가 있어요. 길게 누르면 소리 설명을 볼 수 있어요."
                : "소리를 길게 누르면 설명을 볼 수 있어요.", 12, SUB, false);
        note.setPadding(dp(6), dp(12), dp(6), 0);
        content.addView(note);
    }

    private LinearLayout.LayoutParams tileParams() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(122), 1f);
        lp.setMargins(dp(4), dp(4), dp(4), dp(4));
        return lp;
    }

    private View buildTile(final SoundCatalog.Sound s) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setPadding(dp(4), dp(14), dp(4), dp(4));
        box.setBackground(rounded(CARD, dp(20)));
        box.setContentDescription(s.name);

        TextView emoji = text(s.emoji, 30, TEXT, false);
        emoji.setGravity(Gravity.CENTER);
        box.addView(emoji);
        TextView name = text(s.name, 13, TEXT, false);
        name.setGravity(Gravity.CENTER);
        name.setMaxLines(2);
        name.setPadding(0, dp(4), 0, 0);
        box.addView(name);

        SeekBar volume = new SeekBar(this);
        volume.setMax(100);
        volume.setPadding(dp(14), 0, dp(14), 0);
        Ui.style(volume);
        volume.setContentDescription(s.name + " 음량");
        volume.setOnSeekBarChangeListener(volumeListener(s.id));
        box.addView(volume, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        box.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (service == null) return;
                if (!service.mix().containsKey(s.id)) askNotificationPermission();
                service.toggle(s.id);
            }
        });
        box.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                showSoundInfo(s);
                return true;
            }
        });
        tiles.put(s.id, new Tile(box, volume));
        return box;
    }

    private SeekBar.OnSeekBarChangeListener volumeListener(final String id) {
        return new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                if (fromUser && !updating && service != null) service.setVolume(id, progress);
            }

            @Override
            public void onStartTrackingTouch(SeekBar bar) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar bar) {
                if (service != null) service.persist();
            }
        };
    }

    private void sectionTitle(String s) {
        TextView t = text(s, 16, TEXT, true);
        t.setPadding(dp(6), dp(14), dp(6), dp(8));
        content.addView(t);
    }

    static String names(Map<String, Integer> mix) {
        StringBuilder sb = new StringBuilder();
        for (String id : mix.keySet()) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(SoundCatalog.get(id).name);
        }
        return sb.toString();
    }

    static LinkedHashMap<String, Integer> presetMix(Presets.Preset p) {
        LinkedHashMap<String, Integer> mix = new LinkedHashMap<>();
        for (int i = 0; i < p.ids.length; i++) mix.put(p.ids[i], p.volumes[i]);
        return mix;
    }

    private void buildMixes() {
        sectionTitle("추천 믹스");
        for (final Presets.Preset p : Presets.ALL) {
            final LinkedHashMap<String, Integer> mix = presetMix(p);
            View card = mixCard(p.emoji, p.name, p.desc, names(mix));
            card.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    applyMix(mix);
                }
            });
            card.setTag(mix);
            content.addView(card);
        }

        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("내 믹스", 16, TEXT, true);
        title.setPadding(dp(6), dp(22), dp(6), dp(8));
        head.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView save = text("＋ 지금 조합 저장", 13, INK, true);
        save.setPadding(dp(14), dp(8), dp(14), dp(8));
        save.setBackground(rounded(MOON, dp(18)));
        save.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showSaveDialog();
            }
        });
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sp.topMargin = dp(14);
        head.addView(save, sp);
        content.addView(head);

        List<MixStore.Saved> saved = store.loadSaved();
        if (saved.isEmpty()) {
            TextView hint = text("마음에 드는 조합을 만든 뒤 저장해 두면 여기에서 한 번에 다시 틀 수 있어요.", 13, SUB, false);
            hint.setPadding(dp(6), 0, dp(6), dp(8));
            content.addView(hint);
        }
        for (int i = 0; i < saved.size(); i++) {
            final int index = i;
            final MixStore.Saved s = saved.get(i);
            View card = mixCard("⭐", s.name, null, names(s.mix));
            card.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    applyMix(s.mix);
                }
            });
            card.setOnLongClickListener(new View.OnLongClickListener() {
                @Override
                public boolean onLongClick(View v) {
                    showMixOptions(index, s.name);
                    return true;
                }
            });
            card.setTag(s.mix);
            content.addView(card);
        }
        if (!saved.isEmpty()) {
            TextView hint = text("저장한 믹스를 길게 누르면 이름을 바꾸거나 지금 조합으로 바꾸거나 지울 수 있어요.", 12, SUB, false);
            hint.setPadding(dp(6), dp(6), dp(6), 0);
            content.addView(hint);
        }
    }

    private View mixCard(String emoji, String name, String desc, String sounds) {
        LinearLayout card = new LinearLayout(this);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        card.setBackground(rounded(CARD, dp(20)));
        card.addView(text(emoji, 28, TEXT, false));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(14), 0, 0, 0);
        col.addView(text(name, 15, TEXT, true));
        if (desc != null) {
            TextView d = text(desc, 12, SUB, false);
            d.setPadding(0, dp(2), 0, 0);
            col.addView(d);
        }
        TextView s = text(sounds, 12, SKY, false);
        s.setPadding(0, dp(3), 0, 0);
        col.addView(s);
        card.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(4), dp(4), dp(4), dp(4));
        card.setLayoutParams(lp);
        return card;
    }

    private void applyMix(Map<String, Integer> mix) {
        if (service == null) return;
        askNotificationPermission();
        service.applyMix(mix);
    }

    // ---- 상태 반영 ----

    @Override
    public void onStateChanged() {
        refresh();
    }

    @Override
    public void onTimerTick() {
        refreshTimer();
    }

    private void refresh() {
        Map<String, Integer> mix = service == null ? new LinkedHashMap<String, Integer>() : service.mix();
        boolean playing = service != null && service.isPlaying();
        boolean space = service != null && service.spatialActive();
        boolean locked = service != null && service.locked();
        boolean muted = locked && service.focusMuted();
        updating = true;
        for (Map.Entry<String, Tile> e : tiles.entrySet()) {
            Integer vol = mix.get(e.getKey());
            Tile t = e.getValue();
            boolean on = vol != null;
            t.box.setBackground(on ? activeTile() : rounded(CARD, dp(20)));
            // 집중 중에는 켜 둔 소리만 또렷하게: 나머지는 끝나야 고를 수 있다
            t.box.setAlpha(locked && !on ? 0.4f : 1f);
            t.volume.setVisibility(on ? View.VISIBLE : View.INVISIBLE);
            if (on && t.volume.getProgress() != vol) t.volume.setProgress(vol);
        }
        updating = false;
        for (int i = 0; i < content.getChildCount(); i++) {
            View v = content.getChildAt(i);
            if (v.getTag() instanceof Map) {
                boolean same = !mix.isEmpty() && mix.equals(v.getTag());
                v.setBackground(same ? activeTile() : rounded(CARD, dp(20)));
                v.setAlpha(locked && !same ? 0.4f : 1f);
            }
        }

        if (mix.isEmpty()) {
            barTitle.setText("소리를 골라 보세요");
            barSub.setText("여러 소리를 함께 켜면 섞여서 들려요");
        } else {
            barTitle.setText(names(mix));
            boolean guard = playing && service.blockOthers();
            if (muted) barSub.setText("🎧 이어폰이 빠져 소리를 꺼 뒀어요");
            else if (locked) barSub.setText("🎯 집중 중 · 끝나면 다른 소리 가능");
            else barSub.setText((playing ? "재생 중" : "일시정지") + (space ? " · 🎧 3D" : "") + (guard ? " · 🔒" : "")
                    + " · 눌러서 음량 조절");
        }
        spaceButton.setText(space ? "🎧 3D 켜짐" : "🎧 소리 공간");
        spaceButton.setTextColor(space ? INK : TEXT);
        spaceButton.setBackground(rounded(space ? SKY : CARD, dp(18)));
        boolean sounding = playing && !muted;
        playButton.setImageResource(sounding ? (locked ? R.drawable.ic_lock : R.drawable.ic_pause) : R.drawable.ic_play);
        playButton.setContentDescription(sounding ? (locked ? "집중 중이라 멈출 수 없어요" : "일시정지") : "재생");
        playButton.setEnabled(!mix.isEmpty());
        playButton.setAlpha(mix.isEmpty() ? 0.45f : 1f);
        clearButton.setVisibility(mix.isEmpty() || locked ? View.GONE : View.VISIBLE);
        // 집중 중에는 타이머도 잠기니 감추고, 남은 시간은 위쪽 🎯 단추에 보여 준다
        timerButton.setVisibility(locked ? View.GONE : View.VISIBLE);
        focusButton.setTextColor(locked ? INK : TEXT);
        focusButton.setBackground(rounded(locked ? MOON : CARD, dp(18)));
        refreshTimer();
    }

    private GradientDrawable activeTile() {
        GradientDrawable d = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{CARD_ON, 0xFF4A3F86});
        d.setCornerRadius(dp(20));
        d.setStroke(dp(1.5f), 0x88F6D98B);
        return d;
    }

    private void refreshTimer() {
        long left = service == null ? 0 : service.timerRemaining();
        timerButton.setText(left <= 0 ? "타이머" : clock(left));
        long focus = service == null ? 0 : service.focusRemaining();
        focusButton.setText(focus > 0 ? "🎯 " + clock(focus) : "🎯 집중");
    }

    private static String clock(long ms) {
        long s = (ms + 999) / 1000;
        return s >= 3600
                ? String.format(Locale.US, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
                : String.format(Locale.US, "%d:%02d", s / 60, s % 60);
    }

    // ---- 대화상자 ----

    private AlertDialog.Builder dialog() {
        return new AlertDialog.Builder(this, R.style.Theme_Danjam_Dialog);
    }

    private static String minutesLabel(int m) {
        if (m == 0) return "타이머 끄기";
        if (m < 60) return m + "분";
        return m % 60 == 0 ? (m / 60) + "시간" : (m / 60) + "시간 " + (m % 60) + "분";
    }

    private void showTimerDialog() {
        String[] labels = new String[TIMER_MINUTES.length];
        for (int i = 0; i < labels.length; i++) labels[i] = minutesLabel(TIMER_MINUTES[i]);
        dialog().setTitle("잠들기 타이머")
                .setItems(labels, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        if (service == null) return;
                        service.setTimer(TIMER_MINUTES[which]);
                        if (TIMER_MINUTES[which] > 0) {
                            int fade = Math.min(service.fadeMinutes(), TIMER_MINUTES[which]);
                            Toast.makeText(MainActivity.this, minutesLabel(TIMER_MINUTES[which])
                                    + " 뒤에 꺼져요. 마지막 " + fade + "분 동안 천천히 작아져요.", Toast.LENGTH_SHORT).show();
                        }
                    }
                })
                .setNegativeButton("닫기", null)
                .show();
    }

    private void showSoundInfo(final SoundCatalog.Sound s) {
        final boolean on = service != null && service.mix().containsKey(s.id);
        dialog().setTitle(s.emoji + "  " + s.name)
                .setMessage(s.desc + (s.spatial ? "" : "\n\n이 소리는 3D 로 옮기지 않고 그대로 들려줘요."))
                .setPositiveButton(on ? "끄기" : "켜기", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        if (service == null) return;
                        if (!on) askNotificationPermission();
                        service.toggle(s.id);
                    }
                })
                .setNegativeButton("닫기", null)
                .show();
    }

    private void showCurrentMix() {
        if (service == null || service.mix().isEmpty()) return;
        final LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setPadding(dp(16), dp(8), dp(8), dp(4));
        final List<String> ids = new ArrayList<>(service.mix().keySet());
        for (final String id : ids) {
            final LinearLayout row = new LinearLayout(this);
            row.setGravity(Gravity.CENTER_VERTICAL);
            SoundCatalog.Sound s = SoundCatalog.get(id);
            TextView label = text(s.emoji + "  " + s.name, 14, TEXT, false);
            label.setSingleLine(true);
            label.setEllipsize(TextUtils.TruncateAt.END);
            row.addView(label, new LinearLayout.LayoutParams(dp(120), ViewGroup.LayoutParams.WRAP_CONTENT));
            SeekBar volume = new SeekBar(this);
            volume.setMax(100);
            volume.setProgress(service.mix().get(id));
            Ui.style(volume);
            volume.setContentDescription(s.name + " 음량");
            volume.setOnSeekBarChangeListener(volumeListener(id));
            row.addView(volume, new LinearLayout.LayoutParams(0, dp(44), 1f));
            if (service.locked()) {
                // 집중 중에는 음량만 바꿀 수 있다
                list.addView(row);
                continue;
            }
            ImageButton remove = new ImageButton(this);
            remove.setBackground(null);
            remove.setImageResource(R.drawable.ic_close);
            remove.setImageTintList(ColorStateList.valueOf(SUB));
            remove.setContentDescription(s.name + " 끄기");
            remove.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (service != null && service.mix().containsKey(id)) service.toggle(id);
                    list.removeView(row);
                }
            });
            row.addView(remove, new LinearLayout.LayoutParams(dp(40), dp(40)));
            list.addView(row);
        }
        ScrollView sv = new ScrollView(this);
        sv.addView(list);
        dialog().setTitle("지금 듣는 소리")
                .setView(sv)
                .setPositiveButton("닫기", null)
                .setNeutralButton("조합 저장", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        showSaveDialog();
                    }
                })
                .show();
    }

    /** 이름 입력 대화상자. */
    private interface NameCallback {
        void onName(String name);
    }

    private void askName(String title, String message, String initial, String ok, final NameCallback cb) {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setSingleLine(true);
        input.setText(initial);
        input.setSelectAllOnFocus(true);
        input.setTextColor(TEXT);
        FrameLayout wrap = new FrameLayout(this);
        wrap.setPadding(dp(20), dp(8), dp(20), 0);
        wrap.addView(input);
        dialog().setTitle(title)
                .setMessage(message)
                .setView(wrap)
                .setPositiveButton(ok, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        String name = input.getText().toString().trim();
                        cb.onName(name.isEmpty() ? "내 믹스" : name);
                    }
                })
                .setNegativeButton("취소", null)
                .show();
    }

    private void showSaveDialog() {
        if (service == null || service.mix().isEmpty()) {
            Toast.makeText(this, "먼저 소리를 하나 이상 켜 주세요", Toast.LENGTH_SHORT).show();
            return;
        }
        final Map<String, Integer> mix = new LinkedHashMap<>(service.mix());
        askName("이 조합 저장하기", names(mix), "내 믹스 " + (store.loadSaved().size() + 1), "저장", new NameCallback() {
            @Override
            public void onName(String name) {
                store.addSaved(name, mix);
                Toast.makeText(MainActivity.this, "‘" + name + "’ 저장했어요", Toast.LENGTH_SHORT).show();
                if (tab == TAB_MIXES) showTab(TAB_MIXES);
            }
        });
    }

    private void showMixOptions(final int index, final String name) {
        String[] options = {"이름 바꾸기", "지금 듣는 조합으로 바꾸기", "삭제"};
        dialog().setTitle(name)
                .setItems(options, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        if (which == 0) {
                            askName("이름 바꾸기", null, name, "바꾸기", new NameCallback() {
                                @Override
                                public void onName(String newName) {
                                    store.renameSaved(index, newName);
                                    showTab(TAB_MIXES);
                                }
                            });
                        } else if (which == 1) {
                            if (service == null || service.mix().isEmpty()) {
                                Toast.makeText(MainActivity.this, "먼저 소리를 하나 이상 켜 주세요", Toast.LENGTH_SHORT).show();
                                return;
                            }
                            store.replaceSaved(index, service.mix());
                            Toast.makeText(MainActivity.this, "‘" + name + "’을(를) 지금 조합으로 바꿨어요", Toast.LENGTH_SHORT).show();
                            showTab(TAB_MIXES);
                        } else {
                            confirmDelete(index, name);
                        }
                    }
                })
                .setNegativeButton("닫기", null)
                .show();
    }

    private void confirmDelete(final int index, String name) {
        dialog().setTitle("믹스 삭제")
                .setMessage("‘" + name + "’을(를) 삭제할까요?")
                .setPositiveButton("삭제", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        store.deleteSaved(index);
                        showTab(TAB_MIXES);
                    }
                })
                .setNegativeButton("취소", null)
                .show();
    }

    /** 처음 재생할 때 한 번만 알림 권한을 묻는다 (알림이 있어야 잠금화면에서 멈출 수 있다). */
    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33 || store.askedNotificationPermission()) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        store.setAskedNotificationPermission();
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
    }
}
