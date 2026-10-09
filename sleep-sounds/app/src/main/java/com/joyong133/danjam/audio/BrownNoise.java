package com.joyong133.danjam.audio;

/** 브라운(레드) 노이즈: 새는 적분기. 출력 RMS 약 0.2. */
public final class BrownNoise {
    private final Rng rng;
    private float z;

    public BrownNoise(Rng rng) {
        this.rng = rng;
    }

    public float next() {
        z = z * 0.998f + rng.bi() * 0.02f;
        return z * 1.1f;
    }
}
