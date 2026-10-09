package com.joyong133.danjam.audio;

/** 선풍기: 부드러운 바람 소리에 날개의 웅웅거림, 천천히 좌우로 고개를 돌린다. */
public final class FanGen extends Generator {
    private final PinkNoise pl, pr;
    private final BrownNoise bn;
    private final Svf lpL = new Svf(), lpR = new Svf();
    private final Biquad hpL = new Biquad(), hpR = new Biquad(), hum = new Biquad();
    private final OnePole low;
    private float sweep, blade;
    private final float bladeInc;

    public FanGen(float sr) {
        super(sr);
        pl = new PinkNoise(rng);
        pr = new PinkNoise(new Rng());
        bn = new BrownNoise(rng);
        hpL.hp(sr, 70, 0.7f);
        hpR.hp(sr, 70, 0.7f);
        hum.bp(sr, 130, 4f);
        low = new OnePole(sr, 200);
        bladeInc = rng.range(18f, 23f) / sr;
        sweep = rng.uni();
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        sweep += dt / 16f;
        if (sweep >= 1f) sweep -= 1f;
        float s = Sine.of(sweep);
        float facing = 0.5f + 0.5f * Sine.of(sweep * 2f + 0.25f);
        lpL.set(sr, 1500 + 1500 * facing * (0.6f - 0.4f * s), 0.7f);
        lpR.set(sr, 1500 + 1500 * facing * (0.6f + 0.4f * s), 0.7f);
        float g = 0.75f + 0.25f * facing;
        float gl = g * (1f - 0.18f * s), gr = g * (1f + 0.18f * s);
        for (int i = 0; i < n; i++) {
            float am = 1f + 0.05f * Sine.of(blade);
            blade += bladeInc;
            if (blade >= 1f) blade -= 1f;
            float b = bn.next();
            float body = low.lp(b) * 0.5f + hum.process(b) * 0.6f;
            lpL.process(hpL.process(pl.next()));
            lpR.process(hpR.process(pr.next()));
            l[i] = (lpL.lp * 1.6f * am + body) * gl;
            r[i] = (lpR.lp * 1.6f * am + body) * gr;
        }
    }
}
