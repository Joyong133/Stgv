package com.joyong133.danjam.audio;

/**
 * 짧은 음 묶음 (새의 지저귐, 개구리 울음). 음마다 높이가 미끄러지고,
 * 떨림(비브라토)·펄스(진폭 변조)·약한 찌그러짐으로 음색을 만든다.
 * 필드에 다음 음의 설정을 적어 두고 {@link #add(float)} 로 예약한다.
 */
final class Chirps {
    private final float sr;
    private final int cap;
    private final float[] wait, len, t, ph, inc, mul, amp, atk, rel, vibPh, vibInc, vibDepth, amPh, amInc, h2, drive, gl, gr;
    private final int[] amPow;
    private int count;

    float f0, f1, dur, level, pan, attack = 0.005f, release = 0.012f, vibRate, vibAmount, amRate, harmonic2, saturation;
    int pulseShape = 2;

    Chirps(float sr, int cap) {
        this.sr = sr;
        this.cap = cap;
        wait = new float[cap];
        len = new float[cap];
        t = new float[cap];
        ph = new float[cap];
        inc = new float[cap];
        mul = new float[cap];
        amp = new float[cap];
        atk = new float[cap];
        rel = new float[cap];
        vibPh = new float[cap];
        vibInc = new float[cap];
        vibDepth = new float[cap];
        amPh = new float[cap];
        amInc = new float[cap];
        h2 = new float[cap];
        drive = new float[cap];
        gl = new float[cap];
        gr = new float[cap];
        amPow = new int[cap];
    }

    /** 현재 설정으로 delaySec 뒤에 시작하는 음 하나를 예약한다. */
    void add(float delaySec) {
        if (count == cap) return;
        int k = count++;
        float n = Math.max(1f, dur * sr);
        wait[k] = delaySec * sr;
        len[k] = n;
        t[k] = 0;
        ph[k] = 0;
        inc[k] = f0 / sr;
        mul[k] = (float) Math.pow(f1 / f0, 1.0 / n);
        amp[k] = level;
        atk[k] = Math.max(1f, attack * sr);
        rel[k] = Math.max(1f, release * sr);
        vibPh[k] = 0;
        vibInc[k] = vibRate / sr;
        vibDepth[k] = vibAmount;
        amPh[k] = 0;
        amInc[k] = amRate / sr;
        amPow[k] = pulseShape;
        h2[k] = harmonic2;
        drive[k] = saturation;
        gl[k] = Sine.panL(pan);
        gr[k] = Sine.panR(pan);
    }

    void render(float[] l, float[] r, int n) {
        for (int k = 0; k < count; k++) {
            int i = 0;
            if (wait[k] > 0) {
                if (wait[k] >= n) {
                    wait[k] -= n;
                    continue;
                }
                i = (int) wait[k];
                wait[k] = 0;
            }
            float p = ph[k], d = inc[k], m = mul[k], tt = t[k], L = len[k], A = atk[k], R = rel[k];
            float vp = vibPh[k], vi = vibInc[k], vd = vibDepth[k], ap = amPh[k], ai = amInc[k], hh = h2[k], dr = drive[k];
            float a = amp[k], al = gl[k], ar = gr[k];
            int pw = amPow[k];
            float drNorm = dr > 0 ? 1f / Dsp.tanh(dr) : 1f;
            for (; i < n && tt < L; i++, tt++) {
                float e = Math.min(1f, Math.min(tt / A, (L - tt) / R));
                float w = Sine.of(p);
                if (hh != 0) w += hh * Sine.of(p * 2f);
                if (dr > 0) w = Dsp.tanh(w * dr) * drNorm;
                if (ai > 0) {
                    float c = 0.5f + 0.5f * Sine.of(ap + 0.25f);
                    float q = c;
                    for (int j = 1; j < pw; j++) q *= c;
                    w *= q;
                    ap += ai;
                    if (ap >= 1f) ap -= 1f;
                }
                float s = w * e * a;
                l[i] += s * al;
                r[i] += s * ar;
                float step = d;
                if (vd != 0) {
                    step *= 1f + vd * Sine.of(vp);
                    vp += vi;
                    if (vp >= 1f) vp -= 1f;
                }
                p += step;
                if (p >= 1f) p -= 1f;
                d *= m;
            }
            if (tt >= L) {
                count--;
                copy(count, k);
                k--;
            } else {
                ph[k] = p;
                inc[k] = d;
                t[k] = tt;
                vibPh[k] = vp;
                amPh[k] = ap;
            }
        }
    }

    private void copy(int from, int to) {
        wait[to] = wait[from];
        len[to] = len[from];
        t[to] = t[from];
        ph[to] = ph[from];
        inc[to] = inc[from];
        mul[to] = mul[from];
        amp[to] = amp[from];
        atk[to] = atk[from];
        rel[to] = rel[from];
        vibPh[to] = vibPh[from];
        vibInc[to] = vibInc[from];
        vibDepth[to] = vibDepth[from];
        amPh[to] = amPh[from];
        amInc[to] = amInc[from];
        amPow[to] = amPow[from];
        h2[to] = h2[from];
        drive[to] = drive[from];
        gl[to] = gl[from];
        gr[to] = gr[from];
    }
}
