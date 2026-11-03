package com.stgv.textvideo

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

interface ReadListener {
    fun onSegment(index: Int)
    fun onFinished()
    fun onError(message: String)
}

/** 휴대폰에 설치된 TTS 엔진(Google 음성 서비스, 삼성 TTS 등) 래퍼 */
class DeviceTts(
    context: Context,
    val requestedEngine: String?,
    onInit: (DeviceTts, Boolean) -> Unit
) {
    lateinit var tts: TextToSpeech
        private set

    @Volatile
    var ready = false
        private set

    private val main = Handler(Looper.getMainLooper())
    private val fileWaiters = ConcurrentHashMap<String, (Boolean) -> Unit>()
    private val fileCounter = AtomicInteger()
    private var readToken = 0
    private var readListener: ReadListener? = null
    private var lastIndex = -1

    private val progress = object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String) {
            val p = parseRead(utteranceId) ?: return
            main.post { if (p.first == readToken) readListener?.onSegment(p.second) }
        }

        override fun onDone(utteranceId: String) {
            val waiter = fileWaiters.remove(utteranceId)
            if (waiter != null) {
                waiter(true)
                return
            }
            val p = parseRead(utteranceId) ?: return
            main.post {
                if (p.first == readToken && p.second == lastIndex) {
                    val l = readListener
                    readListener = null
                    l?.onFinished()
                }
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String) {
            onError(utteranceId, -1)
        }

        override fun onError(utteranceId: String, errorCode: Int) {
            val waiter = fileWaiters.remove(utteranceId)
            if (waiter != null) {
                waiter(false)
                return
            }
            val p = parseRead(utteranceId) ?: return
            main.post {
                if (p.first == readToken) {
                    val l = readListener
                    readListener = null
                    l?.onError(errorMessage(errorCode))
                }
            }
        }
    }

    init {
        tts = TextToSpeech(context.applicationContext, { status ->
            main.post {
                ready = status == TextToSpeech.SUCCESS
                if (ready) tts.setOnUtteranceProgressListener(progress)
                onInit(this, ready)
            }
        }, requestedEngine)
    }

    /** 실제로 연결된 엔진 패키지 이름 */
    val enginePackage: String?
        get() = try {
            val names = tts.engines.map { it.name }
            if (requestedEngine != null && requestedEngine in names) requestedEngine else tts.defaultEngine
        } catch (_: Exception) {
            null
        }

    fun voices(): List<Voice> = try {
        tts.voices?.toList() ?: emptyList()
    } catch (_: Exception) {
        emptyList()
    }

    fun setVoice(v: Voice) {
        try {
            tts.voice = v
        } catch (_: Exception) {
        }
    }

    fun setParams(rate: Float, pitch: Float) {
        if (!ready) return
        tts.setSpeechRate(rate)
        tts.setPitch(pitch)
    }

    /** texts[from]부터 끝까지 차례대로 읽기 */
    fun speak(texts: List<String>, from: Int, l: ReadListener) {
        readToken++
        val token = readToken
        readListener = l
        lastIndex = texts.size - 1
        for (i in from until texts.size) {
            val mode = if (i == from) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
            val r = tts.speak(texts[i], mode, Bundle(), "r_${token}_$i")
            if (r != TextToSpeech.SUCCESS) {
                main.post {
                    if (token == readToken) {
                        readListener = null
                        l.onError("읽기를 시작하지 못했어요. 음성 엔진을 확인해 주세요.")
                    }
                }
                return
            }
        }
    }

    fun stopSpeaking() {
        readToken++
        readListener = null
        if (ready) {
            try {
                tts.stop()
            } catch (_: Exception) {
            }
        }
    }

    /** 문장 하나를 WAV 파일로 저장 (작업 스레드에서 호출) */
    fun synthToFile(text: String, file: File, timeoutSec: Long): Boolean {
        if (!ready) return false
        val id = "f_" + fileCounter.incrementAndGet()
        val latch = CountDownLatch(1)
        val ok = AtomicBoolean(false)
        fileWaiters[id] = { success ->
            ok.set(success)
            latch.countDown()
        }
        val r = tts.synthesizeToFile(text, Bundle(), file, id)
        if (r != TextToSpeech.SUCCESS) {
            fileWaiters.remove(id)
            return false
        }
        if (!latch.await(timeoutSec, TimeUnit.SECONDS)) {
            fileWaiters.remove(id)
            return false
        }
        return ok.get() && file.length() > 44
    }

    fun shutdown() {
        readToken++
        readListener = null
        ready = false
        for (w in fileWaiters.values) w(false)
        fileWaiters.clear()
        try {
            tts.stop()
            tts.shutdown()
        } catch (_: Exception) {
        }
    }

    private fun parseRead(id: String): Pair<Int, Int>? {
        if (!id.startsWith("r_")) return null
        val parts = id.split('_')
        if (parts.size != 3) return null
        val t = parts[1].toIntOrNull() ?: return null
        val i = parts[2].toIntOrNull() ?: return null
        return Pair(t, i)
    }

    private fun errorMessage(code: Int) = when (code) {
        TextToSpeech.ERROR_NETWORK, TextToSpeech.ERROR_NETWORK_TIMEOUT ->
            "인터넷이 필요한 목소리예요. 인터넷을 켜거나 ‘오프라인’ 목소리를 골라 주세요."
        TextToSpeech.ERROR_NOT_INSTALLED_YET ->
            "목소리 데이터가 아직 설치되지 않았어요. ‘목소리 다운로드·설정’에서 받아 주세요."
        else -> "음성 재생 중 오류가 났어요 (코드 $code)"
    }
}
