extends Control
class_name TouchPad
## 화면 터치 버튼 (멀티 터치). 왼쪽 아래: 좌/우 조향, 오른쪽 아래: 가속/브레이크/드리프트/부스터.

var buttons := {}        # id -> Rect2 (이 컨트롤 기준)
var touches := {}        # 터치 index -> 버튼 id
var tilt_mode := false
var tilt_value := 0.0
var nitro_level := 0.0
var _sb_normal: StyleBoxFlat
var _sb_down: StyleBoxFlat


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_sb_normal = UiKit.box(Color(0.05, 0.04, 0.1, 0.42), 26, Color(1, 1, 1, 0.22), 3, 0)
	_sb_down = UiKit.box(Color(1.0, 0.5, 0.28, 0.55), 26, Color(1, 1, 1, 0.7), 3, 0)
	resized.connect(_layout)
	_layout()


func _layout() -> void:
	var w := size.x
	var h := size.y
	var m := 22.0
	var bs := 150.0
	buttons.clear()
	if not tilt_mode:
		buttons["left"] = Rect2(m, h - m - bs, bs, bs)
		buttons["right"] = Rect2(m + bs + 18.0, h - m - bs, bs, bs)
	buttons["gas"] = Rect2(w - m - 150.0, h - m - 200.0, 150.0, 200.0)
	buttons["brake"] = Rect2(w - m - 150.0 - 18.0 - 132.0, h - m - 140.0, 132.0, 140.0)
	buttons["nitro"] = Rect2(w - m - 150.0, h - m - 200.0 - 16.0 - 96.0, 150.0, 96.0)
	buttons["drift"] = Rect2(w - m - 150.0 - 18.0 - 132.0, h - m - 140.0 - 16.0 - 96.0, 132.0, 96.0)
	queue_redraw()


func set_tilt_mode(on: bool) -> void:
	tilt_mode = on
	touches.clear()
	_layout()


func is_down(id: String) -> bool:
	for v in touches.values():
		if v == id:
			return true
	return false


func release_all() -> void:
	touches.clear()
	queue_redraw()


func _hit(p: Vector2, slack := 0.0) -> String:
	for id in buttons.keys():
		var r: Rect2 = buttons[id]
		if r.grow(slack).has_point(p):
			return id
	return ""


func _input(event: InputEvent) -> void:
	if not is_visible_in_tree():
		return
	if event is InputEventScreenTouch:
		var lp: Vector2 = event.position - global_position
		if event.pressed:
			var b := _hit(lp, 6.0)
			if b != "":
				touches[event.index] = b
				queue_redraw()
		elif touches.has(event.index):
			touches.erase(event.index)
			queue_redraw()
	elif event is InputEventScreenDrag:
		var lp2: Vector2 = event.position - global_position
		var b2 := _hit(lp2, 6.0)
		if touches.has(event.index):
			if b2 != "" and b2 != touches[event.index]:
				var cur: String = touches[event.index]
				# 조향끼리, 페달끼리만 미끄러져 바뀜
				if (cur in ["left", "right"]) == (b2 in ["left", "right"]):
					touches[event.index] = b2
					queue_redraw()
			elif b2 == "":
				var r: Rect2 = buttons.get(touches[event.index], Rect2())
				if not r.grow(70.0).has_point(lp2):
					touches.erase(event.index)
					queue_redraw()


func _draw() -> void:
	var font := UiKit.font_ui
	for id in buttons.keys():
		var r: Rect2 = buttons[id]
		var down := is_down(id)
		draw_style_box(_sb_down if down else _sb_normal, r)
		var c := r.get_center()
		var col := Color(1, 1, 1, 0.95 if down else 0.8)
		match id:
			"left", "right":
				var s := -1.0 if id == "left" else 1.0
				var pts := PackedVector2Array([c + Vector2(s * 34, 0), c + Vector2(-s * 22, -36), c + Vector2(-s * 22, 36)])
				draw_colored_polygon(pts, col)
			"gas":
				_text(font, "가속", c + Vector2(0, 52), 26, col)
				var pts2 := PackedVector2Array([c + Vector2(0, -50), c + Vector2(34, -4), c + Vector2(12, -4),
					c + Vector2(12, 26), c + Vector2(-12, 26), c + Vector2(-12, -4), c + Vector2(-34, -4)])
				draw_colored_polygon(pts2, col)
			"brake":
				_text(font, "브레이크", c + Vector2(0, 42), 22, col)
				draw_rect(Rect2(c + Vector2(-26, -40), Vector2(52, 52)), col, false, 6.0)
				draw_rect(Rect2(c + Vector2(-10, -24), Vector2(20, 20)), col)
			"drift":
				_text(font, "드리프트", c + Vector2(0, 12), 22, col)
			"nitro":
				var fill := Rect2(r.position + Vector2(8, r.size.y - 14), Vector2((r.size.x - 16) * nitro_level, 7))
				draw_rect(Rect2(r.position + Vector2(8, r.size.y - 14), Vector2(r.size.x - 16, 7)), Color(1, 1, 1, 0.15))
				draw_rect(fill, Color(0.35, 0.85, 1.0, 0.95))
				_text(font, "부스터", c + Vector2(0, 6), 24, col if nitro_level > 0.02 else Color(1, 1, 1, 0.35))
	if tilt_mode:
		var base := Vector2(40, size.y - 70)
		var wbar := 260.0
		draw_rect(Rect2(base, Vector2(wbar, 10)), Color(1, 1, 1, 0.18))
		var x := base.x + wbar * 0.5 + tilt_value * wbar * 0.5
		draw_circle(Vector2(x, base.y + 5), 13.0, UiKit.ACCENT)
		_text(font, "기울여서 조향", base + Vector2(wbar * 0.5, -14), 20, Color(1, 1, 1, 0.75))


func _text(font: Font, t: String, center: Vector2, fs: int, col: Color) -> void:
	var w := font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string(font, center + Vector2(-w * 0.5, fs * 0.35), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
