package com.joyong133.danjam.audio;

/** 시냇물: 수많은 작은 기포가 '졸졸' 터지는 소리와 물살의 흐름. */
public final class BrookGen extends Generator {
    private final Bubbles bubbles;
    private final PinkNoise pl, pr;
    private final Svf fl = new Svf(), fr = new Svf();
    private final SmoothRandom babble, flow;
    private final float rate;
    private float wait = 1;

    /** rate: 초당 기포 수 (시냇물 120, 폭포 보조 60 등) */
    public BrookGen(float sr, float rate) {
        super(sr);
        this.rate = rate;
        bubbles = new Bubbles(sr, 64);
        pl = new PinkNoise(rng);
        pr = new PinkNoise(new Rng());
        fl.set(sr, 1100, 0.6f);
        fr.set(sr, 1250, 0.6f);
        babble = new SmoothRandom(rng, 0.35f, 1.6f, 0.08f, 0.45f);
        flow = new SmoothRandom(rng, 0.6f, 1.2f, 0.03f, 0.09f);
        reverbSend = 0.12f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        float bab = babble.step(dt);
        float f0 = flow.value, f1 = flow.step(dt);
        for (int i = 0; i < n; i++) {
            if (--wait <= 0) {
                float hz = rng.logRange(350, 2300);
                float u = rng.uni();
                bubbles.add(hz, rng.range(5f, 14f) * (float) Math.sqrt(900f / hz), rng.range(0.25f, 0.7f),
                        0.2f * (0.15f + u * u), rng.bi() * 0.85f);
                wait += rng.exp(sr / (rate * bab));
            }
            float g = (f0 + (f1 - f0) * i / n) * 0.35f;
            fl.process(pl.next());
            fr.process(pr.next());
            l[i] = fl.bp * g;
            r[i] = fr.bp * g;
        }
        bubbles.render(l, r, n);
    }
}
