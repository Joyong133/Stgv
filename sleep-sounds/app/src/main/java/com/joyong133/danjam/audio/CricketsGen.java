package com.joyong133.danjam.audio;

/** 가을밤 풀벌레: 귀뚜라미들의 '귀뚤귀뚤'과 길게 이어지는 방울벌레 떨림. */
public final class CricketsGen extends Generator {

    /** 귀뚜라미 한 마리: 짧은 음절 3~5개로 된 울음을 일정 간격으로 반복한다. */
    private final class Cricket {
        final float inc, syl, gap, gl, gr, amp;
        final int sylls;
        float period, t, ph, rest;

        Cricket(float pan, float amp) {
            inc = rng.range(3900, 5200) / sr;
            syl = rng.range(0.012f, 0.018f) * sr;
            gap = rng.range(0.012f, 0.02f) * sr;
            sylls = 3 + rng.below(3);
            period = rng.range(0.35f, 0.8f) * sr;
            t = rng.uni() * period;
            gl = Sine.panL(pan);
            gr = Sine.panR(pan);
            this.amp = amp;
        }

        void add(float[] l, float[] r, int n) {
            if (rest > 0) {
                rest -= n;
                return;
            }
            float chirpLen = sylls * (syl + gap);
            float base = period;
            for (int i = 0; i < n; i++) {
                if (t < chirpLen) {
                    float pos = t % (syl + gap);
                    if (pos < syl) {
                        float e = Sine.of(pos / syl * 0.5f);
                        float s = (Sine.of(ph) + 0.1f * Sine.of(ph * 2)) * e * e * amp;
                        l[i] += s * gl;
                        r[i] += s * gr;
                    }
                }
                ph += inc;
                if (ph >= 1f) ph -= 1f;
                if (++t >= base) {
                    t = 0;
                    base = period * rng.range(0.96f, 1.04f);
                    if (rng.chance(0.012f)) rest = rng.range(2f, 7f) * sr;
                    if (rest > 0) return;
                }
            }
        }
    }

    /** 방울벌레처럼 길게 떠는 소리. */
    private final class Trill {
        final float inc, pulse, gl, gr, amp;
        float ph, t, on, off, fade;

        Trill(float pan, float amp) {
            inc = rng.range(2700, 3400) / sr;
            pulse = sr / rng.range(38, 55);
            gl = Sine.panL(pan);
            gr = Sine.panR(pan);
            this.amp = amp;
            on = rng.range(1f, 8f) * sr;
        }

        void add(float[] l, float[] r, int n) {
            if (on <= 0) {
                off -= n;
                fade = 0;
                if (off <= 0) on = rng.range(3f, 12f) * sr;
                return;
            }
            for (int i = 0; i < n; i++) {
                fade = Math.min(1f, fade + 1f / (0.4f * sr));
                float g = fade * Math.min(1f, on / (0.4f * sr));
                float pos = t / (pulse * 0.55f);
                if (pos < 1f) {
                    float e = Sine.of(pos * 0.5f);
                    float s = Sine.of(ph) * e * e * amp * g;
                    l[i] += s * gl;
                    r[i] += s * gr;
                }
                ph += inc;
                if (ph >= 1f) ph -= 1f;
                if (++t >= pulse) t = 0;
                if (--on <= 0) {
                    off = rng.range(1.5f, 6f) * sr;
                    return;
                }
            }
        }
    }

    private final Cricket[] crickets = new Cricket[7];
    private final Trill[] trills = new Trill[2];
    private final PinkNoise night;
    private final OnePole nightLp;

    public CricketsGen(float sr) {
        super(sr);
        for (int i = 0; i < crickets.length; i++) {
            float near = i < 2 ? rng.range(0.6f, 0.9f) : rng.range(0.12f, 0.4f);
            crickets[i] = new Cricket(rng.range(-0.9f, 0.9f), near * 0.3f);
        }
        for (int i = 0; i < trills.length; i++) trills[i] = new Trill(rng.range(-0.7f, 0.7f), rng.range(0.05f, 0.1f));
        night = new PinkNoise(rng);
        nightLp = new OnePole(sr, 900);
        reverbSend = 0.2f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        for (int i = 0; i < n; i++) l[i] = r[i] = nightLp.lp(night.next()) * 0.04f;
        for (Cricket c : crickets) c.add(l, r, n);
        for (Trill t : trills) t.add(l, r, n);
    }
}
