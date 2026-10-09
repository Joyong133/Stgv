package com.joyong133.danjam.audio;

/** 1차 저역/고역 필터. */
public final class OnePole {
    private float a;
    private float z;

    public OnePole() {
    }

    public OnePole(float sr, float hz) {
        set(sr, hz);
    }

    public OnePole set(float sr, float hz) {
        a = (float) Math.exp(-2.0 * Math.PI * hz / sr);
        return this;
    }

    public float lp(float x) {
        z = x + (z - x) * a + Dsp.ANTI_DENORMAL - Dsp.ANTI_DENORMAL;
        return z;
    }

    public float hp(float x) {
        return x - lp(x);
    }
}
