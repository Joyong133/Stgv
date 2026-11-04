package com.stgv.apphider

import android.content.Context
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * SharedPreferences 래퍼.
 * - PIN은 평문으로 저장하지 않고 임의 salt + SHA-256 해시로 저장합니다.
 * - 숨긴 앱의 패키지명 집합을 저장합니다.
 */
class Prefs(context: Context) {

    private val sp = context.applicationContext
        .getSharedPreferences("app_hider_prefs", Context.MODE_PRIVATE)

    // ---- PIN ----

    fun hasPin(): Boolean = sp.contains(KEY_PIN_HASH) && sp.contains(KEY_PIN_SALT)

    fun setPin(pin: String) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val hash = hash(pin, salt)
        sp.edit()
            .putString(KEY_PIN_SALT, salt.toHex())
            .putString(KEY_PIN_HASH, hash)
            .apply()
    }

    fun checkPin(pin: String): Boolean {
        val saltHex = sp.getString(KEY_PIN_SALT, null) ?: return false
        val stored = sp.getString(KEY_PIN_HASH, null) ?: return false
        return hash(pin, saltHex.fromHex()) == stored
    }

    private fun hash(pin: String, salt: ByteArray): String {
        val md = MessageDigest.getInstance("SHA-256")
        md.update(salt)
        md.update(pin.toByteArray(Charsets.UTF_8))
        return md.digest().toHex()
    }

    // ---- 숨긴 앱 ----

    fun getHidden(): Set<String> =
        sp.getStringSet(KEY_HIDDEN, emptySet())?.toSet() ?: emptySet()

    fun setHidden(pkg: String, hidden: Boolean) {
        val set = getHidden().toMutableSet()
        if (hidden) set.add(pkg) else set.remove(pkg)
        sp.edit().putStringSet(KEY_HIDDEN, set).apply()
    }

    private fun ByteArray.toHex(): String =
        joinToString("") { "%02x".format(it) }

    private fun String.fromHex(): ByteArray =
        chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    companion object {
        private const val KEY_PIN_HASH = "pin_hash"
        private const val KEY_PIN_SALT = "pin_salt"
        private const val KEY_HIDDEN = "hidden_packages"
    }
}
