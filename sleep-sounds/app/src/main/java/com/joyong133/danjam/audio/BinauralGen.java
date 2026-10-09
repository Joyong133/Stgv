package com.joyong133.danjam.audio;

/** 델타파 바이노럴 비트: 왼쪽과 오른쪽 귀에 2.5Hz 차이 나는 음을 들려준다 (이어폰 권장). */
public final class BinauralGen extends Generator {
    private final float il, ir, il2, ir2;
    private float pl, pr, pl2, pr2;
    private final PinkNoise pink;
    private final OnePole soft;
    private final SmoothRandom breath;

    public BinauralGen(float sr) {
        super(sr);
        il = 200f / sr;
        ir = 202.5f / sr;
        il2 = 100f / sr;
        ir2 = 101.25f / sr;
        pink = new PinkNoise(rng);
        soft = new OnePole(sr, 500);
        breath = new SmoothRandom(rng, 0.85f, 1f, 3f, 7f);
        reverbSend = 0.1f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float g = breath.step(n / sr) * 0.3f;
        for (int i = 0; i < n; i++) {
            float bed = soft.lp(pink.next()) * 0.15f;
            l[i] = (Sine.of(pl) + 0.6f * Sine.of(pl2)) * g + bed;
            r[i] = (Sine.of(pr) + 0.6f * Sine.of(pr2)) * g + bed;
            pl += il;
            pr += ir;
            pl2 += il2;
            pr2 += ir2;
            if (pl >= 1f) pl -= 1f;
            if (pr >= 1f) pr -= 1f;
            if (pl2 >= 1f) pl2 -= 1f;
            if (pr2 >= 1f) pr2 -= 1f;
        }
    }
}
