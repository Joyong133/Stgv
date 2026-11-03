package com.stgv.textvideo

import android.graphics.Bitmap
import android.graphics.Color
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.opengl.GLES20
import android.opengl.GLUtils
import android.view.Surface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/** 인코더 입력 Surface 에 OpenGL 로 그리기 위한 EGL 환경 */
class EglCore(surface: Surface) {
    private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
    private var context: EGLContext = EGL14.EGL_NO_CONTEXT
    private var eglSurface: EGLSurface = EGL14.EGL_NO_SURFACE

    init {
        display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        val ver = IntArray(2)
        if (!EGL14.eglInitialize(display, ver, 0, ver, 1)) throw RuntimeException("eglInitialize 실패")
        val attrs = intArrayOf(
            EGL14.EGL_RED_SIZE, 8,
            EGL14.EGL_GREEN_SIZE, 8,
            EGL14.EGL_BLUE_SIZE, 8,
            EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
            EGL_RECORDABLE_ANDROID, 1,
            EGL14.EGL_NONE
        )
        val configs = arrayOfNulls<EGLConfig>(1)
        val num = IntArray(1)
        if (!EGL14.eglChooseConfig(display, attrs, 0, configs, 0, 1, num, 0) || num[0] == 0) {
            throw RuntimeException("eglChooseConfig 실패")
        }
        context = EGL14.eglCreateContext(
            display, configs[0], EGL14.EGL_NO_CONTEXT,
            intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0
        )
        if (context == EGL14.EGL_NO_CONTEXT) throw RuntimeException("eglCreateContext 실패")
        eglSurface = EGL14.eglCreateWindowSurface(display, configs[0], surface, intArrayOf(EGL14.EGL_NONE), 0)
        if (eglSurface == EGL14.EGL_NO_SURFACE) throw RuntimeException("eglCreateWindowSurface 실패")
        if (!EGL14.eglMakeCurrent(display, eglSurface, eglSurface, context)) throw RuntimeException("eglMakeCurrent 실패")
    }

    fun setPresentationTime(ns: Long) {
        EGLExt.eglPresentationTimeANDROID(display, eglSurface, ns)
    }

    fun swap() {
        EGL14.eglSwapBuffers(display, eglSurface)
    }

    fun release() {
        if (display != EGL14.EGL_NO_DISPLAY) {
            EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
            EGL14.eglDestroySurface(display, eglSurface)
            EGL14.eglDestroyContext(display, context)
            EGL14.eglReleaseThread()
            EGL14.eglTerminate(display)
        }
        display = EGL14.EGL_NO_DISPLAY
        context = EGL14.EGL_NO_CONTEXT
        eglSurface = EGL14.EGL_NO_SURFACE
    }

    companion object {
        private const val EGL_RECORDABLE_ANDROID = 0x3142
    }
}

/** 비트맵 텍스처를 화면 가득 그리는 사각형 (rotate = 세로 영상을 90도 돌려 저장해야 하는 기기용) */
class GlQuad(rotate: Boolean) {
    private val program: Int
    private val aPos: Int
    private val aTex: Int
    private val uTex: Int
    private val uAlpha: Int
    private val posBuf = floats(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)
    private val texBuf = if (rotate) floats(0f, 0f, 0f, 1f, 1f, 0f, 1f, 1f)
    else floats(0f, 1f, 1f, 1f, 0f, 0f, 1f, 0f)

    init {
        program = link(
            """
            attribute vec4 aPos;
            attribute vec2 aTex;
            varying vec2 vTex;
            void main() { gl_Position = aPos; vTex = aTex; }
            """.trimIndent(),
            """
            precision mediump float;
            varying vec2 vTex;
            uniform sampler2D uTex;
            uniform float uAlpha;
            void main() { vec4 c = texture2D(uTex, vTex); gl_FragColor = vec4(c.rgb, c.a * uAlpha); }
            """.trimIndent()
        )
        aPos = GLES20.glGetAttribLocation(program, "aPos")
        aTex = GLES20.glGetAttribLocation(program, "aTex")
        uTex = GLES20.glGetUniformLocation(program, "uTex")
        uAlpha = GLES20.glGetUniformLocation(program, "uAlpha")
    }

    fun upload(b: Bitmap, existing: Int): Int {
        val id = if (existing != 0) existing else IntArray(1).also { GLES20.glGenTextures(1, it, 0) }[0]
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, id)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, b, 0)
        return id
    }

    fun draw(tex: Int, alpha: Float) {
        if (alpha <= 0f || tex == 0) return
        GLES20.glUseProgram(program)
        if (alpha < 1f) {
            GLES20.glEnable(GLES20.GL_BLEND)
            GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
        } else {
            GLES20.glDisable(GLES20.GL_BLEND)
        }
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, tex)
        GLES20.glUniform1i(uTex, 0)
        GLES20.glUniform1f(uAlpha, alpha)
        GLES20.glEnableVertexAttribArray(aPos)
        GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 8, posBuf)
        GLES20.glEnableVertexAttribArray(aTex)
        GLES20.glVertexAttribPointer(aTex, 2, GLES20.GL_FLOAT, false, 8, texBuf)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(aPos)
        GLES20.glDisableVertexAttribArray(aTex)
    }

    /** 사각 영역을 단색으로 채움 (진행 막대) */
    fun fill(x: Int, y: Int, w: Int, h: Int, color: Int) {
        if (w <= 0 || h <= 0) return
        GLES20.glEnable(GLES20.GL_SCISSOR_TEST)
        GLES20.glScissor(x, y, w, h)
        GLES20.glClearColor(Color.red(color) / 255f, Color.green(color) / 255f, Color.blue(color) / 255f, 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        GLES20.glDisable(GLES20.GL_SCISSOR_TEST)
    }

    fun release() {
        GLES20.glDeleteProgram(program)
    }

    private fun floats(vararg v: Float): FloatBuffer =
        ByteBuffer.allocateDirect(v.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
            put(v)
            position(0)
        }

    private fun compile(type: Int, src: String): Int {
        val s = GLES20.glCreateShader(type)
        GLES20.glShaderSource(s, src)
        GLES20.glCompileShader(s)
        val ok = IntArray(1)
        GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0)
        if (ok[0] == 0) {
            val log = GLES20.glGetShaderInfoLog(s)
            GLES20.glDeleteShader(s)
            throw RuntimeException("셰이더 오류: $log")
        }
        return s
    }

    private fun link(vs: String, fs: String): Int {
        val p = GLES20.glCreateProgram()
        GLES20.glAttachShader(p, compile(GLES20.GL_VERTEX_SHADER, vs))
        GLES20.glAttachShader(p, compile(GLES20.GL_FRAGMENT_SHADER, fs))
        GLES20.glLinkProgram(p)
        val ok = IntArray(1)
        GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, ok, 0)
        if (ok[0] == 0) throw RuntimeException("프로그램 링크 오류: " + GLES20.glGetProgramInfoLog(p))
        return p
    }
}
