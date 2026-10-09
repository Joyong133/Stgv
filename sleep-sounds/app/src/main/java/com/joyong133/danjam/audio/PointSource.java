package com.joyong133.danjam.audio;

/**
 * 머리 주변 한 점에서 나는 소리를 두 귀에 들리는 소리로 바꾼다 (이어폰용 바이노럴).
 * Brown·Duda 의 구형 머리 모델을 따른다:
 * <ul>
 * <li>두 귀에 닿는 시간 차 (최대 약 0.66ms)</li>
 * <li>머리 그림자: 반대편 귀는 높은 소리가 깎이고, 같은 편 귀는 살짝 밝아진다</li>
 * <li>귓바퀴 단서: 고도에 따라 7~10kHz 의 골이 움직이고, 뒤쪽 소리는 높은 소리가 줄어든다</li>
 * <li>거리: 멀수록 작아지고 공기가 높은 소리를 흡수한다</li>
 * </ul>
 * 매개변수는 블록마다 부드럽게 옮겨 가서 소리가 움직여도 끊기지 않는다.
 */
final class PointSource {
    private static final float HEAD = 0.0875f, SPEED = 343f;
    private static final int LINE = 256;

    private final float sr;
    private final float[] line = new float[LINE];
    private int w;
    private final Biquad notch = new Biquad(), rear = new Biquad();
    private final OnePole air = new OnePole();
    private float dL, dR, gain;
    private boolean primed;
    // 머리 그림자 1차 필터 (귀마다)
    private float lb0, lb1, la1, lx1, ly1, rb0, rb1, ra1, rx1, ry1;
    private float tdL, tdR, tGain;
    private float lastEl = Float.NaN, lastRear = Float.NaN, lastDist = Float.NaN;

    PointSource(float sr) {
        this.sr = sr;
    }

    /** 방위각·고도(도), 거리(m), 기준 거리(이 거리에서 음량 1). */
    void set(float azDeg, float elDeg, float dist, float refDist) {
        double az = Math.toRadians(azDeg), el = Math.toRadians(elDeg);
        double x = Math.cos(el) * Math.sin(az); // 오른쪽
        double y = Math.cos(el) * Math.cos(az); // 앞
        // 귀와 소리 방향 사이 각도
        double incR = Math.acos(Math.max(-1, Math.min(1, x)));
        double incL = Math.acos(Math.max(-1, Math.min(1, -x)));
        tdL = (float) (earDelay(incL) * sr);
        tdR = (float) (earDelay(incR) * sr);
        float[] c = shadow(incL);
        lb0 = c[0];
        lb1 = c[1];
        la1 = c[2];
        c = shadow(incR);
        rb0 = c[0];
        rb1 = c[1];
        ra1 = c[2];
        float d = Math.max(0.3f, dist);
        tGain = (float) Math.min(4.0, Math.pow(refDist / d, 0.9));
        float rearAmt = (float) Math.max(0, -y);
        if (Math.abs(elDeg - lastEl) > 0.5f || Math.abs(rearAmt - lastRear) > 0.01f) {
            float t = Math.max(0f, Math.min(1f, (elDeg + 30f) / 90f));
            notch.peak(sr, 7000 + 3000 * t, 2.5f, -8f);
            rear.highShelf(sr, 3000, -6f * rearAmt);
            lastEl = elDeg;
            lastRear = rearAmt;
        }
        if (Math.abs(d - lastDist) > 0.05f) {
            air.set(sr, 20000f / (1f + d / 8f));
            lastDist = d;
        }
        if (!primed) {
            dL = tdL;
            dR = tdR;
            gain = tGain;
            primed = true;
        }
    }

    /** 귀까지 늦게 닿는 시간 (초). 정면 쪽 귀는 0, 반대편 귀는 머리를 돌아가는 만큼 늦다. */
    private static double earDelay(double inc) {
        double a = HEAD / SPEED;
        return inc < Math.PI / 2 ? a * (1 - Math.cos(inc)) : a * (1 + inc - Math.PI / 2);
    }

    /** 머리 그림자 필터 계수 {b0, b1, a1}. 소리를 정면으로 받는 귀는 고역 +6dB, 가려진 귀는 −20dB 쯤. */
    private float[] shadow(double inc) {
        double deg = Math.toDegrees(inc);
        double alpha = 1.05 + 0.95 * Math.cos(Math.toRadians(deg / 150.0 * 180.0));
        double p = 2 * SPEED / HEAD, k = 2 * sr;
        double n = k + p;
        return new float[]{(float) ((alpha * k + p) / n), (float) ((p - alpha * k) / n), (float) ((p - k) / n)};
    }

    /** in 을 받아 두 귀 신호를 outL/outR 에 더한다. */
    void process(float[] in, float[] outL, float[] outR, int n, float level) {
        float sdL = (tdL - dL) / n, sdR = (tdR - dR) / n, sg = (tGain - gain) / n;
        for (int i = 0; i < n; i++) {
            float x = rear.process(notch.process(air.lp(in[i]))) * (gain + sg * i) * level;
            line[w] = x;
            float yl = read(dL + sdL * i), yr = read(dR + sdR * i);
            w = (w + 1) & (LINE - 1);
            float ol = lb0 * yl + lb1 * lx1 - la1 * ly1;
            lx1 = yl;
            ly1 = ol + Dsp.ANTI_DENORMAL - Dsp.ANTI_DENORMAL;
            float or = rb0 * yr + rb1 * rx1 - ra1 * ry1;
            rx1 = yr;
            ry1 = or + Dsp.ANTI_DENORMAL - Dsp.ANTI_DENORMAL;
            outL[i] += ol;
            outR[i] += or;
        }
        dL = tdL;
        dR = tdR;
        gain = tGain;
    }

    private float read(float delay) {
        float pos = w - delay;
        if (pos < 0) pos += LINE;
        int i0 = (int) pos;
        float f = pos - i0;
        int i1 = (i0 + 1) & (LINE - 1);
        return line[i0 & (LINE - 1)] * (1 - f) + line[i1] * f;
    }
}
