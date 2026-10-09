package com.joyong133.danjam.audio;

/**
 * 물방울/기포 소리 (민나어트 공명): 주파수가 살짝 올라가며 사라지는 사인파.
 * 웅덩이 빗방울, 시냇물, 낙숫물, 물속 기포에 쓴다.
 */
final class Bubbles {
    private final float sr;
    private final int cap;
    private final float[] ph, inc, mul, amp, dec, gl, gr;
    private int count;

    Bubbles(float sr, int cap) {
        this.sr = sr;
        this.cap = cap;
        ph = new float[cap];
        inc = new float[cap];
        mul = new float[cap];
        amp = new float[cap];
        dec = new float[cap];
        gl = new float[cap];
        gr = new float[cap];
    }

    /**
     * @param hz    시작 주파수
     * @param tauMs 감쇠 시간 상수(ms)
     * @param rise  감쇠 시간 상수 동안 주파수가 오르는 비율 (0.3 이면 30%)
     * @param a     세기
     * @param pan   -1~1
     */
    void add(float hz, float tauMs, float rise, float a, float pan) {
        if (count == cap) return;
        int k = count++;
        float tau = tauMs * 0.001f * sr;
        ph[k] = 0f;
        inc[k] = hz / sr;
        mul[k] = (float) Math.exp(Math.log(1 + rise) / tau);
        amp[k] = a;
        dec[k] = (float) Math.exp(-1.0 / tau);
        gl[k] = Sine.panL(pan);
        gr[k] = Sine.panR(pan);
    }

    /** n 샘플을 l, r 에 더한다. */
    void render(float[] l, float[] r, int n) {
        for (int k = 0; k < count; k++) {
            float p = ph[k], d = inc[k], m = mul[k], a = amp[k], da = dec[k], al = gl[k], ar = gr[k];
            for (int i = 0; i < n; i++) {
                float s = Sine.of(p) * a;
                l[i] += s * al;
                r[i] += s * ar;
                p += d;
                if (p >= 1f) p -= 1f;
                if (d < 0.45f) d *= m;
                a *= da;
            }
            if (a < 1e-4f) {
                count--;
                ph[k] = ph[count];
                inc[k] = inc[count];
                mul[k] = mul[count];
                amp[k] = amp[count];
                dec[k] = dec[count];
                gl[k] = gl[count];
                gr[k] = gr[count];
                k--;
            } else {
                ph[k] = p;
                inc[k] = d;
                amp[k] = a;
            }
        }
    }
}
