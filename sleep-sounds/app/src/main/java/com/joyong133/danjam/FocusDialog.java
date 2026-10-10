package com.joyong133.danjam;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.joyong133.danjam.audio.Presets;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.joyong133.danjam.Ui.CARD;
import static com.joyong133.danjam.Ui.INK;
import static com.joyong133.danjam.Ui.MOON;
import static com.joyong133.danjam.Ui.SKY;
import static com.joyong133.danjam.Ui.SUB;
import static com.joyong133.danjam.Ui.TEXT;

/**
 * 집중 소리: 들을 소리와 시간을 먼저 정하고, 그 시간이 끝날 때까지는 다른 소리로 바꾸지 못하게 잠근다.
 * 정하는 화면 → 집중 중 화면(남은 시간, 긴급 해제) → 마친 화면.
 */
final class FocusDialog implements SoundService.Listener {
    private static final int[] MINUTES = {15, 25, 30, 45, 60, 90, 120, 480};
    private static final String[] LABELS = {"15분", "25분", "30분", "45분", "1시간", "90분", "2시간", "8시간"};
    private static final int SETUP = 0, RUNNING = 1, DONE = 2;
    /** 긴급 해제 단추를 이만큼 누르고 있어야 한다 */
    private static final long HOLD_MS = 5000;

    private final Context c;
    private final SoundService service;
    private final MixStore store;
    private final Runnable beforeStart;
    private final Dialog dialog;
    private final LinearLayout root;
    private int mode = -1;
    /** 긴급 해제로 끝냈는지 (그러면 '마쳤어요' 대신 정하는 화면으로 돌아간다) */
    private boolean cancelled;

    // 정하는 화면
    private LinkedHashMap<String, Integer> chosen;
    private String chosenName;
    private int minutes;
    private boolean keep;
    private TextView soundName, soundList, endHint, start;
    private final List<TextView> chips = new ArrayList<>();

    // 집중 중 화면
    private TextView time, until, notice, noticeAction, mixLine, endLine;
    private LinearLayout noticeBox;
    private Ring ring;

    static Dialog show(Context c, SoundService service, Runnable beforeStart) {
        Dialog d = new FocusDialog(c, service, beforeStart).dialog;
        d.show();
        return d;
    }

    private FocusDialog(Context context, SoundService s, Runnable beforeStart) {
        c = context;
        service = s;
        store = new MixStore(context);
        this.beforeStart = beforeStart;
        root = new LinearLayout(c);
        root.setOrientation(LinearLayout.VERTICAL);
        dialog = Ui.fullScreen(c, root, null);
        minutes = store.focusMinutes();
        keep = store.focusKeepChoice();
        if (!service.mix().isEmpty()) {
            chosen = new LinkedHashMap<>(service.mix());
            chosenName = "지금 켜 둔 소리";
        }
        service.addListener(this);
        dialog.setOnDismissListener(new DialogInterface.OnDismissListener() {
            @Override
            public void onDismiss(DialogInterface d) {
                service.removeListener(FocusDialog.this);
            }
        });
        render();
    }

    private int dp(float v) {
        return Ui.dp(c, v);
    }

    private AlertDialog.Builder alert() {
        return new AlertDialog.Builder(c, R.style.Theme_Danjam_Dialog);
    }

    /** 집중 상태에 맞는 화면으로 바꾼다. 같은 화면이면 내용만 고친다. */
    private void render() {
        int next;
        if (service.locked()) next = RUNNING;
        else if (mode == RUNNING && !cancelled) next = DONE;
        else if (mode == DONE) next = DONE;
        else next = SETUP;
        if (next != mode) {
            mode = next;
            root.removeAllViews();
            root.addView(Ui.titleBar(c, mode == RUNNING ? "🎯 집중 중" : "🎯 집중 소리", new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    dialog.dismiss();
                }
            }));
            if (mode == SETUP) buildSetup();
            else if (mode == RUNNING) buildRunning();
            else buildDone();
            root.requestApplyInsets();
        }
        if (mode == RUNNING) updateRunning();
    }

    private ScrollView scroll(LinearLayout body) {
        ScrollView sv = new ScrollView(c);
        sv.setVerticalScrollBarEnabled(false);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18), dp(4), dp(18), dp(20));
        sv.addView(body);
        root.addView(sv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        return sv;
    }

    private TextView bigButton(String label, int bg, int fg, View.OnClickListener click) {
        TextView b = Ui.text(c, label, 16, fg, true);
        b.setGravity(Gravity.CENTER);
        b.setPadding(0, dp(15), 0, dp(15));
        b.setBackground(Ui.rounded(bg, dp(26)));
        b.setOnClickListener(click);
        return b;
    }

    private void addBottom(View v) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(18), dp(6), dp(18), dp(16));
        root.addView(v, lp);
    }

    // ---- 정하는 화면 ----

    private void buildSetup() {
        LinearLayout body = new LinearLayout(c);
        scroll(body);
        TextView intro = Ui.text(c, "들을 소리와 시간을 먼저 정해요. 시간이 다 될 때까지는 이 소리만 들을 수 있고, "
                + "끝나야 다른 소리나 다른 앱의 음악·영상을 들을 수 있어요.", 13, SUB, false);
        intro.setLineSpacing(0, 1.2f);
        intro.setPadding(dp(4), 0, dp(4), 0);
        body.addView(intro);

        Ui.section(body, "들을 소리", null);
        LinearLayout card = new LinearLayout(c);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(16), dp(14), dp(12), dp(14));
        card.setBackground(Ui.rounded(CARD, dp(20)));
        LinearLayout texts = new LinearLayout(c);
        texts.setOrientation(LinearLayout.VERTICAL);
        soundName = Ui.text(c, "", 15, TEXT, true);
        soundList = Ui.text(c, "", 13, SUB, false);
        soundList.setPadding(0, dp(3), 0, 0);
        texts.addView(soundName);
        texts.addView(soundList);
        card.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView change = Ui.text(c, "바꾸기 ›", 13, SKY, true);
        change.setPadding(dp(10), dp(6), dp(4), dp(6));
        card.addView(change);
        card.setContentDescription("들을 소리 바꾸기");
        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                chooseSounds();
            }
        });
        body.addView(card);

        Ui.section(body, "시간", null);
        chips.clear();
        for (int row = 0; row < 2; row++) {
            LinearLayout line = new LinearLayout(c);
            for (int col = 0; col < 4; col++) {
                final int i = row * 4 + col;
                TextView chip = Ui.text(c, LABELS[i], 14, SUB, true);
                chip.setGravity(Gravity.CENTER);
                chip.setSingleLine(true);
                chip.setPadding(0, dp(11), 0, dp(11));
                chip.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        minutes = MINUTES[i];
                        updateSetup();
                    }
                });
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
                if (col > 0) lp.leftMargin = dp(6);
                line.addView(chip, lp);
                chips.add(chip);
            }
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            if (row > 0) lp.topMargin = dp(6);
            body.addView(line, lp);
        }

        Ui.section(body, "끝나면", null);
        body.addView(new Ui.Segmented(c, new String[]{"소리 끄기", "계속 듣기"}, keep ? 1 : 0, new Ui.Segmented.Listener() {
            @Override
            public void onSelect(int index) {
                keep = index == 1;
                updateSetup();
            }
        }).view);
        endHint = Ui.text(c, "", 12, SUB, false);
        endHint.setPadding(dp(4), dp(8), dp(4), 0);
        body.addView(endHint);

        Ui.section(body, "집중하는 동안", null);
        TextView rules = Ui.text(c, "• 소리를 켜고 끄거나 다른 믹스로 바꿀 수 없어요\n"
                + "• 일시정지·끄기·타이머가 잠겨요 (알림창·잠금화면·이어폰 단추도)\n"
                + "• 다른 앱의 음악·영상 소리는 저절로 멈춰요"
                + (service.guardHasAccess() ? "" : " (더 확실하게 막으려면 🎧 소리 공간에서 '알림 접근'을 허용해 주세요)") + "\n"
                + "• 음량과 3D 설정은 바꿀 수 있어요\n"
                + "• 전화·알람이 오면 잠깐 멈췄다가 이어서 들려요\n"
                + "• 이어폰이 빠지면 소리만 꺼 두고, 다시 끼우면 이어서 들려요\n"
                + "• 앱을 꺼도 다시 열면 남은 시간만큼 이어져요", 13, SUB, false);
        rules.setLineSpacing(dp(3), 1f);
        rules.setPadding(dp(4), 0, dp(4), 0);
        body.addView(rules);

        start = bigButton("", MOON, INK, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                confirmStart();
            }
        });
        addBottom(start);
        updateSetup();
    }

    private void updateSetup() {
        boolean has = chosen != null && !chosen.isEmpty();
        soundName.setText(has ? chosenName : "소리를 골라 주세요");
        soundList.setText(has ? MainActivity.names(chosen) : "추천 믹스나 내 믹스에서 고르거나, 먼저 소리를 켜 두세요");
        for (int i = 0; i < chips.size(); i++) {
            boolean on = MINUTES[i] == minutes;
            chips.get(i).setTextColor(on ? INK : SUB);
            chips.get(i).setBackground(Ui.rounded(on ? SKY : CARD, dp(18)));
        }
        int fade = Math.min(service.fadeMinutes(), minutes);
        endHint.setText(keep ? "잠금만 풀리고 소리는 그대로 계속 들려요."
                : fade > 0 ? "마지막 " + fade + "분 동안 천천히 작아지다가 꺼져요." : "시간이 되면 꺼져요.");
        start.setText("🎯 집중 시작 · " + label(minutes));
        start.setAlpha(has ? 1f : 0.45f);
    }

    private static String label(int m) {
        for (int i = 0; i < MINUTES.length; i++) if (MINUTES[i] == m) return LABELS[i];
        return m + "분";
    }

    /** 지금 켜 둔 소리, 추천 믹스, 내 믹스 가운데서 고른다. */
    private void chooseSounds() {
        final List<String> names = new ArrayList<>();
        final List<LinkedHashMap<String, Integer>> mixes = new ArrayList<>();
        final List<String> items = new ArrayList<>();
        if (!service.mix().isEmpty()) {
            names.add("지금 켜 둔 소리");
            mixes.add(new LinkedHashMap<>(service.mix()));
            items.add("🎵 지금 켜 둔 소리");
        }
        for (Presets.Preset p : Presets.ALL) {
            names.add(p.name);
            mixes.add(MainActivity.presetMix(p));
            items.add(p.emoji + " " + p.name);
        }
        for (MixStore.Saved s : store.loadSaved()) {
            names.add(s.name);
            mixes.add(s.mix);
            items.add("⭐ " + s.name);
        }
        alert().setTitle("들을 소리 고르기")
                .setItems(items.toArray(new String[0]), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        chosen = mixes.get(which);
                        chosenName = names.get(which);
                        updateSetup();
                    }
                })
                .setNegativeButton("닫기", null)
                .show();
    }

    private void confirmStart() {
        if (chosen == null || chosen.isEmpty()) {
            chooseSounds();
            return;
        }
        alert().setTitle("집중을 시작할까요?")
                .setMessage("‘" + chosenName + "’을(를) " + label(minutes) + " 동안 들어요.\n"
                        + "끝날 때까지 소리를 바꾸거나 멈출 수 없어요.")
                .setPositiveButton("시작", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        store.setFocusChoice(minutes, keep);
                        if (beforeStart != null) beforeStart.run();
                        cancelled = false;
                        service.startFocus(chosen, minutes, keep);
                    }
                })
                .setNegativeButton("취소", null)
                .show();
    }

    // ---- 집중 중 화면 ----

    private void buildRunning() {
        LinearLayout body = new LinearLayout(c);
        scroll(body);
        body.setGravity(Gravity.CENTER_HORIZONTAL);

        FrameLayout dial = new FrameLayout(c);
        ring = new Ring(c);
        dial.addView(ring, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        LinearLayout center = new LinearLayout(c);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setGravity(Gravity.CENTER_HORIZONTAL);
        time = Ui.text(c, "", 52, TEXT, false);
        time.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        center.addView(time);
        TextView left = Ui.text(c, "남았어요", 14, SUB, false);
        left.setGravity(Gravity.CENTER);
        center.addView(left);
        dial.addView(center, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(dp(250), dp(250));
        dlp.topMargin = dp(10);
        body.addView(dial, dlp);

        until = Ui.text(c, "", 14, SKY, true);
        until.setGravity(Gravity.CENTER);
        until.setPadding(0, dp(14), 0, 0);
        body.addView(until);

        LinearLayout card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        card.setBackground(Ui.rounded(CARD, dp(20)));
        card.addView(Ui.text(c, "듣는 소리", 12, SUB, false));
        mixLine = Ui.text(c, "", 15, TEXT, true);
        mixLine.setPadding(0, dp(4), 0, dp(8));
        card.addView(mixLine);
        endLine = Ui.text(c, "", 13, SUB, false);
        endLine.setLineSpacing(dp(2), 1f);
        card.addView(endLine);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.topMargin = dp(18);
        body.addView(card, clp);

        noticeBox = new LinearLayout(c);
        noticeBox.setOrientation(LinearLayout.VERTICAL);
        noticeBox.setPadding(dp(16), dp(14), dp(16), dp(14));
        noticeBox.setBackground(Ui.rounded(0x33F6D98B, dp(20)));
        notice = Ui.text(c, "", 14, TEXT, false);
        notice.setLineSpacing(dp(2), 1f);
        noticeBox.addView(notice);
        noticeAction = bigButton("", MOON, INK, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                service.play();
            }
        });
        noticeAction.setTextSize(14);
        noticeAction.setPadding(0, dp(11), 0, dp(11));
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        alp.topMargin = dp(12);
        noticeBox.addView(noticeAction, alp);
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        nlp.topMargin = dp(12);
        body.addView(noticeBox, nlp);

        HoldButton unlock = new HoldButton(c);
        addBottom(unlock);
    }

    private void updateRunning() {
        long left = service.focusRemaining();
        long s = (left + 999) / 1000;
        time.setText(s >= 3600
                ? String.format(Locale.US, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
                : String.format(Locale.US, "%d:%02d", s / 60, s % 60));
        long total = service.focusTotal();
        ring.setFraction(total > 0 ? (float) left / total : 0f);
        until.setText(new SimpleDateFormat("a h:mm", Locale.KOREA).format(new Date(System.currentTimeMillis() + left)) + "에 끝나요");
        Map<String, Integer> mix = service.mix();
        mixLine.setText(mix.isEmpty() ? "-" : MainActivity.names(mix));
        int fade = Math.min(service.fadeMinutes(), (int) (service.focusTotal() / 60_000));
        endLine.setText((service.focusKeep() ? "끝나면 잠금만 풀리고 소리는 계속 들려요."
                : "끝나면 " + (fade > 0 ? "천천히 작아지다가 " : "") + "꺼져요.")
                + "\n그때까지 소리를 바꾸거나 멈출 수 없고, 다른 앱 소리는 막혀요. 음량은 조절할 수 있어요.");
        if (service.focusMuted()) {
            noticeBox.setVisibility(View.VISIBLE);
            notice.setText("🎧 이어폰이 빠져서 소리를 잠시 꺼 뒀어요. 다시 연결하면 이어서 들려요.");
            noticeAction.setText("🔈 스피커로 계속 듣기");
        } else if (!service.isPlaying()) {
            noticeBox.setVisibility(View.VISIBLE);
            notice.setText("⏸ 전화나 알람 때문에 잠깐 멈췄어요. 남은 시간은 그대로 흘러가요.");
            noticeAction.setText("▶ 이어서 듣기");
        } else {
            noticeBox.setVisibility(View.GONE);
        }
    }

    private void confirmCancel() {
        long min = (service.focusRemaining() + 59_999) / 60_000;
        alert().setTitle("집중을 끝낼까요?")
                .setMessage("남은 " + min + "분을 채우지 않고 잠금을 풀어요. 소리는 그대로 계속 나와요.")
                .setPositiveButton("끝내기", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        cancelled = true;
                        service.cancelFocus();
                    }
                })
                .setNegativeButton("계속 집중하기", null)
                .show();
    }

    // ---- 마친 화면 ----

    private void buildDone() {
        LinearLayout body = new LinearLayout(c);
        scroll(body);
        body.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView moon = Ui.text(c, "🌙", 64, TEXT, false);
        moon.setGravity(Gravity.CENTER);
        moon.setPadding(0, dp(60), 0, dp(10));
        body.addView(moon);
        TextView title = Ui.text(c, "집중을 마쳤어요", 24, TEXT, true);
        title.setGravity(Gravity.CENTER);
        body.addView(title);
        long total = service.focusTotal();
        TextView sub = Ui.text(c, (total > 0 ? label((int) (total / 60_000)) + " 동안 끝까지 들었어요.\n" : "")
                + "이제 다른 소리를 들을 수 있어요.", 14, SUB, false);
        sub.setGravity(Gravity.CENTER);
        sub.setLineSpacing(dp(3), 1f);
        sub.setPadding(0, dp(12), 0, 0);
        body.addView(sub);
        addBottom(bigButton("닫기", MOON, INK, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
            }
        }));
    }

    @Override
    public void onStateChanged() {
        render();
    }

    @Override
    public void onTimerTick() {
        if (mode == RUNNING && service.locked()) updateRunning();
        else render();
    }

    /** 남은 시간을 보여 주는 원 */
    private static final class Ring extends View {
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG), arc = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF box = new RectF();
        private float fraction;

        Ring(Context c) {
            super(c);
            float w = Ui.dp(c, 7);
            track.setStyle(Paint.Style.STROKE);
            track.setStrokeWidth(w);
            track.setColor(0x26FFFFFF);
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeWidth(w);
            arc.setStrokeCap(Paint.Cap.ROUND);
            arc.setColor(MOON);
        }

        void setFraction(float f) {
            f = Math.max(0f, Math.min(1f, f));
            if (Math.abs(f - fraction) < 1e-4f) return;
            fraction = f;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float pad = track.getStrokeWidth();
            float size = Math.min(getWidth(), getHeight()) - 2 * pad;
            float l = (getWidth() - size) / 2f, t = (getHeight() - size) / 2f;
            box.set(l, t, l + size, t + size);
            canvas.drawOval(box, track);
            if (fraction > 0) canvas.drawArc(box, -90f, 360f * fraction, false, arc);
        }
    }

    /** 5초 동안 누르고 있어야 하는 긴급 해제 단추. 손을 떼면 처음부터. */
    private final class HoldButton extends View {
        private final Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG), fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint label = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF box = new RectF();
        private final Handler handler = new Handler(Looper.getMainLooper());
        private long downAt;
        private boolean done;
        private final Runnable frame = new Runnable() {
            @Override
            public void run() {
                if (downAt == 0) return;
                if (SystemClock.uptimeMillis() - downAt >= HOLD_MS) {
                    downAt = 0;
                    done = true;
                    invalidate();
                    confirmCancel();
                    return;
                }
                invalidate();
                handler.postDelayed(this, 50);
            }
        };

        HoldButton(Context c) {
            super(c);
            bg.setColor(0x1FFFFFFF);
            fill.setColor(0x55FF8A80);
            label.setColor(SUB);
            label.setTextSize(Ui.dp(c, 14));
            label.setTextAlign(Paint.Align.CENTER);
            label.setFakeBoldText(true);
            setContentDescription("긴급 해제: 5초 동안 누르고 있으면 집중을 끝낼 수 있어요");
        }

        @Override
        protected void onMeasure(int w, int h) {
            setMeasuredDimension(MeasureSpec.getSize(w), Ui.dp(getContext(), 50));
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downAt = SystemClock.uptimeMillis();
                    done = false;
                    label.setColor(TEXT);
                    handler.post(frame);
                    getParent().requestDisallowInterceptTouchEvent(true);
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    downAt = 0;
                    label.setColor(SUB);
                    handler.removeCallbacks(frame);
                    invalidate();
                    return true;
                default:
                    return true;
            }
        }

        @Override
        protected void onDetachedFromWindow() {
            handler.removeCallbacks(frame);
            super.onDetachedFromWindow();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float r = getHeight() / 2f;
            box.set(0, 0, getWidth(), getHeight());
            canvas.drawRoundRect(box, r, r, bg);
            String text;
            if (downAt != 0) {
                long held = SystemClock.uptimeMillis() - downAt;
                float f = Math.min(1f, held / (float) HOLD_MS);
                canvas.save();
                canvas.clipRect(0, 0, getWidth() * f, getHeight());
                canvas.drawRoundRect(box, r, r, fill);
                canvas.restore();
                text = "계속 누르고 있어요 · " + Math.max(1, (HOLD_MS - held + 999) / 1000);
            } else {
                text = done ? "긴급 해제" : "긴급 해제 · 5초 동안 누르기";
            }
            float y = getHeight() / 2f - (label.descent() + label.ascent()) / 2f;
            canvas.drawText(text, getWidth() / 2f, y, label);
        }
    }
}
