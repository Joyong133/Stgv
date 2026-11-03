package com.stgv.textvideo

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class VideoTheme(
    val name: String,
    val top: Int,
    val bottom: Int,
    val text: Int,
    val accent: Int,
    val card: Int,
    val shadow: Boolean
) {
    companion object {
        val ALL = listOf(
            VideoTheme("🌙 밤하늘", 0xFF0F2027.toInt(), 0xFF2C5364.toInt(), Color.WHITE, 0xFF7DD3FC.toInt(), 0x24FFFFFF, true),
            VideoTheme("📜 따뜻한 종이", 0xFFFDF6E3.toInt(), 0xFFF1E0BE.toInt(), 0xFF3B2F2F.toInt(), 0xFFD97706.toInt(), 0x66FFFFFF, false),
            VideoTheme("🎬 시네마 블랙", 0xFF000000.toInt(), 0xFF1C1C1C.toInt(), Color.WHITE, 0xFFFACC15.toInt(), 0x1AFFFFFF, true),
            VideoTheme("🍬 파스텔", 0xFFFBC2EB.toInt(), 0xFFA6C1EE.toInt(), 0xFF2D2D4A.toInt(), 0xFF6D28D9.toInt(), 0x80FFFFFF.toInt(), false),
            VideoTheme("🌲 숲속", 0xFF134E5E.toInt(), 0xFF71B280.toInt(), Color.WHITE, 0xFFFDE68A.toInt(), 0x26FFFFFF, true),
            VideoTheme("🌅 노을", 0xFFFF7E5F.toInt(), 0xFF6A3093.toInt(), Color.WHITE, 0xFFFFE082.toInt(), 0x26000000, true)
        )
    }
}

/** 장면 한 장(배경 + 제목 + 가운데 문장 + 쪽수)을 비트맵으로 그림 */
class SceneRenderer(
    private val w: Int,
    private val h: Int,
    private val theme: VideoTheme,
    private val title: String?
) {
    private val base = min(w, h).toFloat()
    private val portrait = h >= w
    val barPx = max(3, (max(w, h) * 0.005f).roundToInt())

    private val bold: Typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)

    fun background(): Bitmap {
        val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        drawBackground(Canvas(b))
        return b
    }

    private fun drawBackground(c: Canvas) {
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.shader = LinearGradient(0f, 0f, w * 0.35f, h.toFloat(), theme.top, theme.bottom, Shader.TileMode.CLAMP)
        c.drawRect(0f, 0f, w.toFloat(), h.toFloat(), p)
        p.shader = null
        // 은은한 장식 원
        p.color = withAlpha(theme.accent, 0x1C)
        c.drawCircle(w * 0.88f, h * 0.10f, base * 0.38f, p)
        p.color = withAlpha(theme.text, 0x0E)
        c.drawCircle(w * 0.08f, h * 0.92f, base * 0.48f, p)
        // 진행 막대 바탕
        p.color = withAlpha(theme.text, 0x30)
        c.drawRect(0f, (h - barPx).toFloat(), w.toFloat(), h.toFloat(), p)
    }

    fun scene(text: String, index: Int, total: Int): Bitmap {
        val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(b)
        drawBackground(c)
        val margin = w * (if (portrait) 0.07f else 0.09f)

        if (!title.isNullOrBlank()) {
            val tp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = theme.accent
                textSize = base * 0.045f
                typeface = bold
                textAlign = Paint.Align.CENTER
            }
            val t = TextUtils.ellipsize(title, tp, w - margin * 2, TextUtils.TruncateAt.END).toString()
            c.drawText(t, w / 2f, h * (if (portrait) 0.09f else 0.11f), tp)
        }

        val pp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = withAlpha(theme.text, 0x99)
            textSize = base * 0.034f
            textAlign = Paint.Align.CENTER
        }
        c.drawText("${index + 1} / $total", w / 2f, h - barPx - h * 0.035f, pp)

        val boxW = w - margin * 2
        val pad = base * 0.055f
        val textW = (boxW - pad * 2).toInt().coerceAtLeast(10)
        val maxH = h * (if (portrait) 0.62f else 0.60f) - pad * 2
        val tp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = theme.text
            typeface = bold
            if (theme.shadow) setShadowLayer(base * 0.006f, 0f, base * 0.003f, 0x66000000)
        }
        var size = base * (if (portrait) 0.074f else 0.066f)
        var layout: StaticLayout
        while (true) {
            tp.textSize = size
            layout = build(text, tp, textW)
            if (layout.height <= maxH || size <= base * 0.03f) break
            size *= 0.93f
        }
        val cardH = layout.height + pad * 2
        val cardTop = (h - cardH) / 2f
        val rect = RectF(margin, cardTop, w - margin, cardTop + cardH)
        val cp = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = theme.card }
        c.drawRoundRect(rect, base * 0.04f, base * 0.04f, cp)
        // 카드 왼쪽 포인트 줄
        cp.color = theme.accent
        val bar = base * 0.012f
        c.drawRoundRect(RectF(margin, cardTop + pad, margin + bar, cardTop + cardH - pad), bar, bar, cp)

        c.save()
        c.translate(margin + pad, cardTop + pad)
        layout.draw(c)
        c.restore()
        return b
    }

    private fun build(text: String, tp: TextPaint, width: Int): StaticLayout =
        StaticLayout.Builder.obtain(text, 0, text.length, tp, width)
            .setAlignment(Layout.Alignment.ALIGN_CENTER)
            .setLineSpacing(0f, 1.3f)
            .setIncludePad(false)
            .setBreakStrategy(Layout.BREAK_STRATEGY_HIGH_QUALITY)
            .build()

    private fun withAlpha(color: Int, alpha: Int) = (color and 0x00FFFFFF) or (alpha shl 24)
}
