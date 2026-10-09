package com.joyong133.danjam.audio;

/** 소리 하나를 실시간으로 합성하는 발생기. */
public abstract class Generator {
    protected final float sr;
    protected final Rng rng = new Rng();
    /** 공용 리버브로 보내는 양 (0~1). */
    public float reverbSend;

    protected Generator(float sr) {
        this.sr = sr;
    }

    /** n 프레임(최대 {@link Mixer#BLOCK})을 l, r 에 덮어써서 채운다. */
    public abstract void render(float[] l, float[] r, int n);

    /** 초 → 샘플 수 */
    protected final int samples(float sec) {
        return Math.max(1, (int) (sec * sr));
    }
}
