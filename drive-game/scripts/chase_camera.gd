extends Camera3D
class_name ChaseCamera
## 차를 뒤따르는 카메라. 0: 멀리, 1: 가까이, 2: 보닛 시점

var target: Car
var mode := 0
var cam_yaw := 0.0
var shake := 0.0
var base_fov := 70.0
var _noise_t := 0.0


func _ready() -> void:
	near = 0.15
	far = 4500.0
	fov = base_fov


func snap() -> void:
	if target == null:
		return
	cam_yaw = target.yaw
	update_cam(1.0)


func add_shake(amount: float) -> void:
	shake = clampf(shake + amount, 0.0, 1.0)


func update_cam(dt: float) -> void:
	if target == null:
		return
	var spd := absf(target.speed)
	var ratio := clampf(spd / 62.0, 0.0, 1.0)
	var desired := target.yaw
	if spd > 4.0 and target.speed > 0.0:
		var vy := atan2(-target.vel.x, -target.vel.z)
		desired = lerp_angle(target.yaw, vy, 0.45)
	cam_yaw = lerp_angle(cam_yaw, desired, 1.0 - exp(-5.5 * dt))
	var tpos := target.global_position
	_noise_t += dt * 40.0
	var sh := Vector3(sin(_noise_t * 1.3), sin(_noise_t * 1.7 + 1.0), 0.0) * shake * 0.22
	shake = maxf(0.0, shake - dt * 2.2)
	if mode < 2:
		var dist := 6.3 + ratio * 1.1 if mode == 0 else 4.4 + ratio * 0.6
		var height := 2.3 if mode == 0 else 1.7
		var back := Vector3(sin(cam_yaw), 0.0, cos(cam_yaw))
		var p := tpos + back * dist + Vector3.UP * height
		var ground := target.track.terrain_height(p.x, p.z)
		p.y = maxf(p.y, ground + 1.0)
		global_position = p + sh
		look_at(tpos + Vector3.UP * 1.1 - back * 3.5, Vector3.UP)
	else:
		var b := target.global_transform.basis
		global_position = tpos + b * Vector3(0.0, 1.08, -0.2) + sh * 0.3
		look_at(global_position - b.z * 20.0 + b.y * 0.4, Vector3.UP)
	var want := base_fov + ratio * 15.0 + (8.0 if target.nitro_active else 0.0)
	fov = lerpf(fov, want, 1.0 - exp(-3.0 * dt))
