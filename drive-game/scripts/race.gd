extends Node3D
class_name Race
## 한 판의 주행: 카운트다운, 랩/순위, AI, 충돌, 결과. 모드: race / time / free

signal finished_session(action: String)   # "restart" | "menu"

var mode := "race"
var track_def: Dictionary
var track: Track
var cars: Array = []
var player: Car
var cam: ChaseCamera
var hud: Hud
var laps_total := 3
var state := "countdown"
var state_t := 0.0
var race_time := 0.0
var finish_order: Array = []
var results_shown := false
var paused := false
var time_started := false
var autopilot := false   # 자동 테스트: 플레이어 차를 AI 가 운전
var _count_shown := -1
var _last_place := 0
var _respawn_msg_t := 0.0
var _ghost: Node3D
var _ghost_rec: Array = []
var _ghost_best: Array = []
var _ghost_t := 0.0
var _rec_t := 0.0


func setup(sel: Dictionary, existing_track: Track = null) -> void:
	mode = sel["mode"]
	track_def = TrackData.by_id(sel["track"])
	var q := int(Game.settings["quality"])
	laps_total = int(Game.settings["laps"]) if mode == "race" else 0
	if existing_track != null:
		track = existing_track
		if track.get_parent() != null:
			track.get_parent().remove_child(track)
		add_child(track)
	else:
		track = Track.new()
		add_child(track)
		track.build(track_def, q)
	Scenery.apply_quality(track, q)
	_spawn_cars(sel)
	cam = ChaseCamera.new()
	add_child(cam)
	cam.target = player
	cam.mode = int(Game.settings["camera"])
	cam.current = true
	cam.snap()
	hud = Hud.new()
	add_child(hud)
	hud.setup(self)
	autopilot = Game.autotest.has("autopilot")
	if mode == "free":
		state = "racing"
		for c in cars:
			c.frozen = false
		hud.show_message("자유 주행 - 마음껏 달려 보세요!", UiKit.GOLD, 3.0)
	else:
		state = "countdown"
	Sfx.music("music_" + String(track_def["id"]))
	for c in cars:
		c.start_audio()


func _spawn_cars(sel: Dictionary) -> void:
	var L := track.length
	var night := track.theme == "night"
	var p_model := int(sel["car"])
	var p_paint: Color = Game.PAINTS[int(sel["paint"])]
	var diff := int(Game.settings["difficulty"])
	var skill_lo: float = [0.8, 0.88, 0.95][diff]
	var skill_hi: float = [0.88, 0.96, 1.01][diff]
	var rng := RandomNumberGenerator.new()
	rng.seed = Time.get_ticks_usec()
	var names: Array = Game.AI_NAMES.duplicate()
	names.shuffle()
	var paints: Array = []
	for i in Game.PAINTS.size():
		if i != int(sel["paint"]):
			paints.append(Game.PAINTS[i])
	paints.shuffle()
	var n_ai := 0
	if mode == "race":
		n_ai = 5
	elif mode == "free":
		n_ai = 5
	# 플레이어
	player = Car.new()
	player.name = "Player"
	add_child(player)
	player.setup(track, p_model, p_paint, true, night)
	player.driver_name = "나"
	cars.append(player)
	for i in n_ai:
		var c := Car.new()
		add_child(c)
		c.setup(track, rng.randi() % Game.CARS.size(), paints[i % paints.size()], false, false)
		c.driver_name = names[i % names.size()]
		var skill := lerpf(skill_hi, skill_lo, float(i) / maxf(1.0, n_ai - 1.0)) + rng.randf_range(-0.01, 0.01)
		c.ai = AIDriver.new(c, track, skill, rng.randi())
		if mode == "free":
			c.ai.cruise = true
			c.ai.cruise_speed = rng.randf_range(17.0, 27.0)
			c.ai.lane = -3.4 if i % 2 == 0 else 3.4
		cars.append(c)
	# 출발 위치
	if mode == "race":
		var order: Array = cars.slice(1)
		order.append(player)
		for k in order.size():
			var c: Car = order[k]
			var s := -14.0 - 8.5 * float(k >> 1) - (4.0 if k % 2 == 1 else 0.0)
			var d := -3.3 if k % 2 == 0 else 3.3
			_place_on_grid(c, s, d)
	elif mode == "time":
		_place_on_grid(player, -25.0, 0.0)
	else:
		_place_on_grid(player, 0.0, 0.0)
		for i in range(1, cars.size()):
			var c2: Car = cars[i]
			var s2 := L * float(i) / cars.size() + 40.0
			c2.place_at(s2, c2.ai.lane)
			c2.lap = 0
			c2.last_s = c2.tp.s
			c2.progress = c2.tp.s


func _place_on_grid(c: Car, s: float, d: float) -> void:
	var L := track.length
	var sw := fposmod(s, L)
	c.place_at(sw, d)
	if s < 0.0:
		c.lap = -1
	c.last_s = c.tp.s
	c.progress = c.lap * L + c.tp.s


# ------------------------------------------------------------------ 진행

func _process(dt: float) -> void:
	if paused:
		return
	dt = minf(dt, 0.1)
	state_t += dt
	_read_player_input(dt)
	if state == "countdown":
		_countdown()
	elif state != "countdown":
		race_time += dt
	for c in cars:
		if c.ai != null and not c.frozen:
			if mode == "race" and not c.is_player:
				c.ai.rubber = clampf(1.0 - (c.progress - player.progress) / 1600.0, 0.9, 1.05)
			c.ai.update(dt, cars)
	var steps := maxi(1, ceili(dt / (1.0 / 60.0) - 0.01))
	var h := dt / steps
	for _i in steps:
		for c in cars:
			c.step(h)
		_collisions()
	for c in cars:
		c.update_visuals(dt)
	_race_logic(dt)
	_ghost_update(dt)
	cam.update_cam(dt)
	hud.update_hud(dt)


func _read_player_input(_dt: float) -> void:
	if player.finished or autopilot:
		return
	var pad := hud.pad
	var thr := 0.0
	var brk := 0.0
	var steer := 0.0
	if pad.is_down("gas") or Input.is_physical_key_pressed(KEY_UP) or Input.is_physical_key_pressed(KEY_W):
		thr = 1.0
	if pad.is_down("brake") or Input.is_physical_key_pressed(KEY_DOWN) or Input.is_physical_key_pressed(KEY_S):
		brk = 1.0
	if pad.is_down("left") or Input.is_physical_key_pressed(KEY_LEFT) or Input.is_physical_key_pressed(KEY_A):
		steer -= 1.0
	if pad.is_down("right") or Input.is_physical_key_pressed(KEY_RIGHT) or Input.is_physical_key_pressed(KEY_D):
		steer += 1.0
	player.analog_steer = false
	if Game.settings["control"] == "tilt" and steer == 0.0:
		var acc := Input.get_accelerometer()
		if acc.length() > 0.1:
			var sens := float(Game.settings["tilt_sens"])
			var raw := clampf(acc.x / 9.8, -1.0, 1.0)
			var v := 0.0
			if absf(raw) > 0.04:
				v = signf(raw) * (absf(raw) - 0.04) / 0.96
			steer = clampf(v * 2.6 * sens, -1.0, 1.0)
			player.analog_steer = true
	player.in_throttle = thr
	player.in_brake = brk
	player.in_steer = steer
	player.in_drift = pad.is_down("drift") or Input.is_physical_key_pressed(KEY_SPACE)
	player.in_nitro = pad.is_down("nitro") or Input.is_physical_key_pressed(KEY_SHIFT)


func _countdown() -> void:
	var t := state_t - 0.6
	var k := int(floor(t))
	if t >= 0.0 and k != _count_shown:
		_count_shown = k
		if k < 3:
			hud.show_center(str(3 - k))
			Sfx.play("beep")
		else:
			hud.show_center("출발!", UiKit.GOLD)
			Sfx.play("go")
			state = "racing"
			race_time = 0.0
			for c in cars:
				c.frozen = false
				c.lap_start = 0.0
			Game.vibrate(60)


func _collisions() -> void:
	for i in cars.size():
		for j in range(i + 1, cars.size()):
			var a: Car = cars[i]
			var b: Car = cars[j]
			var hit := Car.collide(a, b)
			if hit > 2.5 and (a == player or b == player):
				_player_hit(hit * 0.8)


func _player_hit(strength: float) -> void:
	cam.add_shake(clampf(strength / 22.0, 0.1, 0.8))
	Sfx.play("crash", clampf(linear_to_db(strength / 20.0), -18.0, 0.0), randf_range(0.9, 1.1))
	Game.vibrate(int(clampf(strength * 6.0, 30.0, 160.0)))


func _race_logic(dt: float) -> void:
	if player.impact > 3.0:
		_player_hit(player.impact)
	if state == "countdown":
		return
	var L := track.length
	for c in cars:
		# 막힘 / 역주행 자동 복귀
		if not c.is_player or autopilot:
			if c.stuck_t > 2.5 or c.wrong_way_t > 2.5:
				c.respawn()
		elif c.stuck_t > 4.0:
			c.respawn()
			hud.show_message("트랙으로 복귀했어요", UiKit.DIM, 1.6)
		if mode == "free":
			continue
		if mode == "time" and c.is_player and not time_started:
			if c.progress >= 0.0:
				time_started = true
				c.lap_start = race_time
				c.laps_done = 0
				hud.show_message("기록 측정 시작!", UiKit.GOLD, 1.5)
			continue
		var target_line: float = (c.laps_done + 1) * L
		if not c.finished and c.progress >= target_line:
			_lap_done(c)
	if mode == "race":
		_update_places()
		if state == "finished" and not results_shown and state_t > 3.2:
			_show_results()


func _lap_done(c: Car) -> void:
	var lap_time := race_time - c.lap_start
	c.last_lap = lap_time
	var new_best := c.best_lap <= 0.0 or lap_time < c.best_lap
	if new_best:
		c.best_lap = lap_time
	c.laps_done += 1
	c.lap_start = race_time
	if c.is_player:
		var key := String(track_def["id"]) + ":lap"
		var record := Game.submit_record(key, lap_time)
		if mode == "time":
			if record:
				hud.show_message("신기록!  %s" % Game.format_time(lap_time), UiKit.GOLD, 3.0)
				Sfx.play("record")
				_ghost_best = _ghost_rec.duplicate()
			else:
				var rec := Game.get_record(key)
				hud.show_message("랩 %s  (+%.2f)" % [Game.format_time(lap_time), lap_time - rec], Color.WHITE, 2.5)
				Sfx.play("lap")
				if _ghost_best.is_empty():
					_ghost_best = _ghost_rec.duplicate()
			_ghost_rec.clear()
			_rec_t = 0.0
			_ghost_t = 0.0
		elif mode == "race":
			if c.laps_done >= laps_total:
				_player_finished()
			else:
				if c.laps_done == laps_total - 1:
					hud.show_message("마지막 랩!", UiKit.ACCENT2, 2.5)
				else:
					hud.show_message("랩 %s%s" % [Game.format_time(lap_time), "  최고 랩!" if new_best and c.laps_done > 1 else ""],
							Color.WHITE, 2.2)
				Sfx.play("lap")
	elif mode == "race" and c.laps_done >= laps_total:
		c.finished = true
		c.finish_time = race_time
		finish_order.append(c)


func _player_finished() -> void:
	player.finished = true
	player.finish_time = race_time
	finish_order.append(player)
	state = "finished"
	state_t = 0.0
	player.ai = AIDriver.new(player, track, 0.75, 7)
	player.in_nitro = false
	var place := finish_order.find(player) + 1
	hud.show_center("완주!", UiKit.GOLD)
	Sfx.play("finish")
	Game.vibrate(120)
	Game.stats["races"] = int(Game.stats["races"]) + 1
	if place == 1:
		Game.stats["wins"] = int(Game.stats["wins"]) + 1
	Game.save_data()


func _update_places() -> void:
	var order: Array = finish_order.duplicate()
	var rest: Array = []
	for c in cars:
		if not finish_order.has(c):
			rest.append(c)
	rest.sort_custom(func(a: Car, b: Car) -> bool: return a.progress > b.progress)
	order.append_array(rest)
	for i in order.size():
		var c: Car = order[i]
		c.place = i + 1
	if state == "racing" and _last_place != 0 and player.place < _last_place:
		hud.show_message("추월!  %d위" % player.place, UiKit.GOOD, 1.2)
	_last_place = player.place


func _show_results() -> void:
	results_shown = true
	var rows: Array = []
	var order: Array = finish_order.duplicate()
	var rest: Array = []
	for c in cars:
		if not finish_order.has(c):
			rest.append(c)
	rest.sort_custom(func(a: Car, b: Car) -> bool: return a.progress > b.progress)
	order.append_array(rest)
	for i in order.size():
		var c: Car = order[i]
		rows.append({"place": i + 1, "name": c.driver_name, "player": c.is_player,
			"time": Game.format_time(c.finish_time) if c.finished else "주행 중"})
	var place := order.find(player) + 1
	var notes: Array = []
	var key := String(track_def["id"]) + ":race%d" % laps_total
	if Game.submit_record(key, player.finish_time):
		notes.append("코스 신기록!  %s" % Game.format_time(player.finish_time))
	notes.append("최고 랩  %s" % Game.format_time(player.best_lap))
	var title := "우승!" if place == 1 else "%d위" % place
	var col := UiKit.GOLD if place == 1 else (Color.WHITE if place <= 3 else UiKit.DIM)
	hud.show_results(rows, title, col, notes)


# ------------------------------------------------------------------ 고스트 (타임 어택)

func _ghost_update(dt: float) -> void:
	if mode != "time" or not time_started:
		return
	_rec_t += dt
	if _ghost_rec.is_empty() or _rec_t - float(_ghost_rec[_ghost_rec.size() - 1][0]) >= 0.1:
		_ghost_rec.append([_rec_t, player.position, player.yaw])
	if _ghost_best.size() < 2:
		return
	if _ghost == null:
		var parts := CarBuilder.build(Game.car_def(player.model_index)["id"], Color(0.7, 0.9, 1.0))
		_ghost = parts["root"]
		add_child(_ghost)
		for mi in _ghost.find_children("*", "GeometryInstance3D", true, false):
			(mi as GeometryInstance3D).transparency = 0.6
			(mi as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_ghost_t += dt
	var t := _ghost_t
	var last: Array = _ghost_best[_ghost_best.size() - 1]
	if t > float(last[0]):
		_ghost.visible = false
		return
	_ghost.visible = true
	var lo := 0
	var hi := _ghost_best.size() - 1
	while hi - lo > 1:
		var mid := (lo + hi) >> 1
		if float(_ghost_best[mid][0]) <= t:
			lo = mid
		else:
			hi = mid
	var a: Array = _ghost_best[lo]
	var b: Array = _ghost_best[hi]
	var k := clampf((t - float(a[0])) / maxf(0.001, float(b[0]) - float(a[0])), 0.0, 1.0)
	var pa: Vector3 = a[1]
	var pb: Vector3 = b[1]
	_ghost.position = pa.lerp(pb, k)
	_ghost.rotation = Vector3(0, lerp_angle(float(a[2]), float(b[2]), k), 0)


# ------------------------------------------------------------------ 메뉴 동작

func set_paused(on: bool) -> void:
	if results_shown and on:
		return
	paused = on
	get_tree().paused = on
	hud.show_pause(on)
	Sfx.pause_music(false)


func request_respawn() -> void:
	if state == "countdown" or player.finished:
		return
	player.respawn()
	cam.snap()


func cycle_camera() -> void:
	cam.mode = (cam.mode + 1) % 3
	Game.settings["camera"] = cam.mode
	Game.save_data()


func restart() -> void:
	get_tree().paused = false
	finished_session.emit("restart")


func exit_to_menu() -> void:
	get_tree().paused = false
	finished_session.emit("menu")


## 뒤로 가기 버튼
func handle_back() -> void:
	if results_shown:
		exit_to_menu()
	else:
		set_paused(not paused)


func on_app_pause() -> void:
	if not paused and not results_shown:
		set_paused(true)


func detach_track() -> Track:
	if track != null and track.get_parent() == self:
		remove_child(track)
	var t := track
	track = null
	return t
