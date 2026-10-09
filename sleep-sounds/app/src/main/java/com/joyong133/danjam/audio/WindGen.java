package com.joyong133.danjam.audio;

/**
 * 바람: 돌풍에 따라 높낮이가 바뀌는 '휘이잉', 강할 때만 살짝 나는 휘파람 소리.
 * snow 를 주면 눈보라처럼 휘파람이 잦고 날리는 눈이 '사아' 하고 스친다.
 */
public final class WindGen extends Generator {

    private final class Voice {
        final PinkNoise pink = new PinkNoise(new Rng());
        final BrownNoise brown = new BrownNoise(new Rng());
        final Svf body = new Svf(), whistle = new Svf();
        final OnePole low = new OnePole(sr, 140);
        final SmoothRandom gust = new SmoothRandom(new Rng(), 0.12f, 1f, 1.5f, 5.5f);
        final SmoothRandom tone = new SmoothRandom(new Rng(), 0.85f, 1.15f, 0.8f, 2.5f);
        final float gl, gr;

        Voice(float pan) {
            gl = Sine.panL(pan);
            gr = Sine.panR(pan);
        }

        void add(float[] l, float[] r, int n) {
            float dt = n / sr;
            float g = gust.step(dt), tn = tone.step(dt);
            float g15 = (float) Math.pow(g, 1.5);
            body.set(sr, (220 + 650 * g15) * tn, 0.9f + 2.2f * g);
            whistle.set(sr, (650 + 850 * g) * tn, 22f);
            float wl = Math.max(0f, g - 0.6f);
            wl = wl * wl * whistleLevel;
            float lowG = 0.5f * g;
            for (int i = 0; i < n; i++) {
                body.process(pink.next());
                whistle.process(rng.bi());
                float v = body.bp * g15 * 1.6f + whistle.bp * wl + low.lp(brown.next()) * lowG;
                l[i] += v * gl;
                r[i] += v * gr;
            }
        }
    }

    private final Voice a, b;
    private final float whistleLevel, snow;
    private final Biquad snowHpL = new Biquad(), snowHpR = new Biquad();

    public WindGen(float sr, float whistleLevel) {
        this(sr, whistleLevel, 0f);
    }

    public WindGen(float sr, float whistleLevel, float snow) {
        super(sr);
        this.whistleLevel = whistleLevel;
        this.snow = snow;
        snowHpL.hp(sr, 3500, 0.7f);
        snowHpR.hp(sr, 3500, 0.7f);
        a = new Voice(-0.6f);
        b = new Voice(0.6f);
        reverbSend = 0.05f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        for (int i = 0; i < n; i++) l[i] = r[i] = 0;
        a.add(l, r, n);
        b.add(l, r, n);
        if (snow > 0) {
            float gl = snow * a.gust.value * a.gust.value, gr = snow * b.gust.value * b.gust.value;
            for (int i = 0; i < n; i++) {
                l[i] += snowHpL.process(rng.bi()) * gl;
                r[i] += snowHpR.process(rng.bi()) * gr;
            }
        }
    }
}
