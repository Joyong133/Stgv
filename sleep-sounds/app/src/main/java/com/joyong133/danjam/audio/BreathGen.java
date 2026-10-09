package com.joyong133.danjam.audio;

/**
 * 호흡 안내 소리: 들이쉴 때 부드럽게 차오르고, 멈출 때 잔잔히 머물고, 내쉴 때 천천히 잦아드는 바람 소리.
 * 화면의 호흡 원과 같은 순간에 시작해 같은 박자로 움직인다.
 */
public final class BreathGen extends Generator {
    private final float[] phase; // 들이쉬기, 멈추기, 내쉬기, 멈추기 (초)
    private final PinkNoise pl, pr;
    private final Svf fl = new Svf(), fr = new Svf();
    private float t, p1, p2;

    /** spec: "4,7,8" 또는 "4,0,6,0" 처럼 각 단계의 초 */
    public BreathGen(float sr, String spec) {
        super(sr);
        float[] p = {4, 7, 8, 0};
        String[] parts = spec.split(",");
        for (int i = 0; i < parts.length && i < 4; i++) {
            try {
                p[i] = Math.max(0f, Float.parseFloat(parts[i].trim()));
            } catch (NumberFormatException ignored) {
            }
        }
        phase = p;
        pl = new PinkNoise(rng);
        pr = new PinkNoise(new Rng());
        reverbSend = 0.3f;
    }

    private float total() {
        return phase[0] + phase[1] + phase[2] + phase[3];
    }

    /** 지금 시각의 숨 세기 (0~1)와 밝기 (0~1). */
    private float level(float time, float[] bright) {
        float x = time % Math.max(0.1f, total());
        if (x < phase[0]) {
            float k = x / phase[0];
            bright[0] = k;
            return (float) (0.5 - 0.5 * Math.cos(Math.PI * k));
        }
        x -= phase[0];
        if (x < phase[1]) {
            bright[0] = 1f;
            return 1f - 0.6f * Math.min(1f, x / 0.6f);
        }
        x -= phase[1];
        if (x < phase[2]) {
            float k = x / phase[2];
            bright[0] = 1f - k;
            float start = phase[1] > 0 ? 0.4f : 1f;
            return start * (float) (0.5 + 0.5 * Math.cos(Math.PI * k));
        }
        bright[0] = 0f;
        return 0f;
    }

    private final float[] tmp = new float[1];

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        float e0 = level(t, tmp), b0 = tmp[0];
        float e1 = level(t + dt, tmp);
        fl.set(sr, 300 + 900 * b0, 1.1f);
        fr.set(sr, 330 + 950 * b0, 1.1f);
        float i220 = 220f / sr, i330 = 330f / sr;
        for (int i = 0; i < n; i++) {
            float e = e0 + (e1 - e0) * i / n;
            fl.process(pl.next());
            fr.process(pr.next());
            float pad = (Sine.of(p1) + 0.6f * Sine.of(p2)) * 0.05f * e;
            p1 += i220;
            p2 += i330;
            if (p1 >= 1f) p1 -= 1f;
            if (p2 >= 1f) p2 -= 1f;
            l[i] = fl.bp * e * 0.9f + pad;
            r[i] = fr.bp * e * 0.9f + pad;
        }
        t += dt;
    }
}
