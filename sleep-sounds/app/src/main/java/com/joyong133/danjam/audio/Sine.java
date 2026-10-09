package com.joyong133.danjam.audio;

/** 표 기반 사인. 위상은 주기 단위 [0, 1). */
public final class Sine {
    private static final int N = 4096;
    private static final float[] T = new float[N + 1];

    static {
        for (int i = 0; i <= N; i++) T[i] = (float) Math.sin(2 * Math.PI * i / N);
    }

    private Sine() {
    }

    public static float of(float phase) {
        phase -= (int) phase;
        if (phase < 0) phase += 1f;
        float x = phase * N;
        int i = (int) x;
        return T[i] + (T[i + 1] - T[i]) * (x - i);
    }

    /** 등전력 팬: pan -1(왼쪽) ~ 1(오른쪽) 일 때 왼쪽 이득. */
    public static float panL(float pan) {
        return of(0.25f + (pan + 1f) * 0.125f);
    }

    public static float panR(float pan) {
        return of((pan + 1f) * 0.125f);
    }
}
