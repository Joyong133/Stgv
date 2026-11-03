package com.stgv.textvideo

import java.io.File

/** 16비트 모노 PCM 소리 */
class Pcm(val samples: ShortArray, val sampleRate: Int)

object Wav {

    fun read(file: File): Pcm? = try {
        if (file.exists()) parse(file.readBytes()) else null
    } catch (_: Exception) {
        null
    }

    fun parse(b: ByteArray): Pcm? {
        if (b.size < 12) return null
        if (String(b, 0, 4, Charsets.US_ASCII) != "RIFF" || String(b, 8, 4, Charsets.US_ASCII) != "WAVE") return null
        var p = 12
        var format = 1
        var channels = 1
        var rate = 0
        var bits = 16
        while (p + 8 <= b.size) {
            val id = String(b, p, 4, Charsets.US_ASCII)
            var size = le32(b, p + 4)
            val body = p + 8
            if (id == "fmt " && body + 16 <= b.size) {
                format = le16(b, body)
                channels = le16(b, body + 2).coerceAtLeast(1)
                rate = le32(b, body + 4)
                bits = le16(b, body + 14)
                if (format == 0xFFFE && size >= 26 && body + 26 <= b.size) format = le16(b, body + 24)
            } else if (id == "data") {
                if (size <= 0 || body + size > b.size) size = b.size - body
                if (rate <= 0) return null
                return Pcm(toMono16(b, body, size, format, channels, bits), rate)
            }
            if (size < 0) return null
            p = body + size + (size and 1)
        }
        return null
    }

    private fun toMono16(b: ByteArray, off: Int, size: Int, format: Int, channels: Int, bits: Int): ShortArray {
        val bps = (bits / 8).coerceAtLeast(1)
        val frame = bps * channels
        val frames = size / frame
        val out = ShortArray(frames)
        for (f in 0 until frames) {
            var sum = 0
            for (ch in 0 until channels) {
                val i = off + f * frame + ch * bps
                val v: Int = when {
                    bits == 8 -> ((b[i].toInt() and 0xFF) - 128) shl 8
                    bits == 16 -> (b[i].toInt() and 0xFF) or (b[i + 1].toInt() shl 8)
                    bits == 24 -> (b[i + 1].toInt() and 0xFF) or (b[i + 2].toInt() shl 8)
                    bits == 32 && format == 3 -> {
                        val fl = java.lang.Float.intBitsToFloat(le32(b, i))
                        (fl * 32767f).toInt().coerceIn(-32768, 32767)
                    }
                    bits == 32 -> le32(b, i) shr 16
                    else -> 0
                }
                sum += v
            }
            out[f] = (sum / channels).coerceIn(-32768, 32767).toShort()
        }
        return out
    }

    /** 선형 보간 리샘플링 */
    fun resample(p: Pcm, target: Int): ShortArray {
        if (p.sampleRate == target || p.samples.isEmpty()) return p.samples
        val src = p.samples
        val outLen = (src.size.toLong() * target / p.sampleRate).toInt()
        val out = ShortArray(outLen)
        val step = p.sampleRate.toDouble() / target
        for (i in 0 until outLen) {
            val pos = i * step
            val idx = pos.toInt()
            val frac = pos - idx
            val a = src[idx.coerceAtMost(src.size - 1)].toInt()
            val c = src[(idx + 1).coerceAtMost(src.size - 1)].toInt()
            out[i] = (a + (c - a) * frac).toInt().toShort()
        }
        return out
    }

    private fun le16(b: ByteArray, i: Int) = (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8)
    private fun le32(b: ByteArray, i: Int) =
        (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8) or
            ((b[i + 2].toInt() and 0xFF) shl 16) or ((b[i + 3].toInt() and 0xFF) shl 24)
}
