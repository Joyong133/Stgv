package com.stgv.apphider

import android.content.Intent
import android.content.pm.ResolveInfo
import android.os.Bundle
import android.text.InputType
import android.view.Menu
import android.view.MenuItem
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.appbar.MaterialToolbar

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private lateinit var adapter: AppAdapter
    private lateinit var recycler: RecyclerView
    private lateinit var toolbar: MaterialToolbar

    /** true = 관리 모드(PIN 해제됨, 숨긴 앱까지 모두 보임) */
    private var manageMode = false
    private var allApps: List<AppInfo> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = Prefs(this)
        toolbar = findViewById(R.id.toolbar)
        setSupportActionBar(toolbar)

        recycler = findViewById(R.id.recycler)
        recycler.layoutManager = LinearLayoutManager(this)
        adapter = AppAdapter(
            onLaunch = { app -> launchApp(app) },
            onToggleHide = { app, hide -> prefs.setHidden(app.packageName, hide) }
        )
        recycler.adapter = adapter

        if (!prefs.hasPin()) {
            promptSetPin(firstTime = true)
        }
        loadApps()
    }

    override fun onResume() {
        super.onResume()
        // 다른 앱을 실행했다가 돌아오면 다시 잠급니다.
        if (manageMode) {
            manageMode = false
            refresh()
        }
    }

    // ---------- 앱 목록 ----------

    private fun loadApps() {
        val pm = packageManager
        val intent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val resolved: List<ResolveInfo> = pm.queryIntentActivities(intent, 0)
        val self = packageName
        allApps = resolved
            .mapNotNull { ri ->
                val pkg = ri.activityInfo?.packageName ?: return@mapNotNull null
                if (pkg == self) return@mapNotNull null
                AppInfo(
                    label = ri.loadLabel(pm).toString(),
                    packageName = pkg,
                    icon = ri.loadIcon(pm)
                )
            }
            .distinctBy { it.packageName }
            .sortedBy { it.label.lowercase() }
        refresh()
    }

    private fun refresh() {
        val hidden = prefs.getHidden()
        val list = if (manageMode) allApps else allApps.filter { it.packageName !in hidden }
        adapter.submit(list, hidden, manageMode)

        supportActionBar?.title =
            if (manageMode) getString(R.string.title_manage) else getString(R.string.app_name)
        supportActionBar?.subtitle =
            if (manageMode) getString(R.string.subtitle_manage, hidden.size)
            else getString(R.string.subtitle_normal, hidden.size)

        invalidateOptionsMenu()
    }

    private fun launchApp(app: AppInfo) {
        val launch = packageManager.getLaunchIntentForPackage(app.packageName)
        if (launch != null) {
            startActivity(launch)
        } else {
            Toast.makeText(this, getString(R.string.cannot_launch, app.label), Toast.LENGTH_SHORT).show()
        }
    }

    // ---------- 메뉴 ----------

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        menu.findItem(R.id.action_manage).isVisible = !manageMode
        menu.findItem(R.id.action_lock).isVisible = manageMode
        menu.findItem(R.id.action_change_pin).isVisible = manageMode
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_manage -> {
                promptPin { enterManageMode() }
                true
            }
            R.id.action_lock -> {
                manageMode = false
                refresh()
                true
            }
            R.id.action_change_pin -> {
                promptSetPin(firstTime = false)
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun enterManageMode() {
        manageMode = true
        refresh()
    }

    // ---------- PIN 다이얼로그 ----------

    private fun pinEditText(): EditText = EditText(this).apply {
        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        hint = getString(R.string.pin_hint)
    }

    private fun promptSetPin(firstTime: Boolean) {
        val input = pinEditText()
        AlertDialog.Builder(this)
            .setTitle(if (firstTime) R.string.set_pin_title else R.string.change_pin_title)
            .setMessage(R.string.set_pin_msg)
            .setView(input)
            .setCancelable(!firstTime)
            .setPositiveButton(R.string.ok) { _, _ ->
                val pin = input.text.toString()
                if (pin.length < 4) {
                    Toast.makeText(this, R.string.pin_too_short, Toast.LENGTH_SHORT).show()
                    promptSetPin(firstTime)
                } else {
                    prefs.setPin(pin)
                    Toast.makeText(this, R.string.pin_saved, Toast.LENGTH_SHORT).show()
                }
            }
            .apply { if (!firstTime) setNegativeButton(R.string.cancel, null) }
            .show()
    }

    private fun promptPin(onSuccess: () -> Unit) {
        val input = pinEditText()
        AlertDialog.Builder(this)
            .setTitle(R.string.enter_pin_title)
            .setView(input)
            .setPositiveButton(R.string.ok) { _, _ ->
                if (prefs.checkPin(input.text.toString())) {
                    onSuccess()
                } else {
                    Toast.makeText(this, R.string.pin_wrong, Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }
}
