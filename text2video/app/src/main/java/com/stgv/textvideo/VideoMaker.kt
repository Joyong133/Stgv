package com.stgv.textvideo

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import android.opengl.GLES20
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.min

class CancelledException : Exception("cancelled")

data class VideoConfig(
    val width: Int,
    val height: Int,
    val theme: VideoTheme,
    val title: String?,
    val bitrate: Int
)

/**
 * 글 → MP4 영상
 *  1) 장면(문장)마다 TTS 로 목소리를 만들고 길이를 잼
 *  2) 전체 목소리를 AAC 로 압축
 *  3) 장면 그림을 OpenGL 로 인코더에 그려 H.264 로 압축 (목소리 길이에 맞춰 장면 전환, 페이드 인, 진행 막대)
 *  4) MediaMuxer 로 소리+영상을 MP4 하나로 합침
 */
class VideoMaker(
    private val cacheDir: File,
    private val cfg: VideoConfig,
    private val synth: (String) -> Pcm?,
    private val onProgress: (Float, String) -> Unit
) {
    @Volatile
    var cancelled = false

    companion object {
        const val SR = 48000
        const val FPS = 24
        private const val AVC = MediaFormat.MIMETYPE_VIDEO_AVC
        private const val AAC = MediaFormat.MIMETYPE_AUDIO_AAC
        private const val TIMEOUT = 10_000L
        private const val FADE_SEC = 0.35f
    }

    private class Sample(val data: ByteArray, val ptsUs: Long, val flags: Int)

    private class Plan(val name: String, val encW: Int, val encH: Int, val dispW: Int, val dispH: Int, val rotate: Boolean)

    private fun check() {
        if (cancelled || Thread.currentThread().isInterrupted) throw CancelledException()
    }

    fun make(scenes: List<String>, out: File) {
        require(scenes.isNotEmpty())
        val work = File(cacheDir, "videowork").apply {
            deleteRecursively()
            mkdirs()
        }
        try {
            val raw = File(work, "audio.pcm")
            val starts = LongArray(scenes.size)
            var total = 0L
            var fails = 0
            val gap = SR * 45 / 100
            BufferedOutputStream(FileOutputStream(raw), 1 shl 16).use { os ->
                total += writeSilence(os, SR / 2)
                for ((i, text) in scenes.withIndex()) {
                    check()
                    onProgress(0.5f * i / scenes.size, "목소리 만드는 중… ${i + 1} / ${scenes.size}")
                    if (i > 0) starts[i] = total
                    val pcm = synth(text)
                    check()
                    if (pcm != null && pcm.samples.isNotEmpty()) {
                        val s = Wav.resample(pcm, SR)
                        writeShorts(os, s)
                        total += s.size
                    } else {
                        fails++
                        total += writeSilence(os, (SR * (1.0 + text.length * 0.12)).toInt())
                    }
                    total += writeSilence(os, gap)
                }
                total += writeSilence(os, SR * 7 / 10)
            }
            if (fails == scenes.size) {
                throw IOException("목소리를 만들지 못했어요. 목소리 설정(다운로드 여부, 인터넷)을 확인해 주세요.")
            }
            onProgress(0.5f, "소리 압축 중…")
            val (audioFormat, audio) = encodeAudio(raw)
            raw.delete()
            encodeVideo(scenes, starts, total, audioFormat, audio, out)
            onProgress(1f, "마무리 중…")
        } finally {
            work.deleteRecursively()
        }
    }

    // ---------------------------------------------------------------- 소리

    private fun writeSilence(os: OutputStream, n: Int): Long {
        val z = ByteArray(8192)
        var left = n.toLong() * 2
        while (left > 0) {
            val c = min(left, z.size.toLong()).toInt()
            os.write(z, 0, c)
            left -= c
        }
        return n.toLong()
    }

    private fun writeShorts(os: OutputStream, s: ShortArray) {
        val b = ByteArray(s.size * 2)
        for (i in s.indices) {
            val v = s[i].toInt()
            b[2 * i] = v.toByte()
            b[2 * i + 1] = (v shr 8).toByte()
        }
        os.write(b)
    }

    private fun readFully(input: InputStream, buf: ByteArray, want: Int): Int {
        var got = 0
        while (got < want) {
            val n = input.read(buf, got, want - got)
            if (n < 0) break
            got += n
        }
        return got
    }

    private fun encodeAudio(raw: File): Pair<MediaFormat, List<Sample>> {
        val fmt = MediaFormat.createAudioFormat(AAC, SR, 1).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, 128_000)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384)
        }
        val codec = MediaCodec.createEncoderByType(AAC)
        val samples = ArrayList<Sample>()
        var outFormat: MediaFormat? = null
        val totalBytes = raw.length().coerceAtLeast(1)
        try {
            codec.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            codec.start()
            BufferedInputStream(FileInputStream(raw), 1 shl 16).use { input ->
                val buf = ByteArray(8192)
                val info = MediaCodec.BufferInfo()
                var queued = 0L
                var inputDone = false
                var outputDone = false
                var inCount = 0
                while (!outputDone) {
                    check()
                    if (!inputDone) {
                        val idx = codec.dequeueInputBuffer(TIMEOUT)
                        if (idx >= 0) {
                            val ib = codec.getInputBuffer(idx)!!
                            ib.clear()
                            val want = min(buf.size, ib.remaining()) and 1.inv()
                            val n = readFully(input, buf, want)
                            val pts = (queued / 2) * 1_000_000L / SR
                            if (n <= 0) {
                                codec.queueInputBuffer(idx, 0, 0, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                inputDone = true
                            } else {
                                ib.put(buf, 0, n)
                                codec.queueInputBuffer(idx, 0, n, pts, 0)
                                queued += n
                            }
                            if (++inCount % 64 == 0) onProgress(0.5f + 0.08f * queued / totalBytes, "소리 압축 중…")
                        }
                    }
                    while (true) {
                        val oi = codec.dequeueOutputBuffer(info, if (inputDone) TIMEOUT else 0L)
                        if (oi == MediaCodec.INFO_TRY_AGAIN_LATER) break
                        if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                            outFormat = codec.outputFormat
                            continue
                        }
                        if (oi < 0) continue
                        val ob = codec.getOutputBuffer(oi)!!
                        if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0 && info.size > 0) {
                            val d = ByteArray(info.size)
                            ob.position(info.offset)
                            ob.limit(info.offset + info.size)
                            ob.get(d)
                            samples.add(Sample(d, info.presentationTimeUs, info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM.inv()))
                        }
                        codec.releaseOutputBuffer(oi, false)
                        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                            outputDone = true
                            break
                        }
                    }
                }
            }
        } finally {
            try {
                codec.stop()
            } catch (_: Exception) {
            }
            codec.release()
        }
        return Pair(outFormat ?: throw IOException("소리 압축에 실패했어요"), samples)
    }

    // ---------------------------------------------------------------- 영상

    private fun plan(): Plan {
        val list = MediaCodecList(MediaCodecList.REGULAR_CODECS)
        val w = cfg.width
        val h = cfg.height
        val sizes = ArrayList<IntArray>()
        sizes.add(intArrayOf(w, h))
        for (target in intArrayOf(720, 480)) {
            if (min(w, h) > target) {
                val s = target.toFloat() / min(w, h)
                sizes.add(intArrayOf(even(w * s), even(h * s)))
            }
        }
        for (sz in sizes) {
            for (rot in booleanArrayOf(false, true)) {
                val ew = if (rot) sz[1] else sz[0]
                val eh = if (rot) sz[0] else sz[1]
                val name = try {
                    list.findEncoderForFormat(MediaFormat.createVideoFormat(AVC, ew, eh))
                } catch (_: Exception) {
                    null
                }
                if (name != null) return Plan(name, ew, eh, sz[0], sz[1], rot)
            }
        }
        throw IOException("이 휴대폰에서 쓸 수 있는 영상 인코더를 찾지 못했어요")
    }

    private fun even(v: Float) = (v.toInt() / 2) * 2

    private fun encodeVideo(
        scenes: List<String>,
        starts: LongArray,
        totalSamples: Long,
        audioFormat: MediaFormat,
        audio: List<Sample>,
        out: File
    ) {
        val p = plan()
        val bitrate = (cfg.bitrate.toLong() * p.dispW * p.dispH / (cfg.width.toLong() * cfg.height))
            .toInt().coerceAtLeast(700_000)
        val fmt = MediaFormat.createVideoFormat(AVC, p.encW, p.encH).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
            setInteger(MediaFormat.KEY_FRAME_RATE, FPS)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
        }
        val codec = MediaCodec.createByCodecName(p.name)
        try {
            val caps = codec.codecInfo.getCapabilitiesForType(AVC).encoderCapabilities
            if (caps.isBitrateModeSupported(MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)) {
                fmt.setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)
            }
        } catch (_: Exception) {
        }
        codec.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        val surface = codec.createInputSurface()
        codec.start()

        val muxer = MediaMuxer(out.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        if (p.rotate) muxer.setOrientationHint(90)
        var muxStarted = false
        var vTrack = -1
        var aTrack = -1
        var audioIdx = 0
        val info = MediaCodec.BufferInfo()
        var egl: EglCore? = null
        var quad: GlQuad? = null

        fun writeAudioUpTo(us: Long) {
            while (audioIdx < audio.size && audio[audioIdx].ptsUs <= us) {
                val s = audio[audioIdx++]
                val bi = MediaCodec.BufferInfo()
                bi.set(0, s.data.size, s.ptsUs, s.flags)
                muxer.writeSampleData(aTrack, ByteBuffer.wrap(s.data), bi)
            }
        }

        fun drain(eos: Boolean) {
            if (eos) codec.signalEndOfInputStream()
            var idle = 0
            while (true) {
                val oi = codec.dequeueOutputBuffer(info, if (eos) TIMEOUT else 0L)
                if (oi == MediaCodec.INFO_TRY_AGAIN_LATER) {
                    if (!eos || ++idle > 300) return
                    continue
                }
                if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    if (!muxStarted) {
                        vTrack = muxer.addTrack(codec.outputFormat)
                        aTrack = muxer.addTrack(audioFormat)
                        muxer.start()
                        muxStarted = true
                    }
                    continue
                }
                if (oi < 0) continue
                val ob = codec.getOutputBuffer(oi)!!
                if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
                if (info.size > 0 && muxStarted) {
                    ob.position(info.offset)
                    ob.limit(info.offset + info.size)
                    muxer.writeSampleData(vTrack, ob, info)
                    writeAudioUpTo(info.presentationTimeUs)
                }
                codec.releaseOutputBuffer(oi, false)
                if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
            }
        }

        var success = false
        try {
            egl = EglCore(surface)
            quad = GlQuad(p.rotate)
            GLES20.glViewport(0, 0, p.encW, p.encH)
            val renderer = SceneRenderer(p.dispW, p.dispH, cfg.theme, cfg.title)
            val bar = renderer.barPx
            val bgBmp = renderer.background()
            val bgTex = quad.upload(bgBmp, 0)
            bgBmp.recycle()

            var sceneTex = 0
            var cur = -1
            val totalUs = totalSamples * 1_000_000L / SR
            val frames = ((totalUs * FPS + 999_999L) / 1_000_000L).toInt().coerceAtLeast(1)
            for (f in 0 until frames) {
                check()
                val tUs = f.toLong() * 1_000_000L / FPS
                val tS = tUs * SR / 1_000_000L
                var s = max(cur, 0)
                while (s + 1 < scenes.size && starts[s + 1] <= tS) s++
                if (s != cur) {
                    val b = renderer.scene(scenes[s], s, scenes.size)
                    sceneTex = quad.upload(b, sceneTex)
                    b.recycle()
                    cur = s
                }
                val since = (tS - starts[s]).toFloat() / SR
                val alpha = min(1f, since / FADE_SEC)

                drain(false)
                GLES20.glClearColor(0f, 0f, 0f, 1f)
                GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
                quad.draw(bgTex, 1f)
                quad.draw(sceneTex, alpha)
                val frac = (tUs.toFloat() / totalUs).coerceIn(0f, 1f)
                if (p.rotate) {
                    quad.fill(p.encW - bar, 0, bar, (frac * p.encH).toInt(), cfg.theme.accent)
                } else {
                    quad.fill(0, 0, (frac * p.encW).toInt(), bar, cfg.theme.accent)
                }
                egl.setPresentationTime(tUs * 1000L)
                egl.swap()
                if (f % 12 == 0) {
                    val pct = f * 100 / frames
                    onProgress(0.58f + 0.42f * f / frames, "영상 만드는 중… $pct%")
                }
            }
            drain(true)
            if (!muxStarted) throw IOException("영상 압축에 실패했어요")
            writeAudioUpTo(Long.MAX_VALUE)
            success = true
        } finally {
            try {
                quad?.release()
            } catch (_: Exception) {
            }
            try {
                egl?.release()
            } catch (_: Exception) {
            }
            surface.release()
            try {
                codec.stop()
            } catch (_: Exception) {
            }
            codec.release()
            try {
                if (muxStarted) muxer.stop()
            } catch (e: Exception) {
                if (success) throw IOException("영상 파일 저장에 실패했어요: ${e.message}")
            } finally {
                try {
                    muxer.release()
                } catch (_: Exception) {
                }
            }
        }
    }
}
