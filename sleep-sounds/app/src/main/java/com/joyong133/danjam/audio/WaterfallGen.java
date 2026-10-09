package com.joyong133.danjam.audio;

/** 폭포: 끊임없이 쏟아지는 넓은 물소리와 깊은 울림, 물보라의 잔 질감. */
public final class WaterfallGen extends Generator {
    private final PinkNoise pl, pr;
    private final BrownNoise bl, br;
    private final Biquad hpL = new Biquad(), hpR = new Biquad(), lpL = new Biquad(), lpR = new Biquad();
    private final OnePole rumL, rumR;
    private final SmoothRandom ml, mr;
    private final Clicks spray = new Clicks(48);
    private final BrookGen splash;
    private final float[] tl = new float[Mixer.BLOCK], tr = new float[Mixer.BLOCK];
    private float wait = 1;

    public WaterfallGen(float sr) {
        super(sr);
        pl = new PinkNoise(rng);
        pr = new PinkNoise(new Rng());
        bl = new BrownNoise(new Rng());
        br = new BrownNoise(new Rng());
        hpL.hp(sr, 70, 0.7f);
        hpR.hp(sr, 70, 0.7f);
        lpL.lp(sr, 5200, 0.7f);
        lpR.lp(sr, 5000, 0.7f);
        rumL = new OnePole(sr, 180);
        rumR = new OnePole(sr, 180);
        ml = new SmoothRandom(rng, 0.85f, 1.15f, 0.03f, 0.08f);
        mr = new SmoothRandom(new Rng(), 0.85f, 1.15f, 0.03f, 0.08f);
        splash = new BrookGen(sr, 70);
        reverbSend = 0.15f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        float a0 = ml.value, a1 = ml.step(dt), b0 = mr.value, b1 = mr.step(dt);
        for (int i = 0; i < n; i++) {
            if (--wait <= 0) {
                float u = rng.uni();
                spray.add(0.35f * u * u, rng.range(0.2f, 0.6f) * 0.001f * sr, rng.bi(), -1);
                wait += rng.exp(sr / 3000f);
            }
            spray.tick(null);
            float k = (float) i / n;
            float nz = rng.bi();
            float wl = lpL.process(hpL.process(pl.next() + spray.sumL * nz)) * (a0 + (a1 - a0) * k);
            float wr = lpR.process(hpR.process(pr.next() + spray.sumR * nz)) * (b0 + (b1 - b0) * k);
            l[i] = wl + rumL.lp(bl.next()) * 0.7f;
            r[i] = wr + rumR.lp(br.next()) * 0.7f;
        }
        splash.render(tl, tr, n);
        for (int i = 0; i < n; i++) {
            l[i] += tl[i] * 0.35f;
            r[i] += tr[i] * 0.35f;
        }
    }
}
