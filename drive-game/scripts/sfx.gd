extends Node
## 소리 관리 (자동 로드 "Sfx"): 효과음 재생, 반복 소리 설정, 배경 음악.

const LOOPS := ["engine_lo", "engine_hi", "skid", "nitro"]
const SOUNDS := ["engine_lo", "engine_hi", "skid", "nitro", "crash", "beep", "go", "lap", "finish", "click",
	"record", "boost"]
const MUSIC := ["music_menu", "music_coast", "music_forest", "music_city"]

var _streams := {}
var _pool: Array = []
var _next := 0
var _music: AudioStreamPlayer
var _music_name := ""
var _tween: Tween


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for s in SOUNDS:
		var st = load("res://assets/audio/%s.wav" % s)
		if st != null:
			if s in LOOPS and st is AudioStreamWAV:
				var w := st as AudioStreamWAV
				w.loop_mode = AudioStreamWAV.LOOP_FORWARD
				w.loop_begin = 0
				w.loop_end = int(round(w.get_length() * w.mix_rate))
			_streams[s] = st
	for m in MUSIC:
		var st = load("res://assets/audio/%s.ogg" % m)
		if st != null:
			if st is AudioStreamOggVorbis:
				(st as AudioStreamOggVorbis).loop = true
			_streams[m] = st
	for i in 6:
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		_pool.append(p)
	_music = AudioStreamPlayer.new()
	_music.bus = "Music"
	add_child(_music)


func stream(sound_name: String) -> AudioStream:
	return _streams.get(sound_name)


func play(sound_name: String, vol_db := 0.0, pitch := 1.0) -> void:
	var st: AudioStream = _streams.get(sound_name)
	if st == null:
		return
	var p: AudioStreamPlayer = _pool[_next]
	_next = (_next + 1) % _pool.size()
	p.stream = st
	p.volume_db = vol_db
	p.pitch_scale = pitch
	p.play()


func music(music_name: String) -> void:
	if music_name == _music_name and _music.playing:
		return
	_music_name = music_name
	var st: AudioStream = _streams.get(music_name)
	if _tween != null:
		_tween.kill()
	if st == null:
		_music.stop()
		return
	_music.stream = st
	_music.volume_db = -30.0
	_music.play()
	_tween = create_tween()
	_tween.tween_property(_music, "volume_db", -4.0, 1.2)


func stop_music() -> void:
	_music_name = ""
	if _tween != null:
		_tween.kill()
	_music.stop()


func pause_music(paused: bool) -> void:
	_music.stream_paused = paused
