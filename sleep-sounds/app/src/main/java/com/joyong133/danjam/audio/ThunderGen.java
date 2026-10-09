package com.joyong133.danjam.audio;

/**
 * 천둥: 가끔씩 멀리서 또는 가까이서 우르르 울린다.
 * 실제 천둥 녹음처럼 힘이 100~500Hz 에 모이고 1kHz 위로는 서서히 사라진다.
 * 가까운 천둥은 하늘이 찢어지는 '파지직' 소리와 '콰광' 하는 첫 소리가 있다.
 */
public final class ThunderGen extends Generator {
    private static final int ROLLS = 7;

    private final PinkNoise pnL, pnR;
    private final Svf lpL = new Svf(), lpR = new Svf();
    private final Biquad hpL = new Biquad(), hpR = new Biquad();
    private final Biquad crackHp = new Biquad(), crackLp = new Biquad();
    private final Biquad ripBp = new Biquad();
    private final SmoothRandom flutter;
    private final Clicks rip = new Clicks(32);

    private float wait;
    private float t = -1f, len;
    private float level, cutoff, crack, pan, crackEnv, ripLeft, ripWait;
    private final float[] rollAt = new float[ROLLS], rollAmp = new float[ROLLS], rollTau = new float[ROLLS];
    private int rolls;

    public ThunderGen(float sr) {
        super(sr);
        pnL = new PinkNoise(rng);
        pnR = new PinkNoise(new Rng());
        hpL.hp(sr, 35, 0.7f);
        hpR.hp(sr, 35, 0.7f);
        flutter = new SmoothRandom(rng, 0.65f, 1.25f, 0.08f, 0.35f);
        ripBp.bp(sr, 1400, 0.7f);
        wait = 1.5f;
        reverbSend = 0.25f;
    }

    private void strike() {
        float near = rng.uni();
        near *= near;
        level = 0.45f + 0.55f * near;
        cutoff = 280 + 700 * near;
        crack = near > 0.45f ? (near - 0.3f) * 1.2f : 0f;
        pan = rng.range(-0.5f, 0.5f);
        rolls = 3 + rng.below(ROLLS - 2);
        float at = crack > 0 ? 0f : rng.range(0.1f, 0.6f);
        for (int k = 0; k < rolls; k++) {
            rollAt[k] = at;
            rollAmp[k] = (k == 0 ? 1f : rng.range(0.35f, 0.95f));
            rollTau[k] = rng.range(0.7f, 2.4f) * (1.3f - 0.5f * near);
            at += rng.range(0.3f, 1.2f);
        }
        len = at + 9f;
        t = 0;
        crackEnv = crack;
        ripLeft = crack > 0 ? rng.range(0.4f, 1.1f) * sr : 0;
        ripWait = 0;
        crackHp.hp(sr, 200, 0.7f);
        crackLp.lp(sr, 2500 + 2500 * near, 0.7f);
    }

    private float envelope(float time) {
        float e = 0;
        for (int k = 0; k < rolls; k++) {
            float d = time - rollAt[k];
            if (d < 0) continue;
            float atk = 0.15f + 0.12f * k;
            e += rollAmp[k] * (d < atk ? d / atk : (float) Math.exp(-(d - atk) / rollTau[k]));
        }
        return Math.min(e, 1.6f);
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        if (t < 0) {
            wait -= dt;
            if (wait <= 0) strike();
            for (int i = 0; i < n; i++) l[i] = r[i] = 0;
            if (t < 0) return;
        }
        float e0 = envelope(t) * level, e1 = envelope(t + dt) * level;
        float fl = flutter.step(dt);
        // 크게 울릴수록 밝아지고, 잦아들수록 낮게 깔린다
        float cut = cutoff * (0.55f + 0.45f * Math.min(1f, e0)) * (0.85f + 0.3f * fl);
        lpL.set(sr, cut, 0.65f);
        lpR.set(sr, cut * 1.08f, 0.65f);
        float gl = Sine.panL(pan) * 1.4f, gr = Sine.panR(pan) * 1.4f;
        float cdec = (float) Math.exp(-1.0 / (0.08 * sr));
        for (int i = 0; i < n; i++) {
            float e = (e0 + (e1 - e0) * i / n) * fl;
            lpL.process(pnL.next());
            lpR.process(pnR.next());
            float sl = hpL.process(lpL.lp) * 3.2f * e, srr = hpR.process(lpR.lp) * 3.2f * e;
            if (crackEnv > 1e-4f) {
                float c = crackLp.process(crackHp.process(rng.bi())) * crackEnv;
                crackEnv *= cdec;
                sl += c;
                srr += c;
            }
            if (ripLeft > 0) {
                // 하늘이 찢어지는 듯한 잔 파열음
                ripLeft--;
                if (--ripWait <= 0) {
                    float u = rng.uni();
                    rip.add(crack * 0.5f * u * u, rng.range(0.3f, 1.5f) * 0.001f * sr, rng.range(-0.5f, 0.5f), -1);
                    ripWait = rng.exp(sr / 140f);
                }
            }
            if (!rip.idle()) {
                rip.tick(null);
                float v = ripBp.process(rng.bi());
                sl += v * rip.sumL;
                srr += v * rip.sumR;
            }
            l[i] = sl * gl;
            r[i] = srr * gr;
        }
        t += dt;
        if (t > len) {
            t = -1;
            wait = rng.range(12f, 40f);
        }
    }
}
