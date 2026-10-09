package com.joyong133.danjam.audio;

/** 꿈결 앰비언트: 화음 속 음들이 아주 천천히 나타났다 사라지는 몽환적인 배경음. */
public final class DroneGen extends Generator {
    /** D 장조 9화음 + 리디안 색채 */
    private static final float[] NOTES = {73.42f, 110f, 146.83f, 185f, 220f, 277.18f, 329.63f, 369.99f, 440f, 554.37f, 659.26f};
    private static final int VOICES = 9;

    private final float[] incA = new float[VOICES], incB = new float[VOICES], pa = new float[VOICES], pb = new float[VOICES];
    private final float[] gl = new float[VOICES], gr = new float[VOICES];
    private final SmoothRandom[] amp = new SmoothRandom[VOICES];
    private final float[] lastAmp = new float[VOICES];
    private final PinkNoise pink;
    private final Svf air = new Svf();
    private final OnePole lpL, lpR;
    private final SmoothRandom airAmp;

    public DroneGen(float sr) {
        super(sr);
        for (int v = 0; v < VOICES; v++) {
            amp[v] = new SmoothRandom(rng, -0.4f, 1f, 6f, 16f);
            retune(v);
            float pan = rng.range(-0.8f, 0.8f);
            gl[v] = Sine.panL(pan);
            gr[v] = Sine.panR(pan);
            pa[v] = rng.uni();
            pb[v] = rng.uni();
        }
        pink = new PinkNoise(rng);
        air.set(sr, 1800, 0.5f);
        airAmp = new SmoothRandom(rng, 0.2f, 1f, 5f, 12f);
        lpL = new OnePole(sr, 2400);
        lpR = new OnePole(sr, 2400);
        reverbSend = 0.55f;
    }

    private void retune(int v) {
        float f = NOTES[rng.below(NOTES.length)];
        incA[v] = f * 0.9985f / sr;
        incB[v] = f * 1.0015f / sr;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        for (int i = 0; i < n; i++) l[i] = r[i] = 0;
        for (int v = 0; v < VOICES; v++) {
            float a1 = Math.max(0f, amp[v].step(dt));
            float a0 = lastAmp[v];
            lastAmp[v] = a1;
            if (a0 == 0f && a1 == 0f) {
                retune(v);
                continue;
            }
            float ia = incA[v], ib = incB[v], xa = pa[v], xb = pb[v], L = gl[v], R = gr[v];
            for (int i = 0; i < n; i++) {
                float a = a0 + (a1 - a0) * i / n;
                a = a * a * 0.09f;
                float s = (Sine.of(xa) + Sine.of(xb) + 0.25f * Sine.of(xa * 2f)) * a;
                l[i] += s * L;
                r[i] += s * R;
                xa += ia;
                xb += ib;
                if (xa >= 1f) xa -= 1f;
                if (xb >= 1f) xb -= 1f;
            }
            pa[v] = xa;
            pb[v] = xb;
        }
        float ag = airAmp.step(dt) * 0.03f;
        for (int i = 0; i < n; i++) {
            air.process(pink.next());
            float s = air.bp * ag;
            l[i] = lpL.lp(l[i] + s);
            r[i] = lpR.lp(r[i] + s);
        }
    }
}
