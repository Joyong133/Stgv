package com.joyong133.danjam.audio;

/**
 * 시냇물·강물: 돌 사이로 부서지는 물살의 '촤르르'와 그 속에서 터지는 작은 기포들.
 * 강물은 더 낮고 묵직하게 흐르고 기포가 크다.
 * 실제 물소리처럼 힘이 500Hz~8kHz 에 고르게 퍼져 있고, 물살의 세기가 수십 ms 단위로 출렁인다.
 */
public final class BrookGen extends Generator {
    private final Bubbles bubbles;
    private final PinkNoise pl, pr;
    private final Biquad hpL = new Biquad(), hpR = new Biquad(), lpL = new Biquad(), lpR = new Biquad();
    private final Biquad splashHp = new Biquad();
    private final SmoothRandom babble, flowL, flowR, surge;
    private final Clicks splashes = new Clicks(32);
    private final float rate, bubbleLo, bubbleHi, flowLevel;
    private final boolean river;
    private final BrownNoise deepL, deepR;
    private final OnePole deepLpL, deepLpR;
    private float wait = 1;

    /** rate: 초당 기포 수 (시냇물 110, 폭포 보조 60 등) */
    public BrookGen(float sr, float rate) {
        this(sr, rate, false);
    }

    public BrookGen(float sr, float rate, boolean river) {
        super(sr);
        this.rate = rate;
        this.river = river;
        bubbleLo = river ? 250 : 500;
        bubbleHi = river ? 1600 : 3500;
        flowLevel = river ? 0.8f : 0.55f;
        deepL = new BrownNoise(new Rng());
        deepR = new BrownNoise(new Rng());
        deepLpL = new OnePole(sr, 220);
        deepLpR = new OnePole(sr, 240);
        bubbles = new Bubbles(sr, 64);
        pl = new PinkNoise(rng);
        pr = new PinkNoise(new Rng());
        hpL.hp(sr, river ? 200 : 450, 0.6f);
        hpR.hp(sr, river ? 220 : 500, 0.6f);
        lpL.lp(sr, river ? 6000 : 9000, 0.7f);
        lpR.lp(sr, river ? 5600 : 8500, 0.7f);
        splashHp.hp(sr, 2000, 0.7f);
        babble = new SmoothRandom(rng, 0.35f, 1.6f, 0.08f, 0.45f);
        float fMin = river ? 0.06f : 0.02f, fMax = river ? 0.2f : 0.08f;
        flowL = new SmoothRandom(rng, 0.25f, 1.5f, fMin, fMax);
        flowR = new SmoothRandom(new Rng(), 0.25f, 1.5f, fMin, fMax);
        surge = new SmoothRandom(rng, 0.6f, 1.2f, 0.6f, 2.5f);
        reverbSend = 0.12f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        float bab = babble.step(dt);
        float su = surge.step(dt);
        float a0 = flowL.value, a1 = flowL.step(dt), b0 = flowR.value, b1 = flowR.step(dt);
        for (int i = 0; i < n; i++) {
            if (--wait <= 0) {
                float hz = rng.logRange(bubbleLo, bubbleHi);
                float u = rng.uni();
                float pan = rng.bi() * 0.85f;
                float a = 0.14f * (0.15f + u * u);
                bubbles.add(hz, rng.range(4f, 11f) * (float) Math.sqrt(900f / hz), rng.range(0.25f, 0.7f), a, pan);
                splashes.add(a * 0.8f, rng.range(0.2f, 0.6f) * 0.001f * sr, pan, -1);
                wait += rng.exp(sr / (rate * bab));
            }
            float k = (float) i / n;
            float gl = (a0 + (a1 - a0) * k) * su * flowLevel, gr = (b0 + (b1 - b0) * k) * su * flowLevel;
            float wl = lpL.process(hpL.process(pl.next())) * gl;
            float wr = lpR.process(hpR.process(pr.next())) * gr;
            splashes.tick(null);
            float sp = splashHp.process(rng.bi());
            l[i] = wl + sp * splashes.sumL;
            r[i] = wr + sp * splashes.sumR;
            if (river) {
                l[i] += deepLpL.lp(deepL.next()) * 0.5f * su;
                r[i] += deepLpR.lp(deepR.next()) * 0.5f * su;
            }
        }
        bubbles.render(l, r, n);
    }
}
