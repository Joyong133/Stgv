package com.joyong133.danjam.audio;

import java.util.concurrent.atomic.AtomicInteger;

/** 오디오 스레드용 xorshift 난수. 객체 할당이 없어 매 샘플 호출해도 가볍다. */
public final class Rng {
    private static final AtomicInteger SEEDS = new AtomicInteger((int) System.nanoTime());

    private int s;

    public Rng(int seed) {
        s = seed == 0 ? 0x9E3779B9 : seed;
    }

    public Rng() {
        this(SEEDS.addAndGet(0x61C88647) ^ 0x5BD1E995);
    }

    public int nextInt() {
        int x = s;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        s = x;
        return x;
    }

    /** [0, 1) */
    public float uni() {
        return (nextInt() >>> 8) * (1f / 16777216f);
    }

    /** [-1, 1) */
    public float bi() {
        return (nextInt() >> 8) * (1f / 8388608f);
    }

    public float range(float a, float b) {
        return a + (b - a) * uni();
    }

    /** a~b 사이 로그 균등 분포 (주파수 고를 때). */
    public float logRange(float a, float b) {
        return (float) (a * Math.pow(b / a, uni()));
    }

    public int below(int n) {
        return (int) (uni() * n);
    }

    public boolean chance(float p) {
        return uni() < p;
    }

    /** 평균이 mean 인 지수분포 대기 시간 (포아송 사건 간격). */
    public float exp(float mean) {
        return (float) (-Math.log(1.0 - uni()) * mean);
    }
}
