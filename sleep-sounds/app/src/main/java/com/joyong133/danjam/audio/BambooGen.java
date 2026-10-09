package com.joyong133.danjam.audio;

/**
 * 대숲 바람: 바람이 지날 때마다 '쏴아' 하고 일렁이는 댓잎, 줄기끼리 부딪히는 맑은 '똑 똑',
 * 가끔 휘어지는 대나무가 '끼익' 하고 운다.
 */
public final class BambooGen extends Generator {
    private static final int STALKS = 5;

    private final PinkNoise pl, pr;
    private final Biquad leafHpL = new Biquad(), leafHpR = new Biquad(), leafLpL = new Biquad(), leafLpR = new Biquad();
    private final Svf bodyL = new Svf(), bodyR = new Svf();
    private final SmoothRandom gustL, gustR, flutterL, flutterR;
    private final Modal[] stalks = new Modal[STALKS];
    private final float[] stalkL = new float[STALKS], stalkR = new float[STALKS];
    private final Chirps creaks;
    private float knockWait = 1, pendingKnock = -1, creakWait;
    private int pendingStalk;

    public BambooGen(float sr) {
        super(sr);
        pl = new PinkNoise(rng);
        pr = new PinkNoise(new Rng());
        leafHpL.hp(sr, 1200, 0.7f);
        leafHpR.hp(sr, 1300, 0.7f);
        leafLpL.lp(sr, 9000, 0.7f);
        leafLpR.lp(sr, 8500, 0.7f);
        bodyL.set(sr, 400, 0.8f);
        bodyR.set(sr, 450, 0.8f);
        gustL = new SmoothRandom(rng, 0.15f, 1f, 2f, 6f);
        gustR = new SmoothRandom(new Rng(), 0.15f, 1f, 2f, 6f);
        flutterL = new SmoothRandom(rng, 0.3f, 1.4f, 0.01f, 0.05f);
        flutterR = new SmoothRandom(new Rng(), 0.3f, 1.4f, 0.01f, 0.05f);
        for (int k = 0; k < STALKS; k++) {
            float f = rng.range(380, 900);
            stalks[k] = new Modal(3);
            stalks[k].mode(0, sr, f, 0.05f, 0.8f).mode(1, sr, f * 2.71f, 0.025f, 0.35f).mode(2, sr, f * 5.2f, 0.012f, 0.15f);
            float pan = rng.range(-0.85f, 0.85f);
            stalkL[k] = Sine.panL(pan) * 0.5f;
            stalkR[k] = Sine.panR(pan) * 0.5f;
        }
        creaks = new Chirps(sr, 8);
        creakWait = rng.range(6f, 15f);
        reverbSend = 0.2f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        float ga = gustL.step(dt), gb = gustR.step(dt);
        float a0 = flutterL.value, a1 = flutterL.step(dt), b0 = flutterR.value, b1 = flutterR.step(dt);
        float g = (ga + gb) * 0.5f;
        // 바람이 셀수록 줄기가 자주 부딪힌다
        float knockRate = 0.3f + 3f * g * g;
        creakWait -= dt;
        if (creakWait <= 0) {
            Chirps c = creaks;
            c.pan = rng.range(-0.7f, 0.7f);
            c.f0 = rng.range(180, 320);
            c.f1 = c.f0 * rng.range(0.8f, 1.25f);
            c.dur = rng.range(0.4f, 0.9f);
            c.level = 0.05f * (0.5f + g);
            c.amRate = rng.range(25, 45);
            c.pulseShape = 4;
            c.saturation = 2.5f;
            c.harmonic2 = 0.4f;
            c.attack = 0.08f;
            c.release = 0.15f;
            c.vibRate = 0;
            c.vibAmount = 0;
            c.add(0);
            creakWait = rng.range(8f, 20f);
        }
        for (int i = 0; i < n; i++) {
            if (--knockWait <= 0) {
                pendingStalk = rng.below(STALKS);
                pendingKnock = rng.range(0.4f, 1f);
                knockWait = rng.exp(sr / knockRate);
            }
            float k = (float) i / n;
            float la = ga * ga * (a0 + (a1 - a0) * k), lb = gb * gb * (b0 + (b1 - b0) * k);
            float nl = pl.next(), nr = pr.next();
            bodyL.process(nl);
            bodyR.process(nr);
            float sl = leafLpL.process(leafHpL.process(nl)) * la * 1.6f + bodyL.bp * ga * 0.5f;
            float srr = leafLpR.process(leafHpR.process(nr)) * lb * 1.6f + bodyR.bp * gb * 0.5f;
            for (int s = 0; s < STALKS; s++) {
                float e = 0;
                if (pendingKnock > 0 && s == pendingStalk) {
                    e = pendingKnock * 0.5f;
                    pendingKnock = -1;
                }
                float v = stalks[s].process(e);
                if (v != 0) {
                    sl += v * stalkL[s];
                    srr += v * stalkR[s];
                }
            }
            l[i] = sl;
            r[i] = srr;
        }
        creaks.render(l, r, n);
    }
}
