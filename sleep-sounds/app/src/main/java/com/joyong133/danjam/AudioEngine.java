package com.joyong133.danjam;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Process;
import android.util.Log;

import com.joyong133.danjam.audio.Mixer;
import com.joyong133.danjam.audio.Place;

import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * 오디오 스레드: 믹서로 소리를 합성해 AudioTrack 에 계속 써 넣는다.
 * 다른 스레드는 명령만 큐에 넣고, 믹서는 이 스레드에서만 만진다.
 * 전체 음량이 0이 되면 AudioTrack 을 멈추고 다음 명령이 올 때까지 잠든다.
 */
final class AudioEngine implements Runnable {
    private static final String TAG = "AudioEngine";
    /** 한 번에 써 넣는 프레임 수 (약 21ms) */
    private static final int CHUNK = Mixer.BLOCK * 4;

    private static final int SET = 0, REMOVE = 1, REMOVE_ALL = 2, MASTER = 3, SPATIAL = 4, MOTION = 5, ROOM = 6,
            VOLUME = 7, TONE = 8, NATURAL = 9, PLACE = 10;

    private static final class Cmd {
        final int type;
        final String id;
        final float value, fade;
        final Place place;

        Cmd(int type, String id, float value, float fade) {
            this(type, id, value, fade, null);
        }

        Cmd(int type, String id, float value, float fade, Place place) {
            this.type = type;
            this.id = id;
            this.value = value;
            this.fade = fade;
            this.place = place;
        }
    }

    private final int sampleRate;
    private final Mixer mixer;
    private final ConcurrentLinkedQueue<Cmd> queue = new ConcurrentLinkedQueue<>();
    private final Object lock = new Object();
    private Thread thread;
    private volatile boolean running;

    AudioEngine() {
        int sr = AudioTrack.getNativeOutputSampleRate(AudioManager.STREAM_MUSIC);
        sampleRate = sr >= 22050 && sr <= 96000 ? sr : 48000;
        mixer = new Mixer(sampleRate);
    }

    void start() {
        running = true;
        thread = new Thread(this, "danjam-audio");
        thread.start();
    }

    void release() {
        running = false;
        wake();
        if (thread != null) {
            try {
                thread.join(1000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
    }

    /** 소리를 켜거나 음량을 바꾼다. */
    void set(String id, float gain, float fadeSec) {
        post(new Cmd(SET, id, gain, fadeSec));
    }

    void remove(String id, float fadeSec) {
        post(new Cmd(REMOVE, id, 0, fadeSec));
    }

    void removeAll(float fadeSec) {
        post(new Cmd(REMOVE_ALL, null, 0, fadeSec));
    }

    /** 전체 음량. 0으로 가면 재생이 멈추고, 0보다 크면 다시 소리가 난다. */
    void master(float level, float fadeSec) {
        post(new Cmd(MASTER, null, level, fadeSec));
    }

    /** 3D 공간 음향 켜기/끄기 */
    void spatial(boolean on) {
        post(new Cmd(SPATIAL, null, on ? 1 : 0, 0));
    }

    void motion(int m) {
        post(new Cmd(MOTION, null, m, 0));
    }

    /** 공간감 0~1 */
    void room(float r) {
        post(new Cmd(ROOM, null, r, 0));
    }

    /** 사용자 전체 음량 0~1 */
    void volume(float v) {
        post(new Cmd(VOLUME, null, v, 0));
    }

    /** 톤 −1(부드럽게) ~ 1(선명하게) */
    void tone(float t) {
        post(new Cmd(TONE, null, t, 0));
    }

    void natural(boolean on) {
        post(new Cmd(NATURAL, null, on ? 1 : 0, 0));
    }

    /** 소리의 3D 자리. null 이면 기본 자리로. */
    void place(String id, Place p) {
        post(new Cmd(PLACE, id, 0, 0, p));
    }

    private void post(Cmd c) {
        queue.add(c);
        wake();
    }

    private void wake() {
        synchronized (lock) {
            lock.notifyAll();
        }
    }

    private void drain() {
        Cmd c;
        while ((c = queue.poll()) != null) {
            switch (c.type) {
                case SET:
                    mixer.set(c.id, c.value, c.fade);
                    break;
                case REMOVE:
                    mixer.remove(c.id, c.fade);
                    break;
                case REMOVE_ALL:
                    mixer.removeAll(c.fade);
                    break;
                case SPATIAL:
                    mixer.setSpatial(c.value > 0);
                    break;
                case MOTION:
                    mixer.setMotion((int) c.value);
                    break;
                case ROOM:
                    mixer.setRoom(c.value);
                    break;
                case VOLUME:
                    mixer.setVolume(c.value);
                    break;
                case TONE:
                    mixer.setTone(c.value);
                    break;
                case NATURAL:
                    mixer.setNatural(c.value > 0);
                    break;
                case PLACE:
                    mixer.setPlace(c.id, c.place);
                    break;
                default:
                    mixer.setMaster(c.value, c.fade);
                    break;
            }
        }
    }

    private AudioTrack createTrack() {
        int min = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_FLOAT);
        // 잠자는 동안 듣는 소리라 지연은 상관없다: 넉넉한 버퍼로 CPU 를 덜 깨운다
        int bytes = Math.max(min, sampleRate / 4 * 2 * 4);
        AudioTrack.Builder b = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build())
                .setAudioFormat(new AudioFormat.Builder()
                        .setSampleRate(sampleRate)
                        .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                        .build())
                .setTransferMode(AudioTrack.MODE_STREAM)
                .setBufferSizeInBytes(bytes);
        if (Build.VERSION.SDK_INT >= 26) b.setPerformanceMode(AudioTrack.PERFORMANCE_MODE_POWER_SAVING);
        return b.build();
    }

    @Override
    public void run() {
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO);
        float[] l = new float[Mixer.BLOCK], r = new float[Mixer.BLOCK];
        float[] out = new float[CHUNK * 2];
        AudioTrack track = null;
        boolean playing = false;
        while (running) {
            drain();
            if (mixer.silent()) {
                if (playing) {
                    track.pause();
                    track.flush();
                    playing = false;
                }
                synchronized (lock) {
                    if (running && queue.isEmpty()) {
                        try {
                            lock.wait();
                        } catch (InterruptedException e) {
                            break;
                        }
                    }
                }
                continue;
            }
            if (track == null) {
                try {
                    track = createTrack();
                } catch (RuntimeException e) {
                    Log.e(TAG, "AudioTrack 생성 실패", e);
                    sleepQuietly(500);
                    continue;
                }
            }
            if (!playing) {
                track.play();
                playing = true;
            }
            for (int pos = 0; pos < CHUNK; pos += Mixer.BLOCK) {
                mixer.render(l, r, Mixer.BLOCK);
                for (int i = 0, j = pos * 2; i < Mixer.BLOCK; i++, j += 2) {
                    out[j] = l[i];
                    out[j + 1] = r[i];
                }
            }
            int written = track.write(out, 0, out.length, AudioTrack.WRITE_BLOCKING);
            if (written < 0) {
                // 오디오 서버가 다시 시작되는 등 트랙이 망가졌다: 새로 만든다
                Log.w(TAG, "AudioTrack write 오류 " + written);
                track.release();
                track = null;
                playing = false;
                sleepQuietly(200);
            }
        }
        if (track != null) {
            if (playing) track.stop();
            track.release();
        }
    }

    private static void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }
}
