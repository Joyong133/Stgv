extends RefCounted
class_name Scenery
## 테마별 하늘/조명/안개, 도로·지형 재질, 나무·건물·가로등·바다·산 배치.

const WATER_SHADER := """
shader_type spatial;
render_mode specular_schlick_ggx;
uniform vec3 deep : source_color = vec3(0.05, 0.12, 0.25);
uniform vec3 shallow : source_color = vec3(0.15, 0.35, 0.45);
varying vec3 wpos;
void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
	float t = TIME;
	vec2 p = wpos.xz;
	vec3 n = vec3(0.0, 1.0, 0.0);
	n.x += sin(p.x * 0.11 + t * 1.3) * 0.06 + sin(p.y * 0.07 - t * 0.9 + p.x * 0.03) * 0.05
		+ sin((p.x + p.y) * 0.31 + t * 2.1) * 0.025;
	n.z += cos(p.y * 0.13 + t * 1.1) * 0.06 + cos(p.x * 0.05 + t * 0.7 - p.y * 0.02) * 0.05
		+ cos((p.x - p.y) * 0.27 - t * 1.7) * 0.025;
	n = normalize(n);
	NORMAL = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	ALBEDO = mix(deep, shallow, 0.25 + 0.5 * fres);
	ROUGHNESS = 0.05;
	METALLIC = 0.0;
	SPECULAR = 0.8;
}
"""

const NIGHT_SKY_SHADER := """
shader_type sky;
uniform vec3 top_color : source_color = vec3(0.01, 0.015, 0.05);
uniform vec3 horizon_color : source_color = vec3(0.16, 0.07, 0.22);
uniform vec3 glow_color : source_color = vec3(0.45, 0.12, 0.35);
uniform vec3 moon_dir = vec3(-0.45, 0.55, -0.7);

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

void sky() {
	vec3 d = EYEDIR;
	float h = clamp(d.y, 0.0, 1.0);
	vec3 col = mix(horizon_color, top_color, pow(h, 0.45));
	col += glow_color * pow(1.0 - h, 10.0) * 0.6;
	if (d.y > 0.03) {
		vec3 cell = floor(d * 260.0);
		float r = hash13(cell);
		if (r > 0.9965) {
			float tw = 0.6 + 0.4 * sin(TIME * (2.0 + r * 30.0) + r * 100.0);
			col += vec3(0.9, 0.92, 1.0) * ((r - 0.9965) / 0.0035) * tw * smoothstep(0.03, 0.25, d.y);
		}
	}
	vec3 md = normalize(moon_dir);
	float m = dot(d, md);
	col += vec3(0.95, 0.93, 0.85) * smoothstep(0.99945, 0.99965, m);
	col += vec3(0.25, 0.27, 0.4) * pow(max(m, 0.0), 300.0);
	if (d.y < 0.0) {
		col = mix(horizon_color * 0.6, vec3(0.02, 0.02, 0.04), clamp(-d.y * 4.0, 0.0, 1.0));
	}
	COLOR = col;
}
"""

const NEON_SHADER := """
shader_type spatial;
render_mode unshaded, cull_disabled;
uniform float energy = 2.2;
void fragment() {
	ALBEDO = COLOR.rgb * energy;
}
"""


# ------------------------------------------------------------------ 재질

static func road_materials(theme: String) -> Dictionary:
	var key := "road_" + theme
	if MeshKit.cached(key + "_asphalt") != null:
		return {
			"asphalt": MeshKit.cached(key + "_asphalt"), "curb": MeshKit.cached(key + "_curb"),
			"shoulder": MeshKit.cached(key + "_shoulder"), "wall": MeshKit.cached(key + "_wall"),
			"wall_top": MeshKit.cached(key + "_wall_top"),
		}
	var aniso := BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	var asphalt := StandardMaterial3D.new()
	asphalt.albedo_texture = MeshKit.tex("asphalt")
	asphalt.texture_filter = aniso
	asphalt.roughness = 0.88
	if theme == "night":
		asphalt.roughness = 0.45
		asphalt.albedo_color = Color(0.85, 0.85, 0.9)
	var curb := StandardMaterial3D.new()
	curb.albedo_texture = MeshKit.tex("curb")
	curb.texture_filter = aniso
	curb.roughness = 0.7
	var shoulder := StandardMaterial3D.new()
	shoulder.albedo_texture = MeshKit.tex("detail")
	shoulder.texture_filter = aniso
	shoulder.roughness = 0.95
	match theme:
		"sunset":
			shoulder.albedo_color = Color(0.72, 0.6, 0.42)
		"day":
			shoulder.albedo_color = Color(0.36, 0.5, 0.22)
		_:
			shoulder.albedo_color = Color(0.42, 0.42, 0.46)
			shoulder.albedo_texture = MeshKit.tex("pavement")
	var wall := StandardMaterial3D.new()
	wall.cull_mode = BaseMaterial3D.CULL_DISABLED
	wall.texture_filter = aniso
	if theme == "night":
		wall.albedo_texture = MeshKit.tex("barrier")
		wall.roughness = 0.8
	else:
		wall.albedo_texture = MeshKit.tex("guardrail")
		wall.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
		wall.alpha_scissor_threshold = 0.5
		wall.metallic = 0.55
		wall.roughness = 0.38
	var wall_top := StandardMaterial3D.new()
	if theme == "night":
		wall_top.albedo_color = Color(0.55, 0.55, 0.58)
		wall_top.roughness = 0.85
	else:
		wall_top.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		wall_top.albedo_color = Color(0, 0, 0, 0)
	MeshKit.store(key + "_asphalt", asphalt)
	MeshKit.store(key + "_curb", curb)
	MeshKit.store(key + "_shoulder", shoulder)
	MeshKit.store(key + "_wall", wall)
	MeshKit.store(key + "_wall_top", wall_top)
	return {"asphalt": asphalt, "curb": curb, "shoulder": shoulder, "wall": wall, "wall_top": wall_top}


static func terrain_material(theme: String) -> Material:
	var key := "terrain_" + theme
	if MeshKit.cached(key) != null:
		return MeshKit.cached(key)
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = MeshKit.tex("detail")
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	m.roughness = 0.96
	return MeshKit.store(key, m)


static func terrain_palette(theme: String) -> Dictionary:
	match theme:
		"sunset":
			return {"a": Color(0.45, 0.52, 0.26), "b": Color(0.62, 0.58, 0.32), "rock": Color(0.52, 0.44, 0.4),
				"sand": Color(0.88, 0.76, 0.56), "wet": Color(0.55, 0.47, 0.36), "verge": Color(0.5, 0.52, 0.3)}
		"day":
			return {"a": Color(0.26, 0.46, 0.16), "b": Color(0.36, 0.52, 0.2), "rock": Color(0.47, 0.46, 0.43),
				"sand": Color(0.6, 0.55, 0.4), "wet": Color(0.3, 0.3, 0.25), "verge": Color(0.33, 0.48, 0.2)}
		_:
			return {"a": Color(0.16, 0.16, 0.19), "b": Color(0.2, 0.2, 0.23), "rock": Color(0.25, 0.25, 0.28),
				"sand": Color(0.3, 0.3, 0.3), "wet": Color(0.1, 0.1, 0.1), "verge": Color(0.13, 0.2, 0.12)}


static func terrain_color(pal: Dictionary, theme: String, h: float, ny: float, nv: float, dist: float,
		wall_d: float, sea_level: float) -> Color:
	var a: Color = pal["a"]
	var b: Color = pal["b"]
	var c := a.lerp(b, nv)
	if theme == "night":
		if nv > 0.72:
			c = c.lerp(pal["verge"], 0.8)
		return c
	if dist < wall_d + 14.0:
		c = c.lerp(pal["verge"], 0.6)
	var steep := clampf((0.86 - ny) * 4.0, 0.0, 1.0)
	c = c.lerp(pal["rock"], steep)
	if sea_level > -100.0:
		if h < sea_level + 0.3:
			c = pal["wet"]
		elif h < 3.6:
			c = pal["sand"]
		elif h < 4.6:
			c = c.lerp(pal["sand"], 4.6 - h)
	return c


# ------------------------------------------------------------------ 환경

static func build(track: Track) -> void:
	_environment(track)
	match track.theme:
		"sunset":
			_sea(track)
			_mountains(track, Color(0.42, 0.24, 0.42), Color(0.75, 0.45, 0.5), false)
			_trees(track, "palm", 0.42)
			_trees(track, "round", 0.5)
			_rocks(track, 0.5)
			_lamps(track, 26, [-1.0], Color(1.0, 0.75, 0.4))
			_clouds(track, Color(1.0, 0.7, 0.62))
		"day":
			_mountains(track, Color(0.3, 0.4, 0.5), Color(0.92, 0.95, 1.0), true)
			_trees(track, "pine", 1.0)
			_trees(track, "round", 0.25)
			_rocks(track, 0.6)
			_clouds(track, Color(1, 1, 1))
		"night":
			_skyline(track)
			_buildings(track)
			_lamps(track, 18, [-1.0, 1.0], Color(1.0, 0.82, 0.55))
			_trees(track, "round", 0.18)


static func _environment(track: Track) -> void:
	var env := Environment.new()
	var sky := Sky.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	var elev := 30.0
	var azim := 0.0
	match track.theme:
		"sunset":
			var m := ProceduralSkyMaterial.new()
			m.sky_top_color = Color(0.17, 0.12, 0.38)
			m.sky_horizon_color = Color(1.0, 0.56, 0.4)
			m.sky_curve = 0.11
			m.ground_horizon_color = Color(0.85, 0.48, 0.42)
			m.ground_bottom_color = Color(0.12, 0.07, 0.14)
			m.ground_curve = 0.04
			m.sun_angle_max = 28.0
			m.sun_curve = 0.07
			sky.sky_material = m
			env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
			env.ambient_light_energy = 0.75
			env.fog_light_color = Color(0.92, 0.55, 0.5)
			env.fog_density = 0.0014
			env.fog_sky_affect = 0.25
			sun.light_color = Color(1.0, 0.64, 0.42)
			sun.light_energy = 1.45
			elev = 9.0
			azim = -18.0
			env.tonemap_exposure = 1.05
		"day":
			var m := ProceduralSkyMaterial.new()
			m.sky_top_color = Color(0.2, 0.42, 0.84)
			m.sky_horizon_color = Color(0.7, 0.82, 0.96)
			m.ground_horizon_color = Color(0.6, 0.7, 0.66)
			m.ground_bottom_color = Color(0.2, 0.26, 0.2)
			m.sun_angle_max = 20.0
			sky.sky_material = m
			env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
			env.ambient_light_energy = 0.8
			env.fog_light_color = Color(0.72, 0.8, 0.92)
			env.fog_density = 0.0008
			env.fog_sky_affect = 0.2
			sun.light_color = Color(1.0, 0.95, 0.86)
			sun.light_energy = 1.2
			elev = 50.0
			azim = 135.0
		_:
			var m := ShaderMaterial.new()
			var sh := Shader.new()
			sh.code = NIGHT_SKY_SHADER
			m.shader = sh
			sky.sky_material = m
			env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
			env.ambient_light_color = Color(0.2, 0.2, 0.34)
			env.ambient_light_energy = 1.0
			env.fog_light_color = Color(0.12, 0.07, 0.18)
			env.fog_density = 0.0022
			env.fog_sky_affect = 0.15
			sun.light_color = Color(0.55, 0.62, 0.95)
			sun.light_energy = 0.35
			elev = 38.0
			azim = 220.0
			env.tonemap_exposure = 1.1
	var el := deg_to_rad(elev)
	var az := deg_to_rad(azim)
	var sun_dir := Vector3(cos(el) * cos(az), sin(el), cos(el) * sin(az)).normalized()
	sun.basis = Basis.looking_at(-sun_dir, Vector3.UP)
	sun.shadow_enabled = false
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 80.0
	sun.shadow_bias = 0.06
	sun.shadow_normal_bias = 1.2
	sun.light_angular_distance = 0.5
	track.add_child(sun)
	var we := WorldEnvironment.new()
	we.environment = env
	track.add_child(we)
	track.sun = sun
	track.env = env
	if track.theme == "night":
		var sky_mat := env.sky.sky_material as ShaderMaterial
		sky_mat.set_shader_parameter("moon_dir", sun_dir)


## 그래픽 품질에 따라 그림자/글로우 조정
static func apply_quality(track: Track, q: int) -> void:
	if track.sun == null:
		return
	track.sun.shadow_enabled = q >= 1 and track.theme != "night"
	track.sun.directional_shadow_max_distance = 70.0 if q == 1 else 110.0
	track.sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL if q == 1 else DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	var env := track.env
	env.glow_enabled = q >= 1 and track.theme != "day"
	env.glow_intensity = 0.9 if track.theme == "night" else 0.5
	env.glow_bloom = 0.08 if track.theme == "night" else 0.03
	env.glow_hdr_threshold = 0.85 if track.theme == "night" else 1.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE if track.theme == "night" else Environment.GLOW_BLEND_MODE_SOFTLIGHT


# ------------------------------------------------------------------ 배치 도우미

## 인스턴스들을 공간 구역(chunk)별 MultiMesh 로 나눠 화면 밖 구역은 그리지 않게 합니다.
static func _scatter(track: Track, mesh: Mesh, xforms: Array, colors: Array, shadows: bool, vis_end := 900.0,
		chunk := 240.0) -> void:
	var groups := {}
	for i in xforms.size():
		var t: Transform3D = xforms[i]
		var key := Vector2i(int(floor(t.origin.x / chunk)), int(floor(t.origin.z / chunk)))
		if not groups.has(key):
			groups[key] = []
		groups[key].append(i)
	for key in groups.keys():
		var ids: Array = groups[key]
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = colors.size() > 0
		mm.mesh = mesh
		mm.instance_count = ids.size()
		for k in ids.size():
			mm.set_instance_transform(k, xforms[ids[k]])
			if colors.size() > 0:
				mm.set_instance_color(k, colors[ids[k]])
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mmi.visibility_range_end = vis_end
		mmi.visibility_range_end_margin = 60.0
		mmi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_DISABLED
		track.add_child(mmi)


## 도로에서 떨어진 위치를 고릅니다. near: 도로 근처 비중
static func _pick_spots(track: Track, count: int, min_d: float, max_d: float, near := 0.7,
		accept: Callable = Callable()) -> Array:
	var out: Array = []
	var rng := track.rng
	var tries := 0
	while out.size() < count and tries < count * 8:
		tries += 1
		var p := Vector3.ZERO
		if rng.randf() < near:
			var i := rng.randi() % track.n
			var side := -1.0 if rng.randf() < 0.5 else 1.0
			var off := track.wall_d + min_d + pow(rng.randf(), 1.6) * (max_d - min_d)
			p = track.pos[i] + track.right[i] * side * off
			p += Vector3(rng.randf_range(-6, 6), 0, rng.randf_range(-6, 6))
		else:
			p = Vector3(
				rng.randf_range(track.bounds.position.x - 350.0, track.bounds.end.x + 350.0), 0,
				rng.randf_range(track.bounds.position.y - 350.0, track.bounds.end.y + 350.0))
		var approx := track.road_distance(p.x, p.z)
		if approx < 60.0:
			if track.exact_road_distance(p.x, p.z) < track.wall_d + min_d:
				continue
		elif approx < track.wall_d + min_d:
			continue
		p.y = track.terrain_height(p.x, p.z)
		if accept.is_valid() and not accept.call(p):
			continue
		out.append(p)
	return out


static func _count(track: Track, base: int) -> int:
	var f: float = [0.5, 0.8, 1.0][clampi(track.quality, 0, 2)]
	return int(base * f)


# ------------------------------------------------------------------ 나무

static func tree_mesh(kind: String) -> Mesh:
	var key := "tree_mesh_" + kind
	if MeshKit.cached_mesh(key) != null:
		return MeshKit.cached_mesh(key)
	var b := MeshKit.Builder.new()
	match kind:
		"pine":
			var trunk := MeshKit.mat(Color(0.33, 0.22, 0.14), 0.9, 0.0, "pine_trunk")
			var leaf := MeshKit.mat(Color(0.13, 0.3, 0.15), 0.9, 0.0, "pine_leaf")
			leaf.vertex_color_use_as_albedo = true
			MeshKit.cylinder(b.st(trunk), Vector3.ZERO, Vector3.UP, 3.0, 0.32, 0.18, 6, false)
			MeshKit.cone(b.st(leaf), Vector3(0, 1.6, 0), Vector3.UP, 4.2, 2.5, 7)
			MeshKit.cone(b.st(leaf), Vector3(0, 3.6, 0), Vector3.UP, 3.8, 1.95, 7)
			MeshKit.cone(b.st(leaf), Vector3(0, 5.5, 0), Vector3.UP, 3.4, 1.35, 7)
		"round":
			var trunk := MeshKit.mat(Color(0.36, 0.26, 0.18), 0.9, 0.0, "round_trunk")
			var leaf := MeshKit.mat(Color(0.3, 0.45, 0.18), 0.9, 0.0, "round_leaf")
			leaf.vertex_color_use_as_albedo = true
			MeshKit.cylinder(b.st(trunk), Vector3.ZERO, Vector3.UP, 2.6, 0.28, 0.2, 6, false)
			_ball(b.st(leaf), Vector3(0, 3.6, 0), Vector3(2.3, 2.0, 2.3))
			_ball(b.st(leaf), Vector3(0.9, 4.5, 0.4), Vector3(1.5, 1.4, 1.5))
			_ball(b.st(leaf), Vector3(-0.8, 4.2, -0.5), Vector3(1.4, 1.3, 1.4))
		"palm":
			var trunk := MeshKit.mat(Color(0.5, 0.38, 0.26), 0.9, 0.0, "palm_trunk")
			var leaf := MeshKit.mat(Color(0.24, 0.48, 0.16), 0.85, 0.0, "palm_leaf")
			leaf.cull_mode = BaseMaterial3D.CULL_DISABLED
			leaf.vertex_color_use_as_albedo = true
			var p := Vector3.ZERO
			var seg := 1.25
			for k in 7:
				var bend := Vector3(0.12 * k * 0.5, 1.0, 0).normalized()
				MeshKit.cylinder(b.st(trunk), p, bend, seg + 0.05, 0.27 - k * 0.015, 0.25 - k * 0.015, 6, false)
				p += bend * seg
			var top := p
			for f in 8:
				var ang := TAU * f / 8.0 + 0.3
				var dir := Vector3(cos(ang), 0, sin(ang))
				var side := dir.cross(Vector3.UP).normalized()
				var prev_c := top
				var prev_w := 0.08
				for s in 5:
					var t := float(s + 1) / 5.0
					var c := top + dir * (t * 4.2) + Vector3(0, 0.6 * sin(t * PI * 0.7) - t * t * 2.2, 0)
					var w := 0.75 * sin(t * PI) + 0.05
					MeshKit.quad(b.st(leaf), prev_c - side * prev_w, prev_c + side * prev_w, c + side * w, c - side * w, Vector3.UP)
					prev_c = c
					prev_w = w
	return MeshKit.store_mesh(key, b.commit())


static func _ball(st: SurfaceTool, c: Vector3, r: Vector3, segs := 7, rings := 4) -> void:
	for i in rings:
		var a0 := PI * float(i) / rings - PI * 0.5
		var a1 := PI * float(i + 1) / rings - PI * 0.5
		for j in segs:
			var b0 := TAU * float(j) / segs
			var b1 := TAU * float(j + 1) / segs
			var p00 := c + Vector3(cos(a0) * cos(b0) * r.x, sin(a0) * r.y, cos(a0) * sin(b0) * r.z)
			var p01 := c + Vector3(cos(a0) * cos(b1) * r.x, sin(a0) * r.y, cos(a0) * sin(b1) * r.z)
			var p10 := c + Vector3(cos(a1) * cos(b0) * r.x, sin(a1) * r.y, cos(a1) * sin(b0) * r.z)
			var p11 := c + Vector3(cos(a1) * cos(b1) * r.x, sin(a1) * r.y, cos(a1) * sin(b1) * r.z)
			var mid := (p00 + p01 + p10 + p11) * 0.25 - c
			MeshKit.quad(st, p00, p01, p11, p10, mid)


static func _trees(track: Track, kind: String, amount: float) -> void:
	var base := 1200 if kind == "pine" else 700
	var count := _count(track, int(base * amount))
	var accept := Callable()
	if kind == "palm":
		accept = func(p: Vector3) -> bool: return p.y > 0.9 and p.y < 9.0
	elif track.sea_level > -100.0:
		accept = func(p: Vector3) -> bool: return p.y > 3.8
	var spots := _pick_spots(track, count, 3.0 if kind != "pine" else 4.0, 260.0, 0.72, accept)
	var xforms: Array = []
	var colors: Array = []
	var rng := track.rng
	for p in spots:
		var s := rng.randf_range(0.8, 1.45)
		if kind == "palm":
			s = rng.randf_range(0.9, 1.3)
		var basis := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(s, s * rng.randf_range(0.9, 1.15), s))
		xforms.append(Transform3D(basis, p - Vector3(0, 0.25, 0)))
		var tint := rng.randf_range(0.8, 1.15)
		colors.append(Color(tint, tint * rng.randf_range(0.95, 1.05), tint * 0.95))
	_scatter(track, tree_mesh(kind), xforms, colors, true, 950.0)


static func _rocks(track: Track, amount: float) -> void:
	var key := "rock_mesh"
	var mesh: Mesh = MeshKit.cached_mesh(key)
	if mesh == null:
		var b := MeshKit.Builder.new()
		var m := MeshKit.mat(Color(0.5, 0.47, 0.44), 0.95, 0.0, "rock")
		m.vertex_color_use_as_albedo = true
		_ball(b.st(m), Vector3(0, 0.3, 0), Vector3(1.6, 1.1, 1.3), 6, 3)
		_ball(b.st(m), Vector3(0.9, 0.1, 0.5), Vector3(0.9, 0.7, 0.8), 5, 3)
		mesh = MeshKit.store_mesh(key, b.commit())
	var spots := _pick_spots(track, _count(track, int(260 * amount)), 2.0, 200.0, 0.6)
	var xforms: Array = []
	var colors: Array = []
	for p in spots:
		var s := track.rng.randf_range(0.5, 2.2)
		var basis := Basis(Vector3.UP, track.rng.randf() * TAU).scaled(Vector3(s, s * track.rng.randf_range(0.6, 1.1), s))
		xforms.append(Transform3D(basis, p - Vector3(0, 0.3 * s, 0)))
		var c := track.rng.randf_range(0.75, 1.1)
		colors.append(Color(c, c, c))
	_scatter(track, mesh, xforms, colors, true, 600.0)


# ------------------------------------------------------------------ 바다, 산, 구름

static func _sea(track: Track) -> void:
	var sh := Shader.new()
	sh.code = WATER_SHADER
	var m := ShaderMaterial.new()
	m.shader = sh
	m.set_shader_parameter("deep", Color(0.09, 0.12, 0.3))
	m.set_shader_parameter("shallow", Color(0.32, 0.3, 0.45))
	var pm := PlaneMesh.new()
	pm.size = Vector2(7000, 8000)
	var mi := MeshInstance3D.new()
	mi.mesh = pm
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var sea_x := float(track.def.get("sea_x", 0.0))
	mi.position = Vector3(sea_x - 140.0 + 3500.0, track.sea_level, track.center.z)
	track.add_child(mi)


static func _ring_frame(track: Track) -> Array:
	var rx := track.bounds.size.x * 0.5 + 380.0
	var rz := track.bounds.size.y * 0.5 + 380.0
	var c := Vector2(track.bounds.get_center().x, track.bounds.get_center().y)
	return [c, rx, rz]


static func _mountains(track: Track, base_col: Color, top_col: Color, snow: bool) -> void:
	var fr := _ring_frame(track)
	var c: Vector2 = fr[0]
	var rx: float = fr[1]
	var rz: float = fr[2]
	var segs := 96
	var noise := FastNoiseLite.new()
	noise.seed = track.rng.randi()
	noise.frequency = 1.6
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var base_y := track.min_y - 30.0
	var sea_x := float(track.def.get("sea_x", 1.0e9))
	var rows := [0.0, 0.35, 0.6, 1.0, 1.8]   # 안쪽 -> 바깥 (거리 비율)
	var grid: Array = []
	for i in segs + 1:
		var a := TAU * float(i % segs) / segs
		var dir := Vector2(cos(a), sin(a))
		var peak := 130.0 + (noise.get_noise_1d(float(i % segs) / segs * 6.0) * 0.5 + 0.5) * 260.0
		var row: Array = []
		for r in rows.size():
			var k: float = rows[r]
			var dist_add := k * 420.0
			var p2 := c + Vector2(dir.x * (rx + dist_add), dir.y * (rz + dist_add))
			var hk: float = [0.0, 0.55, 1.0, 0.75, -0.1][r]
			var h := base_y + (peak + 30.0) * hk
			if p2.x > sea_x - 60.0:
				h = minf(h, track.sea_level - 5.0 + hk * 25.0)
			row.append(Vector3(p2.x, h, p2.y))
		grid.append(row)
	for i in segs:
		for r in rows.size() - 1:
			var pts := [grid[i][r], grid[i + 1][r], grid[i + 1][r + 1], grid[i][r], grid[i + 1][r + 1], grid[i][r + 1]]
			var a: Vector3 = pts[0]
			var b: Vector3 = pts[1]
			var cc: Vector3 = pts[2]
			var inward := Vector3(c.x - a.x, 0, c.y - a.z).normalized() + Vector3.UP
			if (cc - a).cross(b - a).dot(inward) < 0.0:
				pts = [grid[i][r], grid[i + 1][r + 1], grid[i + 1][r], grid[i][r], grid[i][r + 1], grid[i + 1][r + 1]]
			for v in pts:
				var hv: float = (v.y - base_y) / 380.0
				var col := base_col.lerp(top_col, clampf(hv * 0.8, 0.0, 1.0))
				if snow and v.y - base_y > 250.0:
					col = Color(0.95, 0.96, 1.0)
				st.set_color(col)
				st.add_vertex(v)
	st.index()
	st.generate_normals()
	var mesh := st.commit()
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.roughness = 1.0
	mesh.surface_set_material(0, m)
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	track.add_child(mi)


## 밤 도시: 멀리 보이는 빌딩 실루엣
static func _skyline(track: Track) -> void:
	var fr := _ring_frame(track)
	var c: Vector2 = fr[0]
	var rx: float = fr[1] + 250.0
	var rz: float = fr[2] + 250.0
	var b := MeshKit.Builder.new()
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.05, 0.05, 0.09)
	m.albedo_texture = MeshKit.tex("windows")
	m.emission_enabled = true
	m.emission_texture = MeshKit.tex("windows_emit")
	m.emission = Color(1, 1, 1)
	m.emission_energy_multiplier = 0.9
	m.uv1_triplanar = true
	m.uv1_world_triplanar = true
	m.uv1_scale = Vector3(1.0 / 22.0, 1.0 / 22.0, 1.0 / 22.0)
	var st := b.st(m)
	var count := 140
	for i in count:
		var a := TAU * float(i) / count + track.rng.randf_range(-0.01, 0.01)
		var dist := track.rng.randf_range(0.0, 320.0)
		var p := c + Vector2(cos(a) * (rx + dist), sin(a) * (rz + dist))
		var w := track.rng.randf_range(30.0, 70.0)
		var h := track.rng.randf_range(60.0, 220.0)
		var bas := Basis(Vector3.UP, -a)
		MeshKit.box(st, Vector3(p.x, track.min_y - 5.0 + h * 0.5, p.y), Vector3(w, h, w), bas)
	var mi := MeshInstance3D.new()
	mi.mesh = b.commit()
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	track.add_child(mi)


static func _clouds(track: Track, tint: Color) -> void:
	var qm := QuadMesh.new()
	qm.size = Vector2(1, 1)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_texture = MeshKit.tex("cloud")
	m.albedo_color = tint
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	m.billboard_keep_scale = true
	m.disable_fog = true
	m.vertex_color_use_as_albedo = true
	qm.material = m
	var xforms: Array = []
	var colors: Array = []
	var c := track.bounds.get_center()
	for i in 26:
		var a := track.rng.randf() * TAU
		var r := track.rng.randf_range(500.0, 1900.0)
		var p := Vector3(c.x + cos(a) * r, track.rng.randf_range(170.0, 380.0), c.y + sin(a) * r)
		var w := track.rng.randf_range(160.0, 360.0)
		xforms.append(Transform3D(Basis().scaled(Vector3(w, w * 0.45, 1.0)), p))
		var alpha := track.rng.randf_range(0.55, 0.9)
		colors.append(Color(1, 1, 1, alpha))
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = qm
	mm.instance_count = xforms.size()
	for i in xforms.size():
		mm.set_instance_transform(i, xforms[i])
		mm.set_instance_color(i, colors[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	track.add_child(mmi)


# ------------------------------------------------------------------ 도시

static func _buildings(track: Track) -> void:
	var rng := track.rng
	var box := BoxMesh.new()
	box.size = Vector3.ONE
	var m := StandardMaterial3D.new()
	m.albedo_texture = MeshKit.tex("windows")
	m.vertex_color_use_as_albedo = true
	m.emission_enabled = true
	m.emission_texture = MeshKit.tex("windows_emit")
	m.emission = Color(1, 1, 1)
	m.emission_energy_multiplier = 1.25
	m.uv1_triplanar = true
	m.uv1_world_triplanar = true
	m.uv1_scale = Vector3(1.0 / 16.0, 1.0 / 16.0, 1.0 / 16.0)
	m.roughness = 0.6
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	box.material = m
	var xforms: Array = []
	var colors: Array = []
	var signs: Array = []
	var sign_cols: Array = []
	var step := 38.0
	var x0 := track.bounds.position.x - 320.0
	var z0 := track.bounds.position.y - 320.0
	var x1 := track.bounds.end.x + 320.0
	var z1 := track.bounds.end.y + 320.0
	var neon := [Color(1.0, 0.2, 0.6), Color(0.1, 0.9, 1.0), Color(0.7, 0.3, 1.0), Color(1.0, 0.85, 0.2),
		Color(0.2, 1.0, 0.5), Color(1.0, 0.4, 0.15)]
	var keep: float = [0.45, 0.75, 1.0][clampi(track.quality, 0, 2)]
	var x := x0
	while x < x1:
		var z := z0
		while z < z1:
			var cx := x + rng.randf_range(-4.0, 4.0)
			var cz := z + rng.randf_range(-4.0, 4.0)
			z += step
			if rng.randf() > keep:
				continue
			var w := rng.randf_range(16.0, 30.0)
			var dpt := rng.randf_range(16.0, 30.0)
			var approx := track.road_distance(cx, cz)
			var need := track.wall_d + 7.0 + maxf(w, dpt) * 0.72
			var dist := approx
			if approx < need + 30.0:
				dist = track.exact_road_distance(cx, cz)
			if dist < need:
				continue
			if rng.randf() < 0.12:
				continue
			var center_d := Vector2(cx, cz).distance_to(track.bounds.get_center())
			var tall := clampf(1.0 - center_d / 900.0, 0.2, 1.0)
			var h := rng.randf_range(14.0, 50.0) + pow(rng.randf(), 2.0) * 110.0 * tall
			var gy := track.terrain_height(cx, cz) - 1.0
			var yaw := 0.0
			xforms.append(Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3(w, h, dpt)), Vector3(cx, gy + h * 0.5, cz)))
			var tone := rng.randf_range(0.55, 1.0)
			var hue := rng.randf()
			colors.append(Color.from_hsv(0.6 + hue * 0.15, 0.25, tone))
			# 도로 가까운 건물에 네온 간판
			if dist < need + 50.0 and rng.randf() < 0.55:
				var tp := Track.TrackPos.new()
				track.project(Vector3(cx, 0, cz), tp)
				var to_road := (track.point_at(tp.s, 0.0) - Vector3(cx, 0, cz))
				to_road.y = 0
				to_road = to_road.normalized()
				var face := Vector3(signf(to_road.x), 0, 0) if absf(to_road.x) > absf(to_road.z) else Vector3(0, 0, signf(to_road.z))
				var half := (w if face.x != 0.0 else dpt) * 0.5
				var sp := Vector3(cx, gy + rng.randf_range(6.0, minf(h - 3.0, 26.0)), cz) + face * (half + 0.3)
				var sw := rng.randf_range(5.0, 12.0)
				var sh := rng.randf_range(1.6, 4.0)
				var sb := Basis.looking_at(face, Vector3.UP)
				signs.append(Transform3D(sb.scaled(Vector3(sw, sh, 0.4)), sp))
				sign_cols.append(neon[rng.randi() % neon.size()])
	_scatter(track, box, xforms, colors, false, 1500.0, 300.0)
	if signs.size() > 0:
		var sbox := BoxMesh.new()
		sbox.size = Vector3.ONE
		var sm := ShaderMaterial.new()
		var sh2 := Shader.new()
		sh2.code = NEON_SHADER
		sm.shader = sh2
		sbox.material = sm
		_scatter(track, sbox, signs, sign_cols, false, 900.0, 300.0)


static func _lamps(track: Track, every: int, sides: Array, light_col: Color) -> void:
	var b := MeshKit.Builder.new()
	var pole := MeshKit.mat(Color(0.22, 0.23, 0.26), 0.5, 0.6, "lamp_pole")
	var head := MeshKit.emissive(light_col, 3.0, "lamp_head_%s" % light_col.to_html())
	MeshKit.cylinder(b.st(pole), Vector3.ZERO, Vector3.UP, 8.0, 0.16, 0.11, 6, false)
	MeshKit.box(b.st(pole), Vector3(1.3, 7.9, 0), Vector3(2.8, 0.16, 0.16))
	MeshKit.box(b.st(pole), Vector3(2.6, 7.75, 0), Vector3(0.9, 0.22, 0.42))
	MeshKit.box(b.st(head), Vector3(2.6, 7.62, 0), Vector3(0.75, 0.06, 0.32))
	var mesh := b.commit()
	var xforms: Array = []
	var i := 0
	var k := 0
	while i < track.n:
		for side in sides:
			var d: float = side * (track.wall_d + 0.9)
			var p := track.pos[i] + track.right[i] * d
			var yaw := atan2(-track.tangent[i].x, -track.tangent[i].z)
			# 팔(+x)이 도로 쪽을 향하도록
			var basis := Basis(Vector3.UP, yaw + (0.0 if side < 0.0 else PI))
			xforms.append(Transform3D(basis, p - Vector3(0, 0.1, 0)))
		i += every
		k += 1
	_scatter(track, mesh, xforms, [], false, 700.0)
