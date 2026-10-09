package com.joyong133.danjam.audio;

/**
 * 모닥불: 실제 장작불 녹음처럼 '타닥타닥' 밝은 튐 소리가 중심이고,
 * 그 밑에 불길의 부드러운 '화르륵'과 숯이 내는 잔잔한 '지직'이 깔린다. 가끔 '탁' 하고 터진다.
 */
public final class FireGen extends Generator {
    private final PinkNoise pnL, pnR;
    private final BrownNoise bn;
    private final Svf flameL = new Svf(), flameR = new Svf();
    private final OnePole lowLp;
    private final Biquad hissHp = new Biquad();
    private final Biquad crackHpL = new Biquad(), crackHpR = new Biquad(), crackLpL = new Biquad(), crackLpR = new Biquad();
    private final Biquad emberHp = new Biquad();
    private final SmoothRandom flicker, flicker2, burst;
    private final Clicks crackles = new Clicks(48), pops = new Clicks(8), embers = new Clicks(32);
    private final Modal wood;
    private final float[] woodSum = new float[1];
    private float wait = 1, popWait, emberWait = 1, burstLeft, burstGap, burstPan;

    public FireGen(float sr) {
        super(sr);
        pnL = new PinkNoise(rng);
        pnR = new PinkNoise(new Rng());
        bn = new BrownNoise(new Rng());
        flameL.set(sr, 380, 0.8f);
        flameR.set(sr, 420, 0.8f);
        lowLp = new OnePole(sr, 110);
        hissHp.hp(sr, 4000, 0.7f);
        crackHpL.hp(sr, 1500, 0.7f);
        crackHpR.hp(sr, 1500, 0.7f);
        crackLpL.lp(sr, 11000, 0.7f);
        crackLpR.lp(sr, 11000, 0.7f);
        emberHp.hp(sr, 2500, 0.7f);
        flicker = new SmoothRandom(rng, 0.45f, 1f, 0.08f, 0.35f);
        flicker2 = new SmoothRandom(rng, 0.2f, 1f, 0.05f, 0.2f);
        burst = new SmoothRandom(rng, 0.2f, 2.6f, 0.3f, 1.6f);
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
        float h = flicker2.step(dt) * 0.045f;
        float rate = 11f * burst.step(dt);
        for (int i = 0; i < n; i++) {
            if (burstLeft > 0) {
                if (--burstGap <= 0) {
                    float u = rng.uni();
                    crackles.add(1.5f * u * u, rng.range(0.08f, 0.45f) * 0.001f * sr, burstPan + rng.bi() * 0.08f, -1);
                    burstLeft--;
                    burstGap = rng.range(0.001f, 0.012f) * sr;
                }
            } else if (--wait <= 0) {
                burstLeft = 1 + rng.below(6);
                burstGap = 0;
                burstPan = rng.range(-0.4f, 0.4f);
                wait = rng.exp(sr / rate);
            }
            if (--popWait <= 0) {
                pops.add(rng.range(0.7f, 1f), rng.range(0.6f, 1.4f) * 0.001f * sr, rng.range(-0.3f, 0.3f), 0);
                popWait = rng.exp(4f * sr);
            }
            if (--emberWait <= 0) {
                // 숯불이 내는 아주 잔 '지직' 소리
                float u = rng.uni();
                embers.add(0.2f * u * u, rng.range(0.05f, 0.2f) * 0.001f * sr, rng.range(-0.5f, 0.5f), -1);
                emberWait = rng.exp(sr / 220f);
            }
            float fl = f0 + (f1 - f0) * i / n;
            flameL.process(pnL.next());
            flameR.process(pnR.next());
            float low = lowLp.lp(bn.next()) * 0.5f * fl;
            float flame = 0.3f * fl;
            float hiss = hissHp.process(rng.bi()) * h;
            crackles.tick(null);
            embers.tick(null);
            woodSum[0] = 0;
            pops.tick(woodSum);
            float nz = rng.bi();
            float cl = crackLpL.process(crackHpL.process((crackles.sumL + pops.sumL * 0.6f) * nz));
            float cr = crackLpR.process(crackHpR.process((crackles.sumR + pops.sumR * 0.6f) * nz));
            float em = emberHp.process(rng.bi() * (embers.sumL + embers.sumR));
            float knock = wood.process(woodSum[0] * nz) * 0.2f;
            l[i] = flameL.bp * flame + low + hiss + cl + em + knock;
            r[i] = flameR.bp * flame + low + hiss + cr + em + knock;
        }
    }
}
