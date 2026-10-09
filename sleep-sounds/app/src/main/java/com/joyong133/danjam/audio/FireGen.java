package com.joyong133.danjam.audio;

/** 모닥불: 낮게 일렁이는 불길, '타닥타닥' 튀는 장작, 가끔 '탁' 하고 터지는 소리. */
public final class FireGen extends Generator {
    private final BrownNoise bl, br;
    private final OnePole roarL, roarR;
    private final Biquad hissHp = new Biquad();
    private final Biquad crackHpL = new Biquad(), crackHpR = new Biquad(), crackLpL = new Biquad(), crackLpR = new Biquad();
    private final SmoothRandom flicker, flicker2, burst;
    private final Clicks crackles = new Clicks(48), pops = new Clicks(8);
    private final Modal wood;
    private final float[] woodSum = new float[1];
    private float wait = 1, popWait, burstLeft, burstGap, burstPan;

    public FireGen(float sr) {
        super(sr);
        bl = new BrownNoise(rng);
        br = new BrownNoise(new Rng());
        roarL = new OnePole(sr, 320);
        roarR = new OnePole(sr, 300);
        hissHp.hp(sr, 3500, 0.7f);
        crackHpL.hp(sr, 900, 0.7f);
        crackHpR.hp(sr, 900, 0.7f);
        crackLpL.lp(sr, 7000, 0.7f);
        crackLpR.lp(sr, 7000, 0.7f);
        flicker = new SmoothRandom(rng, 0.45f, 1f, 0.08f, 0.35f);
        flicker2 = new SmoothRandom(rng, 0.2f, 1f, 0.05f, 0.2f);
        burst = new SmoothRandom(rng, 0.15f, 2.6f, 0.3f, 1.6f);
        wood = new Modal(3);
        wood.mode(0, sr, rng.range(650, 900), 0.012f, 0.6f)
                .mode(1, sr, rng.range(1300, 1700), 0.008f, 0.4f)
                .mode(2, sr, rng.range(2400, 3100), 0.005f, 0.3f);
        popWait = rng.range(1f, 4f) * sr;
        reverbSend = 0.06f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        float f0 = flicker.value, f1 = flicker.step(dt);
        float h = flicker2.step(dt) * 0.025f;
        float rate = 9f * burst.step(dt);
        for (int i = 0; i < n; i++) {
            if (burstLeft > 0) {
                if (--burstGap <= 0) {
                    float u = rng.uni();
                    crackles.add(0.9f * u * u, rng.range(0.12f, 0.5f) * 0.001f * sr, burstPan + rng.bi() * 0.08f, -1);
                    burstLeft--;
                    burstGap = rng.range(0.001f, 0.012f) * sr;
                }
            } else if (--wait <= 0) {
                burstLeft = 1 + rng.below(5);
                burstGap = 0;
                burstPan = rng.range(-0.4f, 0.4f);
                wait = rng.exp(sr / rate);
            }
            if (--popWait <= 0) {
                pops.add(rng.range(0.6f, 1f), rng.range(0.8f, 1.6f) * 0.001f * sr, rng.range(-0.3f, 0.3f), 0);
                popWait = rng.exp(4f * sr);
            }
            float fl = f0 + (f1 - f0) * i / n;
            float a = bl.next(), b = br.next();
            float roar = 1.4f * fl;
            float hiss = hissHp.process(rng.bi()) * h;
            crackles.tick(null);
            woodSum[0] = 0;
            pops.tick(woodSum);
            float nz = rng.bi();
            float cl = crackLpL.process(crackHpL.process((crackles.sumL + pops.sumL * 0.6f) * nz));
            float cr = crackLpR.process(crackHpR.process((crackles.sumR + pops.sumR * 0.6f) * nz));
            float knock = wood.process(woodSum[0] * nz) * 0.35f;
            l[i] = roarL.lp(a) * roar + hiss + cl + knock;
            r[i] = roarR.lp(b) * roar + hiss + cr + knock;
        }
    }
}
