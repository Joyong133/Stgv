package com.stgv.apphider

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

/**
 * 앱 목록 어댑터.
 *  - manageMode = false (일반/잠금 모드): 숨긴 앱은 애초에 목록에 없고, 체크박스는 숨김. 탭하면 실행.
 *  - manageMode = true  (관리 모드, PIN 해제됨): 모든 앱 표시 + 체크박스로 숨김 토글.
 */
class AppAdapter(
    private val onLaunch: (AppInfo) -> Unit,
    private val onToggleHide: (AppInfo, Boolean) -> Unit
) : RecyclerView.Adapter<AppAdapter.VH>() {

    private val items = mutableListOf<AppInfo>()
    private var hidden: Set<String> = emptySet()
    private var manageMode = false

    fun submit(list: List<AppInfo>, hidden: Set<String>, manageMode: Boolean) {
        this.items.clear()
        this.items.addAll(list)
        this.hidden = hidden
        this.manageMode = manageMode
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_app, parent, false)
        return VH(v)
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val app = items[position]
        holder.icon.setImageDrawable(app.icon)
        holder.label.text = app.label
        holder.pkg.text = app.packageName

        // 체크박스는 관리 모드에서만 노출
        holder.check.setOnCheckedChangeListener(null)
        if (manageMode) {
            holder.check.visibility = View.VISIBLE
            holder.check.isChecked = app.packageName in hidden
            holder.check.setOnCheckedChangeListener { _, isChecked ->
                onToggleHide(app, isChecked)
            }
        } else {
            holder.check.visibility = View.GONE
        }

        holder.itemView.setOnClickListener {
            if (manageMode) {
                // 관리 모드에서는 탭으로 숨김 토글
                holder.check.isChecked = !holder.check.isChecked
            } else {
                onLaunch(app)
            }
        }
    }

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val icon: ImageView = view.findViewById(R.id.app_icon)
        val label: TextView = view.findViewById(R.id.app_label)
        val pkg: TextView = view.findViewById(R.id.app_pkg)
        val check: CheckBox = view.findViewById(R.id.app_check)
    }
}
