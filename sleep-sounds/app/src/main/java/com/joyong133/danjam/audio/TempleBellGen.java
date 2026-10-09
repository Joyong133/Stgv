package com.joyong133.danjam.audio;

/**
 * 산사의 범종: 당목이 종을 '쿵' 치면 깊은 울림이 길게 이어지며, 우리 종 특유의 맥놀이로
 * '우웅- 우웅-' 하고 천천히 숨을 쉬듯 커졌다 작아진다. 40~60초마다 한 번 친다.
 */
public final class TempleBellGen extends Generator {
    private static final float[] RATIO = {1f, 2.63f, 3.25f, 4.22f, 5.4f, 6.85f, 8.4f, 10.3f};
    private static final float[] AMP = {1f, 0.75f, 0.55f, 0.4f, 0.3f, 0.2f, 0.12f, 0.08f};
    private static final float[] DECAY = {45f, 22f, 16f, 12f, 8f, 6f, 4f, 3f};

    private final Rings partials;
    private final Bubbles thud;
    private final Clicks wood = new Clicks(4);
    private final Biquad woodLp = new Biquad();
    private final float fundamental;
    private float wait;

    public TempleBellGen(float sr) {
        super(sr);
        partials = new Rings(sr, 64);
        partials.floor = 1e-4f;
        thud = new Bubbles(sr, 4);
        woodLp.lp(sr, 600, 0.7f);
        fundamental = rng.range(62f, 72f);
        wait = 0.6f * sr;
        reverbSend = 0.35f;
    }

    private void strike() {
        float a = rng.range(0.85f, 1f) * 0.16f;
        for (int p = 0; p < RATIO.length; p++) {
            float hz = fundamental * RATIO[p];
            // 맥놀이: 조금 다른 두 음이 겹쳐 몇 초 주기로 울림이 커졌다 작아진다
            float beat = p == 0 ? rng.range(0.12f, 0.3f) : rng.range(0.25f, 0.9f);
            float tau = DECAY[p] * 1000f * rng.range(0.9f, 1.1f);
            partials.add(hz - beat / 2, tau, a * AMP[p] * 0.5f, -0.25f);
            partials.add(hz + beat / 2, tau, a * AMP[p] * 0.5f, 0.25f);
        }
        thud.add(rng.range(95, 120), 90, -0.3f, a * 1.2f, 0);
        wood.add(a * 2f, 0.03f * sr, 0, -1);
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        for (int i = 0; i < n; i++) {
            if (--wait <= 0) {
                strike();
                wait = rng.range(40f, 60f) * sr;
            }
            wood.tick(null);
            float w = woodLp.process(rng.bi() * wood.sumL);
            l[i] = w;
            r[i] = w;
        }
        partials.render(l, r, n);
        thud.render(l, r, n);
    }
}
