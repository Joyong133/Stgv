package com.joyong133.danjam.audio;

/** 고래의 노래: 깊은 바닷속에 울려 퍼지는 혹등고래의 길고 느린 노래와 물속의 먹먹한 일렁임. */
public final class WhaleGen extends Generator {
    private final UnderwaterGen sea;
    private final Chirps song;
    private final float[] tl = new float[Mixer.BLOCK], tr = new float[Mixer.BLOCK];
    private final Biquad lpL = new Biquad(), lpR = new Biquad();
    private float wait;

    public WhaleGen(float sr) {
        super(sr);
        sea = new UnderwaterGen(sr);
        song = new Chirps(sr, 16);
        lpL.lp(sr, 2400, 0.7f);
        lpR.lp(sr, 2400, 0.7f);
        wait = 1f;
        reverbSend = 0.55f;
    }

    /** 2~4개의 긴 울음으로 된 한 소절. */
    private float phrase() {
        Chirps c = song;
        float pan = rng.range(-0.7f, 0.7f), t = 0;
        int k = 2 + rng.below(3);
        c.harmonic2 = 0.35f;
        c.saturation = 0.6f;
        c.amRate = 0;
        c.pulseShape = 1;
        for (int i = 0; i < k; i++) {
            c.pan = pan + rng.range(-0.1f, 0.1f);
            if (rng.chance(0.2f)) {
                // 높게 '휘익' 올라가는 소리
                c.f0 = rng.range(600, 900);
                c.f1 = c.f0 * rng.range(1.4f, 1.9f);
                c.dur = rng.range(0.5f, 0.9f);
                c.vibRate = 0;
                c.vibAmount = 0;
                c.attack = 0.1f;
                c.release = 0.25f;
                c.level = 0.12f;
            } else {
                c.f0 = rng.range(140, 420);
                c.f1 = c.f0 * rng.range(0.6f, 1.7f);
                c.dur = rng.range(1.2f, 3.6f);
                c.vibRate = rng.range(3f, 6f);
                c.vibAmount = rng.range(0.008f, 0.03f);
                c.attack = 0.35f;
                c.release = 0.7f;
                c.level = 0.22f;
            }
            c.add(t);
            t += c.dur + rng.range(0.4f, 1.6f);
        }
        return t + rng.range(5f, 14f);
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        wait -= n / sr;
        if (wait <= 0) wait = phrase();
        sea.render(l, r, n);
        for (int i = 0; i < n; i++) {
            l[i] *= 0.45f;
            r[i] *= 0.45f;
            tl[i] = tr[i] = 0;
        }
        song.render(tl, tr, n);
        for (int i = 0; i < n; i++) {
            l[i] += lpL.process(tl[i]);
            r[i] += lpR.process(tr[i]);
        }
    }
}
