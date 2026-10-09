package com.joyong133.danjam.audio;

/** 비행기 객실: 엔진과 기류가 만드는 낮고 고른 '우우웅' 소리. */
public final class CabinGen extends Generator {
    private final BrownNoise bl, br;
    private final PinkNoise pl, pr;
    private final Biquad lowL = new Biquad(), lowR = new Biquad(), midL = new Biquad(), midR = new Biquad();
    private final Biquad midHpL = new Biquad(), midHpR = new Biquad(), ventL = new Biquad(), ventR = new Biquad();
    private final SmoothRandom drift;

    public CabinGen(float sr) {
        super(sr);
        bl = new BrownNoise(rng);
        br = new BrownNoise(new Rng());
        pl = new PinkNoise(rng);
        pr = new PinkNoise(new Rng());
        lowL.lp(sr, 420, 0.7f);
        lowR.lp(sr, 400, 0.7f);
        midL.lp(sr, 1200, 0.7f);
        midR.lp(sr, 1150, 0.7f);
        midHpL.hp(sr, 150, 0.7f);
        midHpR.hp(sr, 150, 0.7f);
        ventL.hp(sr, 4000, 0.7f);
        ventR.hp(sr, 4000, 0.7f);
        drift = new SmoothRandom(rng, 0.93f, 1.05f, 4f, 10f);
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float g = drift.step(n / sr);
        for (int i = 0; i < n; i++) {
            float a = pl.next(), b = pr.next();
            l[i] = (lowL.process(bl.next()) * 2f + midL.process(midHpL.process(a)) * 0.5f + ventL.process(b) * 0.04f) * g;
            r[i] = (lowR.process(br.next()) * 2f + midR.process(midHpR.process(b)) * 0.5f + ventR.process(a) * 0.04f) * g;
        }
    }
}
