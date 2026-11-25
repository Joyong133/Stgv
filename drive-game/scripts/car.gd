extends Node3D
class_name Car
## 아케이드식 자동차 물리. 위치는 코스 좌표로 계산해 도로 높이에 붙이고, 벽과 다른 차와 부딪힙니다.
## 앞 = -Z, yaw 가 커지면 왼쪽으로 돕니다. 조향(steer) 양수 = 오른쪽.

const REVERSE_TOP := 9.0
const GEARS := [0.0, 0.16, 0.3, 0.45, 0.61, 0.79, 1.05]

var track: Track
var def: Dictionary
var model_index := 0
var paint := Color.RED
var driver_name := "플레이어"
var is_player := false
var ai: AIDriver = null

# 입력
var in_throttle := 0.0
var in_brake := 0.0
var in_steer := 0.0
var in_drift := false
var in_nitro := false
var analog_steer := false

# 물리 상태
var yaw := 0.0
var vel := Vector3.ZERO
var speed := 0.0
var steer_s := 0.0
var yaw_rate := 0.0
var grip_cur := 9.0
var drifting := false
var nitro := 0.45
var nitro_active := false
var surface := 0          # 0 도로, 1 연석, 2 갓길
var accel_now := 0.0
var slip := 0.0
var impact := 0.0         # 이번 프레임 충돌 세기 (m/s)
var frozen := true

# 코스 진행
var tp := Track.TrackPos.new()
var lap := 0
var last_s := 0.0
var progress := 0.0
var laps_done := 0
var lap_start := 0.0
var best_lap := 0.0
var last_lap := 0.0
var finished := false
var finish_time := 0.0
var place := 1
var wrong_way_t := 0.0
var stuck_t := 0.0
var distance := 0.0
var drift_score := 0.0

# 시각 요소
var body: Node3D
var pivots: Array = []
var spins: Array = []
var smokes: Array = []
var flames: Array = []
var tail_mat: StandardMaterial3D
var lamp: SpotLight3D
var wheel_r := 0.34
var wheel_angle := 0.0
var roll := 0.0
var pitch_body := 0.0
var bob_t := 0.0
var dust_color := Color(0.75, 0.65, 0.5)

# 소리
var eng_a: Node
var eng_b: Node
var skid_snd: Node
var nitro_snd: Node
var rpm := 900.0
var gear := 1


func setup(p_track: Track, p_model: int, p_paint: Color, player: bool, headlight := false) -> void:
	track = p_track
	model_index = p_model
	def = Game.car_def(p_model)
	paint = p_paint
	is_player = player
	var parts := CarBuilder.build(def["id"], paint, headlight)
	add_child(parts["root"])
	body = parts["body"]
	pivots = parts["pivots"]
	spins = parts["spins"]
	smokes = parts["smokes"]
	flames = parts["flames"]
	tail_mat = parts["tail_mat"]
	lamp = parts["lamp"]
	wheel_r = float(parts["info"]["wheel_r"])
	grip_cur = float(def["grip"])
	match track.theme:
		"sunset":
			dust_color = Color(0.85, 0.72, 0.55)
		"day":
			dust_color = Color(0.55, 0.5, 0.38)
		_:
			dust_color = Color(0.55, 0.55, 0.6)
	_setup_audio()


func forward() -> Vector3:
	return Vector3(-sin(yaw), 0.0, -cos(yaw))


func right_vec() -> Vector3:
	return Vector3(cos(yaw), 0.0, -sin(yaw))


func max_yaw_rate(spd: float) -> float:
	var lat := float(def["lat"])
	if drifting:
		lat *= 1.35
	if surface == 2:
		lat *= 0.8
	return minf(spd / 5.5, lat / maxf(spd, 1.0))


func place_at(s: float, d: float) -> void:
	var p := track.point_at(s, d)
	yaw = track.yaw_at(s)
	vel = Vector3.ZERO
	speed = 0.0
	steer_s = 0.0
	drifting = false
	tp.idx = track.index_of(s)
	track.project(p, tp)
	position = Vector3(p.x, tp.y, p.z)
	last_s = tp.s
	_apply_transform()


func respawn() -> void:
	var s := tp.s
	place_at(s, clampf(tp.d, -track.hw * 0.4, track.hw * 0.4))
	nitro = maxf(nitro, 0.25)
	stuck_t = 0.0
	wrong_way_t = 0.0


func step(dt: float) -> void:
	impact = 0.0
	if frozen:
		_engine_only(dt)
		return
	var fwd := forward()
	var rgt := right_vec()
	var vf := vel.dot(fwd)
	var vr := vel.dot(rgt)
	var top := float(def["top"])
	var acc := float(def["accel"])

	var ad := absf(tp.d)
	surface = 0
	if ad > track.hw + track.curb_w:
		surface = 2
	elif ad > track.hw:
		surface = 1

	nitro_active = in_nitro and nitro > 0.01 and in_throttle > 0.1 and vf > 2.0
	if nitro_active:
		nitro = maxf(0.0, nitro - 0.28 * dt)
		top *= 1.22
	else:
		nitro = minf(1.0, nitro + 0.022 * dt)
	if surface == 2:
		top *= 0.6

	# 앞뒤 가속
	var a := 0.0
	if in_throttle > 0.01:
		if vf < -0.5:
			a += float(def["brake"]) * in_throttle
		else:
			var ratio := vf / top
			if ratio < 1.0:
				a += acc * in_throttle * (1.0 - ratio * ratio)
				if nitro_active:
					a += acc * 0.65 * float(def["nitro"])
			else:
				a -= minf(10.0, (vf - top) * 1.5)
	var braking := false
	if in_brake > 0.01:
		if vf > 0.3:
			a -= float(def["brake"]) * in_brake
			braking = true
		elif vf > -REVERSE_TOP:
			a -= acc * 0.55 * in_brake
	if in_throttle <= 0.01 and in_brake <= 0.01:
		a -= signf(vf) * (1.1 + 0.0006 * vf * vf)
	if surface == 2 and absf(vf) > 1.0:
		a -= signf(vf) * 2.5
	if drifting:
		a -= signf(vf) * 1.2
	var new_vf := vf + a * dt
	if (braking or (in_throttle <= 0.01 and in_brake <= 0.01)) and signf(new_vf) != signf(vf) and vf != 0.0:
		new_vf = 0.0
	accel_now = (new_vf - vf) / dt
	vf = new_vf

	# 조향
	var target := in_steer
	var rate := 14.0 if analog_steer else (5.5 if absf(target) > absf(steer_s) else 8.0)
	steer_s = move_toward(steer_s, target, rate * dt)
	var spd := absf(vf)
	var want_drift := in_drift and spd > 12.0 and absf(steer_s) > 0.15
	if want_drift and not drifting:
		drifting = true
	elif drifting and (not in_drift or spd < 8.0):
		drifting = false
	yaw_rate = 0.0
	if spd > 0.2:
		yaw_rate = steer_s * max_yaw_rate(spd) * signf(vf)
		if drifting:
			yaw_rate += steer_s * 0.25 * signf(vf)
	yaw -= yaw_rate * dt

	# 옆 미끄러짐
	var g_target := float(def["drift"]) if drifting else float(def["grip"])
	if surface == 2:
		g_target *= 0.75
	grip_cur = move_toward(grip_cur, g_target, (24.0 if g_target > grip_cur else 80.0) * dt)
	var vr_new := vr * exp(-grip_cur * dt)
	var lost := absf(vr) - absf(vr_new)
	vf += lost * (0.78 if drifting else 0.9) * signf(vf)
	vr = vr_new
	slip = absf(vr)
	if drifting:
		var gain := (absf(vr) * 0.01 + 0.05) * dt
		nitro = minf(1.0, nitro + gain)
		drift_score += absf(vr) * dt
	vel = fwd * vf + rgt * vr
	speed = vf

	# 위치 적분 + 벽
	var p := position + vel * dt
	p.y = position.y
	track.project(p, tp)
	var lim := track.limit_d
	if absf(tp.d) > lim:
		var side := signf(tp.d)
		var nrm := tp.right * side
		p -= nrm * (absf(tp.d) - lim)
		var vn := vel.dot(nrm)
		if vn > 0.0:
			vel -= nrm * vn * 1.3
			var tang := vel - nrm * vel.dot(nrm)
			vel -= tang * clampf(vn * 0.03, 0.0, 0.45)
			impact = maxf(impact, vn)
			var ty := atan2(-tp.tangent.x, -tp.tangent.z)
			if fwd.dot(tp.tangent) < 0.0:
				ty = wrapf(ty + PI, -PI, PI)
			yaw = lerp_angle(yaw, ty, clampf(vn * 0.05, 0.05, 0.4))
			speed = vel.dot(forward())
		tp.d = side * lim
	position = Vector3(p.x, tp.y, p.z)
	distance += absf(speed) * dt
	_update_progress()

	# 역주행 / 멈춤 감지
	if forward().dot(tp.tangent) < -0.25 and absf(speed) > 4.0:
		wrong_way_t += dt
	else:
		wrong_way_t = maxf(0.0, wrong_way_t - dt * 2.0)
	if absf(speed) < 1.5 and (in_throttle > 0.3 or in_brake > 0.3):
		stuck_t += dt
	else:
		stuck_t = 0.0


func _update_progress() -> void:
	var s := tp.s
	var L := track.length
	if last_s > L * 0.75 and s < L * 0.25:
		lap += 1
	elif last_s < L * 0.25 and s > L * 0.75:
		lap -= 1
	last_s = s
	progress = lap * L + s


func _apply_transform() -> void:
	var fwd := forward()
	var pitch := atan(tp.slope * fwd.dot(tp.tangent))
	transform.basis = Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, pitch)


func update_visuals(dt: float) -> void:
	_apply_transform()
	var lat_acc := speed * yaw_rate
	roll = lerpf(roll, clampf(lat_acc * 0.0055, -0.075, 0.075), 1.0 - exp(-8.0 * dt))
	pitch_body = lerpf(pitch_body, clampf(accel_now * 0.0032, -0.045, 0.03), 1.0 - exp(-6.0 * dt))
	bob_t += dt * (6.0 + absf(speed) * 0.5)
	var rumble := 0.0
	if not frozen:
		if surface == 1 and absf(speed) > 5.0:
			rumble = sin(bob_t * 7.0) * 0.014
		elif surface == 2 and absf(speed) > 3.0:
			rumble = sin(bob_t * 3.1) * 0.022 + sin(bob_t * 5.3) * 0.012
	body.rotation = Vector3(pitch_body, 0.0, roll)
	body.position.y = rumble
	wheel_angle = wrapf(wheel_angle - speed / wheel_r * dt, -TAU, TAU)
	for i in 4:
		spins[i].rotation.x = wheel_angle
	var steer_vis := -steer_s * 0.42
	pivots[0].rotation.y = steer_vis
	pivots[1].rotation.y = steer_vis
	var braking := in_brake > 0.1 and speed > 0.5
	tail_mat.emission_energy_multiplier = 4.5 if braking else 1.2
	var spd := absf(speed)
	var tire_smoke := (drifting and spd > 8.0) or (slip > 6.0 and spd > 6.0) \
			or (in_brake > 0.8 and spd > 25.0 and not frozen)
	var dust := surface == 2 and spd > 7.0
	var burn := not frozen and in_throttle > 0.9 and spd < 7.0 and spd > 0.5
	for sm in smokes:
		var e: bool = tire_smoke or dust or burn
		if sm.emitting != e:
			sm.emitting = e
		sm.color = dust_color if dust and not tire_smoke else Color(1, 1, 1)
	for f in flames:
		if f.emitting != nitro_active:
			f.emitting = nitro_active
	_update_audio(dt)


# ------------------------------------------------------------------ 소리

func _setup_audio() -> void:
	if is_player:
		eng_a = _player2d("engine_lo", -4.0)
		eng_b = _player2d("engine_hi", -80.0)
		skid_snd = _player2d("skid", -80.0)
		nitro_snd = _player2d("nitro", -80.0)
	else:
		var p := AudioStreamPlayer3D.new()
		p.stream = Sfx.stream("engine_lo")
		p.bus = "SFX"
		p.unit_size = 7.0
		p.max_distance = 90.0
		p.volume_db = -6.0
		p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		add_child(p)
		eng_a = p


func _player2d(snd: String, vol: float) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.stream = Sfx.stream(snd)
	p.bus = "SFX"
	p.volume_db = vol
	add_child(p)
	return p


func start_audio() -> void:
	for p in [eng_a, eng_b, skid_snd, nitro_snd]:
		if p != null and p.stream != null and not p.playing:
			p.play()


func stop_audio() -> void:
	for p in [eng_a, eng_b, skid_snd, nitro_snd]:
		if p != null:
			p.stop()


func _engine_only(dt: float) -> void:
	var target := 900.0 + in_throttle * 5200.0
	rpm = lerpf(rpm, target, 1.0 - exp(-6.0 * dt))
	_apply_engine_sound()


func _update_audio(dt: float) -> void:
	if frozen:
		return
	var top := float(def["top"])
	var v := absf(speed)
	var f := v / top
	gear = 1
	while gear < 6 and f > float(GEARS[gear]):
		gear += 1
	var lo := float(GEARS[gear - 1])
	var hi := float(GEARS[gear])
	var gf := clampf((f - lo) / maxf(0.01, hi - lo), 0.0, 1.0)
	var target := 1500.0 + gf * 5400.0
	if gear == 1:
		target = 950.0 + gf * 5800.0
	if in_throttle > 0.5 and v < 4.0:
		target = maxf(target, 2500.0 + in_throttle * 2500.0)
	if drifting or surface == 2:
		target += 500.0
	rpm = lerpf(rpm, target, 1.0 - exp(-9.0 * dt))
	_apply_engine_sound()
	if is_player:
		var sk := 0.0
		if drifting or slip > 5.0:
			sk = clampf((slip - 2.0) / 8.0, 0.0, 1.0)
		if in_brake > 0.8 and v > 22.0:
			sk = maxf(sk, 0.6)
		(skid_snd as AudioStreamPlayer).volume_db = linear_to_db(sk * 0.7 + 0.0001)
		(skid_snd as AudioStreamPlayer).pitch_scale = 0.9 + clampf(v / 60.0, 0.0, 0.4)
		(nitro_snd as AudioStreamPlayer).volume_db = -2.0 if nitro_active else -80.0


func _apply_engine_sound() -> void:
	var load_k := 0.55 + 0.45 * in_throttle
	if is_player:
		var a := eng_a as AudioStreamPlayer
		var b := eng_b as AudioStreamPlayer
		a.pitch_scale = clampf(rpm / 2000.0, 0.4, 3.6)
		b.pitch_scale = clampf(rpm / 5000.0, 0.5, 1.6)
		var mix := smoothstep(3300.0, 5400.0, rpm)
		a.volume_db = linear_to_db(load_k * (1.0 - mix) * 0.85 + 0.0001)
		b.volume_db = linear_to_db(load_k * mix * 0.75 + 0.0001)
	else:
		var a3 := eng_a as AudioStreamPlayer3D
		a3.pitch_scale = clampf(rpm / 2000.0, 0.4, 3.6)


# ------------------------------------------------------------------ 차끼리 충돌

static func collide(a: Car, b: Car) -> float:
	var dx := b.position.x - a.position.x
	var dz := b.position.z - a.position.z
	if dx * dx + dz * dz > 30.0:
		return 0.0
	var fa := a.forward()
	var fb := b.forward()
	var hit := 0.0
	var ma := float(a.def["mass"])
	var mb := float(b.def["mass"])
	for oa in [-1.15, 1.15]:
		for ob in [-1.15, 1.15]:
			var ca: Vector3 = a.position + fa * oa
			var cb: Vector3 = b.position + fb * ob
			var dv := Vector3(cb.x - ca.x, 0.0, cb.z - ca.z)
			var dist := dv.length()
			if dist < 2.0 and dist > 0.0001:
				var nrm := dv / dist
				var overlap := 2.0 - dist
				a.position -= nrm * overlap * (mb / (ma + mb))
				b.position += nrm * overlap * (ma / (ma + mb))
				var rel := (b.vel - a.vel).dot(nrm)
				if rel < 0.0:
					var j := -1.25 * rel / (1.0 / ma + 1.0 / mb)
					a.vel -= nrm * (j / ma)
					b.vel += nrm * (j / mb)
					hit = maxf(hit, -rel)
	if hit > 0.0:
		a.speed = a.vel.dot(a.forward())
		b.speed = b.vel.dot(b.forward())
	return hit
