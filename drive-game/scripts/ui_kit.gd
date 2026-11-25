extends RefCounted
class_name UiKit
## UI 테마와 위젯 도우미. 기준 해상도 1280x720 (가로는 화면비에 따라 늘어남).

const ACCENT := Color(1.0, 0.5, 0.28)
const ACCENT2 := Color(0.96, 0.3, 0.55)
const PANEL := Color(0.07, 0.05, 0.13, 0.82)
const TEXT := Color(1, 1, 1)
const DIM := Color(0.8, 0.76, 0.88)
const GOLD := Color(1.0, 0.82, 0.3)
const GOOD := Color(0.4, 1.0, 0.6)
const BAD := Color(1.0, 0.35, 0.35)

static var _theme: Theme
static var font_ui: Font
static var font_title: Font


static func fonts() -> void:
	if font_ui == null:
		font_ui = load("res://assets/fonts/NotoSansKR-Bold.ttf")
		font_title = load("res://assets/fonts/BlackHanSans-Regular.ttf")


static func theme() -> Theme:
	if _theme != null:
		return _theme
	fonts()
	var t := Theme.new()
	t.default_font = font_ui
	t.default_font_size = 24
	t.set_stylebox("normal", "Button", box(Color(1, 1, 1, 0.1), 16, Color(1, 1, 1, 0.16)))
	t.set_stylebox("hover", "Button", box(Color(1, 1, 1, 0.16), 16, Color(1, 1, 1, 0.3)))
	t.set_stylebox("pressed", "Button", box(ACCENT.darkened(0.15), 16, ACCENT.lightened(0.2)))
	t.set_stylebox("hover_pressed", "Button", box(ACCENT.darkened(0.1), 16, ACCENT.lightened(0.2)))
	t.set_stylebox("disabled", "Button", box(Color(1, 1, 1, 0.04), 16))
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		t.set_color(c, "Button", TEXT)
	t.set_color("font_disabled_color", "Button", Color(1, 1, 1, 0.35))
	t.set_font_size("font_size", "Button", 26)
	t.set_stylebox("panel", "PanelContainer", box(PANEL, 24, Color(1, 1, 1, 0.08), 2, 22))
	t.set_stylebox("panel", "Panel", box(PANEL, 24))
	t.set_color("font_color", "Label", TEXT)
	t.set_color("font_outline_color", "Label", Color(0, 0, 0, 0.55))
	_theme = t
	return t


static func box(bg: Color, radius := 16, border := Color(0, 0, 0, 0), bw := 2, pad := 14) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(radius)
	if border.a > 0.0:
		s.border_color = border
		s.set_border_width_all(bw)
	s.content_margin_left = pad + 8
	s.content_margin_right = pad + 8
	s.content_margin_top = pad * 0.6
	s.content_margin_bottom = pad * 0.6
	s.anti_aliasing = true
	return s


static func label(text: String, size := 24, color := TEXT, title := false, outline := 0) -> Label:
	fonts()
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if title:
		l.add_theme_font_override("font", font_title)
	if outline > 0:
		l.add_theme_constant_override("outline_size", outline)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func button(text: String, cb: Callable, size := 26, min_size := Vector2(0, 64)) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = min_size
	b.add_theme_font_size_override("font_size", size)
	b.pressed.connect(func() -> void:
		Sfx.play("click", -6.0)
		cb.call())
	return b


static func accent_button(text: String, cb: Callable, size := 30, min_size := Vector2(0, 76)) -> Button:
	var b := button(text, cb, size, min_size)
	b.add_theme_stylebox_override("normal", box(ACCENT, 18, ACCENT.lightened(0.3)))
	b.add_theme_stylebox_override("hover", box(ACCENT.lightened(0.1), 18, Color(1, 1, 1, 0.6)))
	b.add_theme_stylebox_override("pressed", box(ACCENT2, 18, Color(1, 1, 1, 0.6)))
	b.add_theme_stylebox_override("hover_pressed", box(ACCENT2, 18, Color(1, 1, 1, 0.6)))
	return b


static func panel(pad := 22) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", box(PANEL, 24, Color(1, 1, 1, 0.08), 2, pad))
	return p


static func vbox(sep := 12) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	return v


static func hbox(sep := 12) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	return h


static func spacer(h := 0.0, w := 0.0, expand := false) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(w, h)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if expand:
		c.size_flags_vertical = Control.SIZE_EXPAND_FILL
		c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c


## 0~1 값을 보여주는 막대
static func bar(value: float, color := ACCENT, w := 220.0) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(w, 14)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.draw.connect(func() -> void:
		var r := Rect2(Vector2.ZERO, c.size)
		c.draw_style_box(box(Color(1, 1, 1, 0.12), 7, Color(0, 0, 0, 0), 0, 0), r)
		var f := Rect2(Vector2.ZERO, Vector2(maxf(14.0, c.size.x * clampf(value, 0.0, 1.0)), c.size.y))
		c.draw_style_box(box(color, 7, Color(0, 0, 0, 0), 0, 0), f))
	return c
