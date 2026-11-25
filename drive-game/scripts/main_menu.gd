extends Control
class_name MainMenu
## 메인 메뉴: 제목 -> 코스 선택 -> 자동차 선택 -> 출발, 그리고 설정.

signal start_game
signal track_changed(id: String)
signal car_changed(model: int, paint: int)
signal view_changed(view: String)
signal quality_changed

var screen := "title"
var content: Control
var _cards := {}


func _ready() -> void:
	theme = UiKit.theme()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var grad := TextureRect.new()
	var gt := GradientTexture2D.new()
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.55, 1.0])
	g.colors = PackedColorArray([Color(0.04, 0.02, 0.09, 0.88), Color(0.04, 0.02, 0.09, 0.55), Color(0.04, 0.02, 0.09, 0.0)])
	gt.gradient = g
	gt.fill_from = Vector2(0, 0)
	gt.fill_to = Vector2(1, 0)
	gt.width = 256
	gt.height = 4
	grad.texture = gt
	grad.stretch_mode = TextureRect.STRETCH_SCALE
	grad.anchor_right = 0.72
	grad.anchor_bottom = 1.0
	grad.offset_left = 0.0
	grad.offset_top = 0.0
	grad.offset_right = 0.0
	grad.offset_bottom = 0.0
	grad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(grad)
	show_screen("title")


func show_screen(s: String) -> void:
	screen = s
	if content != null:
		content.queue_free()
	content = Control.new()
	content.set_anchors_preset(Control.PRESET_FULL_RECT)
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(content)
	match s:
		"title":
			_title()
		"tracks":
			_tracks()
		"cars":
			_cars()
		"settings":
			_settings()
	view_changed.emit("car" if s == "cars" else "wide")


## 뒤로 가기. 더 갈 곳이 없으면 false
func go_back() -> bool:
	match screen:
		"tracks", "settings":
			show_screen("title")
			return true
		"cars":
			show_screen("tracks")
			return true
	return false


func _column(x := 56.0, w := 470.0) -> VBoxContainer:
	var v := UiKit.vbox(12)
	v.anchor_top = 0.0
	v.anchor_bottom = 1.0
	v.offset_left = x
	v.offset_right = x + w
	v.offset_top = 40.0
	v.offset_bottom = -30.0
	content.add_child(v)
	return v


func _title() -> void:
	var v := _column()
	var t := UiKit.label("선셋 드라이브", 88, UiKit.ACCENT, true, 14)
	t.add_theme_color_override("font_outline_color", Color(0.25, 0.05, 0.25, 0.9))
	v.add_child(t)
	var sub := UiKit.label("S U N S E T   D R I V E", 22, UiKit.DIM)
	v.add_child(sub)
	v.add_child(UiKit.spacer(18))
	for m in ["race", "time", "free"]:
		var info: Dictionary = Game.MODES[m]
		var mode: String = m
		var b: Button
		if m == "race":
			b = UiKit.accent_button(info["name"], func() -> void: _pick_mode(mode), 32, Vector2(0, 78))
		else:
			b = UiKit.button(info["name"], func() -> void: _pick_mode(mode), 28, Vector2(0, 66))
		v.add_child(b)
	v.add_child(UiKit.button("설정", func() -> void: show_screen("settings"), 26, Vector2(0, 60)))
	v.add_child(UiKit.spacer(0, 0, true))
	var st := Game.stats
	v.add_child(UiKit.label("레이스 %d회  ·  우승 %d회  ·  총 %.0f km" % [int(st["races"]), int(st["wins"]),
			float(st["distance"]) / 1000.0], 20, UiKit.DIM))


func _pick_mode(m: String) -> void:
	Game.sel["mode"] = m
	show_screen("tracks")


func _tracks() -> void:
	var top := UiKit.vbox(2)
	top.position = Vector2(56, 34)
	content.add_child(top)
	top.add_child(UiKit.label("코스 선택", 52, Color.WHITE, true))
	var mi: Dictionary = Game.MODES[Game.sel["mode"]]
	top.add_child(UiKit.label("%s  ·  %s" % [mi["name"], mi["desc"]], 22, UiKit.DIM))
	var row := UiKit.hbox(20)
	row.anchor_left = 0.0
	row.anchor_right = 1.0
	row.anchor_top = 0.5
	row.anchor_bottom = 0.5
	row.offset_left = 56.0
	row.offset_right = -56.0
	row.offset_top = -150.0
	row.offset_bottom = 170.0
	content.add_child(row)
	_cards.clear()
	for td in TrackData.all():
		var id: String = td["id"]
		var card := Button.new()
		card.focus_mode = Control.FOCUS_NONE
		card.custom_minimum_size = Vector2(300, 300)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.pressed.connect(func() -> void:
			Sfx.play("click", -6.0)
			Game.sel["track"] = id
			_refresh_cards()
			track_changed.emit(id))
		var cv := UiKit.vbox(6)
		cv.set_anchors_preset(Control.PRESET_FULL_RECT)
		cv.offset_left = 22
		cv.offset_top = 18
		cv.offset_right = -22
		cv.offset_bottom = -16
		cv.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(cv)
		var theme_col: Color = {"sunset": Color(1.0, 0.55, 0.35), "day": Color(0.45, 0.85, 0.5),
			"night": Color(0.6, 0.5, 1.0)}[td["theme"]]
		cv.add_child(UiKit.label({"sunset": "노을 · 바다", "day": "낮 · 산", "night": "밤 · 도시"}[td["theme"]], 20, theme_col))
		cv.add_child(UiKit.label(td["name"], 34, Color.WHITE, true))
		var desc := UiKit.label(td["desc"], 20, UiKit.DIM)
		desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc.custom_minimum_size = Vector2(240, 0)
		cv.add_child(desc)
		cv.add_child(UiKit.spacer(0, 0, true))
		var stars := "★".repeat(int(td["level"])) + "☆".repeat(3 - int(td["level"]))
		cv.add_child(UiKit.label("난이도  " + stars, 20, UiKit.GOLD))
		var lap_rec := Game.get_record(id + ":lap")
		var race_rec := Game.get_record(id + ":race%d" % int(Game.settings["laps"]))
		cv.add_child(UiKit.label("최고 랩  " + Game.format_time(lap_rec), 20, Color.WHITE))
		cv.add_child(UiKit.label("최고 레이스  " + Game.format_time(race_rec), 20, Color.WHITE))
		row.add_child(card)
		_cards[id] = card
	_refresh_cards()
	var bottom := UiKit.hbox(14)
	bottom.anchor_left = 1.0
	bottom.anchor_right = 1.0
	bottom.anchor_top = 1.0
	bottom.anchor_bottom = 1.0
	bottom.offset_left = -470.0
	bottom.offset_right = -56.0
	bottom.offset_top = -110.0
	bottom.offset_bottom = -30.0
	bottom.alignment = BoxContainer.ALIGNMENT_END
	content.add_child(bottom)
	bottom.add_child(UiKit.button("뒤로", func() -> void: show_screen("title"), 26, Vector2(150, 72)))
	bottom.add_child(UiKit.accent_button("다음", func() -> void: show_screen("cars"), 30, Vector2(220, 76)))


func _refresh_cards() -> void:
	for id in _cards.keys():
		var card: Button = _cards[id]
		var on: bool = id == Game.sel["track"]
		var bg := Color(0.1, 0.07, 0.18, 0.88) if on else Color(0.06, 0.04, 0.12, 0.7)
		var border := UiKit.ACCENT if on else Color(1, 1, 1, 0.12)
		for st in ["normal", "hover", "pressed", "hover_pressed"]:
			card.add_theme_stylebox_override(st, UiKit.box(bg, 22, border, 4 if on else 2, 0))


func _cars() -> void:
	var v := _column(56.0, 470.0)
	v.add_child(UiKit.label("자동차 선택", 48, Color.WHITE, true))
	var cd := Game.car_def(int(Game.sel["car"]))
	var nav := UiKit.hbox(10)
	v.add_child(nav)
	nav.add_child(UiKit.button("◀", func() -> void: _switch_car(-1), 30, Vector2(70, 64)))
	var name_l := UiKit.label(cd["name"], 36, UiKit.ACCENT, true)
	name_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	nav.add_child(name_l)
	nav.add_child(UiKit.button("▶", func() -> void: _switch_car(1), 30, Vector2(70, 64)))
	var desc := UiKit.label(cd["desc"], 21, UiKit.DIM)
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(desc)
	for pair in [["최고 속도", "stat_speed"], ["가속", "stat_accel"], ["핸들링", "stat_handling"]]:
		var h := UiKit.hbox(12)
		var l := UiKit.label(pair[0], 22, Color.WHITE)
		l.custom_minimum_size = Vector2(120, 0)
		h.add_child(l)
		var b := UiKit.bar(float(cd[pair[1]]), UiKit.ACCENT, 300.0)
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(b)
		v.add_child(h)
	v.add_child(UiKit.label("색상  ·  %s" % Game.PAINT_NAMES[int(Game.sel["paint"])], 22, Color.WHITE))
	var grid := GridContainer.new()
	grid.columns = 8
	grid.add_theme_constant_override("h_separation", 10)
	v.add_child(grid)
	for i in Game.PAINTS.size():
		var idx := i
		var sw := Button.new()
		sw.focus_mode = Control.FOCUS_NONE
		sw.custom_minimum_size = Vector2(46, 46)
		var col: Color = Game.PAINTS[i]
		var on := i == int(Game.sel["paint"])
		for st in ["normal", "hover", "pressed", "hover_pressed"]:
			sw.add_theme_stylebox_override(st, UiKit.box(col, 23, Color.WHITE if on else Color(1, 1, 1, 0.2), 4 if on else 2, 0))
		sw.pressed.connect(func() -> void:
			Sfx.play("click", -6.0)
			Game.sel["paint"] = idx
			car_changed.emit(int(Game.sel["car"]), idx)
			show_screen("cars"))
		grid.add_child(sw)
	v.add_child(UiKit.spacer(0, 0, true))
	var bh := UiKit.hbox(14)
	v.add_child(bh)
	bh.add_child(UiKit.button("뒤로", func() -> void: show_screen("tracks"), 26, Vector2(150, 76)))
	var go := UiKit.accent_button("출발!", func() -> void:
		Game.save_data()
		start_game.emit(), 34, Vector2(0, 80))
	go.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bh.add_child(go)


func _switch_car(d: int) -> void:
	Game.sel["car"] = posmod(int(Game.sel["car"]) + d, Game.CARS.size())
	car_changed.emit(int(Game.sel["car"]), int(Game.sel["paint"]))
	show_screen("cars")


# ------------------------------------------------------------------ 설정

func _settings() -> void:
	var p := UiKit.panel(24)
	p.anchor_left = 0.0
	p.anchor_top = 0.0
	p.offset_left = 56
	p.offset_top = 30
	content.add_child(p)
	var v := UiKit.vbox(6)
	v.custom_minimum_size = Vector2(620, 0)
	p.add_child(v)
	v.add_child(UiKit.label("설정", 44, Color.WHITE, true))
	_row(v, "조작 방식", func() -> String: return "기울기" if Game.settings["control"] == "tilt" else "버튼",
		func(_d: int) -> void: Game.settings["control"] = "buttons" if Game.settings["control"] == "tilt" else "tilt")
	_row(v, "기울기 감도", func() -> String: return "%.1f" % float(Game.settings["tilt_sens"]),
		func(d: int) -> void: Game.settings["tilt_sens"] = clampf(snappedf(float(Game.settings["tilt_sens"]) + d * 0.1, 0.1), 0.5, 2.0))
	_row(v, "그래픽 품질", func() -> String: return ["낮음", "보통", "높음"][int(Game.settings["quality"])],
		func(d: int) -> void:
			Game.settings["quality"] = clampi(int(Game.settings["quality"]) + d, 0, 2)
			quality_changed.emit())
	_row(v, "효과음", func() -> String: return "%d%%" % int(round(float(Game.settings["sfx"]) * 100.0)),
		func(d: int) -> void:
			Game.settings["sfx"] = clampf(snappedf(float(Game.settings["sfx"]) + d * 0.1, 0.1), 0.0, 1.0)
			Game.apply_audio())
	_row(v, "음악", func() -> String: return "%d%%" % int(round(float(Game.settings["music"]) * 100.0)),
		func(d: int) -> void:
			Game.settings["music"] = clampf(snappedf(float(Game.settings["music"]) + d * 0.1, 0.1), 0.0, 1.0)
			Game.apply_audio())
	_row(v, "진동", func() -> String: return "켜기" if Game.settings["vibration"] else "끄기",
		func(_d: int) -> void: Game.settings["vibration"] = not Game.settings["vibration"])
	_row(v, "난이도", func() -> String: return ["쉬움", "보통", "어려움"][int(Game.settings["difficulty"])],
		func(d: int) -> void: Game.settings["difficulty"] = clampi(int(Game.settings["difficulty"]) + d, 0, 2))
	_row(v, "레이스 랩 수", func() -> String: return "%d랩" % int(Game.settings["laps"]),
		func(d: int) -> void:
			var opts := [2, 3, 5]
			var i := opts.find(int(Game.settings["laps"]))
			Game.settings["laps"] = opts[clampi(i + d, 0, opts.size() - 1)])
	_row(v, "카메라", func() -> String: return ["멀리", "가까이", "보닛"][int(Game.settings["camera"])],
		func(d: int) -> void: Game.settings["camera"] = posmod(int(Game.settings["camera"]) + d, 3))
	v.add_child(UiKit.spacer(8))
	v.add_child(UiKit.accent_button("완료", func() -> void:
		Game.save_data()
		show_screen("title"), 28, Vector2(0, 70)))


func _row(parent: Control, title: String, getter: Callable, change: Callable) -> void:
	var h := UiKit.hbox(10)
	var l := UiKit.label(title, 24, Color.WHITE)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(l)
	var val := UiKit.label(getter.call(), 24, UiKit.GOLD)
	val.custom_minimum_size = Vector2(130, 0)
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	h.add_child(UiKit.button("◀", func() -> void:
		change.call(-1)
		val.text = getter.call(), 24, Vector2(64, 56)))
	h.add_child(val)
	h.add_child(UiKit.button("▶", func() -> void:
		change.call(1)
		val.text = getter.call(), 24, Vector2(64, 56)))
	parent.add_child(h)
