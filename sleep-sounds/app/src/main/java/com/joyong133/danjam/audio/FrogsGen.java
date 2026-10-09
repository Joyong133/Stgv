package com.joyong133.danjam.audio;

/** 여름밤 논두렁 개구리: 청개구리의 '꽥꽥꽥'과 참개구리의 낮은 '구르르륵'이 어우러진 합창. */
public final class FrogsGen extends Generator {
    private final Chirps notes;
    private final boolean[] tree = new boolean[11];
    private final float[] pan = new float[tree.length], gain = new float[tree.length], pitch = new float[tree.length],
            next = new float[tree.length];
    private final PinkNoise air;
    private final OnePole airLp;

    public FrogsGen(float sr) {
        super(sr);
        notes = new Chirps(sr, 96);
        for (int i = 0; i < tree.length; i++) {
            tree[i] = i < 7;
            pan[i] = rng.range(-0.9f, 0.9f);
            gain[i] = (i % 4 == 0 ? rng.range(0.6f, 0.9f) : rng.range(0.15f, 0.45f)) * 0.5f;
            pitch[i] = tree[i] ? rng.range(1600, 2500) : rng.range(550, 900);
            next[i] = rng.range(0.2f, 4f);
        }
        air = new PinkNoise(rng);
        airLp = new OnePole(sr, 700);
        reverbSend = 0.25f;
    }

    private void call(int f) {
        Chirps c = notes;
        c.pan = pan[f];
        c.vibRate = 0;
        c.vibAmount = 0;
        c.harmonic2 = 0.2f;
        if (tree[f]) {
            int k = 4 + rng.below(10);
            float rate = rng.range(4f, 7f);
            c.amRate = rng.range(110, 160);
            c.pulseShape = 3;
            c.saturation = 1.6f;
            c.attack = 0.006f;
            c.release = 0.02f;
            for (int i = 0; i < k; i++) {
                c.f0 = pitch[f] * rng.range(0.98f, 1.02f);
                c.f1 = c.f0 * 1.05f;
                c.dur = rng.range(0.06f, 0.1f);
                c.level = gain[f] * rng.range(0.75f, 1f);
                c.add(i / rate);
            }
            next[f] = k / rate + rng.range(1f, 6f);
        } else {
            int k = 1 + rng.below(4);
            c.amRate = rng.range(28, 55);
            c.pulseShape = 4;
            c.saturation = 2.2f;
            c.attack = 0.02f;
            c.release = 0.05f;
            float t = 0;
            for (int i = 0; i < k; i++) {
                c.f0 = pitch[f] * rng.range(0.92f, 1f);
                c.f1 = c.f0 * rng.range(1.05f, 1.2f);
                c.dur = rng.range(0.22f, 0.4f);
                c.level = gain[f] * 0.9f;
                c.add(t);
                t += c.dur + rng.range(0.15f, 0.35f);
            }
            next[f] = t + rng.range(2f, 7f);
        }
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        for (int f = 0; f < tree.length; f++) {
            next[f] -= dt;
            if (next[f] <= 0) call(f);
        }
        for (int i = 0; i < n; i++) l[i] = r[i] = airLp.lp(air.next()) * 0.04f;
        notes.render(l, r, n);
    }
}
