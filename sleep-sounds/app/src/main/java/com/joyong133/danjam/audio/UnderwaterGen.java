package com.joyong133.danjam.audio;

/** 물속: 먹먹하게 일렁이는 낮은 소리와 가끔 올라가는 '보글보글' 기포. */
public final class UnderwaterGen extends Generator {
    private final BrownNoise bl, br;
    private final Svf fl = new Svf(), fr = new Svf();
    private final SmoothRandom swell, tone;
    private final Bubbles bubbles;
    private final Biquad outL = new Biquad(), outR = new Biquad();
    private float streamWait, streamLeft, streamNext, streamPan, streamHz;

    public UnderwaterGen(float sr) {
        super(sr);
        bl = new BrownNoise(rng);
        br = new BrownNoise(new Rng());
        swell = new SmoothRandom(rng, 0.55f, 1f, 2.5f, 6f);
        tone = new SmoothRandom(rng, 220f, 420f, 3f, 7f);
        bubbles = new Bubbles(sr, 32);
        outL.lp(sr, 1100, 0.7f);
        outR.lp(sr, 1100, 0.7f);
        streamWait = 1.5f * sr;
        reverbSend = 0.35f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        float g = swell.step(dt) * 1.4f;
        float c = tone.step(dt);
        fl.set(sr, c, 0.8f);
        fr.set(sr, c * 1.12f, 0.8f);
        for (int i = 0; i < n; i++) {
            fl.process(bl.next());
            fr.process(br.next());
            l[i] = fl.lp * g;
            r[i] = fr.lp * g;
            if (streamLeft > 0) {
                streamLeft--;
                if (--streamNext <= 0) {
                    bubbles.add(streamHz * rng.range(0.7f, 1.5f), rng.range(18, 45), rng.range(0.5f, 1f),
                            rng.range(0.05f, 0.14f), streamPan + rng.bi() * 0.1f);
                    streamNext = rng.exp(sr / 9f);
                    streamHz *= 0.985f;
                }
            } else if (--streamWait <= 0) {
                streamLeft = rng.range(0.4f, 2.2f) * sr;
                streamPan = rng.range(-0.7f, 0.7f);
                streamHz = rng.logRange(180, 520);
                streamNext = 0;
                streamWait = rng.range(2f, 7f) * sr;
            }
        }
        bubbles.render(l, r, n);
        for (int i = 0; i < n; i++) {
            l[i] = outL.process(l[i]);
            r[i] = outR.process(r[i]);
        }
    }
}
