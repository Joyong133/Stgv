package com.joyong133.danjam.audio;

/**
 * 가을밤 풀벌레: 가까운 귀뚜라미 몇 마리의 '귀뚤귀뚤', 멀리서 겹겹이 이어지는 풀벌레 합창,
 * 길게 떠는 방울벌레와 여치. 실제 녹음처럼 울음 사이가 비지 않고 촘촘하게 이어진다.
 */
public final class CricketsGen extends Generator {

    /** 귀뚜라미 한 마리: 짧은 음절 3~5개로 된 울음을 일정 간격으로 반복한다. */
    private final class Cricket {
        final float inc, syl, gap, gl, gr, amp;
        final int sylls;
        float period, t, ph, rest;

        Cricket(float pan, float amp, float lo, float hi) {
            inc = rng.range(lo, hi) / sr;
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

        Trill(float pan, float amp, float lo, float hi, float pulseLo, float pulseHi) {
            inc = rng.range(lo, hi) / sr;
            pulse = sr / rng.range(pulseLo, pulseHi);
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

    private final Cricket[] crickets = new Cricket[14];
    private final Trill[] trills = new Trill[4];
    private final PinkNoise night;
    private final OnePole nightLp;

    public CricketsGen(float sr) {
        super(sr);
        for (int i = 0; i < crickets.length; i++) {
            boolean close = i < 3;
            crickets[i] = close
                    ? new Cricket(rng.range(-0.9f, 0.9f), rng.range(0.25f, 0.4f) * 0.3f, 3900, 5200)
                    : new Cricket(rng.range(-1f, 1f), rng.range(0.05f, 0.16f) * 0.3f, 4200, 7200);
        }
        trills[0] = new Trill(rng.range(-0.7f, 0.7f), rng.range(0.05f, 0.09f), 2700, 3400, 38, 55);
        trills[1] = new Trill(rng.range(-0.7f, 0.7f), rng.range(0.04f, 0.07f), 2700, 3400, 38, 55);
        // 여치처럼 높고 빠르게 떠는 소리
        trills[2] = new Trill(rng.range(-0.9f, 0.9f), rng.range(0.03f, 0.05f), 6000, 8500, 70, 100);
        trills[3] = new Trill(rng.range(-0.9f, 0.9f), rng.range(0.025f, 0.04f), 6500, 9000, 70, 100);
        night = new PinkNoise(rng);
        nightLp = new OnePole(sr, 2500);
        reverbSend = 0.2f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        for (int i = 0; i < n; i++) l[i] = r[i] = nightLp.lp(night.next()) * 0.07f;
        for (Cricket c : crickets) c.add(l, r, n);
        for (Trill t : trills) t.add(l, r, n);
    }
}
