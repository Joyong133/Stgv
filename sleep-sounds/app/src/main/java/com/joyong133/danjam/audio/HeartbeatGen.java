package com.joyong133.danjam.audio;

/** 엄마 뱃속 소리(태내음): 느린 심장 박동 '쿵-쿵'과 혈류의 '쉬익'. */
public final class HeartbeatGen extends Generator {
    private final Bubbles thumps;
    private final BrownNoise bn;
    private final Svf whoosh = new Svf();
    private final OnePole thudLp;
    private final SmoothRandom bpm;
    private float t, beat, flow;
    private boolean dub;
    private final float flowDec;

    public HeartbeatGen(float sr) {
        super(sr);
        thumps = new Bubbles(sr, 16);
        bn = new BrownNoise(rng);
        whoosh.set(sr, 280, 0.8f);
        thudLp = new OnePole(sr, 180);
        bpm = new SmoothRandom(rng, 62f, 68f, 5f, 12f);
        beat = 60f / 64f * sr;
        t = beat - 0.2f * sr;
        flowDec = (float) Math.exp(-1.0 / (0.28 * sr));
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        beat = 60f / bpm.step(n / sr) * sr;
        float rise = 1f / (0.12f * sr);
        float thud = 0;
        for (int i = 0; i < n; i++) {
            if (++t >= beat) {
                t = 0;
                dub = false;
                // '쿵' (낮은 음 + 휴대폰 스피커로도 들리는 배음)
                thumps.add(68, 70, -0.35f, 0.9f, 0);
                thumps.add(140, 45, -0.3f, 0.35f, 0);
                thumps.add(260, 22, -0.2f, 0.12f, 0);
                thud = 1f;
            } else if (!dub && t >= 0.31f * sr) {
                dub = true;
                thumps.add(88, 50, -0.3f, 0.6f, 0);
                thumps.add(180, 30, -0.25f, 0.22f, 0);
                thud = 0.6f;
            }
            if (t > 0.08f * sr && t < 0.2f * sr) flow = Math.min(1f, flow + rise);
            else flow *= flowDec;
            whoosh.process(bn.next());
            float v = whoosh.lp * (0.12f + 0.55f * flow) * 1.6f;
            v += thudLp.lp(rng.bi() * thud) * 0.6f;
            thud *= 0.995f;
            l[i] = v;
            r[i] = v;
        }
        thumps.render(l, r, n);
    }
}
