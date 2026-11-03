package com.stgv.textvideo

import android.util.Base64
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.UnknownHostException
import kotlin.math.ln

/** Google Cloud Text-to-Speech (선택 기능, API 키 필요) */
object CloudTts {

    data class CloudVoice(val id: String, val label: String, val pitchOk: Boolean)

    val VOICES = listOf(
        CloudVoice("ko-KR-Chirp3-HD-Aoede", "★ Chirp 3 HD · Aoede — 여성 (가장 사람 같음)", false),
        CloudVoice("ko-KR-Chirp3-HD-Leda", "Chirp 3 HD · Leda — 여성", false),
        CloudVoice("ko-KR-Chirp3-HD-Kore", "Chirp 3 HD · Kore — 여성", false),
        CloudVoice("ko-KR-Chirp3-HD-Zephyr", "Chirp 3 HD · Zephyr — 여성", false),
        CloudVoice("ko-KR-Neural2-A", "Neural2 · A — 여성", true),
        CloudVoice("ko-KR-Neural2-B", "Neural2 · B — 여성", true),
        CloudVoice("ko-KR-Wavenet-A", "WaveNet · A — 여성", true),
        CloudVoice("ko-KR-Wavenet-B", "WaveNet · B — 여성", true)
    )

    private const val ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize"
    private const val RATE = 24000

    private class HttpError(val code: Int, msg: String) : IOException(msg)

    fun synthesize(apiKey: String, voice: CloudVoice, text: String, rate: Float, pitch: Float): Pcm {
        if (apiKey.isBlank()) throw IOException("Google Cloud API 키를 먼저 입력해 주세요.")
        try {
            return request(apiKey, voice, text, rate, pitch, true)
        } catch (e: HttpError) {
            // 일부 목소리는 속도/음높이 조절을 지원하지 않음 → 조절 없이 한 번 더
            if (e.code == 400 && (rate != 1f || pitch != 1f)) {
                try {
                    return request(apiKey, voice, text, rate, pitch, false)
                } catch (_: HttpError) {
                }
            }
            throw IOException(e.message)
        } catch (e: UnknownHostException) {
            throw IOException("인터넷에 연결되어 있지 않아요.")
        }
    }

    private fun request(key: String, voice: CloudVoice, text: String, rate: Float, pitch: Float, controls: Boolean): Pcm {
        val audioConfig = JSONObject()
            .put("audioEncoding", "LINEAR16")
            .put("sampleRateHertz", RATE)
        if (controls) {
            if (rate != 1f) audioConfig.put("speakingRate", rate.toDouble())
            if (voice.pitchOk && pitch != 1f) {
                val semitones = (12.0 * ln(pitch.toDouble()) / ln(2.0)).coerceIn(-20.0, 20.0)
                audioConfig.put("pitch", semitones)
            }
        }
        val body = JSONObject()
            .put("input", JSONObject().put("text", text))
            .put("voice", JSONObject().put("languageCode", voice.id.substring(0, 5)).put("name", voice.id))
            .put("audioConfig", audioConfig)

        val conn = URL(ENDPOINT).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15000
            conn.readTimeout = 60000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            conn.setRequestProperty("X-Goog-Api-Key", key.trim())
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val resp = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            if (code !in 200..299) {
                val msg = try {
                    JSONObject(resp).getJSONObject("error").getString("message")
                } catch (_: Exception) {
                    resp.take(200)
                }
                throw HttpError(code, "Google Cloud 음성 오류 ($code): $msg")
            }
            val audio = Base64.decode(JSONObject(resp).getString("audioContent"), Base64.DEFAULT)
            return Wav.parse(audio) ?: rawToPcm(audio)
        } finally {
            conn.disconnect()
        }
    }

    private fun rawToPcm(b: ByteArray): Pcm {
        val s = ShortArray(b.size / 2)
        for (i in s.indices) s[i] = ((b[2 * i].toInt() and 0xFF) or (b[2 * i + 1].toInt() shl 8)).toShort()
        return Pcm(s, RATE)
    }
}
