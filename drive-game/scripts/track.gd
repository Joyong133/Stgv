extends Node3D
class_name Track
## 코스: 중심선 샘플, 도로/지형 메시, 위치 질의(진행 거리 s, 좌우 오프셋 d, 높이).

const DS := 2.0                 # 중심선 샘플 간격 (m)
const CURB_W := 1.2             # 연석 폭
const SHOULDER := 2.6           # 연석 바깥 갓길 폭
const WALL_H := 0.95            # 가드레일 높이
const CAR_HALF_W := 1.0

var def: Dictionary
var theme := "sunset"
var hw := 7.0                   # 도로 반폭
var wall_d := 0.0               # 중심선 ~ 벽 거리
var limit_d := 0.0              # 차 중심이 갈 수 있는 최대 |d|
var curb_w := CURB_W

var n := 0
var ds := DS
var length := 0.0
var pos := PackedVector3Array()
var tangent := PackedVector3Array()   # 수평 단위 진행 방향
var right := PackedVector3Array()     # 수평 단위 오른쪽
var curv := PackedFloat32Array()      # 부호 있는 곡률 (+ 왼쪽으로 굽음)
var slope := PackedFloat32Array()     # dy/ds
var racing_line := PackedFloat32Array()
var center := Vector3.ZERO
var bounds := Rect2()
var min_y := 0.0
var max_y := 0.0

# 지형 격자
var g_origin := Vector2.ZERO
var g_step := 12.0
var g_w := 0
var g_h := 0
var g_dist := PackedFloat32Array()    # 도로 중심선까지 거리
var g_road_y := PackedFloat32Array()  # 가장 가까운 도로 높이
var g_height := PackedFloat32Array()  # 최종 지형 높이
var sea_level := -1000.0

var quality := 1
var rng := RandomNumberGenerator.new()
var sun: DirectionalLight3D
var env: Environment


class TrackPos:
	var idx := 0
	var t := 0.0
	var s := 0.0
	var d := 0.0
	var y := 0.0
	var slope := 0.0
	var tangent := Vector3.FORWARD
	var right := Vector3.RIGHT


func build(track_def: Dictionary, q: int) -> void:
	def = track_def
	quality = q
	theme = def["theme"]
	hw = float(def.get("half_width", 7.0))
	wall_d = hw + CURB_W + SHOULDER
	limit_d = wall_d - CAR_HALF_W
	rng.seed = hash(def["id"])
	var t0 := Time.get_ticks_msec()
	_build_path()
	_compute_frames()
	_build_racing_line()
	_build_terrain_grid()
	var t1 := Time.get_ticks_msec()
	_build_road_mesh()
	_build_terrain_mesh()
	_build_start_line()
	var t2 := Time.get_ticks_msec()
	Scenery.build(self)
	var t3 := Time.get_ticks_msec()
	print("track %s: n=%d length=%.0fm grid=%dx%d  path %dms  mesh %dms  scenery %dms" % [
		def["id"], n, length, g_w, g_h, t1 - t0, t2 - t1, t3 - t2])


# ------------------------------------------------------------------ 경로

func _build_path() -> void:
	var raw := PackedVector3Array()
	if def["kind"] == "fillet":
		raw = _fillet_path(def["points"], def["radii"])
	else:
		raw = _spline_path(def["points"])
	# 호 길이로 균일하게 다시 샘플링
	var cum := PackedFloat32Array()
	cum.resize(raw.size() + 1)
	cum[0] = 0.0
	for i in raw.size():
		cum[i + 1] = cum[i] + raw[i].distance_to(raw[(i + 1) % raw.size()])
	var total := cum[raw.size()]
	n = int(round(total / DS))
	ds = total / n
	length = total
	pos.resize(n)
	var j := 0
	for i in n:
		var target := i * ds
		while j < raw.size() - 1 and cum[j + 1] < target:
			j += 1
		var seg := cum[j + 1] - cum[j]
		var t := (target - cum[j]) / seg if seg > 0.0001 else 0.0
		pos[i] = raw[j].lerp(raw[(j + 1) % raw.size()], t)
	# 출발선 위치 옮기기
	var off := int(round(float(def.get("start_offset", 0.0)) / ds))
	if off != 0:
		var p2 := PackedVector3Array()
		p2.resize(n)
		for i in n:
			p2[i] = pos[(i + off) % n]
		pos = p2
	# 높이 부드럽게
	for _pass in 3:
		var ys := PackedFloat32Array()
		ys.resize(n)
		for i in n:
			var acc := 0.0
			for k in range(-6, 7):
				acc += pos[posmod(i + k, n)].y
			ys[i] = acc / 13.0
		for i in n:
			pos[i].y = ys[i]


func _spline_path(pts: Array) -> PackedVector3Array:
	var out := PackedVector3Array()
	var m := pts.size()
	for i in m:
		var p0: Vector3 = pts[posmod(i - 1, m)]
		var p1: Vector3 = pts[i]
		var p2: Vector3 = pts[(i + 1) % m]
		var p3: Vector3 = pts[(i + 2) % m]
		var t0 := 0.0
		var t1 := t0 + pow(p0.distance_to(p1), 0.5)
		var t2 := t1 + pow(p1.distance_to(p2), 0.5)
		var t3 := t2 + pow(p2.distance_to(p3), 0.5)
		var steps := maxi(4, int(p1.distance_to(p2) / 1.0))
		for k in steps:
			var t := lerpf(t1, t2, float(k) / steps)
			var a1 := p0 * ((t1 - t) / (t1 - t0)) + p1 * ((t - t0) / (t1 - t0))
			var a2 := p1 * ((t2 - t) / (t2 - t1)) + p2 * ((t - t1) / (t2 - t1))
			var a3 := p2 * ((t3 - t) / (t3 - t2)) + p3 * ((t - t2) / (t3 - t2))
			var b1 := a1 * ((t2 - t) / (t2 - t0)) + a2 * ((t - t0) / (t2 - t0))
			var b2 := a2 * ((t3 - t) / (t3 - t1)) + a3 * ((t - t1) / (t3 - t1))
			out.append(b1 * ((t2 - t) / (t2 - t1)) + b2 * ((t - t1) / (t2 - t1)))
	return out


func _fillet_path(pts: Array, radii: Array) -> PackedVector3Array:
	var m := pts.size()
	var arcs: Array = []   # 각 꼭짓점의 [호 시작, 호 끝, 호 점들]
	for i in m:
		var pv: Vector3 = pts[posmod(i - 1, m)]
		var pc: Vector3 = pts[i]
		var pn: Vector3 = pts[(i + 1) % m]
		var din := Vector3(pc.x - pv.x, 0, pc.z - pv.z).normalized()
		var dout := Vector3(pn.x - pc.x, 0, pn.z - pc.z).normalized()
		var r: float = radii[i]
		var ang := acos(clampf(din.dot(dout), -1.0, 1.0))
		var tl := r * tan(ang * 0.5)
		var a := pc - din * tl
		var b := pc + dout * tl
		var turn := din.cross(dout).y   # 부호로 좌/우 판단
		# 원호 중심은 회전 안쪽: 우회전(turn<0)이면 오른쪽(-din.z, 0, din.x)
		var nrm := Vector3(-din.z, 0, din.x) if turn < 0.0 else Vector3(din.z, 0, -din.x)
		var sgn := -1.0 if turn < 0.0 else 1.0
		var c := a + nrm * r
		var pts_arc := PackedVector3Array()
		var steps := maxi(4, int(r * ang / 1.0))
		var va := a - c
		for k in range(steps + 1):
			var t := float(k) / steps
			var rot := Basis(Vector3.UP, sgn * ang * t)
			var p := c + rot * va
			p.y = lerpf(a.y, b.y, t)
			pts_arc.append(p)
		if pts_arc[pts_arc.size() - 1].distance_to(b) > 0.5:
			push_error("fillet arc mismatch at corner %d" % i)
		arcs.append(pts_arc)
	var out := PackedVector3Array()
	for i in m:
		var arc: PackedVector3Array = arcs[i]
		for p in arc:
			out.append(p)
		var a_end: Vector3 = arc[arc.size() - 1]
		var next_arc: PackedVector3Array = arcs[(i + 1) % m]
		var b_start: Vector3 = next_arc[0]
		var steps := maxi(1, int(a_end.distance_to(b_start) / 1.0))
		for k in range(1, steps):
			out.append(a_end.lerp(b_start, float(k) / steps))
	return out


func _compute_frames() -> void:
	tangent.resize(n)
	right.resize(n)
	curv.resize(n)
	slope.resize(n)
	var heading := PackedFloat32Array()
	heading.resize(n)
	min_y = INF
	max_y = -INF
	var bmin := Vector2(INF, INF)
	var bmax := Vector2(-INF, -INF)
	var csum := Vector3.ZERO
	for i in n:
		var a := pos[posmod(i - 1, n)]
		var b := pos[(i + 1) % n]
		var t := Vector3(b.x - a.x, 0, b.z - a.z).normalized()
		tangent[i] = t
		right[i] = t.cross(Vector3.UP).normalized()
		heading[i] = atan2(-t.x, -t.z)
		slope[i] = (b.y - a.y) / (2.0 * ds)
		min_y = minf(min_y, pos[i].y)
		max_y = maxf(max_y, pos[i].y)
		bmin = Vector2(minf(bmin.x, pos[i].x), minf(bmin.y, pos[i].z))
		bmax = Vector2(maxf(bmax.x, pos[i].x), maxf(bmax.y, pos[i].z))
		csum += pos[i]
	center = csum / n
	bounds = Rect2(bmin, bmax - bmin)
	var raw := PackedFloat32Array()
	raw.resize(n)
	for i in n:
		raw[i] = angle_difference(heading[posmod(i - 2, n)], heading[(i + 2) % n]) / (4.0 * ds)
	for i in n:
		var acc := 0.0
		for k in range(-3, 4):
			acc += raw[posmod(i + k, n)]
		curv[i] = acc / 7.0


func _build_racing_line() -> void:
	racing_line.resize(n)
	var wide := PackedFloat32Array()
	wide.resize(n)
	for i in n:
		var acc := 0.0
		for k in range(-14, 15):
			acc += curv[posmod(i + k, n)]
		wide[i] = acc / 29.0
	var lim := hw - 2.0
	for i in n:
		var k := wide[i]
		racing_line[i] = -signf(k) * clampf(absf(k) * 55.0, 0.0, 1.0) * lim
	for _pass in 2:
		var tmp := PackedFloat32Array()
		tmp.resize(n)
		for i in n:
			var acc := 0.0
			for k in range(-10, 11):
				acc += racing_line[posmod(i + k, n)]
			tmp[i] = acc / 21.0
		racing_line = tmp


## 코스 곡률과 차 성능으로 AI 목표 속도 표를 만듭니다.
func speed_profile(car: Dictionary, lat_factor := 1.0) -> PackedFloat32Array:
	var v := PackedFloat32Array()
	v.resize(n)
	var top: float = float(car["top"]) * 1.02
	var lat: float = float(car["lat"]) * lat_factor
	for i in n:
		var k := 0.0
		for o in range(-2, 3):
			k = maxf(k, absf(curv[posmod(i + o, n)]))
		v[i] = top if k < 0.0001 else minf(top, sqrt(lat / k))
	var brake := float(car["brake"]) * 0.6
	for _pass in 2:
		for ii in range(n - 1, -1, -1):
			var nxt := v[(ii + 1) % n]
			v[ii] = minf(v[ii], sqrt(nxt * nxt + 2.0 * brake * ds))
	return v


# ------------------------------------------------------------------ 위치 질의

func wrap_s(s: float) -> float:
	return fposmod(s, length)


func index_of(s: float) -> int:
	return int(fposmod(s, length) / ds) % n


## 진행 거리 s, 좌우 d 위치의 월드 좌표(높이 포함)
func point_at(s: float, d: float) -> Vector3:
	var u := fposmod(s, length) / ds
	var i := int(u) % n
	var t := u - floorf(u)
	var j := (i + 1) % n
	var c := pos[i].lerp(pos[j], t)
	var r := right[i].lerp(right[j], t).normalized()
	return c + r * d


func tangent_at(s: float) -> Vector3:
	var u := fposmod(s, length) / ds
	var i := int(u) % n
	var t := u - floorf(u)
	return tangent[i].lerp(tangent[(i + 1) % n], t).normalized()


func yaw_at(s: float) -> float:
	var t := tangent_at(s)
	return atan2(-t.x, -t.z)


## 월드 위치 p 를 코스 좌표로 바꿉니다. hint 근처만 찾고, 너무 멀면 전체를 찾습니다.
func project(p: Vector3, out: TrackPos) -> void:
	var best := -1
	var best_d2 := INF
	var hint := out.idx
	for k in range(-12, 13):
		var i := posmod(hint + k, n)
		var dx := p.x - pos[i].x
		var dz := p.z - pos[i].z
		var d2 := dx * dx + dz * dz
		if d2 < best_d2:
			best_d2 = d2
			best = i
	if best_d2 > 900.0:
		for i in n:
			var dx := p.x - pos[i].x
			var dz := p.z - pos[i].z
			var d2 := dx * dx + dz * dz
			if d2 < best_d2:
				best_d2 = d2
				best = i
	# 앞/뒤 구간 중 어느 쪽에 있는지
	var i0 := best
	var tt := tangent[best]
	var rel := Vector3(p.x - pos[best].x, 0, p.z - pos[best].z)
	var along := rel.dot(tt)
	if along < 0.0:
		i0 = posmod(best - 1, n)
	var i1 := (i0 + 1) % n
	var a := pos[i0]
	var b := pos[i1]
	var seg := Vector3(b.x - a.x, 0, b.z - a.z)
	var sl := seg.length_squared()
	var t := 0.0
	if sl > 0.000001:
		t = clampf(Vector3(p.x - a.x, 0, p.z - a.z).dot(seg) / sl, 0.0, 1.0)
	var r := right[i0].lerp(right[i1], t).normalized()
	var c := a.lerp(b, t)
	out.idx = i0
	out.t = t
	out.s = (i0 + t) * ds
	out.d = Vector3(p.x - c.x, 0, p.z - c.z).dot(r)
	out.y = c.y
	out.slope = lerpf(slope[i0], slope[i1], t)
	out.tangent = tangent[i0].lerp(tangent[i1], t).normalized()
	out.right = r


# ------------------------------------------------------------------ 지형 격자

func _build_terrain_grid() -> void:
	var margin := 420.0
	g_step = 12.0 if quality >= 1 else 16.0
	g_origin = bounds.position - Vector2(margin, margin)
	g_w = int(ceil((bounds.size.x + margin * 2.0) / g_step)) + 1
	g_h = int(ceil((bounds.size.y + margin * 2.0) / g_step)) + 1
	var cells := g_w * g_h
	g_dist.resize(cells)
	g_road_y.resize(cells)
	g_height.resize(cells)
	g_dist.fill(1.0e12)
	g_road_y.fill((min_y + max_y) * 0.5)
	var rad := 100.0
	var rc := int(ceil(rad / g_step))
	var i := 0
	while i < n:
		var p := pos[i]
		var gx := int(round((p.x - g_origin.x) / g_step))
		var gz := int(round((p.z - g_origin.y) / g_step))
		for z in range(maxi(0, gz - rc), mini(g_h, gz + rc + 1)):
			var wz := g_origin.y + z * g_step
			var dz := wz - p.z
			var row := z * g_w
			for x in range(maxi(0, gx - rc), mini(g_w, gx + rc + 1)):
				var dx := g_origin.x + x * g_step - p.x
				var d2 := dx * dx + dz * dz
				var c := row + x
				if d2 < g_dist[c]:
					g_dist[c] = d2
					g_road_y[c] = p.y
		i += 3
	var noise := FastNoiseLite.new()
	noise.seed = rng.randi()
	noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	noise.frequency = 0.0035
	noise.fractal_octaves = 4
	var base := min_y - 1.5
	var sea_x := float(def.get("sea_x", 1.0e9))
	if def.has("sea_x"):
		sea_level = 0.0
	for z in g_h:
		for x in g_w:
			var c := z * g_w + x
			var wx := g_origin.x + x * g_step
			var wz := g_origin.y + z * g_step
			var dist := sqrt(g_dist[c]) if g_dist[c] < 1.0e11 else 1.0e5
			g_dist[c] = dist
			var near_h := g_road_y[c] - 0.3
			var nz := noise.get_noise_2d(wx, wz) * 0.5 + 0.5
			var amp := lerpf(6.0, 55.0, smoothstep(30.0, 320.0, dist))
			var nat := base + nz * amp
			if theme == "night":
				nat = base + nz * lerpf(1.0, 6.0, smoothstep(40.0, 300.0, dist))
			var blend := smoothstep(wall_d + 3.0, wall_d + 55.0, dist)
			var h := lerpf(near_h, nat, blend)
			if sea_level > -100.0:
				var coast := sea_x + 14.0 * sin(wz / 160.0) + 8.0 * sin(wz / 47.0)
				var beach := (wx - coast) / 70.0
				if beach > -0.6:
					var hb := lerpf(3.2, -7.0, clampf(beach, 0.0, 1.0))
					if beach < 0.0:
						hb = lerpf(h, 3.2, (beach + 0.6) / 0.6)
					h = minf(h, hb) if dist > wall_d + 2.0 else h
			g_height[c] = h


func terrain_height(x: float, z: float) -> float:
	var fx := clampf((x - g_origin.x) / g_step, 0.0, g_w - 1.001)
	var fz := clampf((z - g_origin.y) / g_step, 0.0, g_h - 1.001)
	var ix := int(fx)
	var iz := int(fz)
	var tx := fx - ix
	var tz := fz - iz
	var c := iz * g_w + ix
	var h0 := lerpf(g_height[c], g_height[c + 1], tx)
	var h1 := lerpf(g_height[c + g_w], g_height[c + g_w + 1], tx)
	return lerpf(h0, h1, tz)


func road_distance(x: float, z: float) -> float:
	var ix := clampi(int(round((x - g_origin.x) / g_step)), 0, g_w - 1)
	var iz := clampi(int(round((z - g_origin.y) / g_step)), 0, g_h - 1)
	return g_dist[iz * g_w + ix]


## 정확한 도로 거리 (배치 검사용, 느림)
func exact_road_distance(x: float, z: float) -> float:
	var best := INF
	var i := 0
	while i < n:
		var dx := x - pos[i].x
		var dz := z - pos[i].z
		best = minf(best, dx * dx + dz * dz)
		i += 2
	return sqrt(best)


# ------------------------------------------------------------------ 도로 메시

func _ribbon(mesh: ArrayMesh, mat: Material, p0: PackedVector3Array, p1: PackedVector3Array,
		nrm: PackedVector3Array, u0: float, u1: float, v_len: float, mask := PackedByteArray()) -> void:
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var uvs := PackedVector2Array()
	var idx := PackedInt32Array()
	var count := p0.size()
	verts.resize((count + 1) * 2)
	norms.resize((count + 1) * 2)
	uvs.resize((count + 1) * 2)
	for i in count + 1:
		var k := i % count
		verts[i * 2] = p0[k]
		verts[i * 2 + 1] = p1[k]
		norms[i * 2] = nrm[k]
		norms[i * 2 + 1] = nrm[k]
		var v := i * ds / v_len
		uvs[i * 2] = Vector2(u0, v)
		uvs[i * 2 + 1] = Vector2(u1, v)
	# 감는 방향 정하기 (첫 구간 기준)
	var a := verts[0]
	var b := verts[1]
	var c := verts[3]
	var flip := (c - a).cross(b - a).dot(nrm[0]) < 0.0
	for i in count:
		if mask.size() > 0 and mask[i] == 0:
			continue
		var ia := i * 2
		var ib := i * 2 + 1
		var ic := i * 2 + 3
		var id := i * 2 + 2
		if flip:
			idx.append_array([ia, ic, ib, ia, id, ic])
		else:
			idx.append_array([ia, ib, ic, ia, ic, id])
	if idx.size() == 0:
		return
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = norms
	arr[Mesh.ARRAY_TEX_UV] = uvs
	arr[Mesh.ARRAY_INDEX] = idx
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	mesh.surface_set_material(mesh.get_surface_count() - 1, mat)


func _offset_line(d: float, dy: float) -> PackedVector3Array:
	var out := PackedVector3Array()
	out.resize(n)
	for i in n:
		out[i] = pos[i] + right[i] * d + Vector3(0, dy, 0)
	return out


func _build_road_mesh() -> void:
	var mesh := ArrayMesh.new()
	var up_n := PackedVector3Array()
	up_n.resize(n)
	for i in n:
		var a := pos[posmod(i - 1, n)]
		var b := pos[(i + 1) % n]
		var t3 := (b - a).normalized()
		up_n[i] = right[i].cross(t3).normalized()
	var m := Scenery.road_materials(theme)
	# 아스팔트
	_ribbon(mesh, m["asphalt"], _offset_line(-hw, 0.0), _offset_line(hw, 0.0), up_n, 0.0, 1.0, 12.0)
	# 연석: 곡률이 큰 곳만, 나머지는 갓길 재질
	var curb_mask := PackedByteArray()
	var edge_mask := PackedByteArray()
	curb_mask.resize(n)
	edge_mask.resize(n)
	for i in n:
		var k := 0.0
		for o in range(-6, 7):
			k = maxf(k, absf(curv[posmod(i + o, n)]))
		var is_curb := k > 1.0 / 140.0
		curb_mask[i] = 1 if is_curb else 0
		edge_mask[i] = 0 if is_curb else 1
	for side in [-1.0, 1.0]:
		var e0 := _offset_line(side * hw, 0.0)
		var e1 := _offset_line(side * (hw + CURB_W), 0.0)
		var e2 := _offset_line(side * wall_d, 0.0)
		_ribbon(mesh, m["curb"], e0, e1, up_n, 0.0, 1.0, 4.0, curb_mask)
		_ribbon(mesh, m["shoulder"], e0, e1, up_n, 0.0, CURB_W / 4.0, 4.0, edge_mask)
		_ribbon(mesh, m["shoulder"], e1, e2, up_n, 0.0, SHOULDER / 4.0, 4.0)
		# 벽 (아래로 긴 치마 포함)
		var wb := _offset_line(side * wall_d, -2.6)
		var wt := _offset_line(side * wall_d, WALL_H)
		var wn := PackedVector3Array()
		wn.resize(n)
		for i in n:
			wn[i] = -right[i] * side
		_ribbon(mesh, m["wall"], wb, wt, wn, (WALL_H + 2.6) / (WALL_H + 0.05), 0.0, 4.0)
		# 벽 위 모서리
		var wtop_in := _offset_line(side * (wall_d - 0.06), WALL_H)
		var wtop_out := _offset_line(side * (wall_d + 0.22), WALL_H)
		_ribbon(mesh, m["wall_top"], wtop_in, wtop_out, up_n, 0.0, 1.0, 4.0)
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.name = "Road"
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


func _build_terrain_mesh() -> void:
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var cols := PackedColorArray()
	var uvs := PackedVector2Array()
	var cells := g_w * g_h
	verts.resize(cells)
	norms.resize(cells)
	cols.resize(cells)
	uvs.resize(cells)
	var noise := FastNoiseLite.new()
	noise.seed = rng.randi()
	noise.frequency = 0.02
	var pal := Scenery.terrain_palette(theme)
	for z in g_h:
		for x in g_w:
			var c := z * g_w + x
			var h := g_height[c]
			var wx := g_origin.x + x * g_step
			var wz := g_origin.y + z * g_step
			verts[c] = Vector3(wx, h, wz)
			var hl := g_height[c - 1] if x > 0 else h
			var hr := g_height[c + 1] if x < g_w - 1 else h
			var hu := g_height[c - g_w] if z > 0 else h
			var hd := g_height[c + g_w] if z < g_h - 1 else h
			var nn := Vector3(hl - hr, 2.0 * g_step, hu - hd).normalized()
			norms[c] = nn
			uvs[c] = Vector2(wx, wz) / 9.0
			var nv := noise.get_noise_2d(wx, wz) * 0.5 + 0.5
			cols[c] = Scenery.terrain_color(pal, theme, h, nn.y, nv, g_dist[c], wall_d, sea_level)
	var idx := PackedInt32Array()
	idx.resize((g_w - 1) * (g_h - 1) * 6)
	var k := 0
	for z in g_h - 1:
		for x in g_w - 1:
			var a := z * g_w + x
			var b := a + 1
			var c2 := a + g_w + 1
			var d := a + g_w
			idx[k] = a
			idx[k + 1] = b
			idx[k + 2] = c2
			idx[k + 3] = a
			idx[k + 4] = c2
			idx[k + 5] = d
			k += 6
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = norms
	arr[Mesh.ARRAY_COLOR] = cols
	arr[Mesh.ARRAY_TEX_UV] = uvs
	arr[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	mesh.surface_set_material(0, Scenery.terrain_material(theme))
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.name = "Terrain"
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


func _build_start_line() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var t := tangent[0]
	var r := right[0]
	var c := pos[0] + Vector3(0, 0.03, 0)
	var a := c - r * hw - t * 1.2
	var b := c + r * hw - t * 1.2
	var cc := c + r * hw + t * 1.2
	var d := c - r * hw + t * 1.2
	MeshKit.quad_uv(st, a, b, cc, d, Vector3.UP, Vector2(0, 0), Vector2(hw * 2.0 / 1.2, 0),
			Vector2(hw * 2.0 / 1.2, 2.0), Vector2(0, 2.0))
	var checker := StandardMaterial3D.new()
	checker.albedo_texture = MeshKit.tex("checker")
	checker.roughness = 0.7
	checker.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	var mesh := st.commit()
	mesh.surface_set_material(0, checker)
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	# 출발 게이트
	var gb := MeshKit.Builder.new()
	var frame := MeshKit.mat(Color(0.16, 0.16, 0.2), 0.5, 0.6, "gantry_frame")
	var banner := MeshKit.mat(Color(0.08, 0.06, 0.14), 0.6, 0.0, "gantry_banner")
	var yaw := atan2(-t.x, -t.z)
	var basis := Basis(Vector3.UP, yaw)
	var span := wall_d + 0.6
	for side in [-1.0, 1.0]:
		MeshKit.box(gb.st(frame), Vector3(side * span, 3.6, 0), Vector3(0.7, 7.2, 0.7))
	MeshKit.box(gb.st(frame), Vector3(0, 7.0, 0), Vector3(span * 2.0 + 0.7, 0.5, 0.6))
	MeshKit.box(gb.st(banner), Vector3(0, 6.0, 0), Vector3(span * 1.4, 1.5, 0.3))
	var light := MeshKit.emissive(Color(1.0, 0.45, 0.2), 2.5, "gantry_light")
	for k in 8:
		var x := lerpf(-span * 0.65, span * 0.65, k / 7.0)
		MeshKit.box(gb.st(light), Vector3(x, 6.95, 0.32), Vector3(0.5, 0.18, 0.06))
	var gate := MeshInstance3D.new()
	gate.mesh = gb.commit()
	gate.transform = Transform3D(basis, pos[0])
	add_child(gate)
	for face in [-1.0, 1.0]:
		var lbl := Label3D.new()
		lbl.text = "SUNSET DRIVE"
		lbl.font = load("res://assets/fonts/BlackHanSans-Regular.ttf")
		lbl.font_size = 96
		lbl.pixel_size = 0.009
		lbl.modulate = Color(1.0, 0.78, 0.35)
		lbl.outline_size = 0
		lbl.transform = Transform3D(basis * Basis(Vector3.UP, 0.0 if face > 0 else PI),
				pos[0] + Vector3(0, 6.0, 0) + basis.z * 0.17 * face)
		add_child(lbl)
