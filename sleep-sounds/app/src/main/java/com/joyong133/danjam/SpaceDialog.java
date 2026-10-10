package com.joyong133.danjam;

import android.app.Dialog;
import android.content.Context;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.ViewTreeObserver;
import android.content.res.ColorStateList;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import com.joyong133.danjam.audio.Place;
import com.joyong133.danjam.audio.SoundCatalog;

import java.util.ArrayList;
import java.util.List;

/**
 * '소리 공간' 화면: 3D 소리 배치판과 소리 설정을 한곳에 모았다.
 * 3D 공간 음향(자동·켜기·끄기), 움직임, 공간감, 전체 음량, 톤, 자연스러운 변화, 타이머 페이드 길이,
 * 재생 중 다른 앱 소리 막기.
 */
final class SpaceDialog implements SoundService.Listener {
    private static final int[] FADES = {1, 5, 15, 30};

    private final Context c;
    private final SoundService service;
    private final Dialog dialog;
    private final SoundStageView stage;
    private final TextView status, empty;
    private final Ui.Segmented mode;
    private final Switch block;
    private final LinearLayout accessBox;
    private final TextView accessText, accessButton;

    static Dialog show(Context c, SoundService service) {
        Dialog d = new SpaceDialog(c, service).dialog;
        d.show();
        return d;
    }

    private SpaceDialog(Context context, final SoundService s) {
        c = context;
        service = s;
        LinearLayout root = new LinearLayout(c);
        root.setOrientation(LinearLayout.VERTICAL);
        dialog = Ui.fullScreen(c, root, null);
        root.addView(Ui.titleBar(c, "🎧 소리 공간 · 설정", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dialog.dismiss();
            }
        }));

        ScrollView scroll = new ScrollView(c);
        scroll.setVerticalScrollBarEnabled(false);
        LinearLayout body = new LinearLayout(c);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(Ui.dp(c, 18), 0, Ui.dp(c, 18), Ui.dp(c, 28));
        scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        status = Ui.text(c, "", 13, Ui.SKY, false);
        status.setPadding(Ui.dp(c, 14), Ui.dp(c, 10), Ui.dp(c, 14), Ui.dp(c, 10));
        status.setBackground(Ui.rounded(Ui.CARD, Ui.dp(c, 14)));
        body.addView(status);

        Ui.section(body, "소리 배치", "이어폰으로 들으면 소리가 머리 바깥 곳곳에서 들려요. "
                + "동그라미를 끌어서 방향과 거리를 바꾸고, 두 번 누르면 원래 자리로 돌아가요.");
        stage = new SoundStageView(c);
        stage.setListener(new SoundStageView.Listener() {
            @Override
            public void onMove(String id, float az, float dist, boolean done) {
                service.movePlace(id, az, dist, done);
            }

            @Override
            public void onReset(String id) {
                service.resetPlace(id);
                refreshStage();
            }
        });
        body.addView(stage);
        empty = Ui.text(c, "소리를 켜면 여기에 나타나요.", 13, Ui.SUB, false);
        empty.setGravity(Gravity.CENTER);
        empty.setPadding(0, Ui.dp(c, 4), 0, Ui.dp(c, 4));
        body.addView(empty);

        Ui.section(body, "3D 공간 음향", "자동: 이어폰을 연결하면 켜지고, 스피커로 들을 때는 꺼져요.");
        mode = new Ui.Segmented(c, new String[]{"자동", "켜기", "끄기"}, s.spaceMode(), new Ui.Segmented.Listener() {
            @Override
            public void onSelect(int index) {
                service.setSpaceMode(index);
            }
        });
        body.addView(mode.view);

        Ui.section(body, "움직임", "살랑살랑: 소리가 제자리 주변에서 천천히 흔들려요. 감싸기: 2분쯤에 한 바퀴, 머리 둘레를 아주 천천히 돌아요.");
        body.addView(new Ui.Segmented(c, new String[]{"멈춤", "살랑살랑", "감싸기"}, s.motion(), new Ui.Segmented.Listener() {
            @Override
            public void onSelect(int index) {
                service.setMotion(index);
            }
        }).view);

        Ui.section(body, "공간감", "잔향의 양이에요. 넓을수록 소리가 멀고 아늑하게 퍼져요.");
        Ui.slider(body, "좁은 방", "넓은 공간", s.room(), new Ui.OnSlide() {
            @Override
            void onSlide(int value) {
                service.setRoom(value);
            }
        });

        Ui.section(body, "전체 음량", null);
        Ui.slider(body, null, null, s.volume(), new Ui.OnSlide() {
            @Override
            void onSlide(int value) {
                service.setVolume(value);
            }
        });

        Ui.section(body, "소리 톤", "부드럽게 하면 높은 소리가 줄어 잠들 때 귀가 편해요.");
        Ui.slider(body, "부드럽게", "선명하게", s.tone(), new Ui.OnSlide() {
            @Override
            void onSlide(int value) {
                service.setTone(value);
            }
        });

        LinearLayout naturalRow = new LinearLayout(c);
        naturalRow.setGravity(Gravity.CENTER_VERTICAL);
        naturalRow.setPadding(0, Ui.dp(c, 14), 0, 0);
        LinearLayout labels = new LinearLayout(c);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.addView(Ui.text(c, "자연스러운 변화", 15, Ui.TEXT, true));
        TextView nh = Ui.text(c, "소리마다 음량이 수십 초에 걸쳐 조금씩 오르내려 살아 있는 듯해요.", 12, Ui.SUB, false);
        nh.setPadding(0, Ui.dp(c, 2), Ui.dp(c, 8), 0);
        labels.addView(nh);
        naturalRow.addView(labels, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Switch natural = new Switch(c);
        natural.setChecked(s.natural());
        natural.setThumbTintList(ColorStateList.valueOf(Ui.MOON));
        natural.setTrackTintList(ColorStateList.valueOf(0x66F6D98B));
        natural.setContentDescription("자연스러운 변화");
        natural.setOnCheckedChangeListener(new android.widget.CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(android.widget.CompoundButton b, boolean on) {
                service.setNatural(on);
            }
        });
        naturalRow.addView(natural);
        body.addView(naturalRow);

        Ui.section(body, "타이머가 끝날 때", "끝나기 전 이 시간 동안 소리가 천천히 작아져요.");
        int fade = 1;
        for (int i = 0; i < FADES.length; i++) if (FADES[i] == s.fadeMinutes()) fade = i;
        body.addView(new Ui.Segmented(c, new String[]{"1분", "5분", "15분", "30분"}, fade, new Ui.Segmented.Listener() {
            @Override
            public void onSelect(int index) {
                service.setFadeMinutes(FADES[index]);
            }
        }).view);

        // ---- 다른 앱 소리 막기 ----
        LinearLayout blockRow = new LinearLayout(c);
        blockRow.setGravity(Gravity.CENTER_VERTICAL);
        blockRow.setPadding(0, Ui.dp(c, 22), 0, 0);
        LinearLayout blockLabels = new LinearLayout(c);
        blockLabels.setOrientation(LinearLayout.VERTICAL);
        blockLabels.addView(Ui.text(c, "🔒 다른 앱 소리 막기", 15, Ui.TEXT, true));
        TextView bh = Ui.text(c, "단잠이 재생되는 동안 유튜브·음악 앱·브라우저 영상이 소리를 내면 바로 멈춰요. "
                + "전화·알람·내비게이션 안내는 막지 않아요. 단잠을 멈추면 다시 자유롭게 틀 수 있어요.", 12, Ui.SUB, false);
        bh.setPadding(0, Ui.dp(c, 2), Ui.dp(c, 8), 0);
        blockLabels.addView(bh);
        blockRow.addView(blockLabels, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        block = new Switch(c);
        block.setChecked(s.blockOthers());
        block.setThumbTintList(ColorStateList.valueOf(Ui.MOON));
        block.setTrackTintList(ColorStateList.valueOf(0x66F6D98B));
        block.setContentDescription("다른 앱 소리 막기");
        block.setOnCheckedChangeListener(new android.widget.CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(android.widget.CompoundButton b, boolean on) {
                service.setBlockOthers(on);
                refreshAccess();
            }
        });
        blockRow.addView(block);
        body.addView(blockRow);

        accessBox = new LinearLayout(c);
        accessBox.setOrientation(LinearLayout.VERTICAL);
        accessBox.setPadding(Ui.dp(c, 14), Ui.dp(c, 12), Ui.dp(c, 14), Ui.dp(c, 12));
        accessBox.setBackground(Ui.rounded(Ui.CARD, Ui.dp(c, 14)));
        accessText = Ui.text(c, "", 13, Ui.TEXT, false);
        accessBox.addView(accessText);
        accessButton = Ui.pill(c, "알림 접근 허용하러 가기", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openAccessSettings();
            }
        });
        accessButton.setBackground(Ui.rounded(Ui.MOON, Ui.dp(c, 18)));
        accessButton.setTextColor(Ui.INK);
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ap.topMargin = Ui.dp(c, 10);
        accessBox.addView(accessButton, ap);
        TextView restricted = Ui.text(c, "허용 버튼이 회색으로 막혀 있으면: 아래 '앱 정보 열기' → 오른쪽 위 ⋮ → "
                + "'제한된 설정 허용'을 누른 뒤 다시 허용해 주세요. (APK 로 설치한 앱에 안드로이드가 거는 안전장치예요)", 12, Ui.SUB, false);
        restricted.setPadding(0, Ui.dp(c, 10), 0, 0);
        accessBox.addView(restricted);
        TextView appInfo = Ui.pill(c, "앱 정보 열기", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                open(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName())));
            }
        });
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ip.topMargin = Ui.dp(c, 8);
        accessBox.addView(appInfo, ip);
        LinearLayout.LayoutParams bp2 = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bp2.topMargin = Ui.dp(c, 10);
        body.addView(accessBox, bp2);

        // 설정 앱에서 권한을 바꾸고 돌아오면 상태를 다시 확인한다
        dialog.getWindow().getDecorView().getViewTreeObserver().addOnWindowFocusChangeListener(
                new ViewTreeObserver.OnWindowFocusChangeListener() {
                    @Override
                    public void onWindowFocusChanged(boolean hasFocus) {
                        if (hasFocus) {
                            service.refreshGuard();
                            refreshAccess();
                        }
                    }
                });

        TextView reset = Ui.pill(c, "소리 자리 모두 되돌리기", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                service.resetAllPlaces();
                refreshStage();
            }
        });
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rp.topMargin = Ui.dp(c, 22);
        rp.gravity = Gravity.CENTER_HORIZONTAL;
        body.addView(reset, rp);

        service.addListener(this);
        dialog.setOnDismissListener(new DialogInterface.OnDismissListener() {
            @Override
            public void onDismiss(DialogInterface d) {
                service.removeListener(SpaceDialog.this);
            }
        });
        refreshStage();
        refreshStatus();
        refreshAccess();
    }

    /** 다른 앱 소리 막기: 알림 접근이 있으면 더 확실하게 막는다는 안내와 권한 상태 */
    private void refreshAccess() {
        boolean on = service.blockOthers();
        accessBox.setVisibility(on ? View.VISIBLE : View.GONE);
        if (!on) return;
        boolean granted = service.guardHasAccess();
        accessText.setText(granted
                ? "✓ 알림 접근이 허용되어 있어요. 소리를 계속 내려는 앱도 바로 일시정지시켜요. (알림 내용은 읽지 않아요)"
                : "지금은 기본 방식으로 막고 있어요: 대부분의 음악·영상 앱은 멈추지만 일부 앱은 계속 소리를 낼 수 있어요.\n"
                + "'알림 접근'을 허용하면 다른 앱의 재생 버튼을 단잠이 직접 눌러 더 확실하게 막아요. 알림 내용은 읽지 않아요.");
        accessButton.setVisibility(granted ? View.GONE : View.VISIBLE);
    }

    private void openAccessSettings() {
        Intent i;
        if (Build.VERSION.SDK_INT >= 30) {
            i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
            i.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    new ComponentName(c, MediaGuardListener.class).flattenToString());
            if (open(i)) return;
        }
        open(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"));
    }

    private boolean open(Intent i) {
        try {
            c.startActivity(i);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    private void refreshStage() {
        List<SoundStageView.Item> items = new ArrayList<>();
        for (String id : service.mix().keySet()) {
            SoundCatalog.Sound s = SoundCatalog.get(id);
            if (s == null || !s.spatial) continue;
            Place p = service.placeOf(id);
            items.add(new SoundStageView.Item(id, s.emoji, p.az, p.dist, p.width));
        }
        stage.setItems(items);
        empty.setVisibility(items.isEmpty() ? View.VISIBLE : View.GONE);
    }

    private void refreshStatus() {
        boolean on = service.spatialActive();
        String s;
        if (service.headphones()) s = on ? "🎧 이어폰 연결됨 · 3D 공간 음향이 켜져 있어요" : "🎧 이어폰 연결됨 · 3D 공간 음향이 꺼져 있어요";
        else s = on ? "3D 공간 음향이 켜져 있어요. 스피커로는 효과가 잘 느껴지지 않으니 이어폰을 써 보세요."
                : "이어폰을 연결하면 3D 공간 음향이 켜져요.";
        status.setText(s);
        mode.select(service.spaceMode());
    }

    @Override
    public void onStateChanged() {
        refreshStatus();
        refreshStage();
    }

    @Override
    public void onTimerTick() {
    }
}
