package com.joyong133.danjam.audio;

/** 천둥: 가끔씩 멀리서 또는 가까이서 우르르 울린다. 가까운 천둥은 '콰광' 하는 첫 소리가 있다. */
public final class ThunderGen extends Generator {
    private static final int ROLLS = 7;

    private final BrownNoise bnL, bnR;
    private final Svf lpL = new Svf(), lpR = new Svf();
    private final Biquad crackHp = new Biquad(), crackLp = new Biquad();
    private final OnePole bodyL, bodyR;
    private final SmoothRandom flutter;

    private float wait;
    private float t = -1f, len;
    private float level, cutoff, crack, pan, crackEnv;
    private final float[] rollAt = new float[ROLLS], rollAmp = new float[ROLLS], rollTau = new float[ROLLS];
    private int rolls;

    public ThunderGen(float sr) {
        super(sr);
        bnL = new BrownNoise(rng);
        bnR = new BrownNoise(new Rng());
        bodyL = new OnePole(sr, 900);
        bodyR = new OnePole(sr, 900);
        flutter = new SmoothRandom(rng, 0.55f, 1.3f, 0.03f, 0.12f);
        wait = 1.5f;
        reverbSend = 0.2f;
    }

    private void strike() {
        float near = rng.uni();
        near *= near;
        level = 0.45f + 0.55f * near;
        cutoff = 90 + 260 * near;
        crack = near > 0.45f ? (near - 0.3f) * 1.4f : 0f;
        pan = rng.range(-0.5f, 0.5f);
        rolls = 3 + rng.below(ROLLS - 2);
        float at = crack > 0 ? 0f : rng.range(0.1f, 0.6f);
        for (int k = 0; k < rolls; k++) {
            rollAt[k] = at;
            rollAmp[k] = (k == 0 ? 1f : rng.range(0.35f, 0.95f));
            rollTau[k] = rng.range(0.6f, 2.2f) * (1.3f - 0.5f * near);
            at += rng.range(0.25f, 1.1f);
        }
        len = at + 9f;
        t = 0;
        crackEnv = crack;
        crackHp.hp(sr, 250, 0.7f);
        crackLp.lp(sr, 2500 + 3000 * near, 0.7f);
    }

    private float envelope(float time) {
        float e = 0;
        for (int k = 0; k < rolls; k++) {
            float d = time - rollAt[k];
            if (d < 0) continue;
            float atk = 0.12f + 0.1f * k;
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
        float cut = cutoff * (0.8f + 0.4f * fl);
        lpL.set(sr, cut, 0.9f);
        lpR.set(sr, cut * 1.07f, 0.9f);
        float gl = Sine.panL(pan) * 1.4f, gr = Sine.panR(pan) * 1.4f;
        float cdec = (float) Math.exp(-1.0 / (0.09 * sr));
        for (int i = 0; i < n; i++) {
            float e = (e0 + (e1 - e0) * i / n) * fl;
            float a = bnL.next(), b = bnR.next();
            lpL.process(a);
            lpR.process(b);
            float lo = lpL.lp * 2.2f, ro = lpR.lp * 2.2f;
            // 조금 더 높은 대역의 우르릉 (휴대폰 스피커에서도 들리도록)
            float midL = (a - bodyL.lp(a)) * 0.6f, midR = (b - bodyR.lp(b)) * 0.6f;
            float sl = (lo + midL * 0.25f) * e, srr = (ro + midR * 0.25f) * e;
            if (crackEnv > 1e-4f) {
                float c = crackLp.process(crackHp.process(rng.bi())) * crackEnv;
                crackEnv *= cdec;
                sl += c;
                srr += c;
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
