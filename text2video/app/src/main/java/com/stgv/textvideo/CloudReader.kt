package com.stgv.textvideo

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.Future
import kotlin.math.max

/** 클라우드 목소리로 문장을 차례대로 받아서(다음 문장은 미리 받아 둠) 재생 */
class CloudReader(
    private val synth: (String) -> Pcm,
    private val listener: ReadListener
) {
    @Volatile
    private var cancelled = false
    private var worker: Thread? = null

    @Volatile
    private var track: AudioTrack? = null
    private var written = 0L
    private val main = Handler(Looper.getMainLooper())

    fun start(texts: List<String>, from: Int) {
        worker = Thread {
            val pool = Executors.newSingleThreadExecutor()
            try {
                var next: Future<Pcm> = pool.submit(Callable { synth(texts[from]) })
                for (i in from until texts.size) {
                    val pcm = next.get()
                    if (cancelled) return@Thread
                    if (i + 1 < texts.size) {
                        val t = texts[i + 1]
                        next = pool.submit(Callable { synth(t) })
                    }
                    main.post { if (!cancelled) listener.onSegment(i) }
                    play(pcm)
                    if (cancelled) return@Thread
                }
                main.post { if (!cancelled) listener.onFinished() }
            } catch (e: Throwable) {
                if (!cancelled) {
                    val cause = (e as? ExecutionException)?.cause ?: e
                    val msg = cause.message ?: cause.javaClass.simpleName
                    main.post { if (!cancelled) listener.onError(msg) }
                }
            } finally {
                pool.shutdownNow()
                releaseTrack()
            }
        }.also { it.start() }
    }

    fun stop() {
        cancelled = true
        try {
            track?.pause()
            track?.flush()
        } catch (_: Exception) {
        }
        worker?.interrupt()
    }

    private fun play(p: Pcm) {
        var t = track
        if (t == null || t.sampleRate != p.sampleRate) {
            releaseTrack()
            val minBuf = AudioTrack.getMinBufferSize(p.sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
            t = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setSampleRate(p.sampleRate)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(max(minBuf, p.sampleRate / 5 * 2))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
            track = t
            written = 0
            t.play()
        }
        val pause = ShortArray(p.sampleRate * 3 / 10) // 문장 사이 0.3초 쉼
        writeAll(t, p.samples)
        val target = written
        writeAll(t, pause)
        // 실제로 다 들릴 때까지 기다림 (다음 문장 하이라이트를 맞추기 위해)
        val deadline = System.currentTimeMillis() + p.samples.size * 1000L / p.sampleRate + 3000
        while (!cancelled && (t.playbackHeadPosition.toLong() and 0xFFFFFFFFL) < target &&
            System.currentTimeMillis() < deadline
        ) {
            Thread.sleep(15)
        }
    }

    private fun writeAll(t: AudioTrack, s: ShortArray) {
        var off = 0
        while (off < s.size && !cancelled) {
            val n = t.write(s, off, minOf(4096, s.size - off))
            if (n <= 0) break
            off += n
            written += n
        }
    }

    private fun releaseTrack() {
        val t = track ?: return
        track = null
        try {
            t.stop()
        } catch (_: Exception) {
        }
        try {
            t.release()
        } catch (_: Exception) {
        }
    }
}
