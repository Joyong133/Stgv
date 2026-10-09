package com.joyong133.danjam.audio;

/** 파도: 밀려와 부서지고 거품을 남기며 빠져나가는 파도 두 줄기와 낮은 바다의 울림. */
public final class OceanGen extends Generator {

    private final class Wave {
        final PinkNoise pa = new PinkNoise(new Rng()), pb = new PinkNoise(new Rng());
        final Svf fa = new Svf(), fb = new Svf();
        final Biquad fizzA = new Biquad(), fizzB = new Biquad();
        final float pan;
        float t, period, size, grain = 0, grainLeft;
        float gl, gr;

        Wave(float pan, float start) {
            this.pan = pan;
            gl = Sine.panL(pan);
            gr = Sine.panR(pan);
            fizzA.hp(sr, 2500, 0.7f);
            fizzB.hp(sr, 2500, 0.7f);
            next();
            t = start * period;
        }

        void next() {
            t = 0;
            period = rng.range(7.5f, 13f);
            size = rng.range(0.55f, 1f);
        }

        /** 0~1 사이 위치에서 물결 세기. */
        float swell(float x) {
            float peak = 0.42f;
            if (x < peak) {
                float k = x / peak;
                return k * k * k;
            }
            return (float) Math.exp(-(x - peak) * 4.2f) * tail(x);
        }

        float foam(float x) {
            float start = 0.4f;
            if (x < start) return 0f;
            float k = (x - start) / (1 - start);
            return Math.min(1f, k * 12f) * (float) Math.exp(-k * 3.0f) * tail(x);
        }

        /** 마지막 20% 동안 0으로 줄여 다음 파도와 끊김 없이 이어지게 한다. */
        float tail(float x) {
            return Math.min(1f, (1f - x) / 0.2f);
        }

        void add(float[] l, float[] r, int n) {
            float dt = n / sr;
            float x0 = t / period, x1 = (t + dt) / period;
            float s0 = swell(x0) * size, s1 = swell(Math.min(1f, x1)) * size;
            float f0 = foam(x0) * size, f1 = foam(Math.min(1f, x1)) * size;
            float cut = 300 + 3200 * (float) Math.pow(s0, 1.3);
            fa.set(sr, cut, 0.6f);
            fb.set(sr, cut * 1.1f, 0.6f);
            for (int i = 0; i < n; i++) {
                float k = (float) i / n;
                float s = s0 + (s1 - s0) * k, f = f0 + (f1 - f0) * k;
                if (--grainLeft <= 0) {
                    float u = rng.uni();
                    grain = u * u * 2.2f;
                    grainLeft = rng.range(0.002f, 0.009f) * sr;
                }
                fa.process(pa.next());
                fb.process(pb.next());
                float wa = fa.lp * s * 2.2f, wb = fb.lp * s * 2.2f;
                float fz = f * grain * 0.35f;
                wa += fizzA.process(rng.bi()) * fz;
                wb += fizzB.process(rng.bi()) * fz;
                l[i] += wa * gl + wb * 0.2f * gr;
                r[i] += wb * gr + wa * 0.2f * gl;
            }
            t += dt;
            if (t >= period) next();
        }
    }

    private final Wave a, b;
    private final BrownNoise bl, br;
    private final OnePole rl, rr;
    private final SmoothRandom sea;

    public OceanGen(float sr) {
        super(sr);
        a = new Wave(-0.45f, 0f);
        b = new Wave(0.45f, 0.5f);
        bl = new BrownNoise(rng);
        br = new BrownNoise(new Rng());
        rl = new OnePole(sr, 260);
        rr = new OnePole(sr, 260);
        sea = new SmoothRandom(rng, 0.6f, 1f, 3f, 8f);
        reverbSend = 0.1f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float g = sea.step(n / sr) * 0.22f;
        for (int i = 0; i < n; i++) {
            l[i] = rl.lp(bl.next()) * g;
            r[i] = rr.lp(br.next()) * g;
        }
        a.add(l, r, n);
        b.add(l, r, n);
    }
}
