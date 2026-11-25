extends Control
class_name MiniMap
## 코스 미니맵: 코스 윤곽과 차 위치

var track: Track
var cars: Array = []
var player: Car
var pts := PackedVector2Array()
var _scale := 1.0
var _offset := Vector2.ZERO
var _sb: StyleBoxFlat


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(200, 200)
	_sb = UiKit.box(Color(0.05, 0.04, 0.1, 0.45), 20, Color(1, 1, 1, 0.12), 2, 0)


func setup(t: Track, c: Array, p: Car) -> void:
	track = t
	cars = c
	player = p
	var b := t.bounds
	var pad := 16.0
	var avail := custom_minimum_size - Vector2(pad * 2.0, pad * 2.0)
	_scale = minf(avail.x / b.size.x, avail.y / b.size.y)
	_offset = Vector2(pad, pad) + (avail - b.size * _scale) * 0.5 - b.position * _scale
	pts = PackedVector2Array()
	var i := 0
	while i < t.n:
		pts.append(_map(t.pos[i]))
		i += 4
	pts.append(pts[0])


func _map(p: Vector3) -> Vector2:
	return Vector2(p.x, p.z) * _scale + _offset


func _draw() -> void:
	if track == null:
		return
	draw_style_box(_sb, Rect2(Vector2.ZERO, size))
	draw_polyline(pts, Color(0, 0, 0, 0.55), 9.0, true)
	draw_polyline(pts, Color(1, 1, 1, 0.85), 4.0, true)
	var s0 := _map(track.pos[0])
	draw_circle(s0, 5.0, UiKit.GOLD)
	for c in cars:
		if c == player:
			continue
		var car: Car = c
		draw_circle(_map(car.position), 5.5, Color(0, 0, 0, 0.6))
		draw_circle(_map(car.position), 4.0, car.paint.lightened(0.15))
	if player != null:
		var pp := _map(player.position)
		var f := player.forward()
		var dir := Vector2(f.x, f.z)
		var side := Vector2(-dir.y, dir.x)
		var tri := PackedVector2Array([pp + dir * 9.0, pp - dir * 6.0 + side * 6.0, pp - dir * 6.0 - side * 6.0])
		draw_colored_polygon(tri, Color.WHITE)
		draw_circle(pp, 3.0, UiKit.ACCENT)
