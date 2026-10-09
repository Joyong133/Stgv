package com.joyong133.danjam.audio;

/**
 * 배 선실: 멀리서 '두둥두둥' 고르게 도는 엔진, 선체를 스치는 물결, 배가 천천히 흔들릴 때마다
 * 나무 선실이 내는 '삐걱' 소리.
 */
public final class ShipGen extends Generator {
    private final BrownNoise bn;
    private final OnePole hullLp;
    private final Biquad hullHp = new Biquad();
    private final OceanGen water;
    private final Chirps creaks;
    private final float[] tl = new float[Mixer.BLOCK], tr = new float[Mixer.BLOCK];
    private final Biquad waterLpL = new Biquad(), waterLpR = new Biquad();
    private float ph, throb, roll, creakWait;
    private final float inc, throbInc, rollInc;

    public ShipGen(float sr) {
        super(sr);
        bn = new BrownNoise(rng);
        hullLp = new OnePole(sr, 300);
        hullHp.hp(sr, 50, 0.7f);
        water = new OceanGen(sr, true);
        creaks = new Chirps(sr, 12);
        waterLpL.lp(sr, 1100, 0.7f);
        waterLpR.lp(sr, 1100, 0.7f);
        inc = rng.range(52f, 58f) / sr;
        throbInc = rng.range(3.2f, 3.8f) / sr;
        rollInc = 1f / (rng.range(9f, 13f) * sr);
        creakWait = rng.range(2f, 6f);
        reverbSend = 0.12f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        float tilt = Sine.of(roll);
        creakWait -= dt;
        if (creakWait <= 0) {
            Chirps c = creaks;
            c.pan = tilt * 0.7f;
            c.f0 = rng.range(140, 260);
            c.f1 = c.f0 * rng.range(0.85f, 1.3f);
            c.dur = rng.range(0.3f, 0.8f);
            c.level = rng.range(0.03f, 0.07f);
            c.amRate = rng.range(30, 60);
            c.pulseShape = 4;
            c.saturation = 2.5f;
            c.harmonic2 = 0.5f;
            c.attack = 0.06f;
            c.release = 0.12f;
            c.vibRate = 0;
            c.vibAmount = 0;
            c.add(0);
            // 배가 크게 기울 때 더 자주 삐걱인다
            creakWait = rng.range(2f, 7f) * (1.3f - 0.6f * Math.abs(tilt));
        }
        water.render(tl, tr, n);
        for (int i = 0; i < n; i++) {
            float th = 0.75f + 0.25f * Sine.of(throb);
            float engine = (Sine.of(ph) * 0.07f + Sine.of(ph * 2f) * 0.05f) * th;
            float hull = hullHp.process(hullLp.lp(bn.next())) * 0.9f;
            ph += inc;
            throb += throbInc;
            roll += rollInc;
            if (ph >= 1f) ph -= 1f;
            if (throb >= 1f) throb -= 1f;
            if (roll >= 1f) roll -= 1f;
            float w = 0.5f + 0.25f * tilt;
            l[i] = engine + hull + waterLpL.process(tl[i]) * w;
            r[i] = engine + hull + waterLpR.process(tr[i]) * (1f - w + 0.5f);
            tl[i] = tr[i] = 0;
        }
        creaks.render(l, r, n);
    }
}
