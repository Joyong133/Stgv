package com.joyong133.danjam.audio;

import java.util.HashMap;
import java.util.Map;

/**
 * 여러 소리를 섞는 믹서. 오디오 스레드에서만 호출한다.
 * 소리마다 음량을 부드럽게 바꾸고, 3D 공간에 놓고(이어폰용), 공용 리버브와 톤 조절,
 * 리미터를 거쳐 내보낸다.
 */
public final class Mixer {
    public static final int BLOCK = 256;
    private static final int MAX = 48;
    private static final float LIMIT = 0.7f;

    private static final class Channel {
        String id;
        Generator gen;
        Spatializer space;
        SmoothRandom drift;
        float gain, target, step, driftGain = 1f;
        boolean removing;
    }

    private final float sr;
    private final Channel[] channels = new Channel[MAX];
    private int count;
    private final float[] tl = new float[BLOCK], tr = new float[BLOCK], bl = new float[BLOCK], br = new float[BLOCK];
    private final float[] sendL = new float[BLOCK], sendR = new float[BLOCK];
    private final Reverb reverb;
    private int reverbTail;
    private float master, masterTarget, masterStep;
    private float volume = 1f, volumeTarget = 1f;
    private float limEnv;
    private final float limAttack, limRelease;

    private final Map<String, Place> places = new HashMap<>();
    private float spatial, spatialTarget;
    private int motion = Spatializer.SWAY;
    private float room = 0.5f;
    private boolean natural;
    private float tone;
    private final Biquad lowL = new Biquad(), lowR = new Biquad(), highL = new Biquad(), highR = new Biquad();

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

    private Place placeOf(String id) {
        Place p = places.get(id);
        if (p != null) return p;
        SoundCatalog.Sound s = SoundCatalog.get(id);
        return s == null ? null : s.place;
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
            Place p = placeOf(id);
            SoundCatalog.Sound s = SoundCatalog.get(id);
            if (p != null && s != null && s.spatial) {
                c.space = new Spatializer(sr, p);
                c.space.setMotion(motion);
            }
            c.drift = new SmoothRandom(new Rng(), 0.72f, 1.18f, 15f, 45f);
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

    /** 사용자가 정하는 전체 음량 (0~1). */
    public void setVolume(float v) {
        volumeTarget = Math.max(0f, Math.min(1f, v));
    }

    /** 3D 공간 음향 켜기/끄기 (부드럽게 바뀐다). */
    public void setSpatial(boolean on) {
        spatialTarget = on ? 1f : 0f;
    }

    /** 움직임: {@link Spatializer#STILL}, {@link Spatializer#SWAY}, {@link Spatializer#ORBIT}. */
    public void setMotion(int m) {
        motion = m;
        for (int i = 0; i < count; i++) if (channels[i].space != null) channels[i].space.setMotion(m);
    }

    /** 공간감 (0~1): 잔향의 양. */
    public void setRoom(float r) {
        room = Math.max(0f, Math.min(1f, r));
    }

    /** 소리 하나의 3D 자리. 아직 켜지지 않은 소리도 기억해 두었다가 켤 때 쓴다. null 이면 기본 자리. */
    public void setPlace(String id, Place p) {
        if (p == null) places.remove(id);
        else places.put(id, p);
        Channel c = find(id);
        if (c != null && c.space != null) c.space.setPlace(placeOf(id));
    }

    /** 소리마다 음량이 수십 초에 걸쳐 조금씩 오르내리게 할지. */
    public void setNatural(boolean on) {
        natural = on;
    }

    /** 톤: −1 부드럽게(높은 소리를 줄임) ~ 0 그대로 ~ 1 선명하게. */
    public void setTone(float t) {
        tone = Math.max(-1f, Math.min(1f, t));
        float hs = tone < 0 ? 9f * tone : 4f * tone;
        float ls = -2f * tone;
        highL.highShelf(sr, 2500, hs);
        highR.highShelf(sr, 2500, hs);
        lowL.lowShelf(sr, 220, ls);
        lowR.lowShelf(sr, 220, ls);
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
        float dt = n / sr;
        float s0 = spatial;
        if (spatial != spatialTarget) {
            float st = n / (0.4f * sr);
            spatial = spatialTarget > spatial ? Math.min(spatialTarget, spatial + st) : Math.max(spatialTarget, spatial - st);
        }
        float s1 = spatial;
        float sendScale = 0.4f + 1.2f * room;
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
            float send = ch.gen.reverbSend * sendScale;
            if (ch.space != null && (s0 > 0f || s1 > 0f)) {
                ch.space.process(tl, tr, bl, br, n);
                for (int i = 0; i < n; i++) {
                    float m = s0 + (s1 - s0) * i / n;
                    tl[i] += (bl[i] - tl[i]) * m;
                    tr[i] += (br[i] - tr[i]) * m;
                }
                // 3D 에서는 멀리 있는 소리일수록, 그리고 공간감만큼 잔향을 더해 머리 바깥에서 들리게 한다
                send += s1 * (send * (ch.space.distanceReverb() - 1f) + room * 0.06f);
            }
            float d0 = ch.driftGain, d1 = natural ? ch.drift.step(dt) : 1f;
            if (!natural && d0 != 1f) d1 = d0 + (1f - d0) * 0.05f;
            ch.driftGain = d1;
            float g = ch.gain, t = ch.target, st = ch.step;
            for (int i = 0; i < n; i++) {
                if (g != t) {
                    g += st;
                    if ((st > 0 && g > t) || (st < 0 && g < t) || st == 0) g = t;
                }
                float gg = g * (d0 + (d1 - d0) * i / n);
                float a = tl[i] * gg, b = tr[i] * gg;
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
        if (tone != 0f) {
            for (int i = 0; i < n; i++) {
                outL[i] = highL.process(lowL.process(outL[i]));
                outR[i] = highR.process(lowR.process(outR[i]));
            }
        }

        float m = master, v = volume;
        float vk = 1f - (float) Math.exp(-1.0 / (0.03 * sr));
        for (int i = 0; i < n; i++) {
            if (m != masterTarget) {
                m += masterStep;
                if ((masterStep > 0 && m > masterTarget) || (masterStep < 0 && m < masterTarget) || masterStep == 0)
                    m = masterTarget;
            }
            v += (volumeTarget - v) * vk;
            float a = outL[i] * m * v, b = outR[i] * m * v;
            // 계속 큰 소리는 천천히 줄이고, 장작 튀는 소리 같은 아주 짧은 순간은 부드럽게 깎는다
            float peak = Math.max(Math.abs(a), Math.abs(b));
            float k = peak > limEnv ? limAttack : limRelease;
            limEnv = limEnv * k + peak * (1 - k);
            if (limEnv > LIMIT) {
                float gl = LIMIT / limEnv;
                a *= gl;
                b *= gl;
            }
            outL[i] = softClip(a);
            outR[i] = softClip(b);
        }
        master = m;
        volume = v;
    }
}
