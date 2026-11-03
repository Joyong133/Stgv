package com.stgv.textvideo

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Intent
import android.content.SharedPreferences
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import android.text.Editable
import android.text.Spanned
import android.text.TextWatcher
import android.text.style.BackgroundColorSpan
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageView
import android.widget.RadioGroup
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.core.content.IntentCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.slider.Slider
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "TextVideo"
        private const val CLOUD = "__cloud__"
        private const val GOOGLE_TTS = "com.google.android.tts"
        private const val LANG = "ko"
        private const val MAX_FILE = 20 * 1024 * 1024
        private const val SAMPLE = "안녕하세요. 지금 고른 목소리로 글을 읽어 드릴게요. 자연스럽게 들리시나요?"
    }

    private lateinit var prefs: SharedPreferences
    private val main = Handler(Looper.getMainLooper())

    private lateinit var etText: EditText
    private lateinit var tvFile: TextView
    private lateinit var tvStats: TextView
    private lateinit var spEngine: Spinner
    private lateinit var spVoice: Spinner
    private lateinit var cbAllLang: CheckBox
    private lateinit var boxCloud: View
    private lateinit var etApiKey: EditText
    private lateinit var tvRate: TextView
    private lateinit var slRate: Slider
    private lateinit var tvPitch: TextView
    private lateinit var slPitch: Slider
    private lateinit var tvNow: TextView
    private lateinit var btnPlay: MaterialButton
    private lateinit var btnPause: MaterialButton
    private lateinit var btnStop: MaterialButton
    private lateinit var btnPreview: MaterialButton
    private lateinit var etTitle: EditText
    private lateinit var rgRatio: RadioGroup
    private lateinit var rgQuality: RadioGroup
    private lateinit var spTheme: Spinner
    private lateinit var ivPreview: ImageView
    private lateinit var btnMake: MaterialButton
    private lateinit var pbMake: LinearProgressIndicator
    private lateinit var tvMakeStatus: TextView
    private lateinit var rowResult: View

    private var dtts: DeviceTts? = null
    private var engineIds: List<String> = emptyList()
    private var deviceVoices: List<Voice> = emptyList()
    private var cloudMode = false

    private var reading = false
    private var paused = false
    private var previewing = false
    private var segments: List<TextUtil.Segment> = emptyList()
    private var readIndex = 0
    private var cloudReader: CloudReader? = null
    private val hlSpan = BackgroundColorSpan(0x66FFC107)

    private var maker: VideoMaker? = null
    private var lastVideo: Uri? = null
    private var restoring = false

    private val openDoc = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) loadUri(uri)
    }
    private val refresh = Runnable {
        updateStats()
        renderPreview()
    }

    // ================================================================ 생명주기

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = getSharedPreferences("settings", MODE_PRIVATE)
        bindViews()
        restoreSettings()
        setupListeners()
        cloudMode = prefs.getString("engine", GOOGLE_TTS) == CLOUD
        applyEngineUi()
        initTts(prefs.getString("device_engine", GOOGLE_TTS))
        if (!handleIncoming(intent)) restoreLastText()
        updateReadButtons()
        scheduleRefresh(0)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIncoming(intent)
    }

    override fun onPause() {
        super.onPause()
        saveLastText()
    }

    override fun onDestroy() {
        super.onDestroy()
        cloudReader?.stop()
        maker?.cancelled = true
        dtts?.shutdown()
        dtts = null
    }

    private fun bindViews() {
        etText = findViewById(R.id.etText)
        tvFile = findViewById(R.id.tvFile)
        tvStats = findViewById(R.id.tvStats)
        spEngine = findViewById(R.id.spEngine)
        spVoice = findViewById(R.id.spVoice)
        cbAllLang = findViewById(R.id.cbAllLang)
        boxCloud = findViewById(R.id.boxCloud)
        etApiKey = findViewById(R.id.etApiKey)
        tvRate = findViewById(R.id.tvRate)
        slRate = findViewById(R.id.slRate)
        tvPitch = findViewById(R.id.tvPitch)
        slPitch = findViewById(R.id.slPitch)
        tvNow = findViewById(R.id.tvNow)
        btnPlay = findViewById(R.id.btnPlay)
        btnPause = findViewById(R.id.btnPause)
        btnStop = findViewById(R.id.btnStop)
        btnPreview = findViewById(R.id.btnPreview)
        etTitle = findViewById(R.id.etTitle)
        rgRatio = findViewById(R.id.rgRatio)
        rgQuality = findViewById(R.id.rgQuality)
        spTheme = findViewById(R.id.spTheme)
        ivPreview = findViewById(R.id.ivPreview)
        btnMake = findViewById(R.id.btnMake)
        pbMake = findViewById(R.id.pbMake)
        tvMakeStatus = findViewById(R.id.tvMakeStatus)
        rowResult = findViewById(R.id.rowResult)
    }

    private fun snap(v: Float, from: Float, to: Float): Float {
        val c = v.coerceIn(from, to)
        val steps = ((c - from) / 0.05f).roundToInt()
        return ((from + steps * 0.05f) * 100f).roundToInt() / 100f
    }

    private fun restoreSettings() {
        slRate.value = snap(prefs.getFloat("rate", 1.0f), 0.5f, 2.0f)
        slPitch.value = snap(prefs.getFloat("pitch", 1.0f), 0.5f, 1.5f)
        updateSliderLabels()
        etApiKey.setText(prefs.getString("apikey", ""))
        cbAllLang.isChecked = prefs.getBoolean("all_lang", false)
        rgRatio.check(if (prefs.getBoolean("landscape", false)) R.id.rbLandscape else R.id.rbPortrait)
        rgQuality.check(if (prefs.getBoolean("hq", true)) R.id.rb1080 else R.id.rb720)
        setSpinner(spTheme, VideoTheme.ALL.map { it.name }, prefs.getInt("theme", 0).coerceIn(0, VideoTheme.ALL.size - 1))
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupListeners() {
        findViewById<View>(R.id.btnOpen).setOnClickListener {
            try {
                openDoc.launch(arrayOf("text/plain", "text/*", "application/octet-stream"))
            } catch (_: ActivityNotFoundException) {
                toast("파일을 고를 수 있는 앱이 없어요")
            }
        }
        findViewById<View>(R.id.btnPaste).setOnClickListener { pasteClipboard() }
        findViewById<View>(R.id.btnClear).setOnClickListener {
            if (etText.text.isNullOrEmpty()) return@setOnClickListener
            AlertDialog.Builder(this)
                .setMessage("글을 모두 지울까요?")
                .setPositiveButton("지우기") { _, _ -> setTextContent("", null) }
                .setNegativeButton("취소", null)
                .show()
        }

        // ScrollView 안에서도 글 상자 자체를 스크롤할 수 있게
        etText.setOnTouchListener { v, ev ->
            if (v.canScrollVertically(1) || v.canScrollVertically(-1)) {
                v.parent.requestDisallowInterceptTouchEvent(true)
                if (ev.actionMasked == MotionEvent.ACTION_UP || ev.actionMasked == MotionEvent.ACTION_CANCEL) {
                    v.parent.requestDisallowInterceptTouchEvent(false)
                }
            }
            false
        }
        etText.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (restoring) return
                if (reading || paused) stopReading()
                segments = emptyList()
                scheduleRefresh(500)
            }
        })
        etTitle.addTextChangedListener(simpleWatcher { scheduleRefresh(400) })
        etApiKey.addTextChangedListener(simpleWatcher {
            prefs.edit().putString("apikey", etApiKey.text.toString().trim()).apply()
        })

        spEngine.onItemSelectedListener = itemSelected { pos -> engineIds.getOrNull(pos)?.let { selectEngine(it) } }
        spVoice.onItemSelectedListener = itemSelected { pos -> onVoiceSelected(pos) }
        spTheme.onItemSelectedListener = itemSelected { pos ->
            prefs.edit().putInt("theme", pos).apply()
            scheduleRefresh(0)
        }
        cbAllLang.setOnCheckedChangeListener { _, checked ->
            prefs.edit().putBoolean("all_lang", checked).apply()
            if (!cloudMode) loadVoices()
        }

        slRate.setLabelFormatter { String.format(Locale.US, "%.2fx", it) }
        slPitch.setLabelFormatter { String.format(Locale.US, "%.2f", it) }
        slRate.addOnChangeListener { _, _, _ ->
            updateSliderLabels()
            prefs.edit().putFloat("rate", slRate.value).apply()
            scheduleRefresh(300)
        }
        slPitch.addOnChangeListener { _, _, _ ->
            updateSliderLabels()
            prefs.edit().putFloat("pitch", slPitch.value).apply()
        }
        val restartOnRelease = object : Slider.OnSliderTouchListener {
            override fun onStartTrackingTouch(slider: Slider) {}
            override fun onStopTrackingTouch(slider: Slider) {
                // 읽는 중에 속도/음높이를 바꾸면 지금 문장부터 새 설정으로 다시 읽기
                if (reading && !previewing) {
                    stopEngines()
                    speak(segments.map { it.text }, readIndex, readListener)
                }
            }
        }
        slRate.addOnSliderTouchListener(restartOnRelease)
        slPitch.addOnSliderTouchListener(restartOnRelease)

        btnPreview.setOnClickListener { previewVoice() }
        findViewById<View>(R.id.btnVoiceHelp).setOnClickListener { showVoiceHelp() }

        btnPlay.setOnClickListener { startReading() }
        btnPause.setOnClickListener { pauseReading() }
        btnStop.setOnClickListener {
            stopReading()
            tvNow.text = "정지했어요."
        }

        rgRatio.setOnCheckedChangeListener { _, id ->
            prefs.edit().putBoolean("landscape", id == R.id.rbLandscape).apply()
            scheduleRefresh(0)
        }
        rgQuality.setOnCheckedChangeListener { _, id ->
            prefs.edit().putBoolean("hq", id == R.id.rb1080).apply()
        }

        btnMake.setOnClickListener { onMakeClicked() }
        findViewById<View>(R.id.btnWatch).setOnClickListener { watchVideo() }
        findViewById<View>(R.id.btnShare).setOnClickListener { shareVideo() }
    }

    private fun updateSliderLabels() {
        tvRate.text = String.format(Locale.US, "말하기 속도  %.2fx", slRate.value)
        tvPitch.text = String.format(Locale.US, "목소리 높이  %.2f", slPitch.value)
    }

    // ================================================================ 글 불러오기

    private fun handleIncoming(i: Intent?): Boolean {
        if (i == null) return false
        when (i.action) {
            Intent.ACTION_VIEW -> {
                val u = i.data ?: return false
                loadUri(u)
                return true
            }
            Intent.ACTION_SEND -> {
                val u = IntentCompat.getParcelableExtra(i, Intent.EXTRA_STREAM, Uri::class.java)
                if (u != null) {
                    loadUri(u)
                    return true
                }
                val t = i.getStringExtra(Intent.EXTRA_TEXT)
                if (!t.isNullOrEmpty()) {
                    setTextContent(t, null)
                    return true
                }
            }
        }
        return false
    }

    private fun loadUri(uri: Uri) {
        tvFile.text = "불러오는 중…"
        Thread {
            try {
                val name = queryName(uri)
                val bytes = contentResolver.openInputStream(uri)?.use { readLimited(it) }
                    ?: throw IOException("파일을 열 수 없어요")
                val text = TextUtil.decode(bytes)
                main.post { setTextContent(text, name) }
            } catch (e: Exception) {
                Log.e(TAG, "load", e)
                main.post {
                    tvFile.text = "파일을 읽지 못했어요"
                    toast("파일을 읽지 못했어요: ${e.message}")
                }
            }
        }.start()
    }

    private fun readLimited(input: InputStream): ByteArray {
        val out = ByteArrayOutputStream()
        val buf = ByteArray(65536)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            if (out.size() > MAX_FILE) throw IOException("파일이 너무 커요 (20MB 이하만 가능)")
        }
        return out.toByteArray()
    }

    private fun queryName(uri: Uri): String? {
        try {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) return c.getString(0)
            }
        } catch (_: Exception) {
        }
        return uri.lastPathSegment?.substringAfterLast('/')
    }

    private fun setTextContent(text: String, fileName: String?) {
        stopReading()
        etText.setText(text)
        etText.setSelection(0)
        tvFile.text = if (fileName != null) "📄 $fileName" else if (text.isEmpty()) "TXT 파일을 열거나 아래에 글을 직접 써 주세요." else "붙여넣은 글"
        prefs.edit().putString("file_label", tvFile.text.toString()).apply()
        etTitle.setText(fileName?.substringBeforeLast('.') ?: "")
        rowResult.visibility = View.GONE
        scheduleRefresh(0)
    }

    private fun pasteClipboard() {
        val cm = getSystemService(ClipboardManager::class.java)
        val clip = cm?.primaryClip
        val t = if (clip != null && clip.itemCount > 0) clip.getItemAt(0).coerceToText(this)?.toString() else null
        if (t.isNullOrEmpty()) {
            toast("클립보드에 글이 없어요")
            return
        }
        if (etText.text.isNullOrEmpty()) {
            setTextContent(t, null)
        } else {
            val e = etText.text
            val s = max(0, etText.selectionStart)
            val en = max(s, etText.selectionEnd)
            e.replace(s, en, t)
        }
    }

    private fun saveLastText() {
        try {
            val t = etText.text?.toString() ?: ""
            if (t.length < 5_000_000) File(filesDir, "last.txt").writeText(t)
            prefs.edit().putString("title", etTitle.text.toString()).apply()
        } catch (_: Exception) {
        }
    }

    private fun restoreLastText() {
        try {
            val f = File(filesDir, "last.txt")
            if (f.exists()) {
                restoring = true
                etText.setText(f.readText())
                restoring = false
                etTitle.setText(prefs.getString("title", ""))
                prefs.getString("file_label", null)?.let { tvFile.text = it }
            }
        } catch (_: Exception) {
            restoring = false
        }
    }

    private fun updateStats() {
        val text = etText.text?.toString() ?: ""
        if (text.isBlank()) {
            tvStats.text = ""
            return
        }
        val segs = TextUtil.split(text)
        val chars = text.count { !it.isWhitespace() }
        val sec = TextUtil.estimateSeconds(text, segs.size, slRate.value)
        tvStats.text = "글자 ${chars}자 · 문장 ${segs.size}개 · 예상 길이 약 ${TextUtil.formatDuration(sec)}"
    }

    private fun scheduleRefresh(delay: Long) {
        main.removeCallbacks(refresh)
        main.postDelayed(refresh, delay)
    }

    // ================================================================ 음성 엔진 / 목소리

    private fun initTts(pkg: String?) {
        stopReading()
        dtts?.shutdown()
        if (!cloudMode) setSpinner(spVoice, listOf("목소리 불러오는 중…"), 0)
        deviceVoices = emptyList()
        dtts = DeviceTts(this, pkg) { t, ok ->
            if (t === dtts) onTtsReady(t, ok)
        }
    }

    private fun onTtsReady(t: DeviceTts, ok: Boolean) {
        val engines = try {
            t.tts.engines
        } catch (_: Exception) {
            emptyList()
        }
        engineIds = engines.map { it.name } + CLOUD
        val labels = engines.map { it.label + if (it.name == GOOGLE_TTS) "  (추천)" else "" } +
            "☁ Google Cloud 최고음질 (API 키 필요)"
        val sel = if (cloudMode) engineIds.size - 1 else max(0, engineIds.indexOf(t.enginePackage))
        setSpinner(spEngine, labels, sel)

        if (!ok && !cloudMode) toast("음성 엔진을 시작하지 못했어요. ‘목소리 다운로드·설정’을 눌러 확인해 주세요.")
        if (engines.none { it.name == GOOGLE_TTS } && !prefs.getBoolean("asked_google", false)) {
            prefs.edit().putBoolean("asked_google", true).apply()
            AlertDialog.Builder(this)
                .setTitle("더 자연스러운 목소리")
                .setMessage("‘Google 음성 서비스’를 설치하면 사람에 가까운 한국어 여성 목소리를 무료로 쓸 수 있어요. 설치하러 갈까요?")
                .setPositiveButton("설치하기") { _, _ -> openGoogleTtsStore() }
                .setNegativeButton("나중에", null)
                .show()
        }
        if (!cloudMode) loadVoices()
    }

    private fun selectEngine(id: String) {
        if (id == CLOUD) {
            if (cloudMode) return
            stopReading()
            cloudMode = true
            prefs.edit().putString("engine", CLOUD).apply()
            applyEngineUi()
            return
        }
        val wasCloud = cloudMode
        cloudMode = false
        prefs.edit().putString("engine", id).putString("device_engine", id).apply()
        if (wasCloud) applyEngineUi()
        val t = dtts
        if (t == null || (id != t.enginePackage && id != t.requestedEngine)) {
            initTts(id)
        } else if (wasCloud) {
            loadVoices()
        }
    }

    private fun applyEngineUi() {
        boxCloud.visibility = if (cloudMode) View.VISIBLE else View.GONE
        cbAllLang.visibility = if (cloudMode) View.GONE else View.VISIBLE
        if (cloudMode) {
            val saved = prefs.getString("cloud_voice", null)
            val idx = max(0, CloudTts.VOICES.indexOfFirst { it.id == saved })
            setSpinner(spVoice, CloudTts.VOICES.map { it.label }, idx)
        }
    }

    private fun loadVoices() {
        val t = dtts ?: return
        if (!t.ready) {
            deviceVoices = emptyList()
            setSpinner(spVoice, listOf("음성 엔진이 준비되지 않았어요"), 0)
            return
        }
        val online = isOnline()
        val all = t.voices()
        var list = if (cbAllLang.isChecked) all else all.filter { it.locale.language == LANG }
        if (list.isEmpty() && all.isNotEmpty()) {
            list = all
            toast("이 음성 엔진에는 한국어 목소리가 없어요. ‘Google 음성 서비스’를 추천해요.")
        }
        deviceVoices = list.sortedByDescending { VoiceRank.score(it, LANG, online) }
        if (deviceVoices.isEmpty()) {
            setSpinner(spVoice, listOf("기본 목소리"), 0)
            return
        }
        val labels = deviceVoices.mapIndexed { i, v -> (if (i == 0) "★ 추천 · " else "") + VoiceRank.label(v, LANG) }
        val saved = prefs.getString("voice_" + (t.enginePackage ?: ""), null)
        val idx = deviceVoices.indexOfFirst { it.name == saved }.let { if (it < 0) 0 else it }
        setSpinner(spVoice, labels, idx)
        t.setVoice(deviceVoices[idx])
    }

    private fun onVoiceSelected(pos: Int) {
        if (cloudMode) {
            CloudTts.VOICES.getOrNull(pos)?.let { prefs.edit().putString("cloud_voice", it.id).apply() }
            return
        }
        val v = deviceVoices.getOrNull(pos) ?: return
        val t = dtts ?: return
        prefs.edit().putString("voice_" + (t.enginePackage ?: ""), v.name).apply()
        t.setVoice(v)
        if (VoiceRank.notInstalled(v)) {
            toast("이 목소리는 처음 쓸 때 다운로드가 필요할 수 있어요")
        }
    }

    private fun currentCloudVoice(): CloudTts.CloudVoice =
        CloudTts.VOICES.getOrNull(spVoice.selectedItemPosition) ?: CloudTts.VOICES[0]

    private fun isOnline(): Boolean = try {
        val cm = getSystemService(ConnectivityManager::class.java)
        val caps = cm?.getNetworkCapabilities(cm.activeNetwork)
        caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    } catch (_: Exception) {
        false
    }

    private fun showVoiceHelp() {
        val items = arrayOf(
            "선택한 엔진의 목소리 데이터 다운로드",
            "휴대폰 TTS(텍스트 음성 변환) 설정 열기",
            "‘Google 음성 서비스’ 설치/업데이트 (Play 스토어)"
        )
        AlertDialog.Builder(this)
            .setTitle("목소리 다운로드·설정")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> startFirst(
                        Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA).setPackage(dtts?.enginePackage),
                        Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA),
                        Intent("com.android.settings.TTS_SETTINGS")
                    )
                    1 -> startFirst(Intent("com.android.settings.TTS_SETTINGS"), Intent(Settings.ACTION_SETTINGS))
                    2 -> openGoogleTtsStore()
                }
            }
            .setNegativeButton("닫기", null)
            .show()
    }

    private fun openGoogleTtsStore() {
        startFirst(
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$GOOGLE_TTS")),
            Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$GOOGLE_TTS"))
        )
    }

    private fun startFirst(vararg intents: Intent) {
        for (i in intents) {
            try {
                startActivity(i)
                return
            } catch (_: Exception) {
            }
        }
        toast("열 수 있는 화면이 없어요")
    }

    // ================================================================ 읽어 주기

    private val readListener = object : ReadListener {
        override fun onSegment(index: Int) {
            readIndex = index
            segments.getOrNull(index)?.let { showSegment(it) }
        }

        override fun onFinished() {
            reading = false
            paused = false
            readIndex = 0
            clearHighlight()
            tvNow.text = "끝까지 다 읽었어요. 👏"
            updateReadButtons()
        }

        override fun onError(message: String) {
            reading = false
            paused = segments.isNotEmpty()
            toast(message)
            updateReadButtons()
        }
    }

    private val previewListener = object : ReadListener {
        override fun onSegment(index: Int) {
            tvNow.text = SAMPLE
        }

        override fun onFinished() {
            previewing = false
            tvNow.text = "미리듣기 끝. 마음에 들면 ▶ 읽기 또는 🎬 영상 만들기를 눌러 주세요."
            updateReadButtons()
        }

        override fun onError(message: String) {
            previewing = false
            toast(message)
            updateReadButtons()
        }
    }

    private fun previewVoice() {
        if (maker != null) return
        stopReading()
        previewing = true
        reading = false
        tvNow.text = "미리듣기 준비 중…"
        updateReadButtons()
        speak(listOf(SAMPLE), 0, previewListener)
    }

    private fun startReading() {
        if (maker != null) {
            toast("영상을 만드는 중에는 읽을 수 없어요")
            return
        }
        if (!(paused && segments.isNotEmpty())) {
            segments = TextUtil.split(etText.text?.toString() ?: "")
            readIndex = 0
        }
        if (segments.isEmpty()) {
            toast("읽을 글이 없어요. TXT 파일을 열거나 글을 붙여넣어 주세요.")
            return
        }
        stopEngines()
        previewing = false
        reading = true
        paused = false
        updateReadButtons()
        segments.getOrNull(readIndex)?.let { showSegment(it) }
        speak(segments.map { it.text }, readIndex, readListener)
    }

    private fun speak(texts: List<String>, from: Int, l: ReadListener) {
        if (cloudMode) {
            val key = etApiKey.text?.toString()?.trim() ?: ""
            if (key.isEmpty()) {
                l.onError("Google Cloud API 키를 먼저 입력해 주세요.")
                return
            }
            val voice = currentCloudVoice()
            val rate = slRate.value
            val pitch = slPitch.value
            cloudReader = CloudReader({ CloudTts.synthesize(key, voice, it, rate, pitch) }, l).also { it.start(texts, from) }
        } else {
            val t = dtts
            if (t == null || !t.ready) {
                l.onError("음성 엔진이 아직 준비되지 않았어요")
                return
            }
            deviceVoices.getOrNull(spVoice.selectedItemPosition)?.let { t.setVoice(it) }
            t.setParams(slRate.value, slPitch.value)
            t.speak(texts, from, l)
        }
    }

    private fun stopEngines() {
        cloudReader?.stop()
        cloudReader = null
        dtts?.stopSpeaking()
    }

    private fun pauseReading() {
        if (previewing) {
            stopReading()
            return
        }
        if (!reading) return
        stopEngines()
        reading = false
        paused = true
        tvNow.text = "멈췄어요. ▶ 이어 읽기를 누르면 이 문장부터 다시 읽어요."
        updateReadButtons()
    }

    private fun stopReading() {
        stopEngines()
        reading = false
        paused = false
        previewing = false
        readIndex = 0
        clearHighlight()
        updateReadButtons()
    }

    private fun showSegment(seg: TextUtil.Segment) {
        tvNow.text = seg.text
        val e = etText.text ?: return
        e.removeSpan(hlSpan)
        if (seg.end <= e.length) {
            e.setSpan(hlSpan, seg.start, seg.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            etText.bringPointIntoView(seg.start)
        }
    }

    private fun clearHighlight() {
        etText.text?.removeSpan(hlSpan)
    }

    private fun updateReadButtons() {
        val busy = maker != null
        btnPlay.text = if (paused) "▶ 이어 읽기" else "▶ 읽기"
        btnPlay.isEnabled = !reading && !busy
        btnPause.isEnabled = reading || previewing
        btnStop.isEnabled = reading || paused || previewing
        btnPreview.isEnabled = !busy
    }

    // ================================================================ 영상 만들기

    private fun isLandscape() = rgRatio.checkedRadioButtonId == R.id.rbLandscape

    private fun videoSize(): Pair<Int, Int> {
        val hq = rgQuality.checkedRadioButtonId != R.id.rb720
        val long = if (hq) 1920 else 1280
        val short = if (hq) 1080 else 720
        return if (isLandscape()) Pair(long, short) else Pair(short, long)
    }

    private fun sceneMaxLen() = if (isLandscape()) 130 else 90

    private fun currentTheme() = VideoTheme.ALL.getOrNull(spTheme.selectedItemPosition) ?: VideoTheme.ALL[0]

    private fun titleText(): String? = etTitle.text?.toString()?.trim()?.ifEmpty { null }

    private fun renderPreview() {
        try {
            val (w, h) = videoSize()
            val scenes = TextUtil.toScenes(TextUtil.split(etText.text?.toString() ?: "", sceneMaxLen()), sceneMaxLen())
            val first = scenes.firstOrNull() ?: "여기에 글이 한 문장씩 나타나고, 목소리가 함께 읽어 줘요."
            val r = SceneRenderer(w / 3, h / 3, currentTheme(), titleText())
            ivPreview.setImageBitmap(r.scene(first, 0, max(1, scenes.size)))
        } catch (e: Exception) {
            Log.e(TAG, "preview", e)
        }
    }

    private fun onMakeClicked() {
        maker?.let {
            it.cancelled = true
            tvMakeStatus.text = "취소하는 중…"
            return
        }
        val text = etText.text?.toString() ?: ""
        val scenes = TextUtil.toScenes(TextUtil.split(text, sceneMaxLen()), sceneMaxLen())
        if (scenes.isEmpty()) {
            toast("영상으로 만들 글이 없어요")
            return
        }
        if (cloudMode) {
            if ((etApiKey.text?.toString() ?: "").isBlank()) {
                toast("Google Cloud API 키를 먼저 입력해 주세요")
                return
            }
        } else if (dtts?.ready != true) {
            toast("음성 엔진이 아직 준비되지 않았어요")
            return
        }
        val est = TextUtil.estimateSeconds(text, scenes.size, slRate.value)
        if (est > 30 * 60) {
            AlertDialog.Builder(this)
                .setTitle("긴 영상이에요")
                .setMessage("약 ${TextUtil.formatDuration(est)} 길이의 영상이 돼요. 만드는 데 시간이 꽤 걸리고 용량도 커요. 계속할까요?")
                .setPositiveButton("만들기") { _, _ -> startMaking(scenes) }
                .setNegativeButton("취소", null)
                .show()
        } else {
            startMaking(scenes)
        }
    }

    private fun deviceSynth(): (String) -> Pcm? {
        val t = dtts!!
        deviceVoices.getOrNull(spVoice.selectedItemPosition)?.let { t.setVoice(it) }
        t.setParams(slRate.value, slPitch.value)
        val dir = File(cacheDir, "tts").apply { mkdirs() }
        return { s ->
            val f = File(dir, "seg.wav")
            f.delete()
            val ok = t.synthToFile(s, f, 40L + s.length / 4)
            val p = if (ok) Wav.read(f) else null
            f.delete()
            p
        }
    }

    private fun cloudSynth(): (String) -> Pcm? {
        val key = etApiKey.text?.toString()?.trim() ?: ""
        val voice = currentCloudVoice()
        val rate = slRate.value
        val pitch = slPitch.value
        return { s -> CloudTts.synthesize(key, voice, s, rate, pitch) }
    }

    private fun startMaking(scenes: List<String>) {
        stopReading()
        val (w, h) = videoSize()
        val cfg = VideoConfig(w, h, currentTheme(), titleText(), if (max(w, h) >= 1920) 3_000_000 else 1_800_000)
        val synth = if (cloudMode) cloudSynth() else deviceSynth()
        val m = VideoMaker(cacheDir, cfg, synth) { frac, msg ->
            main.post {
                if (maker != null && maker?.cancelled != true) {
                    pbMake.setProgressCompat((frac * 1000).toInt(), true)
                    tvMakeStatus.text = msg
                }
            }
        }
        maker = m
        btnMake.text = "■ 그만 만들기"
        pbMake.visibility = View.VISIBLE
        pbMake.setProgressCompat(0, false)
        tvMakeStatus.text = "준비 중… (화면을 켜 둔 채로 기다려 주세요)"
        rowResult.visibility = View.GONE
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setInputsEnabled(false)
        updateReadButtons()

        Thread {
            val out = File(cacheDir, "render.mp4")
            out.delete()
            var uri: Uri? = null
            var err: String? = null
            var cancelled = false
            try {
                m.make(scenes, out)
                uri = saveVideo(out)
            } catch (_: CancelledException) {
                cancelled = true
            } catch (e: Throwable) {
                Log.e(TAG, "make", e)
                err = e.message ?: e.javaClass.simpleName
            } finally {
                out.delete()
            }
            main.post { finishMaking(uri, err, cancelled) }
        }.start()
    }

    private fun finishMaking(uri: Uri?, err: String?, cancelled: Boolean) {
        maker = null
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        btnMake.text = "🎬 영상 만들기"
        setInputsEnabled(true)
        updateReadButtons()
        when {
            uri != null -> {
                lastVideo = uri
                pbMake.setProgressCompat(1000, true)
                tvMakeStatus.text = if (Build.VERSION.SDK_INT >= 29) {
                    "✅ 완성! 갤러리(Movies › TextVideo 폴더)에 저장했어요."
                } else {
                    "✅ 완성! Android/data/$packageName/files/Movies 에 저장했어요."
                }
                rowResult.visibility = View.VISIBLE
            }
            cancelled -> {
                pbMake.visibility = View.GONE
                tvMakeStatus.text = "영상 만들기를 취소했어요."
            }
            else -> {
                pbMake.visibility = View.GONE
                tvMakeStatus.text = "❌ 영상을 만들지 못했어요: $err"
            }
        }
    }

    private fun setInputsEnabled(on: Boolean) {
        listOf<View>(
            etText, etTitle, spEngine, spVoice, cbAllLang, slRate, slPitch, spTheme, etApiKey,
            findViewById(R.id.btnOpen), findViewById(R.id.btnPaste), findViewById(R.id.btnClear),
            findViewById(R.id.rbPortrait), findViewById(R.id.rbLandscape),
            findViewById(R.id.rb1080), findViewById(R.id.rb720)
        ).forEach { it.isEnabled = on }
    }

    private fun saveVideo(src: File): Uri {
        val name = "TextVideo_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + ".mp4"
        if (Build.VERSION.SDK_INT >= 29) {
            val values = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, name)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/TextVideo")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }
            val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("갤러리에 저장할 수 없어요")
            try {
                contentResolver.openOutputStream(uri)?.use { os -> src.inputStream().use { it.copyTo(os) } }
                    ?: throw IOException("갤러리에 저장할 수 없어요")
                values.clear()
                values.put(MediaStore.Video.Media.IS_PENDING, 0)
                contentResolver.update(uri, values, null, null)
            } catch (e: Exception) {
                contentResolver.delete(uri, null, null)
                throw e
            }
            return uri
        } else {
            val dir = getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: File(filesDir, "movies")
            dir.mkdirs()
            val f = File(dir, name)
            src.copyTo(f, overwrite = true)
            return FileProvider.getUriForFile(this, "$packageName.files", f)
        }
    }

    private fun watchVideo() {
        val u = lastVideo ?: return
        try {
            startActivity(
                Intent(Intent.ACTION_VIEW).setDataAndType(u, "video/mp4")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            )
        } catch (_: ActivityNotFoundException) {
            toast("영상을 재생할 앱이 없어요")
        }
    }

    private fun shareVideo() {
        val u = lastVideo ?: return
        val i = Intent(Intent.ACTION_SEND).setType("video/mp4")
            .putExtra(Intent.EXTRA_STREAM, u)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        startActivity(Intent.createChooser(i, "영상 공유"))
    }

    // ================================================================ 도우미

    private fun setSpinner(sp: Spinner, labels: List<String>, selection: Int) {
        val a = ArrayAdapter(this, android.R.layout.simple_spinner_item, labels)
        a.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        sp.adapter = a
        if (labels.isNotEmpty()) sp.setSelection(selection.coerceIn(0, labels.size - 1), false)
    }

    private fun itemSelected(block: (Int) -> Unit) = object : AdapterView.OnItemSelectedListener {
        override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) = block(position)
        override fun onNothingSelected(parent: AdapterView<*>?) {}
    }

    private fun simpleWatcher(block: () -> Unit) = object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        override fun afterTextChanged(s: Editable?) = block()
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
    }
}
