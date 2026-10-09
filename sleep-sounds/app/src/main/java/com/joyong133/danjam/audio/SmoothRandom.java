package com.joyong133.danjam.audio;

/** 무작위 목표값 사이를 부드럽게 오가는 느린 변조원 (돌풍, 흔들림 등). */
public final class SmoothRandom {
    private final Rng rng;
    private final float lo, hi, tMin, tMax;
    private float from, to, t, dur;
    public float value;

    public SmoothRandom(Rng rng, float lo, float hi, float tMin, float tMax) {
        this.rng = rng;
        this.lo = lo;
        this.hi = hi;
        this.tMin = tMin;
        this.tMax = tMax;
        from = to = value = rng.range(lo, hi);
        dur = rng.range(tMin, tMax);
        t = rng.uni() * dur;
    }

    /** dt 초만큼 진행하고 현재 값을 돌려준다. */
    public float step(float dt) {
        t += dt;
        if (t >= dur) {
            t = Math.min(t - dur, dur);
            from = to;
            to = rng.range(lo, hi);
            dur = rng.range(tMin, tMax);
            t = Math.min(t, dur);
        }
        float x = t / dur;
        value = from + (to - from) * x * x * (3 - 2 * x);
        return value;
    }
}
