package com.joyong133.danjam.audio;

/**
 * 잔잔한 피아노: 오음계 안에서 천천히 이어지는 즉흥 연주. 음 사이에 여유를 두고,
 * 화음이 십몇 초마다 바뀌며, 늘 울림이 남아 있도록 부드럽게 친다.
 */
public final class PianoGen extends Generator {
    /** C 장조 오음계 (C D E G A), MIDI 번호 */
    private static final int[] SCALE = {0, 2, 4, 7, 9};
    /** 화음마다 바뀌는 베이스 음 (C, A, F 대신 G 와 E 로 오음계 안에 머문다) */
    private static final int[] BASS = {36, 33, 31, 40};

    private final Rings strings;
    private final Clicks hammers = new Clicks(16);
    private final Biquad hammerBp = new Biquad();
    private int step = 12, chord;
    private float wait, chordLeft;

    public PianoGen(float sr) {
        super(sr);
        strings = new Rings(sr, 96);
        strings.floor = 8e-4f;
        hammerBp.bp(sr, 2600, 1.2f);
        wait = 0.5f * sr;
        chordLeft = 0;
        reverbSend = 0.45f;
    }

    private static int midiOf(int scaleStep) {
        int oct = scaleStep >= 0 ? scaleStep / SCALE.length : (scaleStep - SCALE.length + 1) / SCALE.length;
        return 48 + 12 * oct + SCALE[scaleStep - oct * SCALE.length];
    }

    private void note(int midi, float vel, float pan) {
        float f = (float) (440.0 * Math.pow(2, (midi - 69) / 12.0));
        float tau0 = 3000f * (float) Math.pow(261.6f / f, 0.35f);
        tau0 = Math.max(1500f, Math.min(7000f, tau0));
        for (int k = 1; k <= 5; k++) {
            float hz = k * f * (float) Math.sqrt(1 + 0.0003f * k * k);
            if (hz > sr * 0.4f) break;
            float a = vel * (float) Math.pow(k, -1.3) * (float) Math.exp(-(k - 1) * (1.1f - vel)) * 0.12f;
            float tau = tau0 / (1 + 0.5f * (k - 1));
            strings.add(hz, tau, a, pan);
            // 줄 두 개가 살짝 어긋나 생기는 울림과 빠른 첫 감쇠
            if (k <= 2) strings.add(hz * 1.0004f, tau * 0.35f, a * 0.6f, pan);
        }
        hammers.add(vel * 0.03f, 0.002f * sr, pan, -1);
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        for (int i = 0; i < n; i++) {
            if (--wait <= 0) {
                if (chordLeft <= 0) {
                    chord = (chord + 1 + rng.below(2)) % BASS.length;
                    note(BASS[chord], rng.range(0.3f, 0.45f), -0.3f);
                    chordLeft = rng.range(12f, 20f) * sr;
                }
                float vel = rng.range(0.25f, 0.55f);
                step = Math.max(2, Math.min(13, step + rng.below(5) - 2));
                float pan = (step - 7) * 0.06f;
                float kind = rng.uni();
                note(midiOf(step), vel, pan);
                if (kind > 0.6f) note(midiOf(step - 2), vel * 0.8f, pan - 0.05f);
                if (kind > 0.85f) note(midiOf(step + 2), vel * 0.7f, pan + 0.05f);
                float gap = rng.chance(0.12f) ? rng.range(3f, 6f) : rng.range(0.9f, 2.6f);
                wait = gap * sr;
                chordLeft -= wait;
            }
            hammers.tick(null);
            float h = hammerBp.process(rng.bi());
            l[i] = h * hammers.sumL;
            r[i] = h * hammers.sumR;
        }
        strings.render(l, r, n);
    }
}
