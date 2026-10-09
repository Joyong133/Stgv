package com.joyong133.danjam.audio;

/**
 * 소리 하나(스테레오)를 3D 공간의 자리에 놓는다.
 * <ul>
 * <li>폭이 좁으면 한 점 (벽시계, 부엉이)</li>
 * <li>보통은 왼쪽·오른쪽 신호를 자리 양옆의 두 점에 (모닥불, 파도)</li>
 * <li>폭이 200도 이상이면 앞뒤 네 점에 퍼뜨려 사방을 감싼다 (비, 바람). 뒤쪽은 조금 늦춰 앞쪽과 섞이지 않게 한다.</li>
 * </ul>
 * 움직임: 살랑살랑(자리 주변에서 천천히 흔들림), 감싸기(머리 둘레를 아주 천천히 돈다).
 */
public final class Spatializer {
    public static final int STILL = 0, SWAY = 1, ORBIT = 2;
    private static final int REAR_DELAY_L = 13, REAR_DELAY_R = 19; // ms

    private final float sr;
    private final PointSource[] points = new PointSource[4];
    private final float refDist;
    private Place place;
    private int motion;
    private final SmoothRandom swayAz, swayDist;
    private float orbit;
    private final float orbitSec;
    private final float[] mono = new float[Mixer.BLOCK], rl = new float[Mixer.BLOCK], rr = new float[Mixer.BLOCK];
    private final float[] lineL, lineR;
    private int lw;

    public Spatializer(float sr, Place home) {
        this.sr = sr;
        this.place = home;
        refDist = home.dist;
        for (int i = 0; i < 4; i++) points[i] = new PointSource(sr);
        Rng rng = new Rng();
        swayAz = new SmoothRandom(rng, -1f, 1f, 6f, 14f);
        swayDist = new SmoothRandom(rng, -1f, 1f, 8f, 18f);
        orbit = rng.uni() * 360f;
        orbitSec = rng.range(110f, 150f);
        lineL = new float[(int) (0.025f * sr) + Mixer.BLOCK];
        lineR = new float[lineL.length];
    }

    public void setPlace(Place p) {
        place = p;
    }

    public Place place() {
        return place;
    }

    public void setMotion(int m) {
        motion = m;
    }

    /** 자리에 따라 잔향을 얼마나 더 보낼지 (멀수록 조금 더 울린다). */
    public float distanceReverb() {
        return Math.max(0.8f, Math.min(1.5f, 0.8f + place.dist / 12f));
    }

    /** 스테레오로 들을 때와 체감 음량이 비슷하도록 맞추는 값 (측정해서 정했다) */
    private static final float NORM = 0.7f;

    /** inL/inR 을 두 귀 신호로 바꿔 outL/outR 에 덮어쓴다. */
    public void process(float[] inL, float[] inR, float[] outL, float[] outR, int n) {
        float dt = n / sr;
        float az = place.az, dist = place.dist;
        float sa = swayAz.step(dt), sd = swayDist.step(dt);
        if (motion == SWAY) {
            az += 14f * sa;
            dist *= 1f + 0.12f * sd;
        } else if (motion == ORBIT) {
            orbit += 360f * dt / orbitSec;
            if (orbit >= 360f) orbit -= 360f;
            az += orbit;
        }
        for (int i = 0; i < n; i++) outL[i] = outR[i] = 0;
        float w = place.width, el = place.el;
        if (w < 15f) {
            for (int i = 0; i < n; i++) mono[i] = (inL[i] + inR[i]) * 0.5f;
            points[0].set(az, el, dist, refDist);
            points[0].process(mono, outL, outR, n, 1.4f * NORM);
        } else if (w < 200f) {
            points[0].set(az - w / 2, el, dist, refDist);
            points[1].set(az + w / 2, el, dist, refDist);
            points[0].process(inL, outL, outR, n, NORM);
            points[1].process(inR, outL, outR, n, NORM);
        } else {
            // 사방에서 감싸기: 뒤쪽은 늦춘 신호로 앞쪽과 겹치지 않게
            int len = lineL.length, dl = (int) (REAR_DELAY_L * 0.001f * sr), dr = (int) (REAR_DELAY_R * 0.001f * sr);
            for (int i = 0; i < n; i++) {
                lineL[lw] = inL[i];
                lineR[lw] = inR[i];
                rl[i] = lineL[(lw - dl + len) % len];
                rr[i] = lineR[(lw - dr + len) % len];
                lw = (lw + 1) % len;
            }
            points[0].set(az - 45, el, dist, refDist);
            points[1].set(az + 45, el, dist, refDist);
            points[2].set(az - 135, el * 0.6f, dist, refDist);
            points[3].set(az + 135, el * 0.6f, dist, refDist);
            points[0].process(inL, outL, outR, n, 0.8f * NORM);
            points[1].process(inR, outL, outR, n, 0.8f * NORM);
            points[2].process(rr, outL, outR, n, 0.6f * NORM);
            points[3].process(rl, outL, outR, n, 0.6f * NORM);
        }
    }
}
