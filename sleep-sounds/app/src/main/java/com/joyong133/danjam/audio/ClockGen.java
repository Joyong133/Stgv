package com.joyong133.danjam.audio;

/** 오래된 벽시계: 1초마다 번갈아 들리는 '똑-딱'. */
public final class ClockGen extends Generator {
    private final Modal tick, tock;
    private final Clicks click = new Clicks(4);
    private final Biquad clickHp = new Biquad();
    private float wait;
    private boolean odd;

    public ClockGen(float sr) {
        super(sr);
        tick = new Modal(5);
        tick.mode(0, sr, 1850, 0.012f, 0.5f).mode(1, sr, 3120, 0.009f, 0.45f).mode(2, sr, 4700, 0.006f, 0.35f)
                .mode(3, sr, 6900, 0.004f, 0.2f).mode(4, sr, 640, 0.02f, 0.4f);
        tock = new Modal(5);
        tock.mode(0, sr, 1520, 0.014f, 0.5f).mode(1, sr, 2610, 0.01f, 0.45f).mode(2, sr, 4080, 0.007f, 0.35f)
                .mode(3, sr, 6150, 0.004f, 0.2f).mode(4, sr, 560, 0.022f, 0.45f);
        clickHp.hp(sr, 2000, 0.7f);
        wait = 0.3f * sr;
        reverbSend = 0.18f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        for (int i = 0; i < n; i++) {
            float ea = 0, eb = 0;
            if (--wait <= 0) {
                float a = rng.range(0.85f, 1f);
                if (odd) eb = a;
                else ea = a;
                click.add(a * 0.3f, 0.0005f * sr, 0, -1);
                odd = !odd;
                wait = sr * rng.range(0.997f, 1.003f);
            }
            click.tick(null);
            float v = tick.process(ea) + tock.process(eb) + clickHp.process(click.sumL * rng.bi());
            l[i] = v * 0.9f;
            r[i] = v * 0.9f;
        }
    }
}
