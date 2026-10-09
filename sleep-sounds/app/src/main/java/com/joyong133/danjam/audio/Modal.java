package com.joyong133.danjam.audio;

/** 공명 모드 묶음 (양철판, 유리, 천막, 시계 부품처럼 두드리면 울리는 물체). */
final class Modal {
    private final int m;
    private final float[] c1, c2, g, y1, y2;
    private int quiet;
    private boolean asleep = true;

    Modal(int modes) {
        m = modes;
        c1 = new float[m];
        c2 = new float[m];
        g = new float[m];
        y1 = new float[m];
        y2 = new float[m];
    }

    /** 충격(1샘플 크기 1)을 주면 진폭 gain 으로 울리고 decaySec(시간 상수) 동안 줄어든다. */
    Modal mode(int i, float sr, float hz, float decaySec, float gain) {
        double w = 2 * Math.PI * Math.min(hz, sr * 0.45f) / sr;
        double r = Math.exp(-1.0 / (decaySec * sr));
        c1[i] = (float) (2 * r * Math.cos(w));
        c2[i] = (float) (-r * r);
        g[i] = (float) (Math.sin(w) * gain);
        return this;
    }

    float process(float x) {
        if (asleep) {
            if (x == 0f) return 0f;
            asleep = false;
            quiet = 0;
        }
        float out = 0;
        for (int i = 0; i < m; i++) {
            float y = c1[i] * y1[i] + c2[i] * y2[i] + g[i] * x;
            y2[i] = y1[i];
            y1[i] = y;
            out += y;
        }
        // 아무것도 두드리지 않고 소리가 사그라들면 잠들어 계산을 아낀다
        if (x == 0f && Math.abs(out) < 1e-6f) {
            if (++quiet > 512) {
                asleep = true;
                for (int i = 0; i < m; i++) y1[i] = y2[i] = 0f;
            }
        } else {
            quiet = 0;
        }
        return out;
    }
}
