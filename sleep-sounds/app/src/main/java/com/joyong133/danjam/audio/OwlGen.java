package com.joyong133.danjam.audio;

/** 부엉이 우는 밤: 깊은 숲 저편의 '부-엉 부엉', 잔잔한 밤바람, 멀리서 들리는 풀벌레. */
public final class OwlGen extends Generator {
    private final Chirps owl;
    private final CricketsGen crickets;
    private final PinkNoise air;
    private final Svf breeze = new Svf();
    private final SmoothRandom gust;
    private final float[] tl = new float[Mixer.BLOCK], tr = new float[Mixer.BLOCK];
    private final OnePole farL, farR;
    private float wait;
    private final float pitch, pan;

    public OwlGen(float sr) {
        super(sr);
        owl = new Chirps(sr, 16);
        crickets = new CricketsGen(sr);
        air = new PinkNoise(rng);
        breeze.set(sr, 450, 0.6f);
        gust = new SmoothRandom(rng, 0.3f, 1f, 3f, 8f);
        farL = new OnePole(sr, 2500);
        farR = new OnePole(sr, 2500);
        wait = 1.2f;
        pitch = rng.range(290, 360);
        pan = rng.range(-0.6f, 0.6f);
        reverbSend = 0.35f;
    }

    private void hoot() {
        Chirps c = owl;
        c.pan = pan + rng.range(-0.05f, 0.05f);
        c.harmonic2 = 0.25f;
        c.saturation = 0;
        c.amRate = 0;
        c.vibRate = 5;
        c.vibAmount = 0.006f;
        c.attack = 0.07f;
        c.release = 0.18f;
        float f = pitch * rng.range(0.98f, 1.02f);
        // '부-' 짧게, 쉬었다가 '엉-' 길게 (가끔 한 번 더)
        c.f0 = f * 1.04f;
        c.f1 = f;
        c.dur = 0.42f;
        c.level = 0.5f;
        c.add(0);
        c.f0 = f * 1.02f;
        c.f1 = f * 0.9f;
        c.dur = 0.7f;
        c.level = 0.42f;
        c.add(0.75f);
        if (rng.chance(0.4f)) {
            c.f0 = f;
            c.f1 = f * 0.88f;
            c.dur = 0.6f;
            c.level = 0.35f;
            c.add(1.75f);
        }
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        wait -= dt;
        if (wait <= 0) {
            hoot();
            wait = rng.range(9f, 22f);
        }
        float g = gust.step(dt) * 0.18f;
        crickets.render(tl, tr, n);
        for (int i = 0; i < n; i++) {
            breeze.process(air.next());
            l[i] = breeze.bp * g + tl[i] * 0.25f;
            r[i] = breeze.bp * g + tr[i] * 0.25f;
            tl[i] = tr[i] = 0;
        }
        owl.render(tl, tr, n);
        for (int i = 0; i < n; i++) {
            l[i] += farL.lp(tl[i]);
            r[i] += farR.lp(tr[i]);
        }
    }
}
