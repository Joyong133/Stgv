package com.joyong133.danjam.audio;

/** 풍경 소리: 바람이 불 때마다 맑게 울리는 금속 막대(오음계)와 아주 옅은 바람. */
public final class ChimesGen extends Generator {
    private static final float[] RATIO = {1f, 2.76f, 5.4f, 8.93f};
    private static final float[] AMP = {1f, 0.45f, 0.2f, 0.08f};
    private static final float[] DECAY = {3.5f, 1.8f, 0.9f, 0.4f};
    /** C6 D6 E6 G6 A6 C7 */
    private static final float[] TUBES = {1046.5f, 1174.7f, 1318.5f, 1568f, 1760f, 2093f};

    private final Rings partials;
    private final SmoothRandom wind;
    private final PinkNoise pink;
    private final Svf windF = new Svf();
    private final float[] tubePan = new float[TUBES.length];
    private float wait;

    public ChimesGen(float sr) {
        super(sr);
        partials = new Rings(sr, 40);
        partials.floor = 5e-4f;
        wind = new SmoothRandom(rng, 0f, 1f, 2.5f, 7f);
        pink = new PinkNoise(rng);
        windF.set(sr, 600, 0.7f);
        for (int i = 0; i < TUBES.length; i++) tubePan[i] = -0.7f + 1.4f * i / (TUBES.length - 1);
        wait = 0.2f * sr;
        reverbSend = 0.3f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float w = wind.step(n / sr);
        float rate = 0.25f + 2.6f * w * w;
        for (int i = 0; i < n; i++) {
            if (--wait <= 0) {
                int k = rng.below(TUBES.length);
                float a = (0.3f + 0.7f * rng.uni()) * (0.5f + 0.5f * w) * 0.18f;
                float scale = (float) Math.sqrt(1046.5f / TUBES[k]);
                for (int p = 0; p < RATIO.length; p++) {
                    partials.add(TUBES[k] * RATIO[p] * rng.range(0.998f, 1.002f), DECAY[p] * 1000f * scale, a * AMP[p], tubePan[k]);
                }
                wait = rng.exp(sr / rate);
            }
            windF.process(pink.next());
            float v = windF.bp * w * 0.05f;
            l[i] = v;
            r[i] = v;
        }
        partials.render(l, r, n);
    }
}
