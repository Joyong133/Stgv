package com.joyong133.danjam.audio;

/**
 * 화이트·핑크·브라운·그린·그레이 노이즈. 좌우를 따로 만들어 넓게 들린다.
 * 그레이 노이즈는 귀가 덜 민감한 낮은 소리와 높은 소리를 키워 모든 높이가 비슷한 크기로 들리게 한다.
 */
public final class NoiseGen extends Generator {
    public static final int WHITE = 0, PINK = 1, BROWN = 2, GREEN = 3, GREY = 4;

    private final int type;
    private final PinkNoise pl, pr;
    private final BrownNoise bl, br;
    private final Rng rr = new Rng();
    private final Biquad hpL = new Biquad(), hpR = new Biquad(), gL = new Biquad(), gR = new Biquad();
    private final Biquad wL = new Biquad(), wR = new Biquad();
    private final Biquad lowL = new Biquad(), lowR = new Biquad(), midL = new Biquad(), midR = new Biquad(),
            highL = new Biquad(), highR = new Biquad();

    public NoiseGen(float sr, int type) {
        super(sr);
        this.type = type;
        pl = new PinkNoise(rng);
        pr = new PinkNoise(rr);
        bl = new BrownNoise(rng);
        br = new BrownNoise(rr);
        hpL.hp(sr, 25, 0.7f);
        hpR.hp(sr, 25, 0.7f);
        gL.bp(sr, 500, 0.55f);
        gR.bp(sr, 500, 0.55f);
        wL.lp(sr, 15000, 0.7f);
        wR.lp(sr, 15000, 0.7f);
        lowL.lowShelf(sr, 150, 9f);
        lowR.lowShelf(sr, 150, 9f);
        midL.peak(sr, 3200, 0.8f, -5f);
        midR.peak(sr, 3200, 0.8f, -5f);
        highL.highShelf(sr, 9000, 3f);
        highR.highShelf(sr, 9000, 3f);
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        switch (type) {
            case WHITE:
                for (int i = 0; i < n; i++) {
                    l[i] = wL.process(rng.bi()) * 0.35f;
                    r[i] = wR.process(rr.bi()) * 0.35f;
                }
                break;
            case PINK:
                for (int i = 0; i < n; i++) {
                    l[i] = pl.next();
                    r[i] = pr.next();
                }
                break;
            case BROWN:
                for (int i = 0; i < n; i++) {
                    l[i] = hpL.process(bl.next());
                    r[i] = hpR.process(br.next());
                }
                break;
            case GREY:
                for (int i = 0; i < n; i++) {
                    l[i] = highL.process(midL.process(lowL.process(hpL.process(pl.next())))) * 0.6f;
                    r[i] = highR.process(midR.process(lowR.process(hpR.process(pr.next())))) * 0.6f;
                }
                break;
            default:
                for (int i = 0; i < n; i++) {
                    l[i] = gL.process(pl.next()) * 2f;
                    r[i] = gR.process(pr.next()) * 2f;
                }
                break;
        }
    }
}
