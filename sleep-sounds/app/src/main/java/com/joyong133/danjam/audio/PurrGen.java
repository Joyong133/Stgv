package com.joyong133.danjam.audio;

/** 고양이 골골송: 숨을 내쉬고 들이쉴 때마다 초당 25번쯤 떨리는 '고르르릉'. */
public final class PurrGen extends Generator {
    private final Biquad f1 = new Biquad(), f2 = new Biquad(), lp = new Biquad(), breathBp = new Biquad();
    private final SmoothRandom rate;
    private float phaseT, phaseLen, pulse, burst;
    private int phase; // 0 내쉬기, 1 쉼, 2 들이쉬기, 3 쉼
    private final float burstDec;

    public PurrGen(float sr) {
        super(sr);
        f1.bp(sr, 230, 1.6f);
        f2.bp(sr, 560, 2.5f);
        lp.lp(sr, 1400, 0.7f);
        breathBp.bp(sr, 1100, 0.8f);
        rate = new SmoothRandom(rng, 0.93f, 1.07f, 1f, 3f);
        burstDec = (float) Math.exp(-1.0 / (0.006 * sr));
        phaseLen = 1.4f * sr;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float rm = rate.step(n / sr);
        for (int i = 0; i < n; i++) {
            if (++phaseT >= phaseLen) {
                phaseT = 0;
                phase = (phase + 1) & 3;
                phaseLen = (phase == 0 ? rng.range(1.3f, 1.7f) : phase == 2 ? rng.range(1f, 1.3f) : rng.range(0.08f, 0.15f)) * sr;
            }
            float env = 0, hz = 0;
            if (phase == 0 || phase == 2) {
                float x = phaseT / phaseLen;
                env = Math.min(1f, Math.min(x / 0.12f, (1f - x) / 0.15f));
                env *= phase == 0 ? 1f : 0.62f;
                hz = (phase == 0 ? 24f : 27f) * rm;
            }
            float exc = 0;
            if (hz > 0) {
                pulse += hz / sr;
                if (pulse >= 1f) {
                    pulse -= 1f;
                    burst = env * rng.range(0.7f, 1f);
                    exc = burst * 0.5f;
                }
            }
            float noise = rng.bi() * burst;
            burst *= burstDec;
            float v = f1.process(noise + exc) * 2.2f + f2.process(noise) * 0.9f;
            v = lp.process(v) + breathBp.process(rng.bi()) * env * 0.035f;
            l[i] = v;
            r[i] = v;
        }
    }
}
