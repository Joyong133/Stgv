extends Node3D
class_name Showroom
## 메뉴 배경: 선택한 코스 위에 선택한 차를 세워 두고 카메라가 천천히 돕니다.

var track: Track
var car: Car
var cam: Camera3D
var view := "wide"
var angle := 0.6
var spot_s := 30.0
var _cur_r := 8.5
var _cur_h := 2.6
var _cur_off := 1.6


func _ready() -> void:
	cam = Camera3D.new()
	cam.fov = 55.0
	cam.near = 0.15
	cam.far = 4500.0
	add_child(cam)
	cam.current = true


func set_track(t: Track) -> void:
	if track != null and track != t:
		track.queue_free()
	track = t
	if t.get_parent() != null:
		t.get_parent().remove_child(t)
	add_child(t)
	Scenery.apply_quality(t, int(Game.settings["quality"]))
	if car != null:
		var m := car.model_index
		var p := car.paint
		car.queue_free()
		car = null
		set_car(m, p)


func detach_track() -> Track:
	var t := track
	if t != null and t.get_parent() == self:
		remove_child(t)
	track = null
	return t


func set_car(model: int, paint: Color) -> void:
	if car != null:
		car.queue_free()
	car = Car.new()
	add_child(car)
	car.setup(track, model, paint, false, track.theme == "night")
	car.place_at(spot_s, -1.5)
	car.frozen = true
	car.update_visuals(0.016)


func _process(dt: float) -> void:
	if car == null:
		return
	angle += dt * 0.16
	var tr := 8.8 if view == "wide" else 6.0
	var th := 2.7 if view == "wide" else 1.45
	var toff := 1.7 if view == "wide" else 2.0
	var k := 1.0 - exp(-3.0 * dt)
	_cur_r = lerpf(_cur_r, tr, k)
	_cur_h = lerpf(_cur_h, th, k)
	_cur_off = lerpf(_cur_off, toff, k)
	var c := car.global_position
	var p := c + Vector3(cos(angle) * _cur_r, _cur_h, sin(angle) * _cur_r)
	p.y = maxf(p.y, track.terrain_height(p.x, p.z) + 0.8)
	cam.global_position = p
	var dir := (c - p)
	dir.y = 0.0
	dir = dir.normalized()
	var right := dir.cross(Vector3.UP).normalized()
	cam.look_at(c + Vector3.UP * 0.75 - right * _cur_off, Vector3.UP)
