package com.stgv.textvideo

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction

object TextUtil {

    /** 원문에서의 위치(start..end)와 함께 보관하는 문장 조각 */
    data class Segment(val start: Int, val end: Int, val text: String)

    private const val ENDERS = ".!?。！？…"
    private const val CLOSERS = "\"'”’」』)]}》〉"
    private val BREAKS = charArrayOf(',', '，', '、', ';', ':', '·')

    /** TXT 파일 바이트를 문자열로. UTF-8/UTF-16(BOM)/한국어 윈도우(CP949, EUC-KR)를 자동 판별 */
    fun decode(bytes: ByteArray): String {
        val text = when {
            bytes.size >= 3 && bytes[0] == 0xEF.toByte() && bytes[1] == 0xBB.toByte() && bytes[2] == 0xBF.toByte() ->
                String(bytes, 3, bytes.size - 3, Charsets.UTF_8)
            bytes.size >= 2 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xFE.toByte() ->
                String(bytes, 2, bytes.size - 2, Charsets.UTF_16LE)
            bytes.size >= 2 && bytes[0] == 0xFE.toByte() && bytes[1] == 0xFF.toByte() ->
                String(bytes, 2, bytes.size - 2, Charsets.UTF_16BE)
            else -> decodeGuess(bytes)
        }
        return text.replace("\r\n", "\n").replace('\r', '\n')
    }

    private fun decodeGuess(bytes: ByteArray): String {
        try {
            val dec = Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
            return dec.decode(ByteBuffer.wrap(bytes)).toString()
        } catch (_: CharacterCodingException) {
        }
        for (name in listOf("x-windows-949", "MS949", "windows-949", "EUC-KR")) {
            try {
                if (Charset.isSupported(name)) return String(bytes, Charset.forName(name))
            } catch (_: Exception) {
            }
        }
        return String(bytes, Charsets.ISO_8859_1)
    }

    /** 문장 단위로 나누기 (마침표·물음표·느낌표·줄바꿈 기준). 너무 긴 문장은 쉼표/띄어쓰기에서 한 번 더 자름 */
    fun split(text: String, maxLen: Int = 110): List<Segment> {
        val out = ArrayList<Segment>()
        val n = text.length
        var start = 0
        var i = 0
        while (i < n) {
            val c = text[i]
            if (c == '\n') {
                add(text, start, i, maxLen, out)
                start = i + 1
                i++
                continue
            }
            if (ENDERS.indexOf(c) >= 0) {
                var j = i + 1
                while (j < n && (ENDERS.indexOf(text[j]) >= 0 || CLOSERS.indexOf(text[j]) >= 0)) j++
                if (j >= n || text[j].isWhitespace()) {
                    add(text, start, j, maxLen, out)
                    start = j
                }
                i = j
                continue
            }
            i++
        }
        add(text, start, n, maxLen, out)
        return out
    }

    private fun add(text: String, s0: Int, e0: Int, maxLen: Int, out: MutableList<Segment>) {
        var s = s0
        var e = e0
        while (s < e && text[s].isWhitespace()) s++
        while (e > s && text[e - 1].isWhitespace()) e--
        if (s >= e) return
        while (e - s > maxLen) {
            val limit = s + maxLen
            val lo = s + maxLen / 2
            var cut = -1
            for (k in limit - 1 downTo lo) if (text[k] in BREAKS) { cut = k + 1; break }
            if (cut < 0) for (k in limit - 1 downTo lo) if (text[k].isWhitespace()) { cut = k + 1; break }
            if (cut < 0) cut = limit
            addPiece(text, s, cut, out)
            s = cut
            while (s < e && text[s].isWhitespace()) s++
        }
        addPiece(text, s, e, out)
    }

    private fun addPiece(text: String, s0: Int, e0: Int, out: MutableList<Segment>) {
        var s = s0
        var e = e0
        while (s < e && text[s].isWhitespace()) s++
        while (e > s && text[e - 1].isWhitespace()) e--
        if (s >= e) return
        val piece = text.substring(s, e)
        // "***", "----" 처럼 읽을 글자가 없는 줄은 건너뜀
        if (piece.none { it.isLetterOrDigit() }) return
        out.add(Segment(s, e, piece))
    }

    /** 영상 장면 만들기: 아주 짧은 문장은 다음 문장과 한 화면에 묶음 */
    fun toScenes(segments: List<Segment>, maxLen: Int): List<String> {
        val out = ArrayList<String>()
        val cur = StringBuilder()
        for (seg in segments) {
            if (cur.isEmpty()) {
                cur.append(seg.text)
            } else if (cur.length < 18 && cur.length + 1 + seg.text.length <= maxLen) {
                cur.append(' ').append(seg.text)
            } else {
                out.add(cur.toString())
                cur.setLength(0)
                cur.append(seg.text)
            }
        }
        if (cur.isNotEmpty()) out.add(cur.toString())
        return out
    }

    /** 예상 낭독 시간(초). 한국어 기준 1초에 6.5글자 정도 */
    fun estimateSeconds(text: String, pieces: Int, rate: Float): Double {
        val chars = text.count { !it.isWhitespace() }
        return chars / (6.5 * rate) + pieces * 0.45 + 1.0
    }

    fun formatDuration(sec: Double): String {
        val s = sec.toLong()
        return when {
            s >= 3600 -> "${s / 3600}시간 ${(s % 3600) / 60}분"
            s >= 60 -> "${s / 60}분 ${s % 60}초"
            else -> "${s}초"
        }
    }
}
