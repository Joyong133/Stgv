package com.joyong133.danjam.audio;

/** 상태변수 필터 (TPT). 차단 주파수를 블록마다 바꿔도 안정적이다. */
public final class Svf {
    private float a1, a2, a3, k;
    private float ic1, ic2;
    public float lp, bp, hp;

    public Svf set(float sr, float fc, float q) {
        float g = (float) Math.tan(Math.PI * Math.min(fc, sr * 0.45f) / sr);
        k = 1f / q;
        a1 = 1f / (1f + g * (g + k));
        a2 = g * a1;
        a3 = g * a2;
        return this;
    }

    public void process(float v0) {
        float v3 = v0 - ic2;
        float v1 = a1 * ic1 + a2 * v3;
        float v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1 + Dsp.ANTI_DENORMAL - Dsp.ANTI_DENORMAL;
        ic2 = 2 * v2 - ic2 + Dsp.ANTI_DENORMAL - Dsp.ANTI_DENORMAL;
        lp = v2;
        bp = v1;
        hp = v0 - k * v1 - v2;
    }
}
