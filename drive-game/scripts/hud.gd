extends CanvasLayer
class_name Hud
## 주행 화면 UI: 순위/랩/시간, 속도계, 미니맵, 터치 버튼, 메시지, 일시정지 메뉴, 결과 화면.

var race: Race
var root: Control
var safe: Control
var pad: TouchPad
var speedo: Speedo
var minimap: MiniMap
var pos_big: Label
var pos_small: Label
var lap_label: Label
var time_label: Label
var sub_label: Label
var center_label: Label
var msg_label: Label
var warn_label: Label
var pause_menu: Control
var results: Control
var info_panel: PanelContainer
var msg_t := 0.0
var _blink := 0.0


static func place(c: Control, anchor: Vector2, pos: Vector2, sz: Vector2) -> void:
	c.anchor_left = anchor.x
	c.anchor_right = anchor.x
	c.anchor_top = anchor.y
	c.anchor_bottom = anchor.y
	c.offset_left = pos.x
	c.offset_top = pos.y
	c.offset_right = pos.x + sz.x
	c.offset_bottom = pos.y + sz.y


func setup(r: Race) -> void:
	race = r
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	root = Control.new()
	root.theme = UiKit.theme()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	safe = Control.new()
	safe.set_anchors_preset(Control.PRESET_FULL_RECT)
	safe.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(safe)

	# 터치 버튼 (가장 아래 층)
	pad = TouchPad.new()
	safe.add_child(pad)
	pad.set_tilt_mode(Game.settings["control"] == "tilt")

	# 왼쪽 위: 순위 / 랩
	info_panel = UiKit.panel(12)
	place(info_panel, Vector2(0, 0), Vector2(18, 14), Vector2(10, 10))
	safe.add_child(info_panel)
	var iv := UiKit.vbox(0)
	info_panel.add_child(iv)
	var ph := UiKit.hbox(6)
	iv.add_child(ph)
	pos_big = UiKit.label("1", 58, Color.WHITE, true)
	pos_small = UiKit.label("/ 6", 28, UiKit.DIM)
	pos_small.size_flags_vertical = Control.SIZE_SHRINK_END
	ph.add_child(pos_big)
	ph.add_child(pos_small)
	lap_label = UiKit.label("랩 1 / 3", 26, UiKit.GOLD)
	iv.add_child(lap_label)
	if race.mode != "race":
		pos_big.visible = false
		pos_small.visible = false

	# 가운데 위: 시간
	var tv := UiKit.vbox(0)
	tv.alignment = BoxContainer.ALIGNMENT_BEGIN
	place(tv, Vector2(0.5, 0), Vector2(-200, 12), Vector2(400, 90))
	safe.add_child(tv)
	time_label = UiKit.label("0:00.00", 40, Color.WHITE, false, 8)
	time_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tv.add_child(time_label)
	sub_label = UiKit.label("", 22, UiKit.DIM, false, 6)
	sub_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tv.add_child(sub_label)

	# 오른쪽 위: 버튼들
	var bh := UiKit.hbox(10)
	place(bh, Vector2(1, 0), Vector2(-18 - 280, 14), Vector2(280, 66))
	bh.alignment = BoxContainer.ALIGNMENT_END
	safe.add_child(bh)
	bh.add_child(UiKit.button("복귀", func() -> void: race.request_respawn(), 22, Vector2(80, 62)))
	bh.add_child(UiKit.button("시점", func() -> void: race.cycle_camera(), 22, Vector2(80, 62)))
	bh.add_child(UiKit.button("II", func() -> void: race.set_paused(true), 26, Vector2(72, 62)))

	# 미니맵
	minimap = MiniMap.new()
	place(minimap, Vector2(1, 0), Vector2(-18 - 200, 92), Vector2(200, 200))
	safe.add_child(minimap)
	minimap.setup(race.track, race.cars, race.player)

	# 아래 가운데: 속도계
	speedo = Speedo.new()
	place(speedo, Vector2(0.5, 1), Vector2(-150, -176), Vector2(300, 168))
	safe.add_child(speedo)

	# 가운데 글자들
	center_label = UiKit.label("", 150, Color.WHITE, true, 18)
	center_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	place(center_label, Vector2(0.5, 0.5), Vector2(-400, -190), Vector2(800, 200))
	center_label.pivot_offset = Vector2(400, 100)
	safe.add_child(center_label)
	msg_label = UiKit.label("", 40, UiKit.GOLD, true, 10)
	msg_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	place(msg_label, Vector2(0.5, 0), Vector2(-450, 128), Vector2(900, 60))
	safe.add_child(msg_label)
	warn_label = UiKit.label("역주행!", 64, UiKit.BAD, true, 12)
	warn_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	place(warn_label, Vector2(0.5, 0.5), Vector2(-300, -60), Vector2(600, 90))
	warn_label.visible = false
	safe.add_child(warn_label)

	_build_pause_menu()
	_apply_safe_area()
	get_viewport().size_changed.connect(_apply_safe_area)


func _apply_safe_area() -> void:
	if not OS.has_feature("mobile"):
		return
	var win := DisplayServer.window_get_size()
	if win.x <= 0:
		return
	var sa := DisplayServer.get_display_safe_area()
	var vis := root.get_viewport_rect().size
	var k := vis.x / float(win.x)
	var wpos := DisplayServer.window_get_position()
	safe.offset_left = maxf(0.0, float(sa.position.x - wpos.x)) * k
	safe.offset_top = maxf(0.0, float(sa.position.y - wpos.y)) * k
	safe.offset_right = -maxf(0.0, float((wpos.x + win.x) - sa.end.x)) * k
	safe.offset_bottom = -maxf(0.0, float((wpos.y + win.y) - sa.end.y)) * k


func set_control_mode(tilt: bool) -> void:
	pad.set_tilt_mode(tilt)


# ------------------------------------------------------------------ 매 프레임

func update_hud(dt: float) -> void:
	var p := race.player
	speedo.kmh = absf(p.speed) * 3.6
	speedo.max_kmh = 280.0
	speedo.nitro = p.nitro
	speedo.nitro_active = p.nitro_active
	speedo.gear = p.gear
	speedo.queue_redraw()
	pad.nitro_level = p.nitro
	pad.queue_redraw()
	minimap.queue_redraw()
	match race.mode:
		"race":
			pos_big.text = "%d" % p.place
			pos_small.text = "/ %d" % race.cars.size()
			lap_label.text = "랩 %d / %d" % [clampi(p.laps_done + 1, 1, race.laps_total), race.laps_total]
			time_label.text = Game.format_time(race.race_time) if race.state != "countdown" else "0:00.00"
			sub_label.text = "최고 랩  %s" % Game.format_time(p.best_lap) if p.best_lap > 0.0 else ""
		"time":
			if race.time_started:
				lap_label.text = "랩 %d" % (p.laps_done + 1)
				time_label.text = Game.format_time(race.race_time - p.lap_start)
			else:
				lap_label.text = "출발선으로!"
				time_label.text = "0:00.00"
			var rec := Game.get_record(race.track_def["id"] + ":lap")
			sub_label.text = "최고 기록  %s" % Game.format_time(rec)
		"free":
			lap_label.text = "자유 주행"
			time_label.text = "%.1f km" % (p.distance / 1000.0)
			sub_label.text = "드리프트 점수  %d" % int(p.drift_score * 10.0)
	if msg_t > 0.0:
		msg_t -= dt
		msg_label.modulate.a = clampf(msg_t / 0.4, 0.0, 1.0)
	_blink += dt
	warn_label.visible = p.wrong_way_t > 1.0 and fmod(_blink, 0.6) < 0.4
	if Game.settings["control"] == "tilt":
		pad.tilt_value = p.in_steer


func show_message(text: String, color := UiKit.GOLD, dur := 2.0) -> void:
	msg_label.text = text
	msg_label.add_theme_color_override("font_color", color)
	msg_label.modulate.a = 1.0
	msg_t = dur


func show_center(text: String, color := Color.WHITE) -> void:
	center_label.text = text
	center_label.add_theme_color_override("font_color", color)
	center_label.modulate.a = 1.0
	center_label.scale = Vector2(1.6, 1.6)
	var tw := center_label.create_tween()
	tw.tween_property(center_label, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_interval(0.45)
	tw.tween_property(center_label, "modulate:a", 0.0, 0.3)


# ------------------------------------------------------------------ 일시정지

func _build_pause_menu() -> void:
	pause_menu = Control.new()
	pause_menu.set_anchors_preset(Control.PRESET_FULL_RECT)
	pause_menu.visible = false
	root.add_child(pause_menu)
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.01, 0.05, 0.6)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	pause_menu.add_child(dim)
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	pause_menu.add_child(cc)
	var p := UiKit.panel(26)
	cc.add_child(p)
	var v := UiKit.vbox(12)
	v.custom_minimum_size = Vector2(380, 0)
	p.add_child(v)
	var t := UiKit.label("일시 정지", 44, Color.WHITE, true)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	v.add_child(UiKit.accent_button("계속하기", func() -> void: race.set_paused(false)))
	v.add_child(UiKit.button("다시 시작", func() -> void: race.restart()))
	var ctrl_btn := UiKit.button("", func() -> void: pass)
	ctrl_btn.pressed.connect(func() -> void:
		Game.settings["control"] = "buttons" if Game.settings["control"] == "tilt" else "tilt"
		Game.save_data()
		set_control_mode(Game.settings["control"] == "tilt")
		ctrl_btn.text = _control_text())
	ctrl_btn.text = _control_text()
	v.add_child(ctrl_btn)
	v.add_child(UiKit.button("메뉴로 나가기", func() -> void: race.exit_to_menu()))


func _control_text() -> String:
	return "조작: 기울기" if Game.settings["control"] == "tilt" else "조작: 버튼"


func show_pause(on: bool) -> void:
	pause_menu.visible = on
	pad.release_all()


# ------------------------------------------------------------------ 결과

func show_results(rows: Array, title: String, title_color: Color, notes: Array) -> void:
	if results != null:
		results.queue_free()
	pad.visible = false
	results = Control.new()
	results.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(results)
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.01, 0.05, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	results.add_child(dim)
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	results.add_child(cc)
	var p := UiKit.panel(26)
	cc.add_child(p)
	var v := UiKit.vbox(8)
	v.custom_minimum_size = Vector2(620, 0)
	p.add_child(v)
	var t := UiKit.label(title, 60, title_color, true, 10)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	for n in notes:
		var nl := UiKit.label(n, 24, UiKit.GOLD)
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(nl)
	v.add_child(UiKit.spacer(6))
	for row in rows:
		var h := UiKit.hbox(10)
		var is_player: bool = row["player"]
		var col := UiKit.ACCENT if is_player else Color.WHITE
		var a := UiKit.label(str(row["place"]), 28, col, true)
		a.custom_minimum_size = Vector2(48, 0)
		var b := UiKit.label(row["name"], 26, col)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var c := UiKit.label(row["time"], 26, col)
		c.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		c.custom_minimum_size = Vector2(150, 0)
		h.add_child(a)
		h.add_child(b)
		h.add_child(c)
		v.add_child(h)
	v.add_child(UiKit.spacer(10))
	var bh := UiKit.hbox(14)
	bh.alignment = BoxContainer.ALIGNMENT_CENTER
	var again := UiKit.accent_button("다시 하기", func() -> void: race.restart(), 28, Vector2(220, 72))
	var menu := UiKit.button("메뉴로", func() -> void: race.exit_to_menu(), 28, Vector2(200, 72))
	bh.add_child(again)
	bh.add_child(menu)
	v.add_child(bh)
	p.modulate.a = 0.0
	p.create_tween().tween_property(p, "modulate:a", 1.0, 0.35)
