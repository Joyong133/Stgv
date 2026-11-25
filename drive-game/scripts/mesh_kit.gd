extends RefCounted
class_name MeshKit
## 절차적 메시와 재질을 만드는 도우미 모음.
## Godot은 앞면을 시계 방향으로 감습니다. 아래 함수들은 의도한 법선 방향을 받아 감는 방향을 자동으로 맞춥니다.

static var _mat_cache := {}
static var _tex_cache := {}
static var _mesh_cache := {}


# ---------------------------------------------------------------- 재질

static func mat(color: Color, rough := 0.8, metal := 0.0, key := "") -> StandardMaterial3D:
	var k := key if key != "" else "m_%s_%.2f_%.2f" % [color.to_html(), rough, metal]
	if _mat_cache.has(k):
		return _mat_cache[k]
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	m.metallic = metal
	_mat_cache[k] = m
	return m


static func emissive(color: Color, energy := 2.0, key := "") -> StandardMaterial3D:
	var k := key if key != "" else "e_%s_%.2f" % [color.to_html(), energy]
	if _mat_cache.has(k):
		return _mat_cache[k]
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.emission_enabled = true
	m.emission = color
	m.emission_energy_multiplier = energy
	m.roughness = 0.4
	_mat_cache[k] = m
	return m


static func unshaded(color: Color, key := "") -> StandardMaterial3D:
	var k := key if key != "" else "u_%s" % color.to_html()
	if _mat_cache.has(k):
		return _mat_cache[k]
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = color
	if color.a < 0.999:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_mat_cache[k] = m
	return m


static func cached(key: String) -> Material:
	return _mat_cache.get(key)


static func store(key: String, m: Material) -> Material:
	_mat_cache[key] = m
	return m


## 밉맵이 있는 텍스처를 돌려줍니다 (멀리 있는 도로 무늬가 지글거리지 않도록).
static func tex(name: String) -> Texture2D:
	if _tex_cache.has(name):
		return _tex_cache[name]
	var t: Texture2D = load("res://assets/textures/%s.png" % name)
	if t == null:
		push_error("texture missing: " + name)
		return null
	var img := t.get_image()
	if img != null and not img.has_mipmaps():
		if img.is_compressed():
			img.decompress()
		img.generate_mipmaps()
		t = ImageTexture.create_from_image(img)
	_tex_cache[name] = t
	return t


static func cached_mesh(key: String) -> Mesh:
	return _mesh_cache.get(key)


static func store_mesh(key: String, m: Mesh) -> Mesh:
	_mesh_cache[key] = m
	return m


static func clear_cache() -> void:
	_mat_cache.clear()
	_mesh_cache.clear()


# ---------------------------------------------------------------- 기본 도형 (SurfaceTool)

## 삼각형 하나. n 은 앞면이 향해야 하는 방향(대략).
static func tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, n: Vector3) -> void:
	var fn := (c - a).cross(b - a)
	if fn.dot(n) < 0.0:
		var t := b
		b = c
		c = t
	var nn := fn.normalized() if fn.length_squared() > 1e-12 else n.normalized()
	if nn.dot(n) < 0.0:
		nn = -nn
	for v in [a, b, c]:
		st.set_normal(nn)
		st.add_vertex(v)


## 사각형 a-b-c-d (둘레 순서). n 은 앞면 방향.
static func quad(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3) -> void:
	tri(st, a, b, c, n)
	tri(st, a, c, d, n)


## 사각형 + UV
static func quad_uv(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3,
		ua: Vector2, ub: Vector2, uc: Vector2, ud: Vector2) -> void:
	var fn := (c - a).cross(b - a)
	var nn := n.normalized()
	var verts := [a, b, c, a, c, d]
	var uvs := [ua, ub, uc, ua, uc, ud]
	if fn.dot(n) < 0.0:
		verts = [a, c, b, a, d, c]
		uvs = [ua, uc, ub, ua, ud, uc]
	for i in 6:
		st.set_normal(nn)
		st.set_uv(uvs[i])
		st.add_vertex(verts[i])


## 기저(basis)와 중심으로 회전된 상자
static func box(st: SurfaceTool, center: Vector3, size: Vector3, b := Basis.IDENTITY) -> void:
	var h := size * 0.5
	var ax := b.x * h.x
	var ay := b.y * h.y
	var az := b.z * h.z
	var c := center
	# +X, -X
	quad(st, c + ax - ay - az, c + ax + ay - az, c + ax + ay + az, c + ax - ay + az, b.x)
	quad(st, c - ax - ay - az, c - ax - ay + az, c - ax + ay + az, c - ax + ay - az, -b.x)
	# +Y, -Y
	quad(st, c - ax + ay - az, c - ax + ay + az, c + ax + ay + az, c + ax + ay - az, b.y)
	quad(st, c - ax - ay - az, c + ax - ay - az, c + ax - ay + az, c - ax - ay + az, -b.y)
	# +Z, -Z
	quad(st, c - ax - ay + az, c + ax - ay + az, c + ax + ay + az, c - ax + ay + az, b.z)
	quad(st, c - ax - ay - az, c - ax + ay - az, c + ax + ay - az, c + ax - ay - az, -b.z)


## 축(axis) 방향 원기둥/원뿔대. r0 아래 반지름, r1 위 반지름. caps: 뚜껑
static func cylinder(st: SurfaceTool, base: Vector3, axis: Vector3, length: float, r0: float, r1: float,
		segs := 10, caps := true, smooth := true) -> void:
	var up := axis.normalized()
	var side := up.cross(Vector3.RIGHT if absf(up.x) < 0.9 else Vector3.FORWARD).normalized()
	var fwd := up.cross(side).normalized()
	var top := base + up * length
	var slope := (r0 - r1) / maxf(length, 0.0001)
	for i in segs:
		var a0 := TAU * float(i) / segs
		var a1 := TAU * float(i + 1) / segs
		var d0 := side * cos(a0) + fwd * sin(a0)
		var d1 := side * cos(a1) + fwd * sin(a1)
		var p00 := base + d0 * r0
		var p01 := base + d1 * r0
		var p10 := top + d0 * r1
		var p11 := top + d1 * r1
		if smooth:
			var n0 := (d0 + up * slope).normalized()
			var n1 := (d1 + up * slope).normalized()
			var nm := (n0 + n1).normalized()
			var fn := (p11 - p00).cross(p01 - p00)
			var order := [p00, p01, p11, p00, p11, p10]
			var norms := [n0, n1, n1, n0, n1, n0]
			if fn.dot(nm) < 0.0:
				order = [p00, p11, p01, p00, p10, p11]
				norms = [n0, n1, n1, n0, n0, n1]
			for k in 6:
				st.set_normal(norms[k])
				st.add_vertex(order[k])
		else:
			var dm := (d0 + d1).normalized()
			quad(st, p00, p01, p11, p10, dm)
		if caps:
			if r1 > 0.0001:
				tri(st, top, p10, p11, up)
			if r0 > 0.0001:
				tri(st, base, p00, p01, -up)


## 원뿔 (밑면 중심 base, 꼭짓점 방향 axis)
static func cone(st: SurfaceTool, base: Vector3, axis: Vector3, height: float, r: float, segs := 7, flat := true) -> void:
	cylinder(st, base, axis, height, r, 0.0, segs, true, not flat)


## 단면(section)들을 이어 붙인 몸체 (자동차 차체용).
## sections: [{z, w, y0, y1, r}] - z 위치, 반폭, 바닥/윗면 높이, 윗모서리 둥글기 비율
## 단면 둘레는 바닥에서 시작해 옆면-윗면-반대 옆면으로 돌아옵니다.
static func loft(st: SurfaceTool, sections: Array, close_ends := true, tumble := 0.12) -> void:
	var rings: Array = []
	for s in sections:
		rings.append(_section_ring(s, tumble))
	var n: int = rings[0].size()
	for si in range(sections.size() - 1):
		var ra: Array = rings[si]
		var rb: Array = rings[si + 1]
		for k in n:
			var k2 := (k + 1) % n
			var a: Vector3 = ra[k]
			var b: Vector3 = ra[k2]
			var c: Vector3 = rb[k2]
			var d: Vector3 = rb[k]
			var mid := (a + b + c + d) * 0.25
			var center := Vector3(0, (float(sections[si]["y0"]) + float(sections[si]["y1"])) * 0.5, mid.z)
			var outward := mid - center
			outward.z *= 0.2
			quad(st, a, b, c, d, outward)
	if close_ends:
		for end in [0, sections.size() - 1]:
			var ring: Array = rings[end]
			var cz := float(sections[end]["z"])
			var cy := (float(sections[end]["y0"]) + float(sections[end]["y1"])) * 0.5
			var cpt := Vector3(0, cy, cz)
			var nz := Vector3(0, 0, -1) if end == 0 else Vector3(0, 0, 1)
			if float(sections[0]["z"]) > float(sections[sections.size() - 1]["z"]):
				nz = -nz
			for k in n:
				tri(st, cpt, ring[k], ring[(k + 1) % n], nz)


static func _section_ring(s: Dictionary, tumble: float) -> Array:
	var z := float(s["z"])
	var w := float(s["w"])
	var y0 := float(s["y0"])
	var y1 := float(s["y1"])
	var h := y1 - y0
	var tw := w * (1.0 - tumble)  # 위쪽은 살짝 좁게
	var rad := minf(tw, h) * float(s.get("r", 0.35))
	var ring: Array = []
	ring.append(Vector3(-w * 0.92, y0, z))
	ring.append(Vector3(w * 0.92, y0, z))
	ring.append(Vector3(w, y0 + h * 0.35, z))
	for i in 4:
		var a := PI * 0.5 * float(i) / 3.0
		ring.append(Vector3(tw - rad + rad * cos(a), y1 - rad + rad * sin(a), z))
	for i in 4:
		var a := PI * 0.5 + PI * 0.5 * float(i) / 3.0
		ring.append(Vector3(-tw + rad + rad * cos(a), y1 - rad + rad * sin(a), z))
	ring.append(Vector3(-w, y0 + h * 0.35, z))
	return ring


## 여러 재질 면을 한 ArrayMesh 로 묶는 도우미
class Builder:
	var _sts := {}
	var _order: Array = []

	func st(m: Material) -> SurfaceTool:
		if not _sts.has(m):
			var s := SurfaceTool.new()
			s.begin(Mesh.PRIMITIVE_TRIANGLES)
			_sts[m] = s
			_order.append(m)
		return _sts[m]

	func commit() -> ArrayMesh:
		var mesh := ArrayMesh.new()
		for m in _order:
			var s: SurfaceTool = _sts[m]
			s.commit(mesh)
			mesh.surface_set_material(mesh.get_surface_count() - 1, m)
		return mesh


static func instance(mesh: Mesh, parent: Node, pos := Vector3.ZERO, shadows := true) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi
