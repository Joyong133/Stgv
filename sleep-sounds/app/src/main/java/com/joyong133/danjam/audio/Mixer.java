package com.joyong133.danjam.audio;

/**
 * 여러 소리를 섞는 믹서. 오디오 스레드에서만 호출한다.
 * 소리마다 음량을 부드럽게 바꾸고, 공용 리버브와 리미터를 거쳐 내보낸다.
 */
public final class Mixer {
    public static final int BLOCK = 256;
    private static final int MAX = 48;
    private static final float LIMIT = 0.7f;

    private static final class Channel {
        String id;
        Generator gen;
        float gain, target, step;
        boolean removing;
    }

    private final float sr;
    private final Channel[] channels = new Channel[MAX];
    private int count;
    private final float[] tl = new float[BLOCK], tr = new float[BLOCK];
    private final float[] sendL = new float[BLOCK], sendR = new float[BLOCK];
    private final Reverb reverb;
    private int reverbTail;
    private float master, masterTarget, masterStep;
    private float limEnv;
    private final float limAttack, limRelease;

    public Mixer(float sr) {
        this.sr = sr;
        reverb = new Reverb(sr);
        limAttack = (float) Math.exp(-1.0 / (0.005 * sr));
        limRelease = (float) Math.exp(-1.0 / (0.3 * sr));
    }

    public float sampleRate() {
        return sr;
    }

    private Channel find(String id) {
        for (int i = 0; i < count; i++) if (channels[i].id.equals(id)) return channels[i];
        return null;
    }

    private static float stepFor(float from, float to, float sec, float sr) {
        float n = Math.max(1f, sec * sr);
        return (to - from) / n;
    }

    /** 소리를 켜거나 음량을 바꾼다. gain 은 최종 선형 이득. */
    public void set(String id, float gain, float fadeSec) {
        Channel c = find(id);
        if (c == null) {
            if (count == MAX) return;
            Generator g = SoundCatalog.create(id, sr);
            if (g == null) return;
            c = new Channel();
            c.id = id;
            c.gen = g;
            channels[count++] = c;
        }
        c.removing = false;
        c.target = gain;
        c.step = stepFor(c.gain, gain, fadeSec, sr);
    }

    /** 소리를 서서히 줄인 뒤 없앤다. */
    public void remove(String id, float fadeSec) {
        Channel c = find(id);
        if (c == null) return;
        c.removing = true;
        c.target = 0;
        c.step = stepFor(c.gain, 0, fadeSec, sr);
    }

    public void removeAll(float fadeSec) {
        for (int i = 0; i < count; i++) remove(channels[i].id, fadeSec);
    }

    /** 전체 음량 (재생·일시정지 페이드, 타이머 페이드아웃, 다른 앱 소리에 맞춰 줄이기). */
    public void setMaster(float target, float fadeSec) {
        masterTarget = target;
        masterStep = stepFor(master, target, fadeSec, sr);
    }

    public float master() {
        return master;
    }

    /** 전체 음량이 0에 도달해 더 이상 소리가 나지 않는 상태인지. */
    public boolean silent() {
        return master == 0f && masterTarget == 0f;
    }

    /** LIMIT 까지는 그대로, 그 위는 1.0 을 넘지 않게 둥글게 누른다. */
    private static float softClip(float x) {
        float ax = Math.abs(x);
        if (ax <= LIMIT) return x;
        float y = LIMIT + (1f - LIMIT) * Dsp.tanh((ax - LIMIT) / (1f - LIMIT));
        return x < 0 ? -y : y;
    }

    public void render(float[] outL, float[] outR, int n) {
        for (int i = 0; i < n; i++) {
            outL[i] = outR[i] = 0;
            sendL[i] = sendR[i] = 0;
        }
        boolean anySend = false;
        for (int c = 0; c < count; c++) {
            Channel ch = channels[c];
            if (ch.gain == 0f && ch.target == 0f) {
                if (ch.removing) {
                    count--;
                    channels[c] = channels[count];
                    channels[count] = null;
                    c--;
                }
                continue;
            }
            ch.gen.render(tl, tr, n);
            float g = ch.gain, t = ch.target, st = ch.step, send = ch.gen.reverbSend;
            for (int i = 0; i < n; i++) {
                if (g != t) {
                    g += st;
                    if ((st > 0 && g > t) || (st < 0 && g < t) || st == 0) g = t;
                }
                float a = tl[i] * g, b = tr[i] * g;
                outL[i] += a;
                outR[i] += b;
                if (send > 0) {
                    sendL[i] += a * send;
                    sendR[i] += b * send;
                }
            }
            ch.gain = g;
            if (send > 0) anySend = true;
        }
        if (anySend) reverbTail = (int) (6 * sr);
        if (reverbTail > 0) {
            reverb.process(sendL, sendR, outL, outR, n);
            reverbTail -= n;
        }

        float m = master;
        for (int i = 0; i < n; i++) {
            if (m != masterTarget) {
                m += masterStep;
                if ((masterStep > 0 && m > masterTarget) || (masterStep < 0 && m < masterTarget) || masterStep == 0)
                    m = masterTarget;
            }
            float a = outL[i] * m, b = outR[i] * m;
            // 계속 큰 소리는 천천히 줄이고, 장작 튀는 소리 같은 아주 짧은 순간은 부드럽게 깎는다
            float peak = Math.max(Math.abs(a), Math.abs(b));
            float k = peak > limEnv ? limAttack : limRelease;
            limEnv = limEnv * k + peak * (1 - k);
            if (limEnv > LIMIT) {
                float g = LIMIT / limEnv;
                a *= g;
                b *= g;
            }
            outL[i] = softClip(a);
            outR[i] = softClip(b);
        }
        master = m;
    }
}
