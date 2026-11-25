extends Control
class_name Speedo
## 속도계: 반원 게이지 + 숫자 + 부스터 게이지

var kmh := 0.0
var max_kmh := 280.0
var nitro := 0.0
var nitro_active := false
var gear := 1


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(300, 168)


func _draw() -> void:
	var font := UiKit.font_ui
	var c := Vector2(size.x * 0.5, size.y - 26.0)
	var r := 118.0
	draw_arc(c, r, PI, TAU, 48, Color(0, 0, 0, 0.35), 22.0, true)
	draw_arc(c, r, PI, TAU, 48, Color(1, 1, 1, 0.14), 12.0, true)
	var f := clampf(kmh / max_kmh, 0.0, 1.0)
	if f > 0.003:
		var col := UiKit.ACCENT.lerp(UiKit.ACCENT2, f)
		if nitro_active:
			col = Color(0.4, 0.85, 1.0)
		draw_arc(c, r, PI, PI + PI * f, 48, col, 12.0, true)
	for k in 15:
		var a := PI + PI * k / 14.0
		var d := Vector2(cos(a), sin(a))
		var tick_len := 14.0 if k % 2 == 0 else 7.0
		draw_line(c + d * (r - 20.0), c + d * (r - 20.0 - tick_len), Color(1, 1, 1, 0.5), 2.0, true)
	var txt := "%d" % int(round(kmh))
	var fs := 64
	var w := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string_outline(font, c + Vector2(-w * 0.5, -26), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 8, Color(0, 0, 0, 0.5))
	draw_string(font, c + Vector2(-w * 0.5, -26), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.WHITE)
	var unit := "km/h"
	var uw := font.get_string_size(unit, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
	draw_string(font, c + Vector2(-uw * 0.5, -4), unit, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(1, 1, 1, 0.7))
	var g := "%d단" % gear
	draw_string(font, c + Vector2(r - 34, 4), g, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(1, 1, 1, 0.6))
	# 부스터 게이지
	var bw := 190.0
	var br := Rect2(c + Vector2(-bw * 0.5, 10), Vector2(bw, 9))
	draw_rect(br, Color(1, 1, 1, 0.15))
	draw_rect(Rect2(br.position, Vector2(bw * clampf(nitro, 0.0, 1.0), 9)),
			Color(0.4, 0.88, 1.0) if not nitro_active else Color(1, 1, 1))
