package com.joyong133.danjam.audio;

/**
 * 밤 고속도로 드라이브: 차 안에서 듣는 고른 타이어·바람 소리와 엔진의 낮은 울림,
 * 가끔 이음매를 넘는 '덜컥-덜컥', 옆 차로를 지나가는 차.
 */
public final class CarDriveGen extends Generator {
    private final PinkNoise pl, pr;
    private final BrownNoise bl, br;
    private final Biquad roadL = new Biquad(), roadR = new Biquad(), lowHpL = new Biquad(), lowHpR = new Biquad();
    private final OnePole lowL, lowR;
    private final Biquad windL = new Biquad(), windR = new Biquad();
    private final SmoothRandom surface, rpm;
    private final Modal joint;
    private final Svf pass = new Svf();
    private final PinkNoise passNoise;
    private float ph, jointWait, secondJoint = -1, passT = -1, passLen, passDir, passWait;

    public CarDriveGen(float sr) {
        super(sr);
        pl = new PinkNoise(rng);
        pr = new PinkNoise(new Rng());
        bl = new BrownNoise(new Rng());
        br = new BrownNoise(new Rng());
        roadL.lp(sr, 900, 0.7f);
        roadR.lp(sr, 850, 0.7f);
        lowL = new OnePole(sr, 220);
        lowR = new OnePole(sr, 230);
        lowHpL.hp(sr, 45, 0.7f);
        lowHpR.hp(sr, 45, 0.7f);
        windL.bp(sr, 2200, 0.6f);
        windR.bp(sr, 2400, 0.6f);
        surface = new SmoothRandom(rng, 0.8f, 1.15f, 6f, 20f);
        rpm = new SmoothRandom(rng, 0.97f, 1.03f, 4f, 12f);
        joint = new Modal(3);
        joint.mode(0, sr, 85, 0.06f, 0.8f).mode(1, sr, 170, 0.04f, 0.5f).mode(2, sr, 340, 0.02f, 0.3f);
        passNoise = new PinkNoise(new Rng());
        jointWait = rng.range(5f, 15f) * sr;
        passWait = rng.range(8f, 25f);
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        float s = surface.step(dt);
        float inc = 70f * rpm.step(dt) / sr;
        float pe = 0, pl2 = 0, pr2 = 0;
        if (passT < 0) {
            passWait -= dt;
            if (passWait <= 0) {
                passT = 0;
                passLen = rng.range(2.5f, 5f);
                passDir = rng.chance(0.5f) ? 1f : -1f;
                passWait = rng.range(10f, 30f);
            }
        } else {
            float x = passT / passLen;
            pe = (float) Math.exp(-Math.pow((x - 0.5f) / 0.18f, 2)) * 0.5f;
            float pan = passDir * (x * 1.6f - 0.8f);
            pl2 = Sine.panL(pan) * pe;
            pr2 = Sine.panR(pan) * pe;
            pass.set(sr, 1100 - 600 * x, 0.8f);
            passT += dt;
            if (passT > passLen) passT = -1;
        }
        for (int i = 0; i < n; i++) {
            float exc = 0;
            if (--jointWait <= 0) {
                exc = rng.range(0.5f, 0.9f);
                secondJoint = 0.11f * sr;
                jointWait = rng.range(8f, 30f) * sr;
            }
            if (secondJoint > 0 && --secondJoint <= 0) exc = rng.range(0.4f, 0.7f);
            float a = pl.next(), b = pr.next();
            float engine = Sine.of(ph) * 0.06f + Sine.of(ph * 2f) * 0.04f + Sine.of(ph * 3f) * 0.015f;
            ph += inc;
            if (ph >= 1f) ph -= 1f;
            float th = joint.process(exc) * 0.6f;
            float vl = roadL.process(a) * 1.1f * s + lowHpL.process(lowL.lp(bl.next())) * 0.9f + windL.process(b) * 0.12f;
            float vr = roadR.process(b) * 1.1f * s + lowHpR.process(lowR.lp(br.next())) * 0.9f + windR.process(a) * 0.12f;
            if (pe > 0) {
                pass.process(passNoise.next());
                vl += pass.bp * pl2;
                vr += pass.bp * pr2;
            }
            l[i] = vl + engine + th;
            r[i] = vr + engine + th;
        }
    }
}
