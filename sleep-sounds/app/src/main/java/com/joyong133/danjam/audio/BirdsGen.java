package com.joyong133.danjam.audio;

/**
 * 숲속 새소리. 가까이에서 노래하는 새 몇 마리(참새, 지빠귀, 박새, 휘파람새, 산비둘기 …)와
 * 멀리서 끊임없이 이어지는 작은 새들의 합창, 나뭇잎을 스치는 바람이 함께 들린다.
 * 실제 숲 녹음처럼 새소리 사이가 텅 비지 않는다.
 */
public final class BirdsGen extends Generator {
    private static final int SPARROW = 0, THRUSH = 1, TRILL = 2, DOVE = 3, WARBLER = 4, TIT = 5, ROBIN = 6;

    private final Chirps near, far;
    private final int[] species = {SPARROW, THRUSH, TIT, WARBLER, ROBIN, DOVE, TRILL, SPARROW, THRUSH};
    private final float[] pan = new float[species.length], gain = new float[species.length], next = new float[species.length];
    private final float[] fl = new float[Mixer.BLOCK], fr = new float[Mixer.BLOCK];
    private final OnePole farL, farR;
    private final PinkNoise airL, airR;
    private final Svf leafL = new Svf(), leafR = new Svf();
    private final SmoothRandom breeze, chorus;
    private float farWait;

    public BirdsGen(float sr) {
        super(sr);
        near = new Chirps(sr, 64);
        far = new Chirps(sr, 64);
        for (int s = 0; s < species.length; s++) {
            pan[s] = rng.range(-0.85f, 0.85f);
            gain[s] = s < 6 ? rng.range(0.55f, 1f) : rng.range(0.25f, 0.45f);
            next[s] = rng.range(0.2f, 5f);
        }
        farL = new OnePole(sr, 3800);
        farR = new OnePole(sr, 3600);
        airL = new PinkNoise(rng);
        airR = new PinkNoise(new Rng());
        leafL.set(sr, 900, 0.35f);
        leafR.set(sr, 1000, 0.35f);
        breeze = new SmoothRandom(rng, 0.45f, 1f, 1.5f, 5f);
        chorus = new SmoothRandom(rng, 0.4f, 1f, 4f, 10f);
        reverbSend = 0.3f;
    }

    private void reset(Chirps c, float p) {
        c.pan = p;
        c.vibRate = 0;
        c.vibAmount = 0;
        c.amRate = 0;
        c.pulseShape = 1;
        c.saturation = 0;
        c.harmonic2 = 0.05f;
        c.attack = 0.005f;
        c.release = 0.015f;
    }

    /** 한 마리가 한 소절을 부른다. 다음 소절까지 쉴 시간을 돌려준다. */
    private float phrase(Chirps c, int kind, float g, float p) {
        reset(c, p);
        switch (kind) {
            case SPARROW: { // 짹짹
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
                return rng.range(2.5f, 7f);
            }
            case THRUSH: { // 지빠귀: 굽이치는 휘파람 소절
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
                return rng.range(3f, 8f);
            }
            case TRILL: { // 빠르게 떨리는 지저귐
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
                return rng.range(5f, 12f);
            }
            case DOVE: { // 산비둘기 '구구- 구구구'
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
                return rng.range(9f, 18f);
            }
            case TIT: { // 박새 '쯔삐- 쯔삐-'
                int k = 3 + rng.below(4);
                float hi = rng.range(5200, 6200), lo = hi * rng.range(0.62f, 0.7f);
                float t = 0;
                for (int i = 0; i < k; i++) {
                    c.f0 = hi;
                    c.f1 = hi * 0.96f;
                    c.dur = 0.11f;
                    c.level = g * 0.75f;
                    c.add(t);
                    c.f0 = lo * 1.02f;
                    c.f1 = lo;
                    c.dur = 0.16f;
                    c.add(t + 0.15f);
                    t += 0.38f;
                }
                return rng.range(4f, 9f);
            }
            case ROBIN: { // 개똥지빠귀처럼 오르내리는 노래 소절
                int k = 4 + rng.below(4);
                float base = rng.range(2400, 3200), t = 0;
                c.vibRate = rng.range(28, 45);
                c.amRate = rng.range(18, 30);
                c.pulseShape = 1;
                for (int i = 0; i < k; i++) {
                    float up = rng.chance(0.5f) ? rng.range(1.15f, 1.45f) : rng.range(0.7f, 0.88f);
                    c.f0 = base * rng.range(0.85f, 1.3f);
                    c.f1 = c.f0 * up;
                    c.dur = rng.range(0.09f, 0.22f);
                    c.vibAmount = rng.range(0.01f, 0.05f);
                    c.level = g * rng.range(0.5f, 0.85f);
                    c.attack = 0.01f;
                    c.release = 0.025f;
                    c.add(t);
                    t += c.dur + rng.range(0.03f, 0.09f);
                }
                return rng.range(3f, 7f);
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
                return rng.range(8f, 15f);
            }
        }
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        for (int s = 0; s < species.length; s++) {
            next[s] -= dt;
            if (next[s] <= 0) next[s] = phrase(near, species[s], gain[s], pan[s]);
        }
        // 멀리서 쉬지 않고 이어지는 작은 새들
        float ch = chorus.step(dt);
        farWait -= dt;
        if (farWait <= 0) {
            int kind = rng.chance(0.5f) ? SPARROW : rng.chance(0.5f) ? TIT : rng.chance(0.5f) ? ROBIN : THRUSH;
            phrase(far, kind, rng.range(0.08f, 0.2f) * ch, rng.range(-1f, 1f));
            farWait = rng.exp(0.9f);
        }
        float b = breeze.step(dt) * 0.36f;
        for (int i = 0; i < n; i++) {
            leafL.process(airL.next());
            leafR.process(airR.next());
            l[i] = leafL.bp * b;
            r[i] = leafR.bp * b;
            fl[i] = fr[i] = 0;
        }
        far.render(fl, fr, n);
        for (int i = 0; i < n; i++) {
            l[i] += farL.lp(fl[i]);
            r[i] += farR.lp(fr[i]);
        }
        near.render(l, r, n);
    }
}
