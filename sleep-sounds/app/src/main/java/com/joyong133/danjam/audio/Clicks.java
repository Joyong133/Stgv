package com.joyong133.danjam.audio;

/**
 * 짧은 충격음(빗방울, 장작 튀는 소리) 묶음.
 * 각 사건은 지수적으로 줄어드는 포락선이고, 실제 소리는 호출하는 쪽에서 노이즈에 곱해 만든다.
 */
final class Clicks {
    private final int cap;
    private final float[] amp, dec, gl, gr;
    private final int[] tag;
    private int count;
    float sumL, sumR;

    Clicks(int cap) {
        this.cap = cap;
        amp = new float[cap];
        dec = new float[cap];
        gl = new float[cap];
        gr = new float[cap];
        tag = new int[cap];
    }

    /** a: 세기, tauSamples: 감쇠 시간(샘플), pan: -1~1, tagIndex: 공명체 번호(-1이면 없음). */
    void add(float a, float tauSamples, float pan, int tagIndex) {
        int k = count;
        if (k == cap) {
            k = 0;
            for (int i = 1; i < cap; i++) if (amp[i] < amp[k]) k = i;
            if (amp[k] > a) return;
        } else {
            count++;
        }
        amp[k] = a;
        dec[k] = (float) Math.exp(-1.0 / Math.max(1f, tauSamples));
        gl[k] = Sine.panL(pan);
        gr[k] = Sine.panR(pan);
        tag[k] = tagIndex;
    }

    /** 한 샘플 진행. sumL/sumR 에 좌우 포락선 합을, tagSums[tag] 에 공명체별 합을 더한다. */
    void tick(float[] tagSums) {
        float sl = 0, sr = 0;
        for (int k = 0; k < count; k++) {
            float a = amp[k];
            sl += a * gl[k];
            sr += a * gr[k];
            if (tagSums != null && tag[k] >= 0) tagSums[tag[k]] += a;
            a *= dec[k];
            if (a < 1e-4f) {
                count--;
                amp[k] = amp[count];
                dec[k] = dec[count];
                gl[k] = gl[count];
                gr[k] = gr[count];
                tag[k] = tag[count];
                k--;
            } else {
                amp[k] = a;
            }
        }
        sumL = sl;
        sumR = sr;
    }

    boolean idle() {
        return count == 0;
    }
}
