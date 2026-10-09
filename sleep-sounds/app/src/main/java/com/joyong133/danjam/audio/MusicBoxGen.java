package com.joyong133.danjam.audio;

/** 오르골 자장가: 브람스의 자장가와 반짝반짝 작은 별을 천천히 번갈아 연주한다. */
public final class MusicBoxGen extends Generator {
    /** 음 이름: C4=60 기준 MIDI 번호, 길이는 8분음표 단위. */
    private static final int[] BRAHMS = {
            64, 1, 64, 1,
            67, 3, 64, 1, 64, 2,
            67, 4, 64, 1, 67, 1,
            72, 2, 71, 2, 69, 2,
            69, 2, 67, 2, 62, 1, 64, 1,
            65, 2, 62, 2, 62, 1, 64, 1,
            65, 4, 62, 1, 65, 1,
            71, 1, 69, 1, 67, 2, 71, 2,
            72, 4, 60, 1, 60, 1,
            72, 3, 69, 1, 65, 2,
            67, 4, 64, 1, 60, 1,
            65, 2, 67, 2, 69, 2,
            67, 4, 60, 1, 60, 1,
            72, 3, 69, 1, 65, 2,
            67, 4, 64, 1, 60, 1,
            65, 2, 64, 2, 62, 2,
            60, 6};
    /** 마디 첫 박에 넣는 낮은 음 (8분음표 위치, MIDI) */
    private static final int[] BRAHMS_BASS = {2, 48, 8, 48, 26, 43, 32, 43, 38, 43, 44, 48, 50, 41, 56, 48, 62, 41,
            68, 48, 74, 41, 80, 48, 86, 43, 92, 48};
    private static final int[] TWINKLE = {
            60, 2, 60, 2, 67, 2, 67, 2, 69, 2, 69, 2, 67, 4,
            65, 2, 65, 2, 64, 2, 64, 2, 62, 2, 62, 2, 60, 4,
            67, 2, 67, 2, 65, 2, 65, 2, 64, 2, 64, 2, 62, 4,
            67, 2, 67, 2, 65, 2, 65, 2, 64, 2, 64, 2, 62, 4,
            60, 2, 60, 2, 67, 2, 67, 2, 69, 2, 69, 2, 67, 4,
            65, 2, 65, 2, 64, 2, 64, 2, 62, 2, 62, 2, 60, 4};
    private static final int[] TWINKLE_BASS = {0, 48, 8, 41, 12, 48, 16, 41, 20, 48, 24, 43, 28, 48, 32, 48, 36, 41,
            40, 48, 44, 43, 48, 48, 52, 41, 56, 48, 60, 43, 64, 48, 72, 41, 76, 48, 80, 41, 84, 48, 88, 43, 92, 48};

    private final Rings tines;
    private int song, index, bassIndex;
    private float step, wait, pos;

    public MusicBoxGen(float sr) {
        super(sr);
        tines = new Rings(sr, 64);
        tines.floor = 4e-4f;
        reverbSend = 0.3f;
        startSong(0);
        wait = 0.4f * sr;
    }

    private void startSong(int s) {
        song = s;
        index = 0;
        bassIndex = 0;
        pos = 0;
        step = (s == 0 ? 0.36f : 0.3f) * sr;
    }

    private void pluck(int midi, float a, float pan) {
        float hz = (float) (440.0 * Math.pow(2, (midi - 69) / 12.0));
        float tau = 1100f * (float) Math.pow(523.25f / hz, 0.6f);
        tines.add(hz, tau, a, pan);
        tines.add(hz * 2f, tau * 0.45f, a * 0.14f, pan);
        tines.add(hz * 3f, tau * 0.25f, a * 0.05f, pan);
        tines.add(hz * 5.4f, 25f, a * 0.12f, pan);
    }

    @Override
    public void render(float[] l, float[] r, int n) {
        int[] notes = song == 0 ? BRAHMS : TWINKLE;
        int[] bass = song == 0 ? BRAHMS_BASS : TWINKLE_BASS;
        for (int i = 0; i < n; i++) {
            l[i] = r[i] = 0;
            if (--wait > 0) continue;
            if (index >= notes.length) {
                startSong(1 - song);
                wait = 3.5f * sr;
                notes = song == 0 ? BRAHMS : TWINKLE;
                bass = song == 0 ? BRAHMS_BASS : TWINKLE_BASS;
                continue;
            }
            // 한 옥타브 올려 오르골 음역으로
            pluck(notes[index] + 12, 0.16f * rng.range(0.9f, 1f), 0.15f);
            while (bassIndex < bass.length && bass[bassIndex] <= pos) {
                pluck(bass[bassIndex + 1] + 12, 0.08f, -0.25f);
                bassIndex += 2;
            }
            float len = notes[index + 1];
            pos += len;
            index += 2;
            wait = len * step * rng.range(0.98f, 1.02f);
        }
        tines.render(l, r, n);
    }
}
