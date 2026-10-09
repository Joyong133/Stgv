package com.joyong133.danjam.audio;

/** 화이트·핑크·브라운·그린 노이즈. 좌우를 따로 만들어 넓게 들린다. */
public final class NoiseGen extends Generator {
    public static final int WHITE = 0, PINK = 1, BROWN = 2, GREEN = 3;

    private final int type;
    private final PinkNoise pl, pr;
    private final BrownNoise bl, br;
    private final Rng rr = new Rng();
    private final Biquad hpL = new Biquad(), hpR = new Biquad(), gL = new Biquad(), gR = new Biquad();
    private final Biquad wL = new Biquad(), wR = new Biquad();

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
            default:
                for (int i = 0; i < n; i++) {
                    l[i] = gL.process(pl.next()) * 2f;
                    r[i] = gR.process(pr.next()) * 2f;
                }
                break;
        }
    }
}
