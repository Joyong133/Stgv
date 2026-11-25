extends RefCounted
class_name CarBuilder
## 자동차 3종의 모양을 단면(loft)으로 만들어 노드로 조립합니다. 앞쪽이 -Z.

const MODELS := {
	"blaze": {
		"body": [
			[-2.22, 0.78, 0.30, 0.50, 0.5], [-2.08, 0.90, 0.24, 0.60, 0.45], [-1.72, 0.94, 0.26, 0.66, 0.4],
			[-1.62, 0.95, 0.53, 0.67, 0.4], [-1.08, 0.95, 0.53, 0.69, 0.4], [-0.98, 0.95, 0.26, 0.70, 0.4],
			[0.95, 0.96, 0.26, 0.76, 0.4], [1.07, 0.97, 0.53, 0.77, 0.4], [1.63, 0.97, 0.53, 0.78, 0.4],
			[1.75, 0.96, 0.27, 0.78, 0.4], [2.10, 0.92, 0.30, 0.76, 0.45], [2.22, 0.86, 0.36, 0.72, 0.5],
		],
		"cabin": [[-0.95, 0.84, 0.66, 0.70, 0.3], [-0.35, 0.72, 0.66, 1.13, 0.35], [0.55, 0.70, 0.70, 1.12, 0.35],
			[1.55, 0.84, 0.74, 0.80, 0.3]],
		"roof": [0.1, 1.125, 0.85, 1.16],
		"wheel_z": [-1.35, 1.35], "wheel_x": 0.80, "wheel_r": 0.34, "wheel_w": 0.27,
		"front": -2.22, "rear": 2.22, "light_y": 0.52, "tail_y": 0.62, "half_w": 0.95,
		"spoiler": [1.98, 0.99, 1.7],
	},
	"thunder": {
		"body": [
			[-2.35, 0.84, 0.32, 0.62, 0.25], [-2.22, 0.94, 0.26, 0.74, 0.2], [-1.80, 0.96, 0.28, 0.78, 0.2],
			[-1.69, 0.97, 0.57, 0.79, 0.2], [-1.11, 0.97, 0.57, 0.80, 0.2], [-1.00, 0.97, 0.28, 0.81, 0.2],
			[1.00, 0.98, 0.28, 0.84, 0.2], [1.11, 0.99, 0.57, 0.85, 0.2], [1.69, 0.99, 0.57, 0.86, 0.2],
			[1.80, 0.98, 0.28, 0.86, 0.2], [2.25, 0.95, 0.30, 0.88, 0.2], [2.35, 0.90, 0.36, 0.86, 0.25],
		],
		"cabin": [[-0.62, 0.86, 0.78, 0.82, 0.25], [-0.02, 0.75, 0.78, 1.24, 0.25], [0.85, 0.75, 0.80, 1.24, 0.25],
			[1.72, 0.86, 0.84, 0.90, 0.25]],
		"roof": [0.42, 1.245, 0.9, 1.3],
		"wheel_z": [-1.40, 1.40], "wheel_x": 0.82, "wheel_r": 0.36, "wheel_w": 0.30,
		"front": -2.35, "rear": 2.35, "light_y": 0.58, "tail_y": 0.7, "half_w": 0.97,
		"scoop": true,
	},
	"swift": {
		"body": [
			[-1.98, 0.80, 0.32, 0.58, 0.45], [-1.85, 0.88, 0.26, 0.68, 0.4], [-1.45, 0.90, 0.27, 0.72, 0.35],
			[-1.35, 0.91, 0.54, 0.73, 0.35], [-0.85, 0.91, 0.54, 0.75, 0.35], [-0.75, 0.91, 0.27, 0.76, 0.35],
			[0.80, 0.92, 0.27, 0.80, 0.35], [0.91, 0.92, 0.54, 0.80, 0.35], [1.41, 0.92, 0.54, 0.80, 0.35],
			[1.52, 0.91, 0.28, 0.80, 0.35], [1.98, 0.86, 0.30, 0.80, 0.4],
		],
		"cabin": [[-0.80, 0.84, 0.74, 0.78, 0.3], [-0.22, 0.75, 0.74, 1.36, 0.35], [1.50, 0.76, 0.76, 1.34, 0.35],
			[1.93, 0.80, 0.78, 1.02, 0.3]],
		"roof": [0.62, 1.355, 1.6, 1.2],
		"wheel_z": [-1.10, 1.16], "wheel_x": 0.78, "wheel_r": 0.33, "wheel_w": 0.26,
		"front": -1.98, "rear": 1.98, "light_y": 0.58, "tail_y": 0.72, "half_w": 0.92,
		"roof_spoiler": [1.74, 1.37, 1.25],
	},
}


static func _sections(raw: Array) -> Array:
	var out: Array = []
	for r in raw:
		out.append({"z": r[0], "w": r[1], "y0": r[2], "y1": r[3], "r": r[4]})
	return out


static func paint_material(c: Color) -> StandardMaterial3D:
	var key := "paint_%s" % c.to_html()
	var m := MeshKit.cached(key) as StandardMaterial3D
	if m != null:
		return m
	m = StandardMaterial3D.new()
	m.albedo_color = c
	m.metallic = 0.45
	m.roughness = 0.22
	m.metallic_specular = 0.7
	MeshKit.store(key, m)
	return m


static func _wheel_mesh(r: float, w: float) -> Mesh:
	var key := "wheel_%.2f_%.2f" % [r, w]
	var cached := MeshKit.cached_mesh(key)
	if cached != null:
		return cached
	var b := MeshKit.Builder.new()
	var tire := MeshKit.mat(Color(0.07, 0.07, 0.08), 0.85, 0.0, "tire")
	var rim := MeshKit.mat(Color(0.78, 0.8, 0.84), 0.25, 0.9, "rim")
	var hub := MeshKit.mat(Color(0.2, 0.2, 0.22), 0.4, 0.7, "hub")
	MeshKit.cylinder(b.st(tire), Vector3(-w * 0.5, 0, 0), Vector3.RIGHT, w, r, r, 14, true, true)
	for side in [-1.0, 1.0]:
		var x: float = side * (w * 0.5 + 0.004)
		MeshKit.cylinder(b.st(hub), Vector3(x - side * 0.01, 0, 0), Vector3.RIGHT * side, 0.012, r * 0.66, r * 0.66, 12, true, false)
		for k in 5:
			var a := TAU * k / 5.0
			var bas := Basis(Vector3.RIGHT, a)
			MeshKit.box(b.st(rim), Vector3(x + side * 0.012, 0, 0) + bas * Vector3(0, r * 0.33, 0),
					Vector3(0.02, r * 0.6, r * 0.16), bas)
		MeshKit.cylinder(b.st(rim), Vector3(x, 0, 0), Vector3.RIGHT * side, 0.03, r * 0.15, r * 0.12, 8, true, false)
	return MeshKit.store_mesh(key, b.commit())


## 반환: {root, body, pivots[4], spins[4], tail_mat, info}
static func build(model_id: String, paint: Color, headlight := false) -> Dictionary:
	var info: Dictionary = MODELS.get(model_id, MODELS["blaze"])
	var root := Node3D.new()
	var body := Node3D.new()
	body.name = "Body"
	root.add_child(body)

	var b := MeshKit.Builder.new()
	var paint_m := paint_material(paint)
	var glass := MeshKit.mat(Color(0.06, 0.08, 0.12), 0.06, 0.35, "glass")
	var trim := MeshKit.mat(Color(0.05, 0.05, 0.06), 0.6, 0.2, "trim")
	var chrome := MeshKit.mat(Color(0.85, 0.86, 0.9), 0.15, 1.0, "chrome")
	var head := MeshKit.emissive(Color(1.0, 0.95, 0.82), 2.2, "headlight")
	var tail := StandardMaterial3D.new()
	tail.albedo_color = Color(0.6, 0.02, 0.04)
	tail.emission_enabled = true
	tail.emission = Color(1.0, 0.08, 0.1)
	tail.emission_energy_multiplier = 1.2
	var plate := MeshKit.mat(Color(0.93, 0.93, 0.88), 0.6, 0.0, "plate")

	MeshKit.loft(b.st(paint_m), _sections(info["body"]), true, 0.1)
	MeshKit.loft(b.st(glass), _sections(info["cabin"]), true, 0.16)
	var roof: Array = info["roof"]
	MeshKit.box(b.st(paint_m), Vector3(0, roof[1], roof[0]), Vector3(roof[3], 0.04, roof[2]))

	var front: float = info["front"]
	var rear: float = info["rear"]
	var hw: float = info["half_w"]
	var ly: float = info["light_y"]
	var ty: float = info["tail_y"]
	# 앞: 그릴, 헤드라이트
	MeshKit.box(b.st(trim), Vector3(0, ly - 0.14, front + 0.06), Vector3(hw * 0.95, 0.14, 0.08))
	for s in [-1.0, 1.0]:
		MeshKit.box(b.st(head), Vector3(s * hw * 0.64, ly, front + 0.1), Vector3(hw * 0.38, 0.09, 0.12))
		# 뒤: 미등
		MeshKit.box(b.st(tail), Vector3(s * hw * 0.6, ty, rear - 0.03), Vector3(hw * 0.46, 0.08, 0.07))
		# 사이드 미러
		MeshKit.box(b.st(paint_m), Vector3(s * (hw + 0.06), 0.86 if model_id != "swift" else 0.9, front + 1.55),
				Vector3(0.14, 0.09, 0.16))
		# 배기구
		MeshKit.cylinder(b.st(chrome), Vector3(s * hw * 0.45, 0.3, rear - 0.12), Vector3.BACK, 0.18, 0.055, 0.055, 8, true, false)
	MeshKit.box(b.st(plate), Vector3(0, ty - 0.22, rear + 0.005), Vector3(0.5, 0.13, 0.03))
	MeshKit.box(b.st(trim), Vector3(0, 0.33, rear - 0.02), Vector3(hw * 1.6, 0.1, 0.1))
	if info.has("spoiler"):
		var sp: Array = info["spoiler"]
		for s in [-1.0, 1.0]:
			MeshKit.box(b.st(trim), Vector3(s * 0.55, sp[1] - 0.1, sp[0]), Vector3(0.05, 0.2, 0.12))
		MeshKit.box(b.st(paint_m), Vector3(0, sp[1], sp[0] + 0.03), Vector3(sp[2], 0.045, 0.34))
	if info.has("roof_spoiler"):
		var rs: Array = info["roof_spoiler"]
		MeshKit.box(b.st(paint_m), Vector3(0, rs[1], rs[0]), Vector3(rs[2], 0.05, 0.36))
	if info.has("scoop"):
		MeshKit.box(b.st(trim), Vector3(0, 0.84, -1.35), Vector3(0.5, 0.1, 0.7))
	var mi := MeshInstance3D.new()
	mi.mesh = b.commit()
	body.add_child(mi)

	# 바퀴
	var wr: float = info["wheel_r"]
	var ww: float = info["wheel_w"]
	var wx: float = info["wheel_x"]
	var wz: Array = info["wheel_z"]
	var wheel_mesh := _wheel_mesh(wr, ww)
	var pivots: Array = []
	var spins: Array = []
	for zi in 2:
		for s in [-1.0, 1.0]:
			var pivot := Node3D.new()
			pivot.position = Vector3(s * wx, wr, wz[zi])
			root.add_child(pivot)
			var spin := MeshInstance3D.new()
			spin.mesh = wheel_mesh
			pivot.add_child(spin)
			pivots.append(pivot)
			spins.append(spin)

	# 바닥 그림자
	var sh := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(hw * 2.0 + 0.5, rear - front + 0.6)
	sh.mesh = pm
	var shm := MeshKit.cached("car_shadow") as StandardMaterial3D
	if shm == null:
		shm = StandardMaterial3D.new()
		shm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		shm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		shm.albedo_texture = MeshKit.tex("shadow")
		shm.albedo_color = Color(1, 1, 1, 0.85)
		shm.render_priority = -1
		MeshKit.store("car_shadow", shm)
	sh.material_override = shm
	sh.position = Vector3(0, 0.035, (front + rear) * 0.5)
	sh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(sh)

	# 연기 (뒷바퀴) / 니트로 불꽃 (배기구)
	var smokes: Array = []
	for s in [-1.0, 1.0]:
		var p := _smoke_emitter()
		p.position = Vector3(s * wx, 0.15, wz[1] + 0.2)
		root.add_child(p)
		smokes.append(p)
	var flames: Array = []
	for s in [-1.0, 1.0]:
		var f := _flame_emitter()
		f.position = Vector3(s * hw * 0.45, 0.3, rear + 0.08)
		body.add_child(f)
		flames.append(f)

	var lamp: SpotLight3D = null
	if headlight:
		lamp = SpotLight3D.new()
		lamp.position = Vector3(0, 0.75, front + 0.1)
		lamp.rotation.x = -0.09
		lamp.spot_range = 70.0
		lamp.spot_angle = 34.0
		lamp.spot_attenuation = 0.8
		lamp.light_energy = 5.0
		lamp.light_color = Color(1.0, 0.92, 0.78)
		lamp.shadow_enabled = false
		root.add_child(lamp)

	return {"root": root, "body": body, "pivots": pivots, "spins": spins, "tail_mat": tail,
		"smokes": smokes, "flames": flames, "info": info, "lamp": lamp}


static func _smoke_emitter() -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = 26
	p.lifetime = 1.2
	p.local_coords = false
	p.emitting = false
	var qm := QuadMesh.new()
	qm.size = Vector2(1.0, 1.0)
	var m := MeshKit.cached("smoke_mat") as StandardMaterial3D
	if m == null:
		m = StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		m.vertex_color_use_as_albedo = true
		m.albedo_texture = MeshKit.tex("smoke")
		MeshKit.store("smoke_mat", m)
	qm.material = m
	p.mesh = qm
	p.direction = Vector3(0, 0.6, 1)
	p.spread = 30.0
	p.initial_velocity_min = 0.8
	p.initial_velocity_max = 2.4
	p.gravity = Vector3(0, 0.9, 0)
	p.damping_min = 0.6
	p.damping_max = 1.2
	p.scale_amount_min = 0.7
	p.scale_amount_max = 1.3
	var curve := Curve.new()
	curve.add_point(Vector2(0, 0.35))
	curve.add_point(Vector2(1, 2.6))
	p.scale_amount_curve = curve
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 1.0])
	g.colors = PackedColorArray([Color(0.95, 0.95, 0.95, 0.5), Color(0.9, 0.9, 0.9, 0.0)])
	p.color_ramp = g
	return p


static func _flame_emitter() -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = 30
	p.lifetime = 0.17
	p.local_coords = false
	p.emitting = false
	var qm := QuadMesh.new()
	qm.size = Vector2(0.42, 0.42)
	var m := MeshKit.cached("flame_mat") as StandardMaterial3D
	if m == null:
		m = StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		m.vertex_color_use_as_albedo = true
		m.albedo_texture = MeshKit.tex("glow")
		MeshKit.store("flame_mat", m)
	qm.material = m
	p.mesh = qm
	p.direction = Vector3(0, 0, 1)
	p.spread = 7.0
	p.initial_velocity_min = 6.0
	p.initial_velocity_max = 10.0
	p.gravity = Vector3.ZERO
	var curve := Curve.new()
	curve.add_point(Vector2(0, 1.0))
	curve.add_point(Vector2(1, 0.25))
	p.scale_amount_curve = curve
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.35, 1.0])
	g.colors = PackedColorArray([Color(0.6, 0.8, 1.0, 1.0), Color(1.0, 0.55, 0.15, 0.9), Color(1.0, 0.2, 0.05, 0.0)])
	p.color_ramp = g
	return p
