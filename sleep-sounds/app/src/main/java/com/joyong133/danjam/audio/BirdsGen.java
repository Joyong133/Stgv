package com.joyong133.danjam.audio;

/** 숲속 새소리: 참새, 지빠귀, 휘파람새, 산비둘기 등이 저마다의 간격으로 노래한다. */
public final class BirdsGen extends Generator {
    private static final int SPARROW = 0, THRUSH = 1, TRILL = 2, DOVE = 3, WARBLER = 4;

    private final Chirps notes;
    private final int[] species = {SPARROW, THRUSH, TRILL, DOVE, WARBLER, SPARROW, THRUSH};
    private final float[] pan = new float[species.length], gain = new float[species.length], next = new float[species.length];
    private final PinkNoise air;
    private final Svf airF = new Svf();
    private final SmoothRandom breeze;

    public BirdsGen(float sr) {
        super(sr);
        notes = new Chirps(sr, 64);
        for (int s = 0; s < species.length; s++) {
            pan[s] = rng.range(-0.8f, 0.8f);
            gain[s] = s < 5 ? rng.range(0.6f, 1f) : rng.range(0.25f, 0.45f);
            next[s] = rng.range(0.3f, 6f);
        }
        air = new PinkNoise(rng);
        airF.set(sr, 2500, 0.5f);
        breeze = new SmoothRandom(rng, 0.3f, 1f, 2f, 6f);
        reverbSend = 0.3f;
    }

    private void sing(int s) {
        Chirps c = notes;
        c.pan = pan[s];
        c.vibRate = 0;
        c.vibAmount = 0;
        c.amRate = 0;
        c.saturation = 0;
        c.harmonic2 = 0.12f;
        c.attack = 0.005f;
        c.release = 0.015f;
        float g = gain[s];
        switch (species[s]) {
            case SPARROW: {
                int k = 2 + rng.below(5);
                float t = 0;
                for (int i = 0; i < k; i++) {
                    c.f0 = rng.range(5000, 6600);
                    c.f1 = c.f0 * rng.range(0.55f, 0.72f);
                    c.dur = rng.range(0.05f, 0.09f);
                    c.level = g * rng.range(0.6f, 1f);
                    c.add(t);
                    t += rng.range(0.1f, 0.17f);
                }
                next[s] = rng.range(3f, 9f);
                break;
            }
            case THRUSH: {
                int k = 3 + rng.below(4);
                float t = 0;
                c.vibRate = rng.range(25, 40);
                for (int i = 0; i < k; i++) {
                    c.f0 = rng.range(2200, 4200);
                    c.f1 = c.f0 * rng.range(0.8f, 1.25f);
                    c.dur = rng.range(0.12f, 0.3f);
                    c.vibAmount = rng.range(0.005f, 0.04f);
                    c.level = g * rng.range(0.5f, 0.9f);
                    c.attack = 0.012f;
                    c.release = 0.03f;
                    c.add(t);
                    t += c.dur + rng.range(0.05f, 0.13f);
                }
                next[s] = rng.range(4f, 10f);
                break;
            }
            case TRILL: {
                float total = rng.range(0.6f, 1.4f), rate = rng.range(14, 22), f = rng.range(4200, 5200);
                int k = (int) (total * rate);
                for (int i = 0; i < k; i++) {
                    float x = (float) i / k;
                    c.f0 = f * (1 - 0.06f * x);
                    c.f1 = c.f0 * 0.85f;
                    c.dur = 0.03f;
                    c.level = g * 0.7f * (0.4f + 0.6f * (float) Math.sin(Math.PI * x));
                    c.add(i / rate);
                }
                next[s] = rng.range(6f, 14f);
                break;
            }
            case DOVE: {
                float f = rng.range(480, 560);
                float[] durs = {0.35f, 0.55f, 0.3f, 0.3f, 0.42f};
                float[] gaps = {0.15f, 0.35f, 0.12f, 0.12f, 0f};
                float t = 0;
                c.harmonic2 = 0.3f;
                c.attack = 0.06f;
                c.release = 0.08f;
                c.vibRate = 6;
                c.vibAmount = 0.01f;
                for (int i = 0; i < durs.length; i++) {
                    c.f0 = f * (i == 1 ? 1.04f : 1f);
                    c.f1 = f * 0.9f;
                    c.dur = durs[i];
                    c.level = g * 0.55f;
                    c.add(t);
                    t += durs[i] + gaps[i];
                }
                next[s] = rng.range(10f, 20f);
                break;
            }
            default: { // 휘파람새: 길게 '호~' 하고 '호케쿄'
                float f = rng.range(1300, 1550);
                c.f0 = f;
                c.f1 = f * 1.06f;
                c.dur = rng.range(0.9f, 1.3f);
                c.attack = 0.15f;
                c.release = 0.05f;
                c.level = g * 0.7f;
                c.add(0);
                float t = c.dur + 0.08f;
                c.attack = 0.008f;
                c.release = 0.02f;
                c.f0 = f * 1.35f;
                c.f1 = f * 1.2f;
                c.dur = 0.12f;
                c.add(t);
                t += 0.16f;
                c.f0 = f * 1.85f;
                c.f1 = f * 1.6f;
                c.dur = 0.1f;
                c.add(t);
                t += 0.14f;
                c.f0 = f * 1.5f;
                c.f1 = f * 1.25f;
                c.dur = 0.35f;
                c.vibRate = 18;
                c.vibAmount = 0.02f;
                c.release = 0.08f;
                c.add(t);
                next[s] = rng.range(8f, 16f);
                break;
            }
        }
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        for (int s = 0; s < species.length; s++) {
            next[s] -= dt;
            if (next[s] <= 0) sing(s);
        }
        float b = breeze.step(dt) * 0.02f;
        for (int i = 0; i < n; i++) {
            airF.process(air.next());
            l[i] = r[i] = airF.bp * b;
        }
        notes.render(l, r, n);
    }
}
