package com.joyong133.danjam.audio;

/**
 * 빗소리 합성기. 여러 층을 조합해 이슬비부터 양철 지붕까지 다양한 비를 만든다.
 * <ul>
 * <li>바탕: 멀리서 쏟아지는 '쏴아' (필터 거친 핑크 노이즈 + 아주 가는 빗방울)</li>
 * <li>빗방울: 가까이 떨어지는 '톡톡' 충격음 (방울마다 음색이 조금씩 다르다), 굵은 물방울</li>
 * <li>표면: 빗방울이 두드리는 양철판·유리·천막이 짧게 '팅'·'퉁' 울리는 소리</li>
 * <li>물방울: 웅덩이 기포, 처마 낙숫물, 유리창을 타고 흐르는 물줄기</li>
 * </ul>
 */
public final class RainGen extends Generator {

    /** 비 한 종류를 정의하는 값들. 세기는 서로의 상대값이며 최종 음량은 카탈로그에서 맞춘다. */
    public static final class Config {
        /** 실제 빗소리처럼 핑크 노이즈를 200Hz~7kHz 로 거른 바탕. gust 는 수 초, surge 는 1초 안팎의 세기 변화 */
        public float bed, bedHp = 200, bedLp = 7000, gust = 0.15f, surge = 0.12f;
        public float fineRate, fine;
        public float dropRate, drop, dropTauMs = 1.5f, dropHp = 1200, dropLp = 9000;
        /** 빗방울마다 붙는 짧은 공명 ('톡'·'탁' 음색). tickLo~tickHi 사이에서 매번 다르게 고른다 */
        public float tick, tickLo = 1200, tickHi = 6000;
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
        /** 소나기처럼 수십 초 단위로 몰려왔다 잦아드는 정도 (0이면 없음) */
        public float swell;
        /** 젖은 길을 지나가는 자동차 (초당 대수)와 세기 */
        public float carRate, car;
    }

    private static final int CARS = 3;

    private final Config c;
    private final PinkNoise pinkL, pinkR;
    private final Biquad bedHpL = new Biquad(), bedHpR = new Biquad(), bedLpL = new Biquad(), bedLpR = new Biquad();
    private final Biquad dropHpL = new Biquad(), dropHpR = new Biquad(), dropLpL = new Biquad(), dropLpR = new Biquad();
    private final Biquad bigLpL = new Biquad(), bigLpR = new Biquad();
    private final Biquad outLpL = new Biquad(), outLpR = new Biquad();
    private final OnePole rumL, rumR;
    private final BrownNoise brownL, brownR;
    private final SmoothRandom gust, surge, swell;
    private final PinkNoise carNoise;
    private final Svf[] carF = new Svf[CARS];
    private final Biquad carHiss = new Biquad();
    private final float[] carT = new float[CARS], carLen = new float[CARS], carAmp = new float[CARS], carDir = new float[CARS];
    private float carWait;
    private final Clicks fine = new Clicks(48), drops = new Clicks(96), bigs = new Clicks(16);
    private final Rings surface, ticks;
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
        surge = new SmoothRandom(rng, -c.surge, c.surge, 0.3f, 1.2f);
        swell = new SmoothRandom(rng, 0f, 1f, 8f, 25f);
        carNoise = new PinkNoise(new Rng());
        for (int k = 0; k < CARS; k++) {
            carF[k] = new Svf();
            carT[k] = -1;
        }
        carHiss.hp(sr, 2500, 0.7f);
        carWait = rng.range(1f, 6f);
        fineTau = 0.00035f * sr;
        dropTau = c.dropTauMs * 0.001f * sr;
        bigTau = c.bigTauMs * 0.001f * sr;

        surface = c.surf > 0 ? new Rings(sr, 96) : null;
        ticks = c.tick > 0 ? new Rings(sr, 48) : null;
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
        if (ticks != null) ticks.add(rng.logRange(c.tickLo, c.tickHi), rng.range(0.35f, 1.3f), a * c.tick, pan);
        if (surface == null) return;
        surface.add(rng.logRange(c.surfLo, c.surfHi), rng.range(c.surfTauLo, c.surfTauHi), a * c.surf, pan);
        if (rng.chance(0.5f)) {
            surface.add(rng.logRange(c.surfLo, c.surfHi), rng.range(c.surfTauLo, c.surfTauHi) * 0.6f, a * c.surf * 0.5f, pan);
        }
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        float g = Math.max(0.2f, 1f + gust.step(n / sr) + surge.step(n / sr));
        if (c.swell > 0) {
            float v = swell.step(n / sr);
            g *= 1f + c.swell * (0.3f + 1.4f * v * v - 1f);
        }
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
        if (ticks != null) ticks.render(l, r, n);

        if (c.outLp > 0) {
            for (int i = 0; i < n; i++) {
                l[i] = outLpL.process(l[i]);
                r[i] = outLpR.process(r[i]);
            }
        }
        if (c.carRate > 0) renderCars(l, r, n);
        if (c.rumble > 0) {
            float rg = c.rumble * g;
            for (int i = 0; i < n; i++) {
                l[i] += rumL.lp(brownL.next()) * rg;
                r[i] += rumR.lp(brownR.next()) * rg;
            }
        }
    }

    /** 빗길을 '쏴아-' 하고 지나가는 자동차: 다가오며 커지고 높아졌다가 멀어지며 낮아진다. */
    private void renderCars(float[] l, float[] r, int n) {
        float dt = n / sr;
        carWait -= dt;
        if (carWait <= 0) {
            for (int k = 0; k < CARS; k++) {
                if (carT[k] < 0) {
                    carT[k] = 0;
                    carLen[k] = rng.range(3f, 7f);
                    carAmp[k] = c.car * rng.range(0.4f, 1f);
                    carDir[k] = rng.chance(0.5f) ? 1f : -1f;
                    break;
                }
            }
            carWait = rng.exp(1f / c.carRate);
        }
        for (int k = 0; k < CARS; k++) {
            if (carT[k] < 0) continue;
            float x = carT[k] / carLen[k];
            float e0 = (float) Math.exp(-Math.pow((x - 0.5f) / 0.17f, 2));
            float pan = carDir[k] * (x * 1.8f - 0.9f);
            float gl = Sine.panL(pan) * e0 * carAmp[k], gr = Sine.panR(pan) * e0 * carAmp[k];
            carF[k].set(sr, 1500 - 900 * x, 0.8f);
            for (int i = 0; i < n; i++) {
                float nz = carNoise.next();
                carF[k].process(nz);
                float v = carF[k].bp * 2.2f + carHiss.process(nz) * 0.6f;
                l[i] += v * gl;
                r[i] += v * gr;
            }
            carT[k] += dt;
            if (carT[k] > carLen[k]) carT[k] = -1;
        }
    }

    // ---- 비 종류 ----

    public static Config drizzle() {
        Config c = new Config();
        c.bed = 0.4f; c.bedHp = 250; c.bedLp = 6500; c.gust = 0.4f; c.surge = 0.22f;
        c.fineRate = 2200; c.fine = 0.12f;
        c.dropRate = 30; c.drop = 0.5f; c.dropTauMs = 0.8f; c.dropHp = 700; c.dropLp = 6000;
        c.tick = 0.25f; c.tickLo = 1500; c.tickHi = 5000;
        return c;
    }

    public static Config light() {
        Config c = new Config();
        c.bed = 0.4f; c.bedHp = 220; c.bedLp = 7000; c.gust = 0.4f; c.surge = 0.22f;
        c.fineRate = 2000; c.fine = 0.15f;
        c.dropRate = 70; c.drop = 0.85f; c.dropTauMs = 1.2f; c.dropHp = 500; c.dropLp = 6500;
        c.tick = 0.3f; c.tickLo = 1000; c.tickHi = 5000;
        c.bubbleRate = 4; c.bubble = 0.15f; c.bubbleLo = 900; c.bubbleHi = 3200; c.bubbleTauMs = 6;
        return c;
    }

    public static Config steady() {
        Config c = new Config();
        c.bed = 0.6f; c.bedHp = 200; c.bedLp = 7000; c.gust = 0.35f;
        c.fineRate = 3500; c.fine = 0.25f;
        c.dropRate = 150; c.drop = 0.7f; c.dropTauMs = 1.6f; c.dropHp = 500; c.dropLp = 7000;
        c.tick = 0.25f; c.tickLo = 900; c.tickHi = 4500;
        c.bubbleRate = 8; c.bubble = 0.12f; c.bubbleLo = 900; c.bubbleHi = 3500;
        c.surge = 0.2f;
        return c;
    }

    public static Config heavy() {
        Config c = new Config();
        c.bed = 1f; c.bedHp = 120; c.bedLp = 5500; c.gust = 0.35f;
        c.fineRate = 8000; c.fine = 0.45f;
        c.dropRate = 500; c.drop = 0.55f; c.dropTauMs = 2.5f; c.dropHp = 600; c.dropLp = 6000;
        c.tick = 0.15f; c.tickLo = 900; c.tickHi = 4000;
        c.bigRate = 30; c.big = 0.5f; c.bigTauMs = 5; c.bigLp = 2000;
        c.bubbleRate = 20; c.bubble = 0.06f; c.bubbleLo = 600; c.bubbleHi = 2500;
        c.rumble = 0.35f; c.rumbleLp = 140;
        c.surge = 0.18f;
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
        c.bed = 0.3f; c.bedHp = 300; c.bedLp = 7000;
        c.fineRate = 2000; c.fine = 0.2f;
        c.dropRate = 110; c.drop = 0.8f; c.dropTauMs = 2.5f; c.dropHp = 300; c.dropLp = 3500;
        c.surf = 0.32f; c.surfLo = 300; c.surfHi = 1100; c.surfTauLo = 4; c.surfTauHi = 12;
        c.body = 8f; c.bodyHz = 170;
        c.gust = 0.35f;
        c.surge = 0.2f;
        return c;
    }

    public static Config tent() {
        Config c = new Config();
        c.bed = 0.3f; c.bedHp = 200; c.bedLp = 4000;
        c.dropRate = 150; c.drop = 0.5f; c.dropTauMs = 2.5f; c.dropHp = 300; c.dropLp = 4000;
        c.tick = 0.2f; c.tickLo = 600; c.tickHi = 2500;
        c.bigRate = 6; c.big = 0.6f; c.bigTauMs = 4; c.bigLp = 2000;
        c.surf = 0.24f; c.surfLo = 250; c.surfHi = 1200; c.surfTauLo = 5; c.surfTauHi = 14;
        c.body = 5f; c.bodyHz = 120;
        c.gust = 0.35f;
        c.surge = 0.2f;
        return c;
    }

    public static Config forest() {
        Config c = new Config();
        c.bed = 0.55f; c.bedHp = 250; c.bedLp = 6500; c.gust = 0.35f;
        c.fineRate = 3500; c.fine = 0.25f;
        c.dropRate = 260; c.drop = 0.45f; c.dropTauMs = 4; c.dropHp = 1200; c.dropLp = 5000;
        c.tick = 0.2f; c.tickLo = 800; c.tickHi = 4000;
        c.bigRate = 3; c.big = 1.6f; c.bigTauMs = 8; c.bigLp = 1800;
        c.bubbleRate = 3; c.bubble = 0.05f; c.bubbleLo = 500; c.bubbleHi = 1800;
        c.reverb = 0.15f;
        c.surge = 0.2f;
        return c;
    }

    public static Config eaves() {
        Config c = new Config();
        c.bed = 0.3f; c.bedHp = 250; c.bedLp = 6000;
        c.fineRate = 1500; c.fine = 0.15f;
        c.dropRate = 20; c.drop = 0.25f; c.dropTauMs = 1; c.dropHp = 1200; c.dropLp = 7000;
        c.dripSpots = 4; c.drip = 0.5f; c.dripLo = 500; c.dripHi = 1400; c.dripPeriodLo = 0.5f; c.dripPeriodHi = 2.2f;
        c.bubbleRate = 3; c.bubble = 0.06f; c.bubbleLo = 900; c.bubbleHi = 2500;
        c.reverb = 0.25f;
        c.gust = 0.35f;
        c.surge = 0.2f;
        return c;
    }

    public static Config car() {
        Config c = new Config();
        c.bed = 0.35f; c.bedHp = 100; c.bedLp = 1500; c.gust = 0.2f;
        c.dropRate = 90; c.drop = 0.9f; c.dropTauMs = 0.5f; c.dropHp = 2000; c.dropLp = 6500;
        c.tick = 0.4f; c.tickLo = 2500; c.tickHi = 6500;
        c.surf = 0.6f; c.surfLo = 400; c.surfHi = 3000; c.surfTauLo = 5; c.surfTauHi = 15;
        c.body = 6f; c.bodyHz = 110;
        c.rumble = 0.08f; c.rumbleLp = 110;
        c.outLp = 7000;
        return c;
    }

    public static Config puddle() {
        Config c = new Config();
        c.bed = 0.35f; c.bedHp = 250; c.bedLp = 7000;
        c.fineRate = 2000; c.fine = 0.15f;
        c.dropRate = 50; c.drop = 0.3f; c.dropTauMs = 1; c.dropHp = 1000; c.dropLp = 7000;
        c.bubbleRate = 35; c.bubble = 0.12f; c.bubbleLo = 500; c.bubbleHi = 3000; c.bubbleTauMs = 10; c.bubbleRise = 0.5f;
        c.reverb = 0.1f;
        c.gust = 0.35f;
        c.surge = 0.2f;
        return c;
    }

    public static Config shower() {
        Config c = new Config();
        c.bed = 0.9f; c.bedHp = 150; c.bedLp = 6000; c.gust = 0.3f; c.surge = 0.18f;
        c.swell = 1f;
        c.fineRate = 6000; c.fine = 0.4f;
        c.dropRate = 350; c.drop = 0.6f; c.dropTauMs = 2f; c.dropHp = 500; c.dropLp = 6500;
        c.tick = 0.2f; c.tickLo = 900; c.tickHi = 4500;
        c.bigRate = 15; c.big = 0.5f; c.bigTauMs = 5; c.bigLp = 2200;
        c.bubbleRate = 15; c.bubble = 0.07f; c.bubbleLo = 600; c.bubbleHi = 2500;
        c.rumble = 0.2f; c.rumbleLp = 140;
        return c;
    }

    public static Config tileRoof() {
        Config c = new Config();
        c.bed = 0.35f; c.bedHp = 250; c.bedLp = 5500; c.gust = 0.3f; c.surge = 0.18f;
        c.fineRate = 1500; c.fine = 0.12f;
        c.dropRate = 120; c.drop = 0.65f; c.dropTauMs = 0.8f; c.dropHp = 900; c.dropLp = 7000;
        c.tick = 0.4f; c.tickLo = 1500; c.tickHi = 4500;
        c.surf = 0.12f; c.surfLo = 2200; c.surfHi = 5500; c.surfTauLo = 2; c.surfTauHi = 5;
        c.trickleRate = 0.5f; c.trickle = 0.08f;
        c.dripSpots = 3; c.drip = 0.35f; c.dripLo = 600; c.dripHi = 1300; c.dripPeriodLo = 0.6f; c.dripPeriodHi = 1.8f;
        c.reverb = 0.15f;
        return c;
    }

    public static Config greenhouse() {
        Config c = new Config();
        c.bed = 0.3f; c.bedHp = 250; c.bedLp = 5000; c.gust = 0.3f; c.surge = 0.2f;
        c.dropRate = 220; c.drop = 0.7f; c.dropTauMs = 1.2f; c.dropHp = 500; c.dropLp = 6000;
        c.tick = 0.25f; c.tickLo = 1200; c.tickHi = 4000;
        c.surf = 0.22f; c.surfLo = 700; c.surfHi = 2600; c.surfTauLo = 3; c.surfTauHi = 8;
        c.body = 3f; c.bodyHz = 220;
        return c;
    }

    public static Config lake() {
        Config c = new Config();
        c.bed = 0.3f; c.bedHp = 300; c.bedLp = 6000; c.gust = 0.3f; c.surge = 0.2f;
        c.fineRate = 2500; c.fine = 0.15f;
        c.dropRate = 70; c.drop = 0.3f; c.dropTauMs = 0.8f; c.dropHp = 1200; c.dropLp = 7000;
        c.bubbleRate = 60; c.bubble = 0.1f; c.bubbleLo = 900; c.bubbleHi = 4000; c.bubbleTauMs = 6; c.bubbleRise = 0.5f;
        c.reverb = 0.22f;
        return c;
    }

    public static Config city() {
        Config c = new Config();
        c.bed = 0.55f; c.bedHp = 200; c.bedLp = 6500; c.gust = 0.25f;
        c.fineRate = 3000; c.fine = 0.2f;
        c.dropRate = 110; c.drop = 0.6f; c.dropTauMs = 1.4f; c.dropHp = 500; c.dropLp = 6500;
        c.tick = 0.2f; c.tickLo = 900; c.tickHi = 4500;
        c.carRate = 0.12f; c.car = 0.35f;
        c.rumble = 0.08f; c.rumbleLp = 120;
        c.reverb = 0.12f;
        return c;
    }

    public static Config cave() {
        Config c = new Config();
        c.bed = 0.05f; c.bedHp = 150; c.bedLp = 900; c.gust = 0.2f;
        c.dripSpots = 6; c.drip = 0.55f; c.dripLo = 500; c.dripHi = 2600; c.dripPeriodLo = 1.2f; c.dripPeriodHi = 4.5f;
        c.rumble = 0.05f; c.rumbleLp = 90;
        c.reverb = 0.65f;
        return c;
    }
}
