extends Node2D
class_name InkRenderer

var sim: InkMain
var scenery: Array[Dictionary] = []
var visual_time := 0.0
var body_font: Font = ThemeDB.fallback_font
var number_font: Font = ThemeDB.fallback_font

func setup(target: InkMain) -> void:
	sim = target
	if ResourceLoader.exists("res://assets/fonts/NotoSerifSC[wght].ttf"):
		body_font = load("res://assets/fonts/NotoSerifSC[wght].ttf")
	if ResourceLoader.exists("res://assets/fonts/JetBrainsMono[wght].ttf"):
		number_font = load("res://assets/fonts/JetBrainsMono[wght].ttf")
	scenery = make_scenery(20261125)
	queue_redraw()

func _process(delta: float) -> void:
	visual_time += delta
	set_light_uniforms()
	queue_redraw()

static func make_scenery(seed_value: int) -> Array:
	var generator := RandomNumberGenerator.new()
	generator.seed = seed_value
	var result: Array[Dictionary] = []
	for i in range(78):
		var kind := "grave"
		if i % 9 == 0:
			kind = "bamboo"
		elif i % 11 == 0:
			kind = "grass"
		elif i % 17 == 0:
			kind = "stone_lantern"
		elif i % 13 == 0:
			kind = "wall"
		result.append({
			"kind": kind,
			"pos": Vector2(generator.randf_range(-1050.0, 1050.0), generator.randf_range(-1050.0, 1050.0)),
			"scale": generator.randf_range(0.75, 1.35),
			"phase": generator.randf_range(0.0, TAU),
			"glyph": ["墓", "归", "眠", "镇"][generator.randi_range(0, 3)],
		})
	return result

func _draw() -> void:
	if sim == null:
		return
	var palette := InkData.palette()
	var viewport_size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, viewport_size), palette.ink_deep)
	if sim.phase == sim.Phase.TITLE:
		return
	draw_set_transform(viewport_size * 0.5 - sim.camera)
	_draw_ground(palette)
	for prop in scenery:
		_draw_prop(prop, palette)
	_draw_taboos(palette)
	_draw_player(palette)
	_draw_entities(palette)
	draw_set_transform(Vector2.ZERO)
	_draw_moon(palette, viewport_size)
	_draw_foreground_mist(palette, viewport_size)
	if sim.flip_freeze > 0.0:
		draw_rect(Rect2(Vector2.ZERO, viewport_size), Color(palette.bone_bright, sim.flip_freeze / InkData.player_base().flip_freeze_sec * 0.22))

func _draw_ground(palette: Dictionary) -> void:
	draw_rect(Rect2(-InkData.WORLD_HALF, -InkData.WORLD_HALF, InkData.WORLD_SIZE, InkData.WORLD_SIZE), palette.ink_night)
	var road := PackedVector2Array([
		Vector2(-170.0, -InkData.WORLD_HALF),
		Vector2(150.0, -InkData.WORLD_HALF),
		Vector2(420.0, InkData.WORLD_HALF),
		Vector2(-430.0, InkData.WORLD_HALF),
	])
	draw_colored_polygon(road, Color(palette.grey_dark, 0.16))
	for i in range(90):
		var x := fmod(float(i) * 137.51, InkData.WORLD_SIZE) - InkData.WORLD_HALF
		var y := fmod(float(i) * 83.17, InkData.WORLD_SIZE) - InkData.WORLD_HALF
		draw_circle(Vector2(x, y), 1.4, Color(palette.grey_mid, 0.18))

func _draw_prop(prop: Dictionary, palette: Dictionary) -> void:
	var pos: Vector2 = prop.pos
	var scale_value: float = prop.scale
	match prop.kind:
		"grave":
			_draw_grave(pos, scale_value, prop.glyph, palette)
		"bamboo":
			_draw_bamboo(pos, scale_value, prop.phase, palette)
		"grass":
			_draw_grass(pos, scale_value, palette)
		"stone_lantern":
			_draw_stone_lantern(pos, scale_value, palette)
		"wall":
			_draw_wall(pos, scale_value, palette)

func _draw_grave(pos: Vector2, scale_value: float, glyph: String, palette: Dictionary) -> void:
	var base := pos + Vector2(0.0, 18.0) * scale_value
	draw_rect(Rect2(base - Vector2(26.0, 8.0) * scale_value, Vector2(52.0, 10.0) * scale_value), palette.grey_dark)
	var body := Rect2(pos - Vector2(18.0, 42.0) * scale_value, Vector2(36.0, 58.0) * scale_value)
	draw_rect(body, palette.grey_mid)
	draw_arc(pos + Vector2(0.0, -42.0) * scale_value, 18.0 * scale_value, PI, TAU, 18, palette.grey_mid, 36.0 * scale_value, true)
	draw_line(body.position + Vector2(5.0, 8.0), body.position + Vector2(5.0, 48.0), Color(palette.grey_light, 0.25), 2.0)
	draw_string(body_font, pos + Vector2(-10.0, 4.0), glyph, HORIZONTAL_ALIGNMENT_LEFT, -1.0, int(18.0 * scale_value), palette.grey_light)

func _draw_bamboo(pos: Vector2, scale_value: float, phase_value: float, palette: Dictionary) -> void:
	for i in range(5):
		var offset := float(i - 2) * 8.0
		var sway := sin(visual_time * 0.8 + phase_value + i) * 4.0
		var bottom := pos + Vector2(offset, 20.0) * scale_value
		var top := pos + Vector2(offset + sway, -70.0 - i * 4.0) * scale_value
		draw_line(bottom, top, palette.sage_dark, 3.0 * scale_value)
		for j in range(3):
			var leaf_pos := bottom.lerp(top, 0.35 + j * 0.2)
			draw_line(leaf_pos, leaf_pos + Vector2(-16.0, -8.0) * scale_value, palette.sage_mid, 2.0 * scale_value)
			draw_line(leaf_pos, leaf_pos + Vector2(15.0, -11.0) * scale_value, palette.sage_mid, 2.0 * scale_value)

func _draw_grass(pos: Vector2, scale_value: float, palette: Dictionary) -> void:
	for i in range(5):
		var angle := -1.2 + float(i) * 0.6
		draw_line(pos, pos + Vector2(cos(angle), sin(angle)) * 18.0 * scale_value, palette.sage_dark, 2.0)

func _draw_stone_lantern(pos: Vector2, scale_value: float, palette: Dictionary) -> void:
	draw_rect(Rect2(pos - Vector2(14.0, 48.0) * scale_value, Vector2(28.0, 48.0) * scale_value), palette.grey_dark)
	draw_rect(Rect2(pos - Vector2(22.0, -58.0) * scale_value, Vector2(44.0, 12.0) * scale_value), palette.grey_mid)
	draw_circle(pos + Vector2(0.0, -40.0) * scale_value, 7.0 * scale_value, palette.amber)

func _draw_wall(pos: Vector2, scale_value: float, palette: Dictionary) -> void:
	for i in range(7):
		var offset := Vector2((i % 3) * 22.0 - 22.0, -float(i / 3) * 18.0)
		draw_rect(Rect2(pos + offset * scale_value, Vector2(24.0, 18.0) * scale_value), palette.grey_dark)

func _draw_taboos(palette: Dictionary) -> void:
	for zone in sim.hazards.shadow_zones:
		var pos: Vector2 = zone.pos
		var radius: float = zone.radius
		draw_circle(pos, radius, Color(0.0, 0.0, 0.0, 0.32))
		if sim.is_in_shadow(sim.player.pos):
			draw_arc(pos, radius, 0.0, TAU, 40, Color(palette.vermilion, 0.45), 2.0, true)
	if sim.hazards.blackout_active:
		var frozen: Vector2 = sim.hazards.frozen_light
		draw_circle(frozen, sim.hazards.frozen_radius, Color(palette.amber, 0.06))
		draw_arc(frozen, sim.hazards.frozen_radius, 0.0, TAU, 48, Color(palette.amber, 0.35), 2.0, true)
	if sim.hazards.white_stranger.active:
		var pos: Vector2 = sim.hazards.white_stranger.pos
		draw_circle(pos + Vector2(0, -26), 13, palette.bone_bright)
		draw_colored_polygon(PackedVector2Array([
			pos + Vector2(-15, -12),
			pos + Vector2(15, -12),
			pos + Vector2(20, 26),
			pos + Vector2(-20, 26),
		]), palette.bone)
		draw_circle(pos + Vector2(-5, -28), 2.2, palette.ink_deep)
		draw_circle(pos + Vector2(5, -28), 2.2, palette.ink_deep)
		draw_line(pos + Vector2(-5, -19), pos + Vector2(5, -19), palette.ink_deep, 1.4)

func _draw_player(palette: Dictionary) -> void:
	var pos: Vector2 = sim.player.pos
	var bob := sin(sim.player.walk * 0.08) * 2.0 if sim.player.vel.length_squared() > 1.0 else 0.0
	var is_spectral := sim.realm == "spectral"
	var robe: Color = palette.grey_mid
	if is_spectral:
		robe = palette.bone if sim.face == "dan" else palette.grey_light
	draw_circle(pos + Vector2(0.0, 18.0), 18.0, Color(0.0, 0.0, 0.0, 0.35))
	draw_rect(Rect2(pos + Vector2(-13.0, -24.0 + bob), Vector2(26.0, 38.0)), robe)
	draw_circle(pos + Vector2(0.0, -30.0 + bob), 11.0, palette.bone_bright if is_spectral else palette.bone_dark)
	draw_rect(Rect2(pos + Vector2(-17.0, -42.0 + bob), Vector2(34.0, 7.0)), palette.ink_deep)
	draw_rect(Rect2(pos + Vector2(-12.0, -49.0 + bob), Vector2(24.0, 8.0)), palette.ink_slate)
	if is_spectral:
		draw_line(pos + Vector2(0, -39 + bob), pos + Vector2(0, -22 + bob), palette.vermilion_dark, 1.5)
		draw_arc(pos + Vector2(-5, -31 + bob), 3.0, PI, TAU, 8, palette.ink_deep, 1.5, true)
		draw_arc(pos + Vector2(5, -31 + bob), 3.0, PI, TAU, 8, palette.ink_deep, 1.5, true)
		if sim.face == "sheng":
			draw_line(pos + Vector2(18, -2), pos + Vector2(42, -48), palette.bone_bright, 3.0)
			draw_line(pos + Vector2(15, -6), pos + Vector2(24, -10), palette.amber, 4.0)
		else:
			draw_arc(pos + Vector2(-18, -6), 26.0, PI * 0.8, TAU * 0.9, 18, palette.bone, 7.0, true)
			draw_arc(pos + Vector2(18, -6), 26.0, PI * 0.1, PI * 1.2, 18, palette.bone, 7.0, true)
	var lantern_pos := pos + Vector2(20.0 * sim.player.facing, -10.0 + bob)
	draw_circle(lantern_pos, 42.0, Color(palette.amber, 0.08))
	draw_circle(lantern_pos, 25.0, Color(palette.amber, 0.15))
	draw_rect(Rect2(lantern_pos - Vector2(7.0, 10.0), Vector2(14.0, 20.0)), palette.amber)
	draw_rect(Rect2(lantern_pos - Vector2(9.0, 12.0), Vector2(18.0, 16.0)), palette.amber_bright)
	draw_line(lantern_pos + Vector2(0.0, -14.0), lantern_pos + Vector2(0.0, -10.0), palette.ink_deep, 2.0)

func _draw_entities(palette: Dictionary) -> void:
	for gem in sim.gems:
		var pos: Vector2 = gem.pos
		var pulse := 1.0 + sin(visual_time * 5.0 + pos.x) * 0.08
		draw_circle(pos, 12.0 * pulse, Color(palette.xp_mid, 0.10))
		var points := PackedVector2Array([
			pos + Vector2(0, -8) * pulse,
			pos + Vector2(6, 0) * pulse,
			pos + Vector2(0, 8) * pulse,
			pos + Vector2(-6, 0) * pulse,
		])
		draw_colored_polygon(points, palette.xp_mid)
		draw_line(pos + Vector2(0, -6), pos + Vector2(0, 5), palette.xp_bright, 1.5)
	for enemy in sim.enemies:
		_draw_enemy(enemy, palette)
	for projectile in sim.projectiles:
		var from: Vector2 = projectile.from
		var to: Vector2 = projectile.to
		draw_line(from, to, Color(palette.amber_bright, 0.25), 8.0)
		draw_line(from, to, palette.amber_bright, 2.5)
	for slash in sim.slashes:
		var pos: Vector2 = slash.pos
		var radius: float = slash.radius * (1.0 - float(slash.life) * 0.8)
		var color: Color = palette.bone_bright if slash.face != "flip" else palette.amber_bright
		draw_arc(pos, radius, -PI * 0.8, PI * 0.8, 28, Color(color, float(slash.life) * 3.0), 5.0, true)
	for particle in sim.particles:
		var pos: Vector2 = particle.pos
		draw_circle(pos, 5.0 + float(particle.life) * 18.0, Color(particle.color, float(particle.life) * 2.0))
	for floater in sim.floaters:
		var pos: Vector2 = floater.pos
		draw_string(number_font, pos, str(floater.text), HORIZONTAL_ALIGNMENT_CENTER, -1.0, 15, palette.bone_bright)

func _draw_enemy(enemy: Dictionary, palette: Dictionary) -> void:
	var pos: Vector2 = enemy.pos
	var flash := float(enemy.hit_flash) > 0.0
	var body_color: Color = palette.bone_bright if flash else palette.sage_light
	match enemy.kind:
		"ghost":
			var bob := sin(visual_time * 3.0 + pos.x) * 3.0
			draw_circle(pos + Vector2(0, bob), 17, Color(body_color, 0.96))
			draw_colored_polygon(PackedVector2Array([
				pos + Vector2(-16, 4 + bob),
				pos + Vector2(16, 4 + bob),
				pos + Vector2(10, 24 + bob),
				pos + Vector2(0, 18 + bob),
				pos + Vector2(-10, 24 + bob),
			]), body_color)
			draw_circle(pos + Vector2(-6, -2 + bob), 2.6, palette.ink_deep)
			draw_circle(pos + Vector2(6, -2 + bob), 2.6, palette.ink_deep)
			draw_arc(pos + Vector2(0, 4 + bob), 4.0, 0.0, PI, 8, palette.ink_deep, 1.4, true)
		"jiangshi":
			draw_rect(Rect2(pos + Vector2(-15, -20), Vector2(30, 40)), palette.grey_mid)
			draw_circle(pos + Vector2(0, -25), 11, palette.sage_mid)
			draw_rect(Rect2(pos + Vector2(-18, -40), Vector2(36, 7)), palette.ink_deep)
			draw_rect(Rect2(pos + Vector2(-10, -47), Vector2(20, 8)), palette.ink_slate)
			draw_line(pos + Vector2(-12, -8), pos + Vector2(-28, 4), palette.sage_mid, 6)
			draw_line(pos + Vector2(12, -8), pos + Vector2(28, 4), palette.sage_mid, 6)
			draw_circle(pos + Vector2(-4, -26), 2.0, palette.vermilion)
			draw_circle(pos + Vector2(4, -26), 2.0, palette.vermilion)
		"punisher":
			draw_rect(Rect2(pos + Vector2(-13, -28), Vector2(26, 48)), palette.bone)
			draw_circle(pos + Vector2(0, -34), 12, palette.bone_bright)
			draw_rect(Rect2(pos + Vector2(-20, -50), Vector2(40, 8)), palette.ink_deep)
			draw_line(pos + Vector2(-16, -46), pos + Vector2(16, -46), palette.vermilion, 3)
			draw_line(pos + Vector2(-10, -10), pos + Vector2(-24, 8), palette.bone_dark, 5)
			draw_line(pos + Vector2(10, -10), pos + Vector2(24, 8), palette.bone_dark, 5)

func _draw_moon(palette: Dictionary, viewport_size: Vector2) -> void:
	var moon_pos := viewport_size * Vector2(0.72, 0.18) - sim.camera * 0.05
	draw_circle(moon_pos, 62.0, Color(palette.bone, 0.16))
	draw_circle(moon_pos, 50.0, Color(palette.bone, 0.82))
	draw_circle(moon_pos + Vector2(18.0, -8.0), 13.0, Color(palette.grey_mid, 0.18))
	draw_circle(moon_pos + Vector2(-14.0, 17.0), 9.0, Color(palette.grey_mid, 0.14))

func _draw_foreground_mist(palette: Dictionary, viewport_size: Vector2) -> void:
	for i in range(6):
		var x := fmod(visual_time * (8.0 + i) + i * 260.0, viewport_size.x + 500.0) - 250.0
		var y := viewport_size.y * (0.25 + float(i % 3) * 0.23)
		draw_circle(Vector2(x, y), 150.0 + i * 12.0, Color(palette.grey_light, 0.018 + i * 0.002))

func set_light_uniforms() -> void:
	var overlay = get_parent().get_node_or_null("ScreenLayer/LightOverlay")
	if overlay == null or overlay.material == null:
		return
	var viewport_size := get_viewport_rect().size
	var light_world: Vector2 = sim.hazards.frozen_light if sim.hazards.blackout_active else sim.player.pos
	var light_center: Vector2 = light_world - sim.camera + viewport_size * 0.5
	var light_radius: float = sim.hazards.frozen_radius if sim.hazards.blackout_active else (235.0 if sim.realm == "mortal" else 185.0)
	overlay.material.set_shader_parameter("light_center", light_center / viewport_size)
	overlay.material.set_shader_parameter("viewport_size", viewport_size)
	overlay.material.set_shader_parameter("light_radius", light_radius)
	overlay.material.set_shader_parameter("darkness", 0.86 if sim.hazards.blackout_active else (0.62 if sim.realm == "mortal" else 0.72))

func capture_screenshot(path: String) -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var error := image.save_png(path)
	if error != OK:
		push_error("screenshot save failed: " + error_string(error))
