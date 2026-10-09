package com.joyong133.danjam.audio;

/** 밤기차: 객실의 낮은 울림과 흔들림, 레일 이음매를 지날 때마다 '덜컹-덜컹'. */
public final class TrainGen extends Generator {
    /** 이음매 하나를 지날 때 바퀴가 부딪히는 시각 (주기에 대한 비율)과 세기 */
    private static final float[] HIT_AT = {0f, 0.1f, 0.24f, 0.34f, 0.8f, 0.9f};
    private static final float[] HIT_AMP = {0.35f, 0.3f, 1f, 0.9f, 0.95f, 0.85f};

    private final BrownNoise bl, br;
    private final PinkNoise pl, pr;
    private final OnePole rumL, rumR;
    private final Biquad subL = new Biquad(), subR = new Biquad();
    private final Svf midL = new Svf(), midR = new Svf();
    private final Biquad hissL = new Biquad(), hissR = new Biquad();
    private final SmoothRandom sway, speed;
    private final Modal thump;
    private final Clicks clank = new Clicks(16);
    private final Biquad clankBp = new Biquad();
    private float cycle, period, pos;
    private int hit;

    public TrainGen(float sr) {
        super(sr);
        bl = new BrownNoise(rng);
        br = new BrownNoise(new Rng());
        pl = new PinkNoise(rng);
        pr = new PinkNoise(new Rng());
        rumL = new OnePole(sr, 300);
        rumR = new OnePole(sr, 320);
        subL.hp(sr, 70, 0.7f);
        subR.hp(sr, 70, 0.7f);
        midL.set(sr, 550, 0.6f);
        midR.set(sr, 620, 0.6f);
        hissL.hp(sr, 2200, 0.7f);
        hissR.hp(sr, 2200, 0.7f);
        sway = new SmoothRandom(rng, 0.8f, 1.1f, 0.7f, 2.5f);
        speed = new SmoothRandom(rng, 0.96f, 1.04f, 6f, 15f);
        thump = new Modal(3);
        thump.mode(0, sr, 72, 0.1f, 0.7f).mode(1, sr, 150, 0.07f, 0.6f).mode(2, sr, 310, 0.035f, 0.5f);
        clankBp.bp(sr, 650, 1.2f);
        period = 1.15f * sr;
        pos = rng.range(0.3f, 0.9f);
        cycle = pos * period;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        float sw = sway.step(dt);
        period = 1.15f * sr / speed.step(dt);
        for (int i = 0; i < n; i++) {
            float exc = 0;
            float x = cycle / period;
            if (hit < HIT_AT.length && x >= HIT_AT[hit]) {
                float a = HIT_AMP[hit] * rng.range(0.75f, 1.05f);
                exc = a;
                clank.add(a * 0.5f, rng.range(8, 16) * 0.001f * sr, rng.range(-0.15f, 0.15f), -1);
                hit++;
            }
            if (++cycle >= period) {
                cycle -= period;
                hit = 0;
            }
            float a = bl.next(), b = br.next();
            midL.process(pl.next());
            midR.process(pr.next());
            float cabinL = (subL.process(rumL.lp(a)) * 1.3f + midL.bp * 0.6f) * sw + hissL.process(pr.next()) * 0.02f;
            float cabinR = (subR.process(rumR.lp(b)) * 1.3f + midR.bp * 0.6f) * sw + hissR.process(pl.next()) * 0.02f;
            float th = thump.process(exc);
            clank.tick(null);
            float c = clankBp.process(rng.bi());
            l[i] = cabinL + th * 0.5f + c * clank.sumL;
            r[i] = cabinR + th * 0.5f + c * clank.sumR;
        }
    }
}
