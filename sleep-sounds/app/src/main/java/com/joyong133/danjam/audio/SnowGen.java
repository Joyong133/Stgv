package com.joyong133.danjam.audio;

/**
 * 눈 내리는 밤: 소리가 눈에 묻혀 고요한 밤. 아주 낮게 흐르는 바람, 눈송이가 내려앉는 희미한 '사락',
 * 가끔 나뭇가지에 쌓인 눈이 '스르륵- 툭' 하고 떨어진다.
 */
public final class SnowGen extends Generator {
    private final PinkNoise windL, windR;
    private final Svf wl = new Svf(), wr = new Svf();
    private final Biquad flakeL = new Biquad(), flakeR = new Biquad();
    private final SmoothRandom gust, flakes;
    private final Svf slide = new Svf();
    private final PinkNoise slideNoise;
    private final Bubbles thud;
    private float slideT = -1, slideLen, slidePan, slideAmp, wait;

    public SnowGen(float sr) {
        super(sr);
        windL = new PinkNoise(rng);
        windR = new PinkNoise(new Rng());
        wl.set(sr, 320, 0.7f);
        wr.set(sr, 380, 0.7f);
        flakeL.hp(sr, 5000, 0.7f);
        flakeR.hp(sr, 5000, 0.7f);
        gust = new SmoothRandom(rng, 0.3f, 1f, 3f, 9f);
        flakes = new SmoothRandom(rng, 0.4f, 1f, 2f, 6f);
        slideNoise = new PinkNoise(new Rng());
        thud = new Bubbles(sr, 8);
        wait = rng.range(3f, 8f);
        reverbSend = 0.35f;
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float dt = n / sr;
        float g = gust.step(dt) * 0.5f, f = flakes.step(dt) * 0.012f;
        if (slideT < 0) {
            wait -= dt;
            if (wait <= 0) {
                slideT = 0;
                slideLen = rng.range(0.4f, 1.1f);
                slidePan = rng.range(-0.8f, 0.8f);
                slideAmp = rng.range(0.25f, 0.6f);
                wait = rng.range(8f, 25f);
            }
        }
        float se = 0;
        if (slideT >= 0) {
            float x = slideT / slideLen;
            se = x < 1f ? (float) Math.sin(Math.PI * x) * slideAmp : 0f;
            slide.set(sr, 900 + 900 * x, 0.6f);
            slideT += dt;
            if (slideT >= slideLen) {
                thud.add(rng.range(70, 120), 70, -0.2f, slideAmp * 0.8f, slidePan);
                slideT = -1;
            }
        }
        float sl = Sine.panL(slidePan) * se, sr2 = Sine.panR(slidePan) * se;
        for (int i = 0; i < n; i++) {
            wl.process(windL.next());
            wr.process(windR.next());
            l[i] = wl.bp * g + flakeL.process(rng.bi()) * f;
            r[i] = wr.bp * g + flakeR.process(rng.bi()) * f;
            if (se > 0) {
                slide.process(slideNoise.next());
                l[i] += slide.lp * sl;
                r[i] += slide.lp * sr2;
            }
        }
        thud.render(l, r, n);
    }
}
