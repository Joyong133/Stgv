package com.joyong133.danjam.audio;

/** Freeverb 방식 스테레오 잔향 (콤 8개 + 올패스 4개). 공간감이 필요한 소리가 함께 쓴다. */
final class Reverb {
    private static final int[] COMBS = {1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617};
    private static final int[] ALLPASSES = {556, 441, 341, 225};
    private static final int SPREAD = 23;

    private final float[][] cbL = new float[8][], cbR = new float[8][];
    private final int[] ciL = new int[8], ciR = new int[8];
    private final float[] cfL = new float[8], cfR = new float[8];
    private final float[][] abL = new float[4][], abR = new float[4][];
    private final int[] aiL = new int[4], aiR = new int[4];
    private final float feedback = 0.86f, damp = 0.35f;

    Reverb(float sr) {
        float s = sr / 44100f;
        for (int i = 0; i < 8; i++) {
            cbL[i] = new float[(int) (COMBS[i] * s)];
            cbR[i] = new float[(int) ((COMBS[i] + SPREAD) * s)];
        }
        for (int i = 0; i < 4; i++) {
            abL[i] = new float[(int) (ALLPASSES[i] * s)];
            abR[i] = new float[(int) ((ALLPASSES[i] + SPREAD) * s)];
        }
    }

    /** inL/inR 을 받아 젖은 신호를 outL/outR 에 더한다. */
    void process(float[] inL, float[] inR, float[] outL, float[] outR, int n) {
        for (int s = 0; s < n; s++) {
            float in = (inL[s] + inR[s]) * 0.015f;
            float l = 0, r = 0;
            for (int i = 0; i < 8; i++) {
                float[] b = cbL[i];
                int p = ciL[i];
                float y = b[p];
                cfL[i] = y * (1 - damp) + cfL[i] * damp;
                b[p] = in + cfL[i] * feedback;
                ciL[i] = ++p == b.length ? 0 : p;
                l += y;

                b = cbR[i];
                p = ciR[i];
                y = b[p];
                cfR[i] = y * (1 - damp) + cfR[i] * damp;
                b[p] = in + cfR[i] * feedback;
                ciR[i] = ++p == b.length ? 0 : p;
                r += y;
            }
            for (int i = 0; i < 4; i++) {
                float[] b = abL[i];
                int p = aiL[i];
                float bo = b[p];
                b[p] = l + bo * 0.5f;
                l = bo - l;
                aiL[i] = ++p == b.length ? 0 : p;

                b = abR[i];
                p = aiR[i];
                bo = b[p];
                b[p] = r + bo * 0.5f;
                r = bo - r;
                aiR[i] = ++p == b.length ? 0 : p;
            }
            outL[s] += l * 3f;
            outR[s] += r * 3f;
        }
    }
}
