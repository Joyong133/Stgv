package com.stgv.textvideo

import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import java.util.Locale

/**
 * 기기 목소리 중 "가장 사람 같은 여성 목소리"를 고르는 점수표.
 *  - 한국어 > 여성 > 음질(quality) > 온라인 신경망 목소리 > 설치됨
 *  - Google 음성 서비스 한국어: ism·kob = 여성, koc·kod = 남성
 *  - 삼성 TTS: 이름의 SMTf = 여성, SMTm = 남성
 */
object VoiceRank {

    private val femaleCodes = setOf(
        "ism", "kob",                                  // 한국어
        "sfg", "iob", "iog", "tpc", "tpf",             // 영어(미국)
        "fis", "gba", "gbc", "gbg",                    // 영어(영국)
        "htm", "jab"                                   // 일본어
    )
    private val maleCodes = setOf(
        "koc", "kod",
        "iol", "iom", "tpd",
        "rjs", "gbb", "gbd",
        "jac", "jad"
    )
    private val codeRegex = Regex("-x-([a-z]{3})")
    private val samsungRegex = Regex("smt([fm])\\d")
    private val maleWord = Regex("(^|[^e])male")

    /** 1 = 여성, -1 = 남성, 0 = 모름 */
    fun gender(v: Voice): Int {
        val feats = v.features?.map { it.lowercase(Locale.ROOT) } ?: emptyList()
        if (feats.any { it.contains("female") }) return 1
        if (feats.any { it == "male" || it.endsWith("=male") || it.endsWith(":male") }) return -1
        val n = v.name.lowercase(Locale.ROOT)
        codeRegex.find(n)?.groupValues?.get(1)?.let {
            if (it in femaleCodes) return 1
            if (it in maleCodes) return -1
        }
        samsungRegex.find(n)?.let { return if (it.groupValues[1] == "f") 1 else -1 }
        if (n.contains("female") || n.contains("woman")) return 1
        if (maleWord.containsMatchIn(n)) return -1
        return 0
    }

    fun notInstalled(v: Voice) =
        v.features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) == true

    fun score(v: Voice, lang: String, online: Boolean): Int {
        var s = 0
        if (v.locale.language == lang) s += 10000
        if (notInstalled(v)) s -= 3000
        s += when (gender(v)) {
            1 -> 2000
            -1 -> -2000
            else -> 0
        }
        s += v.quality * 2
        // 온라인 목소리는 서버의 신경망 음성이라 더 자연스러움 (인터넷 없으면 감점)
        if (v.isNetworkConnectionRequired) s += if (online) 300 else -1500
        // Google 한국어 기본 여성 목소리(ism)를 가장 먼저
        if (codeRegex.find(v.name.lowercase(Locale.ROOT))?.groupValues?.get(1) == "ism") s += 60
        return s
    }

    fun label(v: Voice, lang: String): String {
        val g = when (gender(v)) {
            1 -> "여성"
            -1 -> "남성"
            else -> "목소리"
        }
        val q = when {
            v.quality >= Voice.QUALITY_VERY_HIGH -> "최고음질"
            v.quality >= Voice.QUALITY_HIGH -> "고음질"
            v.quality >= Voice.QUALITY_NORMAL -> "보통음질"
            else -> "저음질"
        }
        val net = if (v.isNetworkConnectionRequired) "온라인" else "오프라인"
        val inst = if (notInstalled(v)) " · 다운로드 필요" else ""
        val language = if (v.locale.language == lang) "" else " [${v.locale.getDisplayName(Locale.KOREAN)}]"
        return "$g · $q · $net$inst$language  (${v.name})"
    }
}
