extends Node3D

const WORLD_SIZE := 220.0
const GRID := 6.0
const WATER_LEVEL := 2.0

var rng := RandomNumberGenerator.new()

func _ready() -> void:
	rng.seed = 184729
	_build_environment()
	_build_terrain()
	_build_water()
	_build_forest()
	_build_landmarks()

func _height(x: float, z: float) -> float:
	var broad := sin(x * 0.035) * 8.0 + cos(z * 0.028) * 7.0
	var hills := sin((x + z) * 0.075) * 3.5 + cos((x - z) * 0.055) * 3.0
	var detail := sin(x * 0.16 + z * 0.09) * 0.9
	return max(-1.5, broad + hills + detail)

func _build_environment() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var mat := ProceduralSkyMaterial.new()
	mat.sky_top_color = Color("5f91c4")
	mat.sky_horizon_color = Color("cfe5d8")
	mat.ground_bottom_color = Color("435d3d")
	mat.ground_horizon_color = Color("b8c9a7")
	sky.sky_material = mat
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.ambient_light_energy = 0.7
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.environment = e
	add_child(env)

func _build_terrain() -> void:
	var mesh := ArrayMesh.new()
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var half := WORLD_SIZE * 0.5
	var steps := int(WORLD_SIZE / GRID)
	for z in range(steps + 1):
		for x in range(steps + 1):
			var px := -half + x * GRID
			var pz := -half + z * GRID
			verts.append(Vector3(px, _height(px, pz), pz))
			normals.append(Vector3.UP)
			uvs.append(Vector2(float(x) / steps, float(z) / steps))
	for z in range(steps):
		for x in range(steps):
			var i := z * (steps + 1) + x
			indices.append_array([i, i + 1, i + steps + 1, i + 1, i + steps + 2, i + steps + 1])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var terrain := MeshInstance3D.new()
	terrain.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("557545")
	material.roughness = 1.0
	terrain.material_override = material
	add_child(terrain)
	var body := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var collision := ConcavePolygonShape3D.new()
	collision.data = mesh.get_faces()
	shape.shape = collision
	body.add_child(shape)
	add_child(body)

func _build_water() -> void:
	var mesh := BoxMesh.new()
	mesh.size = Vector3(WORLD_SIZE, 0.35, WORLD_SIZE)
	var water := MeshInstance3D.new()
	water.mesh = mesh
	water.position.y = WATER_LEVEL
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.12, 0.38, 0.48, 0.72)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 0.15
	water.material_override = mat
	add_child(water)

func _build_forest() -> void:
	for i in range(240):
		var x := rng.randf_range(-WORLD_SIZE * 0.47, WORLD_SIZE * 0.47)
		var z := rng.randf_range(-WORLD_SIZE * 0.47, WORLD_SIZE * 0.47)
		if Vector2(x, z).length() < 20.0:
			continue
		var y := _height(x, z)
		if y < WATER_LEVEL + 0.8:
			continue
		_make_tree(Vector3(x, y, z), rng.randf_range(0.75, 1.35))

	for i in range(110):
		var x := rng.randf_range(-WORLD_SIZE * 0.47, WORLD_SIZE * 0.47)
		var z := rng.randf_range(-WORLD_SIZE * 0.47, WORLD_SIZE * 0.47)
		var y := _height(x, z)
		if y > WATER_LEVEL + 0.5:
			_make_rock(Vector3(x, y, z), rng.randf_range(0.5, 1.8))

func _make_tree(pos: Vector3, scale_factor: float) -> void:
	var root := Node3D.new()
	root.position = pos
	root.scale = Vector3.ONE * scale_factor
	var trunk := MeshInstance3D.new()
	var tm := CylinderMesh.new()
	tm.top_radius = 0.16
	tm.bottom_radius = 0.24
	tm.height = 2.8
	trunk.mesh = tm
	trunk.position.y = 1.4
	var bark := StandardMaterial3D.new()
	bark.albedo_color = Color("594332")
	trunk.material_override = bark
	root.add_child(trunk)
	var crown := MeshInstance3D.new()
	var cm := SphereMesh.new()
	cm.radius = 1.25
	cm.height = 2.5
	crown.mesh = cm
	crown.position.y = 3.25
	var leaves := StandardMaterial3D.new()
	leaves.albedo_color = Color("315c35")
	leaves.roughness = 0.95
	crown.material_override = leaves
	root.add_child(crown)
	add_child(root)

func _make_rock(pos: Vector3, scale_factor: float) -> void:
	var rock := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 1.0
	mesh.height = 1.4
	rock.mesh = mesh
	rock.position = pos + Vector3.UP * 0.45
	rock.scale = Vector3(scale_factor, scale_factor * 0.7, scale_factor * 0.9)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("59605a")
	mat.roughness = 1.0
	rock.material_override = mat
	add_child(rock)

func _build_landmarks() -> void:
	var tower := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 1.8
	mesh.bottom_radius = 2.3
	mesh.height = 8.0
	tower.mesh = mesh
	tower.position = Vector3(-48.0, _height(-48.0, -42.0) + 4.0, -42.0)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("77786b")
	mat.roughness = 0.9
	tower.material_override = mat
	add_child(tower)
