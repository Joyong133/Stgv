package com.joyong133.danjam.audio;

/**
 * 파도: 밀려와 부서지고 거품을 남기며 빠져나가는 파도 두 줄기와 낮은 바다의 울림.
 * lake 이면 호숫가에 찰랑이는 작고 잦은 물결이 된다.
 */
public final class OceanGen extends Generator {

    private final class Wave {
        final PinkNoise pa = new PinkNoise(new Rng()), pb = new PinkNoise(new Rng());
        final Svf fa = new Svf(), fb = new Svf();
        final Biquad fizzA = new Biquad(), fizzB = new Biquad();
        final float pan;
        /** 거품 소리의 결: 수십 ms 단위로 부드럽게 일렁인다 (뚝뚝 끊기면 지직거리는 잡음처럼 들린다) */
        final SmoothRandom froth = new SmoothRandom(new Rng(), 0.4f, 1.4f, 0.15f, 0.5f);
        /** 밀려드는 물살의 출렁임 (0.3~1.5초) */
        final SmoothRandom wash = new SmoothRandom(new Rng(), 0.55f, 1.25f, 0.3f, 1.5f);
        final Biquad hpA = new Biquad(), hpB = new Biquad(), fzLpA = new Biquad(), fzLpB = new Biquad();
        float t, period, size;
        float gl, gr;

        Wave(float pan, float start) {
            this.pan = pan;
            gl = Sine.panL(pan);
            gr = Sine.panR(pan);
            fizzA.hp(sr, 2500, 0.7f);
            fizzB.hp(sr, 2500, 0.7f);
            fzLpA.lp(sr, 9000, 0.7f);
            fzLpB.lp(sr, 9000, 0.7f);
            hpA.hp(sr, 160, 0.6f);
            hpB.hp(sr, 160, 0.6f);
            next();
            t = start * period;
        }

        void next() {
            t = 0;
            period = lake ? rng.range(2.2f, 4.5f) : rng.range(7.5f, 13f);
            size = lake ? rng.range(0.4f, 0.9f) : rng.range(0.55f, 1f);
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
            if (lake) {
                // 호숫가는 물결 사이에도 잔잔한 찰랑임이 이어진다
                s0 = 0.3f * size + 0.7f * s0;
                s1 = 0.3f * size + 0.7f * s1;
            }
            float f0 = foam(x0) * size, f1 = foam(Math.min(1f, x1)) * size;
            float cut = 300 + (lake ? 1400 : 3200) * (float) Math.pow(s0, 1.3);
            float fr0 = froth.value, fr1 = froth.step(dt);
            float w0 = wash.value, w1 = wash.step(dt);
            fa.set(sr, cut, 0.6f);
            fb.set(sr, cut * 1.1f, 0.6f);
            for (int i = 0; i < n; i++) {
                float k = (float) i / n;
                float s = s0 + (s1 - s0) * k, f = f0 + (f1 - f0) * k;
                fa.process(pa.next());
                fb.process(pb.next());
                float w = w0 + (w1 - w0) * k;
                float wa = hpA.process(fa.lp) * s * w * 2.6f, wb = hpB.process(fb.lp) * s * w * 2.6f;
                float fz = f * (fr0 + (fr1 - fr0) * k) * 0.3f;
                wa += fzLpA.process(fizzA.process(rng.bi())) * fz;
                wb += fzLpB.process(fizzB.process(rng.bi())) * fz;
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
    private final Biquad hl = new Biquad(), hr = new Biquad();
    private final SmoothRandom sea;
    private final boolean lake;

    public OceanGen(float sr) {
        this(sr, false);
    }

    public OceanGen(float sr, boolean lake) {
        super(sr);
        this.lake = lake;
        a = new Wave(-0.45f, 0f);
        b = new Wave(0.45f, 0.5f);
        bl = new BrownNoise(rng);
        br = new BrownNoise(new Rng());
        rl = new OnePole(sr, 260);
        rr = new OnePole(sr, 260);
        hl.hp(sr, 45, 0.7f);
        hr.hp(sr, 45, 0.7f);
        sea = new SmoothRandom(rng, 0.6f, 1f, 3f, 8f);
        reverbSend = 0.1f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float g = sea.step(n / sr) * (lake ? 0.06f : 0.14f);
        for (int i = 0; i < n; i++) {
            l[i] = hl.process(rl.lp(bl.next())) * g;
            r[i] = hr.process(rr.lp(br.next())) * g;
        }
        a.add(l, r, n);
        b.add(l, r, n);
    }
}
