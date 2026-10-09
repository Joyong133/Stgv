package com.joyong133.danjam.audio;

/** 싱잉볼: 가끔 한 번씩 '디잉-' 하고 쳐서 길게 맥놀이하며 사라진다. */
public final class BowlGen extends Generator {
    private static final float[] RATIO = {1f, 2.71f, 5.03f, 7.92f, 11.3f};
    private static final float[] AMP = {1f, 0.55f, 0.28f, 0.14f, 0.06f};
    private static final float[] DECAY = {7f, 3.8f, 2.2f, 1.3f, 0.8f};
    private static final float[] BOWLS = {196f, 220f, 261.6f, 293.7f};

    private final Rings partials;
    private final Clicks strike = new Clicks(4);
    private final Biquad strikeBp = new Biquad();
    private float wait;

    public BowlGen(float sr) {
        super(sr);
        partials = new Rings(sr, 40);
        partials.floor = 2e-4f;
        strikeBp.bp(sr, 2800, 1.5f);
        wait = 0.3f * sr;
        reverbSend = 0.35f;
    }

    private void hit() {
        float f = BOWLS[rng.below(BOWLS.length)];
        float a = rng.range(0.7f, 1f) * 0.25f;
        for (int p = 0; p < RATIO.length; p++) {
            float hz = f * RATIO[p];
            float beat = rng.range(0.6f, 2.4f) * (p == 0 ? 0.5f : 1f);
            float tau = DECAY[p] * 1000f * rng.range(0.85f, 1.15f);
            partials.add(hz - beat / 2, tau, a * AMP[p] * 0.5f, -0.35f);
            partials.add(hz + beat / 2, tau, a * AMP[p] * 0.5f, 0.35f);
        }
        strike.add(a * 0.5f, 0.003f * sr, 0, -1);
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        for (int i = 0; i < n; i++) {
            if (--wait <= 0) {
                hit();
                wait = rng.range(14f, 24f) * sr;
            }
            strike.tick(null);
            float s = strikeBp.process(rng.bi() * strike.sumL);
            l[i] = s;
            r[i] = s;
        }
        partials.render(l, r, n);
    }
}
