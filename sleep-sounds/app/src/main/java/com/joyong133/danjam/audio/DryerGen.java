package com.joyong133.danjam.audio;

/** 빨래 건조기: 고르게 도는 드럼의 웅웅거림, 더운 바람 소리, 빨래가 굴러 떨어지는 부드러운 '툭 툭'. */
public final class DryerGen extends Generator {
    private final PinkNoise pl, pr;
    private final Biquad airHpL = new Biquad(), airHpR = new Biquad(), airLpL = new Biquad(), airLpR = new Biquad();
    private final Bubbles thumps;
    private final Clicks clinks = new Clicks(4);
    private final Biquad clinkBp = new Biquad();
    private final float humInc;
    private float humPh, rot, tumbleWait;
    private final float rotInc;

    public DryerGen(float sr) {
        super(sr);
        pl = new PinkNoise(rng);
        pr = new PinkNoise(new Rng());
        airHpL.hp(sr, 140, 0.7f);
        airHpR.hp(sr, 150, 0.7f);
        airLpL.lp(sr, 3200, 0.7f);
        airLpR.lp(sr, 3000, 0.7f);
        thumps = new Bubbles(sr, 12);
        clinkBp.bp(sr, 3400, 4f);
        humInc = rng.range(96f, 104f) / sr;
        rotInc = rng.range(0.75f, 0.85f) / sr;
        tumbleWait = 0.4f * sr;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        for (int i = 0; i < n; i++) {
            if (--tumbleWait <= 0) {
                float a = rng.range(0.2f, 0.55f);
                float pan = rng.range(-0.3f, 0.3f);
                thumps.add(rng.range(75, 120), rng.range(35, 70), -0.25f, a, pan);
                thumps.add(rng.range(180, 260), rng.range(15, 25), -0.2f, a * 0.4f, pan);
                if (rng.chance(0.08f)) clinks.add(a * 0.3f, 0.004f * sr, pan, -1);
                // 드럼 한 바퀴에 두세 번 빨래가 떨어진다
                tumbleWait = sr / (rotInc * sr) / rng.range(2f, 3f) * rng.range(0.85f, 1.15f);
            }
            rot += rotInc;
            if (rot >= 1f) rot -= 1f;
            float am = 1f + 0.08f * Sine.of(rot);
            float hum = (Sine.of(humPh) * 0.05f + Sine.of(humPh * 2f) * 0.04f + Sine.of(humPh * 3f) * 0.015f);
            humPh += humInc;
            if (humPh >= 1f) humPh -= 1f;
            clinks.tick(null);
            float ck = clinkBp.process(rng.bi()) * clinks.sumL;
            l[i] = airLpL.process(airHpL.process(pl.next())) * 0.9f * am + hum + ck;
            r[i] = airLpR.process(airHpR.process(pr.next())) * 0.9f * am + hum + ck;
        }
        thumps.render(l, r, n);
    }
}
