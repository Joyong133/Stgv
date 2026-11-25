extends Node
## 시작 장면: 메뉴(쇼룸 배경)와 주행 화면을 오가고, 뒤로 가기/앱 일시정지를 처리합니다.

var showroom: Showroom
var menu: MainMenu
var menu_layer: CanvasLayer
var race: Race
var loading: CanvasLayer
var loading_label: Label
var busy := false


func _ready() -> void:
	Engine.max_fps = 60
	_build_loading()
	_apply_viewport_quality()
	if Game.autotest.is_empty():
		show_menu()
	else:
		_autotest()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		_on_back()
	elif what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		if race != null:
			race.on_app_pause()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var k := (event as InputEventKey).physical_keycode
		if k == KEY_ESCAPE or k == KEY_P:
			_on_back()
		elif race != null and k == KEY_C:
			race.cycle_camera()
		elif race != null and k == KEY_R:
			race.request_respawn()


func _on_back() -> void:
	if busy:
		return
	if race != null:
		race.handle_back()
	elif menu != null:
		if not menu.go_back():
			get_tree().quit()


func _build_loading() -> void:
	loading = CanvasLayer.new()
	loading.layer = 100
	loading.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(loading)
	var bg := ColorRect.new()
	bg.color = Color(0.05, 0.03, 0.1)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	loading.add_child(bg)
	var c := CenterContainer.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	c.theme = UiKit.theme()
	loading.add_child(c)
	var v := UiKit.vbox(10)
	c.add_child(v)
	var t := UiKit.label("선셋 드라이브", 64, UiKit.ACCENT, true, 10)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	loading_label = UiKit.label("코스를 만드는 중...", 26, UiKit.DIM)
	loading_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(loading_label)
	loading.visible = false


func _show_loading(on: bool, text := "코스를 만드는 중...") -> void:
	loading_label.text = text
	loading.visible = on
	if on:
		await get_tree().process_frame
		await get_tree().process_frame


func _apply_viewport_quality() -> void:
	var q := int(Game.settings["quality"])
	var vp := get_viewport()
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
	match q:
		0:
			vp.msaa_3d = Viewport.MSAA_DISABLED
			vp.scaling_3d_scale = 0.7
		1:
			vp.msaa_3d = Viewport.MSAA_2X
			vp.scaling_3d_scale = 0.85
		_:
			vp.msaa_3d = Viewport.MSAA_4X
			vp.scaling_3d_scale = 1.0
	RenderingServer.directional_shadow_atlas_set_size(2048 if q >= 2 else 1024, true)


func _build_track(id: String) -> Track:
	var t := Track.new()
	t.build(TrackData.by_id(id), int(Game.settings["quality"]))
	return t


func show_menu(screen := "title") -> void:
	if busy:
		return
	busy = true
	await _show_loading(true)
	var t: Track = null
	if race != null:
		t = race.detach_track()
		race.queue_free()
		race = null
	get_tree().paused = false
	if showroom == null:
		showroom = Showroom.new()
		add_child(showroom)
	var want: String = Game.sel["track"]
	if t == null or t.def["id"] != want or t.quality != int(Game.settings["quality"]):
		if t != null:
			t.queue_free()
		t = _build_track(want)
	showroom.set_track(t)
	showroom.set_car(int(Game.sel["car"]), Game.PAINTS[int(Game.sel["paint"])])
	menu_layer = CanvasLayer.new()
	add_child(menu_layer)
	menu = MainMenu.new()
	menu_layer.add_child(menu)
	menu.start_game.connect(_on_start)
	menu.track_changed.connect(_on_track_changed)
	menu.car_changed.connect(func(m: int, p: int) -> void: showroom.set_car(m, Game.PAINTS[p]))
	menu.view_changed.connect(func(v: String) -> void: showroom.view = v)
	menu.quality_changed.connect(_on_quality_changed)
	menu.show_screen(screen)
	Sfx.music("music_menu")
	await _show_loading(false)
	busy = false


func _on_track_changed(id: String) -> void:
	if busy:
		return
	busy = true
	await _show_loading(true)
	showroom.set_track(_build_track(id))
	await _show_loading(false)
	busy = false


func _on_quality_changed() -> void:
	_apply_viewport_quality()
	MeshKit.clear_cache()


func _on_start() -> void:
	if busy:
		return
	busy = true
	await _show_loading(true, "출발 준비 중...")
	var t: Track = null
	if showroom != null:
		t = showroom.detach_track()
		showroom.queue_free()
		showroom = null
	if menu_layer != null:
		menu_layer.queue_free()
		menu_layer = null
		menu = null
	if t != null and (t.def["id"] != Game.sel["track"] or t.quality != int(Game.settings["quality"])):
		t.queue_free()
		t = null
	_start_race(t)
	await _show_loading(false)
	busy = false


func _start_race(t: Track) -> void:
	race = Race.new()
	add_child(race)
	race.setup(Game.sel, t)
	race.finished_session.connect(_on_race_done)


func _on_race_done(action: String) -> void:
	if busy:
		return
	Game.stats["distance"] = float(Game.stats["distance"]) + race.player.distance
	Game.save_data()
	if action == "restart":
		busy = true
		await _show_loading(true, "다시 출발 준비 중...")
		var t := race.detach_track()
		race.queue_free()
		race = null
		get_tree().paused = false
		_start_race(t)
		await _show_loading(false)
		busy = false
	else:
		show_menu("title")


# ------------------------------------------------------------------ 자동 테스트 (데스크톱 검증용)

func _autotest() -> void:
	var a := Game.autotest
	Game.settings["quality"] = int(a.get("q", "2"))
	_apply_viewport_quality()
	var out: String = a.get("out", "user://shots")
	DirAccess.make_dir_recursive_absolute(out)
	var shots := DisplayServer.get_name() != "headless"
	if a.has("menu"):
		Game.sel["track"] = a.get("track", "coast")
		await show_menu()
		await _wait(1.0)
		await _shot(out + "/menu_title.png", shots)
		menu.show_screen("tracks")
		await _wait(0.6)
		await _shot(out + "/menu_tracks.png", shots)
		menu.show_screen("cars")
		await _wait(1.5)
		await _shot(out + "/menu_cars.png", shots)
		menu.show_screen("settings")
		await _wait(0.5)
		await _shot(out + "/menu_settings.png", shots)
		get_tree().quit()
		return
	Game.sel["track"] = a.get("track", "coast")
	Game.sel["mode"] = a.get("mode", "race")
	Game.sel["car"] = int(a.get("car", "0"))
	Game.sel["paint"] = int(a.get("paint", "0"))
	Game.settings["laps"] = int(a.get("laps", "3"))
	var t0 := Time.get_ticks_msec()
	_start_race(null)
	print("race setup took %d ms" % (Time.get_ticks_msec() - t0))
	if a.has("autopilot"):
		race.player.ai = AIDriver.new(race.player, race.track, 0.95, 3)
	var total := float(a.get("time", "60"))
	var every := float(a.get("every", "10"))
	var t := 0.0
	var k := 0
	while t < total:
		await _wait(every)
		t += every
		k += 1
		if a.has("cam"):
			race.cam.mode = int(a["cam"])
		await _shot(out + "/race_%s_%02d.png" % [Game.sel["track"], k], shots)
		_report(t)
		if race.results_shown:
			await _wait(1.0)
			await _shot(out + "/race_%s_results.png" % Game.sel["track"], shots)
			break
	get_tree().quit()


func _report(t: float) -> void:
	var line := "t=%.0f state=%s time=%.1f |" % [t, race.state, race.race_time]
	for c in race.cars:
		var car: Car = c
		line += " %s:P%d lap%d best=%.1f v=%.0f |" % [car.driver_name, car.place, car.laps_done, car.best_lap,
			car.speed * 3.6]
	print(line)


func _wait(sec: float) -> void:
	await get_tree().create_timer(sec, true, false, true).timeout


func _shot(path: String, enabled: bool) -> void:
	if not enabled:
		return
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(path)
	print("shot: ", path)
