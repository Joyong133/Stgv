package com.joyong133.danjam.audio;

/**
 * 빗소리 합성기. 여러 층을 조합해 이슬비부터 양철 지붕까지 다양한 비를 만든다.
 * <ul>
 * <li>바탕: 멀리서 쏟아지는 '쏴아' (필터 거친 핑크 노이즈 + 아주 가는 빗방울)</li>
 * <li>빗방울: 가까이 떨어지는 '톡톡' 충격음, 굵은 물방울</li>
 * <li>표면: 빗방울이 두드리는 양철판·유리·천막이 짧게 '팅'·'퉁' 울리는 소리</li>
 * <li>물방울: 웅덩이 기포, 처마 낙숫물, 유리창을 타고 흐르는 물줄기</li>
 * </ul>
 */
public final class RainGen extends Generator {

    /** 비 한 종류를 정의하는 값들. 세기는 서로의 상대값이며 최종 음량은 카탈로그에서 맞춘다. */
    public static final class Config {
        public float bed, bedHp = 300, bedLp = 7000, gust = 0.15f;
        public float fineRate, fine;
        public float dropRate, drop, dropTauMs = 1.5f, dropHp = 1200, dropLp = 9000;
        public float bigRate, big, bigTauMs = 6, bigLp = 2500;
        /** 빗방울마다 표면이 울리는 세기와 음높이 범위, 울림 길이(ms) */
        public float surf, surfLo, surfHi, surfTauLo, surfTauHi;
        /** 표면 전체가 '퉁' 하고 둔하게 울리는 세기와 중심 주파수 */
        public float body, bodyHz = 150;
        public float bubbleRate, bubble, bubbleLo = 800, bubbleHi = 3000, bubbleTauMs = 8, bubbleRise = 0.3f;
        public float trickleRate, trickle;
        public int dripSpots;
        public float drip, dripLo = 600, dripHi = 1600, dripPeriodLo = 0.6f, dripPeriodHi = 2f;
        public float rumble, rumbleLp = 150;
        public float outLp;
        public float reverb;
    }

    private final Config c;
    private final PinkNoise pinkL, pinkR;
    private final Biquad bedHpL = new Biquad(), bedHpR = new Biquad(), bedLpL = new Biquad(), bedLpR = new Biquad();
    private final Biquad dropHpL = new Biquad(), dropHpR = new Biquad(), dropLpL = new Biquad(), dropLpR = new Biquad();
    private final Biquad bigLpL = new Biquad(), bigLpR = new Biquad();
    private final Biquad outLpL = new Biquad(), outLpR = new Biquad();
    private final OnePole rumL, rumR;
    private final BrownNoise brownL, brownR;
    private final SmoothRandom gust;
    private final Clicks fine = new Clicks(48), drops = new Clicks(96), bigs = new Clicks(16);
    private final Rings surface;
    private final Biquad bodyL = new Biquad(), bodyR = new Biquad();
    private final Bubbles bubbles;

    private final float fineTau, dropTau, bigTau;
    private float fineWait, dropWait, bigWait, bubbleWait, trickleWait, trickleLeft, tricklePan, trickleNext;
    private final float[] dripWait, dripPeriod, dripHz, dripAmp, dripPan;

    public RainGen(float sr, Config c) {
        super(sr);
        this.c = c;
        reverbSend = c.reverb;
        pinkL = new PinkNoise(rng);
        pinkR = new PinkNoise(new Rng());
        bedHpL.hp(sr, c.bedHp, 0.707f);
        bedHpR.hp(sr, c.bedHp, 0.707f);
        bedLpL.lp(sr, c.bedLp, 0.707f);
        bedLpR.lp(sr, c.bedLp, 0.707f);
        dropHpL.hp(sr, c.dropHp, 0.707f);
        dropHpR.hp(sr, c.dropHp, 0.707f);
        dropLpL.lp(sr, c.dropLp, 0.707f);
        dropLpR.lp(sr, c.dropLp, 0.707f);
        bigLpL.lp(sr, c.bigLp, 0.8f);
        bigLpR.lp(sr, c.bigLp, 0.8f);
        if (c.outLp > 0) {
            outLpL.lp(sr, c.outLp, 0.707f);
            outLpR.lp(sr, c.outLp, 0.707f);
        }
        rumL = new OnePole(sr, c.rumbleLp);
        rumR = new OnePole(sr, c.rumbleLp);
        brownL = new BrownNoise(rng);
        brownR = new BrownNoise(new Rng());
        gust = new SmoothRandom(rng, -c.gust, c.gust, 1.5f, 5f);
        fineTau = 0.00035f * sr;
        dropTau = c.dropTauMs * 0.001f * sr;
        bigTau = c.bigTauMs * 0.001f * sr;

        surface = c.surf > 0 ? new Rings(sr, 96) : null;
        bodyL.bp(sr, c.bodyHz, 1.8f);
        bodyR.bp(sr, c.bodyHz * 1.15f, 1.8f);
        bubbles = new Bubbles(sr, 48);
        dripWait = new float[c.dripSpots];
        dripPeriod = new float[c.dripSpots];
        dripHz = new float[c.dripSpots];
        dripAmp = new float[c.dripSpots];
        dripPan = new float[c.dripSpots];
        for (int d = 0; d < c.dripSpots; d++) {
            dripPeriod[d] = rng.range(c.dripPeriodLo, c.dripPeriodHi) * sr;
            dripWait[d] = rng.uni() * dripPeriod[d];
            dripHz[d] = rng.logRange(c.dripLo, c.dripHi);
            dripAmp[d] = rng.range(0.5f, 1f);
            dripPan[d] = rng.range(-0.7f, 0.7f);
        }
        fineWait = dropWait = bigWait = bubbleWait = 1;
        trickleWait = rng.uni() * 3 * sr;
    }

    private float wait(float ratePerSec) {
        return rng.exp(sr / ratePerSec);
    }

    /** 빗방울 하나가 표면을 울린다: 매번 다른 높이로 짧게 울려 한 음으로 웅웅거리지 않는다. */
    private void ring(float a, float pan) {
        if (surface == null) return;
        surface.add(rng.logRange(c.surfLo, c.surfHi), rng.range(c.surfTauLo, c.surfTauHi), a * c.surf, pan);
        if (rng.chance(0.5f)) {
            surface.add(rng.logRange(c.surfLo, c.surfHi), rng.range(c.surfTauLo, c.surfTauHi) * 0.6f, a * c.surf * 0.5f, pan);
        }
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float g = 1f + gust.step(n / sr);
        float bedGain = c.bed * g;

        for (int i = 0; i < n; i++) {
            if (c.fineRate > 0 && --fineWait <= 0) {
                float u = rng.uni();
                fine.add(c.fine * u * u, fineTau * rng.range(0.6f, 1.6f), rng.bi(), -1);
                fineWait += wait(c.fineRate * g);
            }
            if (c.dropRate > 0 && --dropWait <= 0) {
                float u = rng.uni(), a = c.drop * u * u * u, pan = rng.bi() * 0.9f;
                drops.add(a, dropTau * rng.range(0.6f, 1.5f), pan, -1);
                ring(a, pan);
                dropWait += wait(c.dropRate * g);
            }
            if (c.bigRate > 0 && --bigWait <= 0) {
                float u = rng.uni(), a = c.big * (0.3f + 0.7f * u * u), pan = rng.bi() * 0.8f;
                bigs.add(a, bigTau * rng.range(0.7f, 1.4f), pan, -1);
                ring(a, pan);
                bigWait += wait(c.bigRate * g);
            }

            float n1 = rng.bi(), n2 = rng.bi(), n3 = rng.bi();

            float bl = pinkL.next() * bedGain, br = pinkR.next() * bedGain;
            if (!fine.idle()) {
                fine.tick(null);
                bl += fine.sumL * n1;
                br += fine.sumR * n1;
            }
            bl = bedLpL.process(bedHpL.process(bl));
            br = bedLpR.process(bedHpR.process(br));

            drops.tick(null);
            float dl = dropLpL.process(dropHpL.process(drops.sumL * n2));
            float dr = dropLpR.process(dropHpR.process(drops.sumR * n2));

            float gl = 0, gr = 0;
            if (c.bigRate > 0) {
                bigs.tick(null);
                gl = bigLpL.process(bigs.sumL * n3);
                gr = bigLpR.process(bigs.sumR * n3);
            }
            if (c.body > 0) {
                gl += bodyL.process((drops.sumL * n2 + bigs.sumL * n3) * c.body);
                gr += bodyR.process((drops.sumR * n2 + bigs.sumR * n3) * c.body);
            }
            l[i] = bl + dl + gl;
            r[i] = br + dr + gr;

            if (c.bubbleRate > 0 && --bubbleWait <= 0) {
                float u = rng.uni();
                float hz = rng.logRange(c.bubbleLo, c.bubbleHi);
                bubbles.add(hz, c.bubbleTauMs * rng.range(0.6f, 1.4f) * (float) Math.sqrt(1000f / hz),
                        c.bubbleRise * rng.range(0.5f, 1.5f), c.bubble * u * u, rng.bi() * 0.9f);
                bubbleWait += wait(c.bubbleRate * g);
            }
            if (c.trickleRate > 0) {
                if (trickleLeft > 0) {
                    trickleLeft--;
                    if (--trickleNext <= 0) {
                        bubbles.add(rng.logRange(1400, 3200), rng.range(3, 7), 0.6f, c.trickle * rng.range(0.3f, 1f), tricklePan);
                        trickleNext = rng.exp(sr / 28f);
                    }
                } else if (--trickleWait <= 0) {
                    trickleLeft = rng.range(0.6f, 2f) * sr;
                    tricklePan = rng.range(-0.8f, 0.8f);
                    trickleWait = wait(c.trickleRate);
                }
            }
            for (int d = 0; d < c.dripSpots; d++) {
                if (--dripWait[d] <= 0) {
                    float a = c.drip * dripAmp[d] * rng.range(0.6f, 1f);
                    bubbles.add(dripHz[d] * rng.range(0.94f, 1.06f), rng.range(14, 24), rng.range(0.5f, 0.9f), a, dripPan[d]);
                    drops.add(a * 0.25f, dropTau, dripPan[d], -1);
                    dripWait[d] = dripPeriod[d] * rng.range(0.85f, 1.15f);
                    if (rng.chance(0.08f)) dripPeriod[d] = rng.range(c.dripPeriodLo, c.dripPeriodHi) * sr;
                }
            }
        }

        bubbles.render(l, r, n);
        if (surface != null) surface.render(l, r, n);

        if (c.outLp > 0) {
            for (int i = 0; i < n; i++) {
                l[i] = outLpL.process(l[i]);
                r[i] = outLpR.process(r[i]);
            }
        }
        if (c.rumble > 0) {
            float rg = c.rumble * g;
            for (int i = 0; i < n; i++) {
                l[i] += rumL.lp(brownL.next()) * rg;
                r[i] += rumR.lp(brownR.next()) * rg;
            }
        }
    }

    // ---- 비 종류 ----

    public static Config drizzle() {
        Config c = new Config();
        c.bed = 0.35f; c.bedHp = 1500; c.bedLp = 10000; c.gust = 0.1f;
        c.fineRate = 3000; c.fine = 0.25f;
        c.dropRate = 20; c.drop = 0.6f; c.dropTauMs = 0.8f; c.dropHp = 2500; c.dropLp = 10000;
        return c;
    }

    public static Config light() {
        Config c = new Config();
        c.bed = 0.4f; c.bedHp = 600; c.bedLp = 9000; c.gust = 0.12f;
        c.fineRate = 2500; c.fine = 0.3f;
        c.dropRate = 40; c.drop = 0.9f; c.dropTauMs = 1.2f; c.dropHp = 1500; c.dropLp = 9000;
        c.bubbleRate = 4; c.bubble = 0.18f; c.bubbleLo = 1200; c.bubbleHi = 4000; c.bubbleTauMs = 6;
        return c;
    }

    public static Config steady() {
        Config c = new Config();
        c.bed = 0.6f; c.bedHp = 250; c.bedLp = 7000; c.gust = 0.15f;
        c.fineRate = 4000; c.fine = 0.35f;
        c.dropRate = 120; c.drop = 0.7f; c.dropTauMs = 1.6f; c.dropHp = 1000; c.dropLp = 8000;
        c.bubbleRate = 8; c.bubble = 0.12f; c.bubbleLo = 900; c.bubbleHi = 3500;
        return c;
    }

    public static Config heavy() {
        Config c = new Config();
        c.bed = 1f; c.bedHp = 120; c.bedLp = 5500; c.gust = 0.3f;
        c.fineRate = 8000; c.fine = 0.45f;
        c.dropRate = 500; c.drop = 0.55f; c.dropTauMs = 2.5f; c.dropHp = 600; c.dropLp = 6000;
        c.bigRate = 30; c.big = 0.5f; c.bigTauMs = 5; c.bigLp = 2000;
        c.bubbleRate = 20; c.bubble = 0.06f; c.bubbleLo = 600; c.bubbleHi = 2500;
        c.rumble = 0.35f; c.rumbleLp = 140;
        return c;
    }

    public static Config tinRoof() {
        Config c = new Config();
        c.bed = 0.22f; c.bedHp = 200; c.bedLp = 3000; c.gust = 0.15f;
        c.dropRate = 70; c.drop = 0.7f; c.dropTauMs = 0.6f; c.dropHp = 2500; c.dropLp = 10000;
        c.bigRate = 4; c.big = 1f; c.bigTauMs = 2; c.bigLp = 4000;
        c.surf = 0.5f; c.surfLo = 1200; c.surfHi = 6000; c.surfTauLo = 6; c.surfTauHi = 22;
        c.body = 7.5f; c.bodyHz = 180;
        return c;
    }

    public static Config window() {
        Config c = new Config();
        c.bed = 0.5f; c.bedHp = 150; c.bedLp = 1600; c.gust = 0.2f;
        c.dropRate = 35; c.drop = 1f; c.dropTauMs = 0.5f; c.dropHp = 3000; c.dropLp = 11000;
        c.surf = 0.3f; c.surfLo = 2500; c.surfHi = 7500; c.surfTauLo = 2; c.surfTauHi = 8;
        c.trickleRate = 0.15f; c.trickle = 0.12f;
        c.rumble = 0.15f; c.rumbleLp = 120;
        return c;
    }

    public static Config umbrella() {
        Config c = new Config();
        c.bed = 0.3f; c.bedHp = 400; c.bedLp = 7000;
        c.fineRate = 2000; c.fine = 0.2f;
        c.dropRate = 110; c.drop = 0.8f; c.dropTauMs = 2.5f; c.dropHp = 300; c.dropLp = 3500;
        c.surf = 0.32f; c.surfLo = 300; c.surfHi = 1100; c.surfTauLo = 4; c.surfTauHi = 12;
        c.body = 8f; c.bodyHz = 170;
        return c;
    }

    public static Config tent() {
        Config c = new Config();
        c.bed = 0.3f; c.bedHp = 200; c.bedLp = 2500;
        c.dropRate = 150; c.drop = 0.45f; c.dropTauMs = 3; c.dropHp = 200; c.dropLp = 2200;
        c.bigRate = 6; c.big = 0.6f; c.bigTauMs = 4; c.bigLp = 1500;
        c.surf = 0.26f; c.surfLo = 160; c.surfHi = 650; c.surfTauLo = 6; c.surfTauHi = 16;
        c.body = 8f; c.bodyHz = 110;
        return c;
    }

    public static Config forest() {
        Config c = new Config();
        c.bed = 0.55f; c.bedHp = 400; c.bedLp = 8000; c.gust = 0.25f;
        c.fineRate = 5000; c.fine = 0.4f;
        c.dropRate = 260; c.drop = 0.45f; c.dropTauMs = 4; c.dropHp = 1500; c.dropLp = 6000;
        c.bigRate = 3; c.big = 1.6f; c.bigTauMs = 8; c.bigLp = 1800;
        c.bubbleRate = 3; c.bubble = 0.05f; c.bubbleLo = 500; c.bubbleHi = 1800;
        c.reverb = 0.15f;
        return c;
    }

    public static Config eaves() {
        Config c = new Config();
        c.bed = 0.3f; c.bedHp = 500; c.bedLp = 6000;
        c.fineRate = 1500; c.fine = 0.2f;
        c.dropRate = 20; c.drop = 0.25f; c.dropTauMs = 1; c.dropHp = 1500; c.dropLp = 8000;
        c.dripSpots = 4; c.drip = 0.5f; c.dripLo = 500; c.dripHi = 1400; c.dripPeriodLo = 0.5f; c.dripPeriodHi = 2.2f;
        c.bubbleRate = 3; c.bubble = 0.06f; c.bubbleLo = 900; c.bubbleHi = 2500;
        c.reverb = 0.25f;
        return c;
    }

    public static Config car() {
        Config c = new Config();
        c.bed = 0.35f; c.bedHp = 100; c.bedLp = 700; c.gust = 0.2f;
        c.dropRate = 90; c.drop = 0.6f; c.dropTauMs = 0.5f; c.dropHp = 2000; c.dropLp = 6000;
        c.surf = 0.5f; c.surfLo = 300; c.surfHi = 1500; c.surfTauLo = 5; c.surfTauHi = 15;
        c.body = 15f; c.bodyHz = 95;
        c.rumble = 0.2f; c.rumbleLp = 110;
        c.outLp = 4500;
        return c;
    }

    public static Config puddle() {
        Config c = new Config();
        c.bed = 0.35f; c.bedHp = 500; c.bedLp = 8000;
        c.fineRate = 2000; c.fine = 0.25f;
        c.dropRate = 50; c.drop = 0.3f; c.dropTauMs = 1; c.dropHp = 1500; c.dropLp = 9000;
        c.bubbleRate = 35; c.bubble = 0.12f; c.bubbleLo = 500; c.bubbleHi = 3000; c.bubbleTauMs = 10; c.bubbleRise = 0.5f;
        c.reverb = 0.1f;
        return c;
    }
}
