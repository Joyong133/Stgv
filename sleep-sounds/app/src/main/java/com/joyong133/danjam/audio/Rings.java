package com.joyong133.danjam.audio;

/**
 * 울리다 사라지는 사인파 묶음 (싱잉볼, 풍경, 오르골의 배음).
 * 감쇠 공진기 점화식 y = 2r·cos(w)·y1 − r²·y2 으로 만들어 표 조회보다 가볍다.
 */
final class Rings {
    private final float sr;
    private final int cap;
    private final float[] c1, c2, y1, y2, env, rBlock, gl, gr;
    private final double[] r;
    private int count;
    /** 이보다 작아지면 그 음은 끝낸다. */
    float floor = 3e-4f;

    Rings(float sr, int cap) {
        this.sr = sr;
        this.cap = cap;
        c1 = new float[cap];
        c2 = new float[cap];
        y1 = new float[cap];
        y2 = new float[cap];
        env = new float[cap];
        rBlock = new float[cap];
        gl = new float[cap];
        gr = new float[cap];
        r = new double[cap];
    }

    /** hz 로 울리고 tauMs(시간 상수) 동안 1/e 로 줄어드는 음. 공간이 없으면 가장 작은 음을 밀어낸다. */
    void add(float hz, float tauMs, float a, float pan) {
        int k = count;
        if (k == cap) {
            k = 0;
            for (int i = 1; i < cap; i++) if (env[i] < env[k]) k = i;
            if (env[k] > a) return;
        } else {
            count++;
        }
        double w = 2 * Math.PI * Math.min(hz, sr * 0.45f) / sr;
        double rr = Math.exp(-1.0 / (tauMs * 0.001 * sr));
        c1[k] = (float) (2 * rr * Math.cos(w));
        c2[k] = (float) (-rr * rr);
        y1[k] = (float) (a * Math.sin(w));
        y2[k] = 0f;
        env[k] = a;
        r[k] = rr;
        rBlock[k] = -1f;
        gl[k] = Sine.panL(pan);
        gr[k] = Sine.panR(pan);
    }

    void render(float[] l, float[] rOut, int n) {
        for (int k = 0; k < count; k++) {
            float a1 = c1[k], a2 = c2[k], p1 = y1[k], p2 = y2[k], L = gl[k], R = gr[k];
            for (int i = 0; i < n; i++) {
                float y = a1 * p1 + a2 * p2;
                p2 = p1;
                p1 = y;
                l[i] += y * L;
                rOut[i] += y * R;
            }
            if (rBlock[k] < 0f || n != Mixer.BLOCK) {
                float rb = (float) Math.pow(r[k], n);
                if (n == Mixer.BLOCK) rBlock[k] = rb;
                env[k] *= rb;
            } else {
                env[k] *= rBlock[k];
            }
            if (env[k] < floor) {
                count--;
                c1[k] = c1[count];
                c2[k] = c2[count];
                y1[k] = y1[count];
                y2[k] = y2[count];
                env[k] = env[count];
                r[k] = r[count];
                rBlock[k] = rBlock[count];
                gl[k] = gl[count];
                gr[k] = gr[count];
                k--;
            } else {
                y1[k] = p1;
                y2[k] = p2;
            }
        }
    }
}
