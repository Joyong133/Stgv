extends Node
## 전역 상태 (자동 로드 "Game"): 설정, 기록, 자동차 정보, 현재 선택.

const SAVE_PATH := "user://sunset_drive.cfg"
const VERSION := "1.0"

## 자동차 모델. top: 최고속도(m/s), accel: 가속(m/s²), brake: 제동, grip: 접지(옆미끄럼 감쇠),
## lat: 최대 횡가속도(코너링 한계), drift: 드리프트 때 접지, wheelbase: 축거
const CARS := [
	{
		"id": "blaze", "name": "블레이즈 GT", "desc": "균형 잡힌 스포츠카. 코너와 직선 모두 무난합니다.",
		"top": 66.0, "accel": 12.5, "brake": 25.0, "grip": 9.5, "lat": 26.0, "drift": 2.3,
		"wheelbase": 2.6, "mass": 1.0, "nitro": 1.0,
		"stat_speed": 0.75, "stat_accel": 0.75, "stat_handling": 0.75,
	},
	{
		"id": "thunder", "name": "썬더 V8", "desc": "강력한 엔진의 머슬카. 빠르지만 잘 미끄러집니다.",
		"top": 70.0, "accel": 13.8, "brake": 23.0, "grip": 7.6, "lat": 23.5, "drift": 2.0,
		"wheelbase": 2.8, "mass": 1.25, "nitro": 1.1,
		"stat_speed": 0.92, "stat_accel": 0.9, "stat_handling": 0.5,
	},
	{
		"id": "swift", "name": "스위프트 R", "desc": "작고 날렵한 랠리 해치백. 코너링이 가장 좋습니다.",
		"top": 61.5, "accel": 12.0, "brake": 27.0, "grip": 11.0, "lat": 29.0, "drift": 2.6,
		"wheelbase": 2.45, "mass": 0.85, "nitro": 0.95,
		"stat_speed": 0.58, "stat_accel": 0.7, "stat_handling": 0.95,
	},
]

const PAINTS := [
	Color(0.86, 0.1, 0.16), Color(0.1, 0.35, 0.9), Color(0.98, 0.7, 0.05), Color(0.08, 0.7, 0.45),
	Color(0.94, 0.94, 0.96), Color(0.12, 0.12, 0.14), Color(0.95, 0.35, 0.05), Color(0.55, 0.15, 0.85),
]
const PAINT_NAMES := ["레드", "블루", "옐로", "그린", "화이트", "블랙", "오렌지", "퍼플"]

const AI_NAMES := ["번개 민수", "드리프트 지은", "터보 현우", "질주 서연", "레이서 도윤", "바람 하은", "로켓 준호"]

const MODES := {
	"race": {"name": "레이스", "desc": "AI 5대와 순위 경쟁"},
	"time": {"name": "타임 어택", "desc": "혼자 달리며 최고 랩 기록 도전"},
	"free": {"name": "자유 주행", "desc": "제한 없이 경치를 즐기며 드라이브"},
}

var settings := {
	"control": "buttons",   # "buttons" | "tilt"
	"tilt_sens": 1.0,
	"quality": 1,           # 0 낮음, 1 보통, 2 높음
	"sfx": 0.8,
	"music": 0.55,
	"vibration": true,
	"difficulty": 1,        # 0 쉬움, 1 보통, 2 어려움
	"laps": 3,
	"camera": 0,
}

var records := {}   # "coast:lap" -> 초, "coast:race3" -> 초
var stats := {"races": 0, "wins": 0, "distance": 0.0}

var sel := {"mode": "race", "track": "coast", "car": 0, "paint": 0}

## 자동 테스트(데스크톱 검증용) 옵션. 실제 게임에서는 비어 있습니다.
var autotest := {}


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_parse_cmdline()
	load_data()
	_setup_audio_buses()
	apply_audio()


func _parse_cmdline() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--autotest="):
			for part in a.substr(11).split(","):
				var kv := part.split(":")
				if kv.size() == 2:
					autotest[kv[0]] = kv[1]
				elif kv.size() == 1 and kv[0] != "":
					autotest[kv[0]] = "1"


func car_def(i: int) -> Dictionary:
	return CARS[clampi(i, 0, CARS.size() - 1)]


func load_data() -> void:
	var cf := ConfigFile.new()
	if cf.load(SAVE_PATH) != OK:
		return
	for k in settings.keys():
		settings[k] = cf.get_value("settings", k, settings[k])
	for k in sel.keys():
		sel[k] = cf.get_value("selection", k, sel[k])
	for k in stats.keys():
		stats[k] = cf.get_value("stats", k, stats[k])
	if cf.has_section("records"):
		for k in cf.get_section_keys("records"):
			records[k.replace("_", ":")] = cf.get_value("records", k)
	sel["car"] = clampi(int(sel["car"]), 0, CARS.size() - 1)
	sel["paint"] = clampi(int(sel["paint"]), 0, PAINTS.size() - 1)


func save_data() -> void:
	if not autotest.is_empty():
		return
	var cf := ConfigFile.new()
	for k in settings.keys():
		cf.set_value("settings", k, settings[k])
	for k in sel.keys():
		cf.set_value("selection", k, sel[k])
	for k in stats.keys():
		cf.set_value("stats", k, stats[k])
	for k in records.keys():
		cf.set_value("records", String(k).replace(":", "_"), records[k])
	cf.save(SAVE_PATH)


func get_record(key: String) -> float:
	return float(records.get(key, 0.0))


## 기록을 갱신하면 true
func submit_record(key: String, t: float) -> bool:
	var old := get_record(key)
	if old <= 0.0 or t < old:
		records[key] = t
		save_data()
		return true
	return false


func _setup_audio_buses() -> void:
	for bus_name in ["Music", "SFX"]:
		if AudioServer.get_bus_index(bus_name) == -1:
			var idx := AudioServer.bus_count
			AudioServer.add_bus(idx)
			AudioServer.set_bus_name(idx, bus_name)
			AudioServer.set_bus_send(idx, "Master")


func apply_audio() -> void:
	var m := AudioServer.get_bus_index("Music")
	var s := AudioServer.get_bus_index("SFX")
	AudioServer.set_bus_volume_db(m, linear_to_db(maxf(0.0001, float(settings["music"]))))
	AudioServer.set_bus_volume_db(s, linear_to_db(maxf(0.0001, float(settings["sfx"]))))
	AudioServer.set_bus_mute(m, float(settings["music"]) <= 0.01)
	AudioServer.set_bus_mute(s, float(settings["sfx"]) <= 0.01)


func vibrate(ms: int) -> void:
	if settings["vibration"] and OS.get_name() == "Android":
		Input.vibrate_handheld(ms)


static func format_time(t: float) -> String:
	if t <= 0.0:
		return "--:--.--"
	var m := int(t / 60.0)
	var s := t - m * 60.0
	return "%d:%05.2f" % [m, s]
