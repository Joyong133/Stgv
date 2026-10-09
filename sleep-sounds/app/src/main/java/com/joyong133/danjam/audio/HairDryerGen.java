package com.joyong133.danjam.audio;

/** 헤어드라이어: 아기가 좋아하는 고른 '위이잉' 바람 소리와 모터의 낮은 떨림. */
public final class HairDryerGen extends Generator {
    private final PinkNoise pl, pr;
    private final Biquad hpL = new Biquad(), hpR = new Biquad(), lpL = new Biquad(), lpR = new Biquad();
    private final Svf whine = new Svf();
    private final SmoothRandom drift;
    private float ph;
    private final float base;

    public HairDryerGen(float sr) {
        super(sr);
        pl = new PinkNoise(rng);
        pr = new PinkNoise(new Rng());
        hpL.hp(sr, 250, 0.7f);
        hpR.hp(sr, 260, 0.7f);
        lpL.lp(sr, 7500, 0.7f);
        lpR.lp(sr, 7000, 0.7f);
        whine.set(sr, 1350, 9f);
        drift = new SmoothRandom(rng, 0.985f, 1.015f, 1f, 4f);
        base = rng.range(205f, 225f);
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float inc = base * drift.step(n / sr) / sr;
        for (int i = 0; i < n; i++) {
            float a = pl.next(), b = pr.next();
            whine.process(rng.bi());
            float motor = Sine.of(ph) * 0.03f + Sine.of(ph * 2f) * 0.02f + whine.bp * 0.08f;
            ph += inc;
            if (ph >= 1f) ph -= 1f;
            l[i] = lpL.process(hpL.process(a)) * 1.2f + motor;
            r[i] = lpR.process(hpR.process(b)) * 1.2f + motor;
        }
    }
}
