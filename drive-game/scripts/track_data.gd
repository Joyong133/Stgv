extends RefCounted
class_name TrackData
## 코스 정의. 좌표는 미터, (x, 높이, z). 위에서 볼 때 x 오른쪽(동쪽), z 아래쪽(남쪽).
## kind "spline": 제어점을 지나는 매끄러운 곡선 / "fillet": 꼭짓점을 반지름(radii)으로 둥글린 직선+원호


static func all() -> Array:
	return [coast(), forest(), city()]


static func by_id(id: String) -> Dictionary:
	for t in all():
		if t["id"] == id:
			return t
	return coast()


static func coast() -> Dictionary:
	return {
		"id": "coast",
		"name": "선셋 해안도로",
		"desc": "노을 지는 바닷가를 따라 달리는 고속 코스",
		"level": 1,
		"theme": "sunset",
		"kind": "spline",
		"half_width": 7.5,
		"points": [
			Vector3(300, 4, 300), Vector3(312, 4, 60), Vector3(305, 5, -190), Vector3(280, 7, -400),
			Vector3(225, 10, -525), Vector3(135, 12, -575), Vector3(55, 14, -530), Vector3(50, 15, -420),
			Vector3(125, 16, -345), Vector3(150, 17, -245), Vector3(95, 18, -150), Vector3(-10, 20, -165),
			Vector3(-115, 19, -125), Vector3(-165, 16, -10), Vector3(-130, 13, 115), Vector3(-35, 11, 170),
			Vector3(40, 9, 255), Vector3(105, 7, 385), Vector3(195, 5, 440), Vector3(275, 4, 410),
		],
		"sea_x": 352.0,
	}


static func forest() -> Dictionary:
	return {
		"id": "forest",
		"name": "솔숲 산악로",
		"desc": "오르막과 내리막, 급커브가 이어지는 기술 코스",
		"level": 2,
		"theme": "day",
		"kind": "spline",
		"half_width": 7.0,
		"points": [
			Vector3(0, 10, 0), Vector3(5, 14, -190), Vector3(-35, 22, -355), Vector3(-140, 30, -430),
			Vector3(-265, 36, -405), Vector3(-320, 40, -300), Vector3(-255, 38, -215), Vector3(-170, 34, -250),
			Vector3(-105, 30, -165), Vector3(-150, 26, -60), Vector3(-265, 24, -40), Vector3(-365, 20, 45),
			Vector3(-345, 16, 175), Vector3(-230, 12, 235), Vector3(-120, 9, 185), Vector3(-45, 7, 255),
			Vector3(45, 6, 325), Vector3(150, 7, 285), Vector3(170, 8, 160), Vector3(95, 9, 85),
		],
	}


static func city() -> Dictionary:
	return {
		"id": "city",
		"name": "네온 시티",
		"desc": "빌딩 숲 사이 직각 코너가 많은 야간 시가지 코스",
		"level": 3,
		"theme": "night",
		"kind": "fillet",
		"half_width": 7.5,
		"points": [
			Vector3(-450, 0, 0), Vector3(330, 0, 0), Vector3(330, 0, 290), Vector3(100, 0, 290),
			Vector3(100, 0, 500), Vector3(-260, 0, 500), Vector3(-260, 0, 330), Vector3(-450, 0, 330),
		],
		"radii": [45.0, 45.0, 35.0, 30.0, 35.0, 45.0, 30.0, 35.0],
		# 출발선은 첫 직선 중간 쯤
		"start_offset": 300.0,
	}
