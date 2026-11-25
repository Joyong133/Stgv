extends RefCounted
class_name AIDriver
## AI 운전: 레이싱 라인을 따라가는 순수 추종(pure pursuit) 조향 + 곡률 기반 목표 속도.

var car: Car
var track: Track
var profile: PackedFloat32Array
var skill := 0.95
var lane := 0.0
var rubber := 1.0
var cruise := false
var cruise_speed := 24.0
var avoid_d := 0.0
var avoid_t := 0.0
var nitro_t := 0.0
var rng := RandomNumberGenerator.new()


func _init(p_car: Car, p_track: Track, p_skill: float, p_seed: int) -> void:
	car = p_car
	track = p_track
	skill = p_skill
	rng.seed = p_seed
	profile = track.speed_profile(car.def, 0.9)
	lane = rng.randf_range(-1.6, 1.6)


func line_d(s: float) -> float:
	if cruise:
		return clampf(lane, -track.hw + 1.6, track.hw - 1.6)
	var i := track.index_of(s)
	var k := clampf(1.0 - absf(track.curv[i]) * 50.0, 0.2, 1.0)
	return clampf(track.racing_line[i] + lane * k, -track.hw + 1.4, track.hw - 1.4)


func update(dt: float, cars: Array) -> void:
	var tp := car.tp
	var v := car.speed
	var s := tp.s
	var L := track.length
	var target_v := 1.0e9
	# 앞차 피하기
	avoid_t = maxf(0.0, avoid_t - dt)
	for o in cars:
		if o == car:
			continue
		var oc: Car = o
		var gap := fposmod(oc.tp.s - s, L)
		if gap > L * 0.5:
			continue
		var dd := oc.tp.d - tp.d
		if gap < 24.0 and absf(dd) < 2.5 and oc.speed < v + 2.0:
			var left_room := (oc.tp.d - 2.0) - (-track.hw + 1.0)
			var right_room := (track.hw - 1.0) - (oc.tp.d + 2.0)
			if avoid_t <= 0.0 or absf(avoid_d - oc.tp.d) < 2.6:
				if left_room > right_room:
					avoid_d = oc.tp.d - 3.4
				else:
					avoid_d = oc.tp.d + 3.4
				avoid_d = clampf(avoid_d, -track.hw + 1.3, track.hw - 1.3)
				avoid_t = 1.4
			if gap < 10.0 and absf(dd) < 2.1:
				target_v = minf(target_v, oc.speed - 0.5)

	# 조향: 앞쪽 목표점 추종
	var look := clampf(absf(v) * 0.55, 7.0, 30.0)
	var st := s + look
	var td := avoid_d if avoid_t > 0.0 else line_d(st)
	var target := track.point_at(st, td)
	var to := target - car.position
	to.y = 0.0
	var lx := to.dot(car.right_vec())
	var lz := to.dot(car.forward())
	var alpha := atan2(lx, maxf(lz, 0.1))
	var dist := maxf(to.length(), 1.0)
	var curvature := 2.0 * sin(alpha) / dist
	var desired_rate := curvature * maxf(absf(v), 3.0)
	var max_rate := car.max_yaw_rate(maxf(absf(v), 1.0))
	car.in_steer = clampf(desired_rate / maxf(max_rate, 0.05), -1.0, 1.0)
	car.analog_steer = true

	# 속도
	var n := track.n
	var ahead := int(maxf(v, 0.0) * 0.35 / track.ds) + 2
	var vp := 1.0e9
	for k in range(0, ahead + 1, 2):
		vp = minf(vp, profile[(tp.idx + k) % n])
	var vt := vp * skill * rubber
	if cruise:
		vt = minf(vt, cruise_speed)
	vt = minf(vt, target_v)
	var err := vt - v
	if err > 0.6:
		car.in_throttle = clampf(err / 4.0, 0.35, 1.0)
		car.in_brake = 0.0
	elif err < -1.5:
		car.in_throttle = 0.0
		car.in_brake = clampf(-err / 6.0, 0.15, 1.0)
	else:
		car.in_throttle = 0.3
		car.in_brake = 0.0
	if absf(car.in_steer) > 0.95 and v > 15.0:
		car.in_throttle *= 0.5

	# 니트로: 긴 직선에서
	nitro_t = maxf(0.0, nitro_t - dt)
	car.in_nitro = false
	if not cruise and car.nitro > 0.35 and v > 18.0:
		var straight := true
		for k in range(0, 70, 7):
			if profile[(tp.idx + k) % n] < float(car.def["top"]) * 0.95:
				straight = false
				break
		if straight and absf(car.in_steer) < 0.25:
			nitro_t = 1.5
	if nitro_t > 0.0:
		car.in_nitro = true
	car.in_drift = false
