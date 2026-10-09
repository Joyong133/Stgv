package com.joyong133.danjam.audio;

/** RBJ 쿡북 2차 필터 (Transposed Direct Form II). */
public final class Biquad {
    private float b0 = 1f, b1, b2, a1, a2;
    private float z1, z2;

    public float process(float x) {
        float y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2 + Dsp.ANTI_DENORMAL - Dsp.ANTI_DENORMAL;
        z2 = b2 * x - a2 * y + Dsp.ANTI_DENORMAL - Dsp.ANTI_DENORMAL;
        return y;
    }

    public Biquad lp(float sr, float f, float q) {
        double w = omega(sr, f), c = Math.cos(w), al = Math.sin(w) / (2 * q);
        return set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
    }

    public Biquad hp(float sr, float f, float q) {
        double w = omega(sr, f), c = Math.cos(w), al = Math.sin(w) / (2 * q);
        return set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
    }

    /** 대역통과 (중심 주파수에서 이득 0dB). */
    public Biquad bp(float sr, float f, float q) {
        double w = omega(sr, f), c = Math.cos(w), al = Math.sin(w) / (2 * q);
        return set(al, 0, -al, 1 + al, -2 * c, 1 - al);
    }

    public Biquad peak(float sr, float f, float q, float db) {
        double A = Math.pow(10, db / 40.0), w = omega(sr, f), c = Math.cos(w), al = Math.sin(w) / (2 * q);
        return set(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
    }

    public Biquad lowShelf(float sr, float f, float db) {
        double A = Math.pow(10, db / 40.0), w = omega(sr, f), c = Math.cos(w), s = Math.sin(w);
        double al = s / 2 * Math.sqrt(2), sa = 2 * Math.sqrt(A) * al;
        return set(A * ((A + 1) - (A - 1) * c + sa), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sa),
                (A + 1) + (A - 1) * c + sa, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sa);
    }

    public Biquad highShelf(float sr, float f, float db) {
        double A = Math.pow(10, db / 40.0), w = omega(sr, f), c = Math.cos(w), s = Math.sin(w);
        double al = s / 2 * Math.sqrt(2), sa = 2 * Math.sqrt(A) * al;
        return set(A * ((A + 1) + (A - 1) * c + sa), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sa),
                (A + 1) - (A - 1) * c + sa, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sa);
    }

    private static double omega(float sr, float f) {
        return 2 * Math.PI * Math.min(f, sr * 0.45f) / sr;
    }

    private Biquad set(double nb0, double nb1, double nb2, double na0, double na1, double na2) {
        b0 = (float) (nb0 / na0);
        b1 = (float) (nb1 / na0);
        b2 = (float) (nb2 / na0);
        a1 = (float) (na1 / na0);
        a2 = (float) (na2 / na0);
        return this;
    }
}
