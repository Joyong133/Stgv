package com.joyong133.danjam.audio;

final class Dsp {
    /**
     * 필터 상태에 더했다 빼면 1e-25 보다 작은 값이 0으로 떨어진다.
     * 쉬고 있는 필터가 비정규화 수(denormal)로 느려지는 것을 막는다.
     */
    static final float ANTI_DENORMAL = 1e-18f;

    private Dsp() {
    }

    /** 빠른 tanh 근사 */
    static float tanh(float x) {
        if (x > 3f) return 1f;
        if (x < -3f) return -1f;
        float x2 = x * x;
        return x * (27f + x2) / (27f + 9f * x2);
    }
}
