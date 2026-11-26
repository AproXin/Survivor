extends Node2D
class_name InkRenderer

var sim: InkMain
var scenery: Array[Dictionary] = []
var visual_time := 0.0
var body_font: Font = ThemeDB.fallback_font
var number_font: Font = ThemeDB.fallback_font
var title_font: Font = ThemeDB.fallback_font

func setup(target: InkMain) -> void:
	sim = target
	if ResourceLoader.exists("res://assets/fonts/NotoSerifSC[wght].ttf"):
		body_font = load("res://assets/fonts/NotoSerifSC[wght].ttf")
	if ResourceLoader.exists("res://assets/fonts/JetBrainsMono[wght].ttf"):
		number_font = load("res://assets/fonts/JetBrainsMono[wght].ttf")
	if ResourceLoader.exists("res://assets/fonts/MaShanZheng-Regular.ttf"):
		title_font = load("res://assets/fonts/MaShanZheng-Regular.ttf")
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
	for i in range(96):
		var kind := "grave"
		if i % 7 == 0:
			kind = "bamboo"
		elif i % 5 == 0:
			kind = "grass"
		elif i % 16 == 0:
			kind = "stone_lantern"
		elif i % 13 == 0:
			kind = "wall"
		var px := generator.randf_range(-1050.0, 1050.0)
		var py := generator.randf_range(-1050.0, 1050.0)
		# Keep spawn center clear of large obstacles
		if Vector2(px, py).length() < 120.0:
			px += 180.0 if px >= 0.0 else -180.0
		result.append({
			"kind": kind,
			"pos": Vector2(px, py),
			"scale": generator.randf_range(0.78, 1.32),
			"phase": generator.randf_range(0.0, TAU),
			"tilt": generator.randf_range(-0.08, 0.08),
			"glyph": ["墓", "归", "眠", "镇", "安"][generator.randi_range(0, 4)],
		})
	return result

func _draw() -> void:
	if sim == null:
		return
	var palette := InkData.palette()
	var viewport_size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, viewport_size), palette.ink_deep)
	if sim.phase == sim.Phase.TITLE:
		_draw_title_diorama(palette, viewport_size)
		return
	var cam_pos: Vector2 = sim.camera + sim.shake_offset
	var view_origin := viewport_size * 0.5 - cam_pos
	draw_set_transform(view_origin)
	_draw_ground(palette, cam_pos, viewport_size)
	_draw_taboo_zones(palette)
	_draw_gems(palette, cam_pos, viewport_size)
	_draw_afterimages(palette)
	_draw_y_sorted_world(palette, cam_pos, viewport_size)
	_draw_combat_vfx(palette)
	draw_set_transform(Vector2.ZERO)
	_draw_moon(palette, viewport_size)
	_draw_foreground_mist(palette, viewport_size)
	if sim.flip_freeze > 0.0:
		var flash_alpha: float = clampf(sim.flip_freeze / InkData.player_base().flip_freeze_sec, 0.0, 1.0) * 0.24
		draw_rect(Rect2(Vector2.ZERO, viewport_size), Color(palette.bone_bright, flash_alpha))

# --- Title Screen Live Atmospheric Diorama ---
func _draw_title_diorama(palette: Dictionary, vs: Vector2) -> void:
	# Subtle deep ink night sky gradient bands
	draw_rect(Rect2(Vector2.ZERO, vs), palette.ink_deep)
	draw_rect(Rect2(Vector2(vs.x * 0.32, 0.0), Vector2(vs.x * 0.68, vs.y * 0.65)), Color(palette.ink_night, 0.72))
	# Full moon upper right
	var moon_pos := Vector2(vs.x * 0.76, vs.y * 0.22)
	draw_circle(moon_pos, 128.0, Color(palette.bone, 0.04))
	draw_circle(moon_pos, 88.0, Color(palette.bone, 0.09))
	draw_circle(moon_pos, 58.0, Color(palette.bone, 0.86))
	draw_circle(moon_pos + Vector2(18.0, -10.0), 14.0, Color(palette.grey_mid, 0.20))
	draw_circle(moon_pos + Vector2(-16.0, 16.0), 10.0, Color(palette.grey_mid, 0.16))
	draw_circle(moon_pos + Vector2(4.0, 22.0), 7.0, Color(palette.grey_dark, 0.14))
	# Layered distant ink mountain ridges
	var ridge_far := PackedVector2Array([
		Vector2(vs.x * 0.28, vs.y),
		Vector2(vs.x * 0.42, vs.y * 0.64),
		Vector2(vs.x * 0.56, vs.y * 0.54),
		Vector2(vs.x * 0.70, vs.y * 0.60),
		Vector2(vs.x * 0.86, vs.y * 0.48),
		Vector2(vs.x, vs.y * 0.56),
		Vector2(vs.x, vs.y),
	])
	draw_colored_polygon(ridge_far, Color(palette.ink_slate, 0.42))
	var ridge_near := PackedVector2Array([
		Vector2(vs.x * 0.35, vs.y),
		Vector2(vs.x * 0.50, vs.y * 0.72),
		Vector2(vs.x * 0.68, vs.y * 0.66),
		Vector2(vs.x * 0.84, vs.y * 0.70),
		Vector2(vs.x, vs.y * 0.64),
		Vector2(vs.x, vs.y),
	])
	draw_colored_polygon(ridge_near, Color(palette.ink_night, 0.92))
	# Midground tombstones & swaying bamboo silhouettes on the right
	_draw_grave(Vector2(vs.x * 0.61, vs.y * 0.75), 1.15, "归", palette)
	_draw_grave(Vector2(vs.x * 0.85, vs.y * 0.78), 1.30, "眠", palette)
	_draw_grave(Vector2(vs.x * 0.74, vs.y * 0.82), 0.92, "墓", palette)
	_draw_bamboo(Vector2(vs.x * 0.92, vs.y * 0.86), 1.65, 0.4, palette)
	_draw_bamboo(Vector2(vs.x * 0.53, vs.y * 0.85), 1.25, 2.1, palette)
	# Floating ghostly wisps in the graveyard mist
	for i in range(4):
		var gx := vs.x * (0.58 + float(i) * 0.09) + sin(visual_time * 0.7 + float(i) * 1.9) * 26.0
		var gy := vs.y * (0.60 + float(i % 2) * 0.10) + cos(visual_time * 1.1 + float(i)) * 12.0
		_draw_ghost_shape(Vector2(gx, gy), 0.72 + float(i % 2) * 0.18, float(i) * 1.5, palette.sage_light, false, false, palette)
	# Gnarled ink branch & hanging swaying hexagonal lantern on right-center
	var anchor := Vector2(vs.x * 0.72, vs.y * 0.34)
	draw_line(Vector2(vs.x, vs.y * 0.24), anchor + Vector2(30.0, -12.0), palette.ink_deep, 9.0)
	draw_line(anchor + Vector2(30.0, -12.0), anchor, palette.ink_slate, 5.0)
	var sway := sin(visual_time * 1.4) * 10.0
	var lantern_pos := anchor + Vector2(sway, 86.0)
	draw_line(anchor, lantern_pos + Vector2(0.0, -24.0), palette.grey_mid, 2.0)
	# Warm lantern glow pools
	var pulse := 1.0 + sin(visual_time * 5.2) * 0.04
	draw_circle(lantern_pos, 170.0 * pulse, Color(palette.amber, 0.05))
	draw_circle(lantern_pos, 96.0 * pulse, Color(palette.amber, 0.11))
	draw_circle(lantern_pos, 46.0 * pulse, Color(palette.amber_bright, 0.22))
	_draw_hex_lantern(lantern_pos, 1.85, sway * 0.2, palette)
	# Rising golden ember sparks around the lantern
	for i in range(10):
		var t := fmod(visual_time * 0.38 + float(i) * 0.17, 1.0)
		var ex := lantern_pos.x + sin(visual_time * 2.0 + float(i) * 2.3) * (16.0 + t * 28.0)
		var ey := lantern_pos.y + 18.0 - t * 115.0
		draw_circle(Vector2(ex, ey), (1.0 - t) * 2.8, Color(palette.amber_bright, (1.0 - t) * 0.75))
	# Drifting foreground mist across bottom
	_draw_foreground_mist(palette, vs)

# --- Ground & Road ---
func _draw_ground(palette: Dictionary, cam_pos: Vector2, vs: Vector2) -> void:
	var half_w := vs.x * 0.55
	var half_h := vs.y * 0.55
	var view_rect := Rect2(cam_pos.x - half_w, cam_pos.y - half_h, half_w * 2.0, half_h * 2.0)
	var world_rect := Rect2(-InkData.WORLD_HALF, -InkData.WORLD_HALF, InkData.WORLD_SIZE, InkData.WORLD_SIZE)
	draw_rect(world_rect.intersection(view_rect), palette.ink_night)
	# Winding dirt road with soft ink-wash borders
	var road_outer := PackedVector2Array([
		Vector2(-210.0, -InkData.WORLD_HALF),
		Vector2(190.0, -InkData.WORLD_HALF),
		Vector2(470.0, InkData.WORLD_HALF),
		Vector2(-480.0, InkData.WORLD_HALF),
	])
	var road_inner := PackedVector2Array([
		Vector2(-150.0, -InkData.WORLD_HALF),
		Vector2(130.0, -InkData.WORLD_HALF),
		Vector2(380.0, InkData.WORLD_HALF),
		Vector2(-390.0, InkData.WORLD_HALF),
	])
	draw_colored_polygon(road_outer, Color(palette.ink_slate, 0.45))
	draw_colored_polygon(road_inner, Color(palette.grey_dark, 0.30))
	# Subtle cross-path
	var cross_path := PackedVector2Array([
		Vector2(-InkData.WORLD_HALF, -85.0),
		Vector2(InkData.WORLD_HALF, 130.0),
		Vector2(InkData.WORLD_HALF, 260.0),
		Vector2(-InkData.WORLD_HALF, 65.0),
	])
	draw_colored_polygon(cross_path, Color(palette.grey_dark, 0.22))
	# Ground ink-wash pebbles & dry-brush texture (culled to view)
	for i in range(140):
		var x := fmod(float(i) * 173.31 + 311.0, InkData.WORLD_SIZE) - InkData.WORLD_HALF
		var y := fmod(float(i) * 109.73 + 577.0, InkData.WORLD_SIZE) - InkData.WORLD_HALF
		if absf(x - cam_pos.x) > half_w or absf(y - cam_pos.y) > half_h:
			continue
		if i % 4 == 0:
			draw_circle(Vector2(x, y), 22.0 + float(i % 5) * 6.0, Color(palette.ink_slate, 0.16))
		else:
			draw_circle(Vector2(x, y), 1.8 + float(i % 3) * 0.7, Color(palette.grey_mid, 0.26))
	# Subtle world boundary ink border
	draw_rect(world_rect, Color(palette.grey_dark, 0.45), false, 4.0)

func _draw_taboo_zones(palette: Dictionary) -> void:
	# 1. Shadow zones
	if sim.has_rule("shadow"):
		for zone in sim.hazards.shadow_zones:
			var pos: Vector2 = zone.pos
			var radius: float = zone.radius
			var pulse := 1.0 + sin(visual_time * 2.2 + pos.x * 0.01) * 0.03
			draw_circle(pos, radius * pulse, Color(0.015, 0.02, 0.025, 0.62))
			draw_circle(pos, radius * 0.72 * pulse, Color(0.01, 0.014, 0.018, 0.55))
			var p_pos: Vector2 = sim.player.pos
			var in_this: bool = p_pos.distance_to(pos) <= radius
			var border_col: Color = Color(palette.vermilion, 0.78) if in_this else Color(palette.grey_dark, 0.35)
			draw_arc(pos, radius * pulse, 0.0, TAU, 44, border_col, 2.2 if in_this else 1.4, true)
			if in_this and sim.hazards.shadow_timer > 0.01:
				var prog: float = clampf(sim.hazards.shadow_timer / (1.0 + float(sim.player.taboo_grace_bonus)), 0.0, 1.0)
				draw_arc(p_pos, 32.0, -PI * 0.5, -PI * 0.5 + TAU * prog, 28, palette.vermilion_bright, 3.5, true)
	# 3. Blackout frozen light & cold safe zones
	if sim.hazards.blackout_active:
		var frozen: Vector2 = sim.hazards.frozen_light
		var fr: float = sim.hazards.frozen_radius
		draw_circle(frozen, fr, Color(palette.amber, 0.08))
		draw_arc(frozen, fr, 0.0, TAU, 52, Color(palette.amber_bright, 0.58), 2.5, true)
		for cl in sim.cold_lights:
			var cp: Vector2 = cl.pos
			var cr: float = float(cl.radius)
			draw_circle(cp, cr, Color(palette.sage_light, 0.07))
			draw_arc(cp, cr, 0.0, TAU, 36, Color(palette.sage_light, 0.42), 1.8, true)
	# 5. Name call ripple ring
	if sim.has_rule("avoid_name_call") and bool(sim.hazards.name_call.active):
		var np: Vector2 = sim.hazards.name_call.pos
		var nr: float = float(sim.hazards.name_call.radius)
		var wave := fmod(visual_time * 1.4, 1.0)
		draw_circle(np, nr, Color(palette.bone, 0.08))
		draw_arc(np, nr, 0.0, TAU, 40, Color(palette.vermilion_bright, 0.72), 2.2, true)
		draw_arc(np, nr * wave, 0.0, TAU, 32, Color(palette.bone_bright, (1.0 - wave) * 0.75), 2.0, true)
		draw_string(body_font, np + Vector2(-9.0, 6.0), "名", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(palette.bone_bright, 0.85))
	# 6. Southwest Spirit Gate (阴门)
	if sim.has_rule("avoid_door_knock"):
		var gp: Vector2 = sim.landmarks.spirit_gate
		var active: bool = bool(sim.hazards.door_knock.active)
		draw_circle(gp, 115.0, Color(palette.vermilion if active else palette.ink_slate, 0.14 if active else 0.06))
		draw_arc(gp, 115.0, 0.0, TAU, 40, Color(palette.vermilion_bright if active else palette.grey_dark, 0.78 if active else 0.35), 2.2, true)
		draw_rect(Rect2(gp + Vector2(-28, -56), Vector2(10, 56)), palette.grey_dark)
		draw_rect(Rect2(gp + Vector2(18, -56), Vector2(10, 56)), palette.grey_dark)
		draw_rect(Rect2(gp + Vector2(-36, -64), Vector2(72, 10)), palette.ink_slate)
		draw_string(body_font, gp + Vector2(-14, -22), "阴门", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.vermilion_bright if active else palette.bone_dark)
	# 7. Southeast Dark Pond (暗潭)
	if sim.has_rule("avoid_water_gong"):
		var wp: Vector2 = sim.landmarks.dark_pond
		var active: bool = bool(sim.hazards.water_gong.active)
		draw_circle(wp, 125.0, Color(palette.ink_deep, 0.72))
		draw_circle(wp, 102.0, Color(palette.ink_slate, 0.55))
		draw_arc(wp, 125.0, 0.0, TAU, 44, Color(palette.vermilion_bright if active else palette.sage_mid, 0.82 if active else 0.35), 2.2, true)
		if active:
			var r_wave := fmod(visual_time * 1.6, 1.0)
			draw_arc(wp, 120.0 * r_wave, 0.0, TAU, 36, Color(palette.bone, (1.0 - r_wave) * 0.65), 1.8, true)
		draw_string(body_font, wp + Vector2(-14, 5), "暗潭", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.vermilion_bright if active else palette.sage_light)
	# 8. Northwest Ruined Wall Shadow (断垣)
	if sim.has_rule("avoid_wall_shadow") and not sim.boss_spawned:
		var rp: Vector2 = sim.landmarks.ruined_wall
		draw_circle(rp, 120.0, Color(palette.ink_deep, 0.60))
		draw_arc(rp, 120.0, 0.0, TAU, 40, Color(palette.vermilion, 0.55), 2.0, true)
		draw_string(body_font, rp + Vector2(-14, 5), "断垣", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.bone_dark)
	# 9. North Blank Stele (无字残碑)
	if sim.has_rule("no_stele_linger"):
		var sp: Vector2 = sim.landmarks.blank_stele
		draw_circle(sp, 115.0, Color(palette.grey_dark, 0.22))
		draw_arc(sp, 115.0, 0.0, TAU, 40, Color(palette.vermilion if sim.hazards.stele_timer > 0.05 else palette.grey_light, 0.55), 1.8, true)
		draw_rect(Rect2(sp + Vector2(-18, -54), Vector2(36, 56)), palette.grey_mid)
		draw_rect(Rect2(sp + Vector2(-24, 0), Vector2(48, 10)), palette.grey_dark)
		draw_string(body_font, sp + Vector2(-20, 24), "无字碑", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, palette.bone_dark)
		if sim.hazards.stele_timer > 0.05:
			var prog: float = clampf(float(sim.hazards.stele_timer) / (3.0 + float(sim.player.taboo_grace_bonus)), 0.0, 1.0)
			draw_arc(sim.player.pos, 32.0, -PI * 0.5, -PI * 0.5 + TAU * prog, 28, palette.vermilion_bright, 3.5, true)
	# Boss telegraphed Vermilion Seal AoEs (朱笔点卯)
	for aoe in sim.boss_aoes:
		var ap: Vector2 = aoe.pos
		var ar: float = float(aoe.radius)
		var max_c: float = maxf(0.01, float(aoe.max_charge))
		var u: float = 1.0 - clampf(float(aoe.charge) / max_c, 0.0, 1.0)
		draw_circle(ap, ar * u, Color(palette.vermilion, 0.22 + u * 0.24))
		draw_arc(ap, ar, 0.0, TAU, 40, Color(palette.vermilion_bright, 0.85), 2.4, true)
		draw_string(title_font, ap + Vector2(-12.0, 10.0), "敕", HORIZONTAL_ALIGNMENT_LEFT, -1, 28, Color(palette.vermilion_bright, 0.7 + u * 0.3))

func _draw_gems(palette: Dictionary, cam_pos: Vector2, vs: Vector2) -> void:
	var half_w := vs.x * 0.55
	var half_h := vs.y * 0.55
	for gem in sim.gems:
		var pos: Vector2 = gem.pos
		if absf(pos.x - cam_pos.x) > half_w or absf(pos.y - cam_pos.y) > half_h:
			continue
		var pulse := 1.0 + sin(visual_time * 5.2 + pos.x * 0.1) * 0.10
		draw_circle(pos, 13.0 * pulse, Color(palette.xp_mid, 0.14))
		draw_circle(pos, 7.5 * pulse, Color(palette.xp_bright, 0.20))
		var points := PackedVector2Array([
			pos + Vector2(0.0, -8.5) * pulse,
			pos + Vector2(6.5, 0.0) * pulse,
			pos + Vector2(0.0, 8.5) * pulse,
			pos + Vector2(-6.5, 0.0) * pulse,
		])
		draw_colored_polygon(points, palette.xp_mid)
		var facet := PackedVector2Array([
			pos + Vector2(0.0, -8.5) * pulse,
			pos + Vector2(6.5, 0.0) * pulse,
			pos + Vector2(0.0, 0.0),
			pos + Vector2(-2.5, -2.5) * pulse,
		])
		draw_colored_polygon(facet, palette.xp_bright)
		draw_polyline(PackedVector2Array([points[0], points[1], points[2], points[3], points[0]]), palette.xp_dark, 1.2)

func _draw_afterimages(palette: Dictionary) -> void:
	for img in sim.afterimages:
		var alpha: float = clampf(float(img.life) / maxf(0.01, float(img.max_life)), 0.0, 1.0) * 0.45
		var p: Vector2 = img.pos
		draw_circle(p + Vector2(0.0, -14.0), 18.0, Color(palette.bone_bright, alpha * 0.35))
		draw_rect(Rect2(p + Vector2(-12.0, -24.0), Vector2(24.0, 38.0)), Color(palette.bone, alpha))
		draw_circle(p + Vector2(0.0, -31.0), 10.0, Color(palette.bone_bright, alpha))

func _draw_y_sorted_world(palette: Dictionary, cam_pos: Vector2, vs: Vector2) -> void:
	var half_w := vs.x * 0.58
	var half_h := vs.y * 0.58
	var draw_list: Array[Dictionary] = []
	for prop in scenery:
		var p: Vector2 = prop.pos
		if absf(p.x - cam_pos.x) <= half_w and absf(p.y - cam_pos.y) <= half_h:
			draw_list.append({"y": p.y, "type": 0, "ref": prop})
	for enemy in sim.enemies:
		var ep: Vector2 = enemy.pos
		if absf(ep.x - cam_pos.x) <= half_w and absf(ep.y - cam_pos.y) <= half_h:
			draw_list.append({"y": ep.y, "type": 1, "ref": enemy})
	draw_list.append({"y": sim.player.pos.y, "type": 2, "ref": null})
	if sim.hazards.white_stranger.active:
		var wp: Vector2 = sim.hazards.white_stranger.pos
		if absf(wp.x - cam_pos.x) <= half_w and absf(wp.y - cam_pos.y) <= half_h:
			draw_list.append({"y": wp.y, "type": 3, "ref": null})
	draw_list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a.y) < float(b.y))
	for item in draw_list:
		var t: int = int(item.type)
		if t == 0:
			_draw_prop(item.ref, palette)
		elif t == 1:
			_draw_enemy(item.ref, palette)
		elif t == 2:
			_draw_player(palette)
		else:
			_draw_white_stranger(palette)

# --- Sculpted Ink-Wash Props ---
func _draw_prop(prop: Dictionary, palette: Dictionary) -> void:
	var pos: Vector2 = prop.pos
	var scale_value: float = prop.scale
	match prop.kind:
		"grave":
			_draw_grave(pos, scale_value, prop.glyph, palette)
		"bamboo":
			_draw_bamboo(pos, scale_value, prop.phase, palette)
		"grass":
			_draw_grass(pos, scale_value, prop.phase, palette)
		"stone_lantern":
			_draw_stone_lantern(pos, scale_value, palette)
		"wall":
			_draw_wall(pos, scale_value, palette)

func _draw_grave(pos: Vector2, s: float, glyph: String, palette: Dictionary) -> void:
	# Ground shadow
	draw_colored_polygon(PackedVector2Array([
		pos + Vector2(-28.0, 14.0) * s,
		pos + Vector2(30.0, 14.0) * s,
		pos + Vector2(38.0, 24.0) * s,
		pos + Vector2(-20.0, 24.0) * s,
	]), Color(palette.ink_deep, 0.55))
	# Stepped stone pedestal
	draw_rect(Rect2(pos + Vector2(-25.0, 6.0) * s, Vector2(50.0, 10.0) * s), palette.grey_dark)
	draw_rect(Rect2(pos + Vector2(-21.0, 1.0) * s, Vector2(42.0, 6.0) * s), palette.grey_mid)
	# Tapered Chinese stone stele with carved shoulder arch
	var stele := PackedVector2Array([
		pos + Vector2(-17.0, 2.0) * s,
		pos + Vector2(-15.0, -38.0) * s,
		pos + Vector2(-10.0, -47.0) * s,
		pos + Vector2(0.0, -51.0) * s,
		pos + Vector2(10.0, -47.0) * s,
		pos + Vector2(15.0, -38.0) * s,
		pos + Vector2(17.0, 2.0) * s,
	])
	draw_colored_polygon(stele, palette.grey_mid)
	# Left moonlight bevel & right ink shadow
	draw_polyline(PackedVector2Array([
		pos + Vector2(-17.0, 2.0) * s,
		pos + Vector2(-15.0, -38.0) * s,
		pos + Vector2(-10.0, -47.0) * s,
		pos + Vector2(0.0, -51.0) * s,
	]), Color(palette.grey_light, 0.55), 2.0 * s)
	draw_polyline(PackedVector2Array([
		pos + Vector2(0.0, -51.0) * s,
		pos + Vector2(10.0, -47.0) * s,
		pos + Vector2(15.0, -38.0) * s,
		pos + Vector2(17.0, 2.0) * s,
	]), Color(palette.ink_deep, 0.72), 2.2 * s)
	# Recessed inscription plaque & weathering crack
	draw_rect(Rect2(pos + Vector2(-9.5, -36.0) * s, Vector2(19.0, 32.0) * s), Color(palette.grey_dark, 0.55))
	draw_line(pos + Vector2(6.0, -40.0) * s, pos + Vector2(11.0, -31.0) * s, palette.ink_night, 1.3 * s)
	draw_string(body_font, pos + Vector2(-8.0, -14.0) * s, glyph, HORIZONTAL_ALIGNMENT_LEFT, -1.0, maxi(10, int(16.0 * s)), Color(palette.bone_dark, 0.72))
	# Moss / grass tuft at base
	draw_line(pos + Vector2(-20.0, 15.0) * s, pos + Vector2(-24.0, 6.0) * s, palette.sage_dark, 2.0 * s)
	draw_line(pos + Vector2(-16.0, 15.0) * s, pos + Vector2(-13.0, 7.0) * s, palette.sage_mid, 1.8 * s)

func _draw_bamboo(pos: Vector2, s: float, phase_value: float, palette: Dictionary) -> void:
	draw_circle(pos + Vector2(0.0, 14.0) * s, 22.0 * s, Color(palette.ink_deep, 0.35))
	for i in range(4):
		var offset := float(i - 1.5) * 11.0
		var sway := sin(visual_time * 1.1 + phase_value + float(i) * 0.7) * 5.5
		var bottom := pos + Vector2(offset, 14.0) * s
		var mid := pos + Vector2(offset + sway * 0.45, -34.0 - float(i % 2) * 8.0) * s
		var top := pos + Vector2(offset + sway, -84.0 - float(i) * 7.0) * s
		draw_line(bottom, mid, palette.sage_dark, 3.8 * s)
		draw_line(mid, top, palette.sage_dark, 2.8 * s)
		# Bamboo node rings
		for seg in [0.25, 0.52, 0.76]:
			var np := bottom.lerp(top, seg)
			draw_line(np + Vector2(-3.5, 0.0) * s, np + Vector2(3.5, 0.0) * s, palette.sage_light, 1.6 * s)
		# Pointed bamboo leaf clusters
		for j in range(3):
			var lp := bottom.lerp(top, 0.46 + float(j) * 0.22)
			var dir := -1.0 if (i + j) % 2 == 0 else 1.0
			var leaf_a := PackedVector2Array([
				lp,
				lp + Vector2(dir * 12.0, -7.0) * s,
				lp + Vector2(dir * 23.0, -3.0) * s,
				lp + Vector2(dir * 10.0, -1.0) * s,
			])
			var leaf_b := PackedVector2Array([
				lp,
				lp + Vector2(dir * 9.0, -13.0) * s,
				lp + Vector2(dir * 18.0, -15.0) * s,
				lp + Vector2(dir * 8.0, -6.0) * s,
			])
			draw_colored_polygon(leaf_a, palette.sage_mid)
			draw_colored_polygon(leaf_b, palette.sage_dark)

func _draw_grass(pos: Vector2, s: float, phase_value: float, palette: Dictionary) -> void:
	var sway := sin(visual_time * 1.6 + phase_value) * 2.5
	for i in range(6):
		var angle := -2.35 + float(i) * 0.34
		var len_b := (14.0 + float(i % 3) * 5.0) * s
		var tip := pos + Vector2(cos(angle) * len_b + sway, sin(angle) * len_b)
		var col: Color = palette.sage_mid if i % 2 == 0 else palette.sage_dark
		draw_line(pos + Vector2(float(i - 2) * 2.5 * s, 0.0), tip, col, 2.0 * s)

func _draw_stone_lantern(pos: Vector2, s: float, palette: Dictionary) -> void:
	draw_circle(pos + Vector2(0.0, 10.0) * s, 20.0 * s, Color(palette.ink_deep, 0.45))
	# Pedestal & shaft
	draw_rect(Rect2(pos + Vector2(-16.0, 2.0) * s, Vector2(32.0, 10.0) * s), palette.grey_dark)
	draw_rect(Rect2(pos + Vector2(-7.0, -26.0) * s, Vector2(14.0, 30.0) * s), palette.grey_mid)
	# Firebox chamber
	draw_rect(Rect2(pos + Vector2(-12.0, -44.0) * s, Vector2(24.0, 18.0) * s), palette.grey_dark)
	# Cold grave-wisp glow (sage-bone, NOT warm amber!)
	var pulse := 1.0 + sin(visual_time * 3.4 + pos.x) * 0.12
	draw_circle(pos + Vector2(0.0, -35.0) * s, 26.0 * s * pulse, Color(palette.sage_light, 0.14))
	draw_circle(pos + Vector2(0.0, -35.0) * s, 11.0 * s * pulse, Color(palette.bone, 0.42))
	draw_circle(pos + Vector2(0.0, -35.0) * s, 5.0 * s, palette.bone_bright)
	# Curved traditional roof eaves
	var roof := PackedVector2Array([
		pos + Vector2(-22.0, -43.0) * s,
		pos + Vector2(-12.0, -55.0) * s,
		pos + Vector2(0.0, -60.0) * s,
		pos + Vector2(12.0, -55.0) * s,
		pos + Vector2(22.0, -43.0) * s,
	])
	draw_colored_polygon(roof, palette.grey_mid)
	draw_polyline(roof, palette.ink_deep, 1.8 * s)

func _draw_wall(pos: Vector2, s: float, palette: Dictionary) -> void:
	draw_rect(Rect2(pos + Vector2(-36.0, 4.0) * s, Vector2(76.0, 12.0) * s), Color(palette.ink_deep, 0.48))
	var blocks := [
		Rect2(-34, -14, 24, 18),
		Rect2(-8, -14, 26, 18),
		Rect2(20, -14, 20, 18),
		Rect2(-26, -32, 24, 17),
		Rect2(0, -32, 22, 17),
		Rect2(-18, -46, 20, 13),
	]
	for idx in range(blocks.size()):
		var b: Rect2 = blocks[idx]
		var r := Rect2(pos + b.position * s, b.size * s)
		draw_rect(r, palette.grey_mid if idx % 2 == 0 else palette.grey_dark)
		draw_rect(r, palette.ink_deep, false, 1.5 * s)
		draw_line(r.position + Vector2(2.0, 2.0), r.position + Vector2(r.size.x - 2.0, 2.0), Color(palette.grey_light, 0.35), 1.4)

func _draw_white_stranger(palette: Dictionary) -> void:
	var pos: Vector2 = sim.hazards.white_stranger.pos
	var p_pos: Vector2 = sim.player.pos
	var dist: float = p_pos.distance_to(pos)
	var danger := clampf((180.0 - dist) / 90.0, 0.0, 1.0)
	# Taboo perimeter ring
	draw_circle(pos, 90.0, Color(palette.bone, 0.04 + danger * 0.06))
	draw_arc(pos, 90.0, 0.0, TAU, 40, Color(palette.vermilion if danger > 0.2 else palette.bone_dark, 0.28 + danger * 0.55), 1.8, true)
	# Eerie pale veiled figure
	var float_y := sin(visual_time * 2.2) * 2.5
	draw_circle(pos + Vector2(0.0, 20.0), 18.0, Color(palette.ink_deep, 0.45))
	draw_colored_polygon(PackedVector2Array([
		pos + Vector2(-14.0, -14.0 + float_y),
		pos + Vector2(14.0, -14.0 + float_y),
		pos + Vector2(21.0, 24.0 + float_y),
		pos + Vector2(-21.0, 24.0 + float_y),
	]), palette.bone)
	draw_line(pos + Vector2(-5.0, -10.0 + float_y), pos + Vector2(-8.0, 22.0 + float_y), Color(palette.grey_mid, 0.35), 1.5)
	draw_line(pos + Vector2(5.0, -10.0 + float_y), pos + Vector2(8.0, 22.0 + float_y), Color(palette.grey_mid, 0.35), 1.5)
	draw_circle(pos + Vector2(0.0, -26.0 + float_y), 12.0, palette.bone_bright)
	draw_circle(pos + Vector2(-4.5, -27.0 + float_y), 2.2, palette.ink_deep)
	draw_circle(pos + Vector2(4.5, -27.0 + float_y), 2.2, palette.ink_deep)
	# Whispered question line above head (120px core range per Doc 37 Section VI.1)
	var line: String = str(sim.hazards.white_stranger.get("line", ""))
	if line != "" and dist <= 160.0:
		var tw := body_font.get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
		var a := clampf((160.0 - dist) / 40.0, 0.45, 1.0)
		draw_rect(Rect2(pos + Vector2(-tw * 0.5 - 8.0, -64.0), Vector2(tw + 16.0, 22.0)), Color(palette.ink_deep, 0.84 * a))
		draw_string(body_font, pos + Vector2(-tw * 0.5, -48.0), line, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(palette.bone_bright, a))

# --- Expressive Player & Hexagonal Lantern ---
func _draw_hex_lantern(center: Vector2, s: float, sway_x: float, palette: Dictionary) -> void:
	var lp := center + Vector2(sway_x, 0.0)
	# Tassel underneath
	draw_line(lp + Vector2(0.0, 12.0) * s, lp + Vector2(sway_x * 0.5, 22.0) * s, palette.amber_dark, 2.0 * s)
	# Lantern body (hexagonal silhouette)
	var body := PackedVector2Array([
		lp + Vector2(-6.5, -10.0) * s,
		lp + Vector2(6.5, -10.0) * s,
		lp + Vector2(9.5, 0.0) * s,
		lp + Vector2(6.5, 10.0) * s,
		lp + Vector2(-6.5, 10.0) * s,
		lp + Vector2(-9.5, 0.0) * s,
	])
	draw_colored_polygon(body, palette.amber)
	var core := PackedVector2Array([
		lp + Vector2(-4.0, -7.0) * s,
		lp + Vector2(4.0, -7.0) * s,
		lp + Vector2(6.0, 0.0) * s,
		lp + Vector2(4.0, 7.0) * s,
		lp + Vector2(-4.0, 7.0) * s,
		lp + Vector2(-6.0, 0.0) * s,
	])
	draw_colored_polygon(core, palette.amber_bright)
	# Wooden ribs & caps
	draw_line(lp + Vector2(-3.2, -10.0) * s, lp + Vector2(-3.2, 10.0) * s, Color(palette.amber_dark, 0.75), 1.2 * s)
	draw_line(lp + Vector2(3.2, -10.0) * s, lp + Vector2(3.2, 10.0) * s, Color(palette.amber_dark, 0.75), 1.2 * s)
	draw_polyline(PackedVector2Array([body[0], body[1], body[2], body[3], body[4], body[5], body[0]]), palette.ink_night, 1.5 * s)
	draw_rect(Rect2(lp + Vector2(-8.0, -13.0) * s, Vector2(16.0, 3.5) * s), palette.ink_deep)
	draw_rect(Rect2(lp + Vector2(-7.0, 9.5) * s, Vector2(14.0, 3.0) * s), palette.ink_deep)
	draw_line(lp + Vector2(0.0, -17.0) * s, lp + Vector2(0.0, -13.0) * s, palette.ink_slate, 1.8 * s)

func _draw_player(palette: Dictionary) -> void:
	var pos: Vector2 = sim.player.pos
	var vel: Vector2 = sim.player.vel
	var moving: bool = vel.length_squared() > 1.0
	var bob := sin(sim.player.walk * 0.09) * 2.6 if moving else sin(visual_time * 2.8) * 0.8
	var stride := sin(sim.player.walk * 0.09) * 5.0 if moving else 0.0
	var facing: float = sim.player.facing
	var is_spectral := sim.realm == "spectral"
	var blink := sim.invuln > 0.0 and int(visual_time * 18.0) % 2 == 0
	if blink:
		draw_circle(pos + Vector2(0.0, -12.0), 26.0, Color(palette.vermilion, 0.25))
	# Ground shadow
	draw_circle(pos + Vector2(0.0, 18.0), 19.0, Color(palette.ink_deep, 0.50))
	# Stepping boots
	draw_circle(pos + Vector2(-6.0 + stride, 15.0), 4.2, palette.ink_deep)
	draw_circle(pos + Vector2(6.0 - stride, 15.0), 4.2, palette.ink_deep)
	# Dan water sleeves behind body
	if is_spectral and sim.face == "dan":
		var sleeve_wave := sin(visual_time * 6.5) * 8.0
		var left_s := PackedVector2Array([
			pos + Vector2(-10.0, -16.0 + bob),
			pos + Vector2(-34.0, -8.0 + sleeve_wave + bob),
			pos + Vector2(-42.0, 10.0 - sleeve_wave * 0.6 + bob),
			pos + Vector2(-18.0, 8.0 + bob),
		])
		var right_s := PackedVector2Array([
			pos + Vector2(10.0, -16.0 + bob),
			pos + Vector2(34.0, -8.0 - sleeve_wave + bob),
			pos + Vector2(42.0, 10.0 + sleeve_wave * 0.6 + bob),
			pos + Vector2(18.0, 8.0 + bob),
		])
		draw_colored_polygon(left_s, Color(palette.bone, 0.90))
		draw_colored_polygon(right_s, Color(palette.bone, 0.90))
		draw_polyline(left_s, palette.grey_mid, 1.3)
		draw_polyline(right_s, palette.grey_mid, 1.3)
	# Tapered scholar / opera robe
	var robe_col: Color = palette.grey_mid
	var trim_col: Color = palette.ink_slate
	if is_spectral:
		robe_col = palette.bone if sim.face == "dan" else palette.bone_dark
		trim_col = palette.ink_night
	var robe := PackedVector2Array([
		pos + Vector2(-12.0, -21.0 + bob),
		pos + Vector2(12.0, -21.0 + bob),
		pos + Vector2(17.0, 14.0 + bob),
		pos + Vector2(-17.0, 14.0 + bob),
	])
	draw_colored_polygon(robe, robe_col)
	draw_polyline(PackedVector2Array([robe[0], robe[1], robe[2], robe[3], robe[0]]), palette.ink_deep, 1.8)
	# Diagonal Chinese lapel & waist sash
	draw_line(pos + Vector2(-5.0, -20.0 + bob), pos + Vector2(7.0, -4.0 + bob), trim_col, 2.0)
	draw_rect(Rect2(pos + Vector2(-13.5, -4.0 + bob), Vector2(27.0, 4.5)), trim_col)
	# Head & face
	var face_col: Color = palette.bone_bright if is_spectral else palette.bone
	draw_circle(pos + Vector2(0.0, -30.0 + bob), 11.5, face_col)
	draw_arc(pos + Vector2(0.0, -30.0 + bob), 11.5, 0.0, TAU, 24, palette.ink_deep, 1.6, true)
	if is_spectral:
		# Clean opera mask (NO vermilion per palette rule!)
		draw_line(pos + Vector2(-7.0, -32.0 + bob), pos + Vector2(-2.0, -30.5 + bob), palette.ink_deep, 1.8)
		draw_line(pos + Vector2(7.0, -32.0 + bob), pos + Vector2(2.0, -30.5 + bob), palette.ink_deep, 1.8)
		draw_circle(pos + Vector2(-4.5, -29.0 + bob), 1.6, palette.ink_deep)
		draw_circle(pos + Vector2(4.5, -29.0 + bob), 1.6, palette.ink_deep)
	else:
		draw_circle(pos + Vector2(-4.0 + facing * 1.5, -29.5 + bob), 1.7, palette.ink_deep)
		draw_circle(pos + Vector2(4.0 + facing * 1.5, -29.5 + bob), 1.7, palette.ink_deep)
	# Black scholar cap (小帽)
	draw_rect(Rect2(pos + Vector2(-16.0, -42.0 + bob), Vector2(32.0, 5.5)), palette.ink_deep)
	draw_colored_polygon(PackedVector2Array([
		pos + Vector2(-12.0, -42.0 + bob),
		pos + Vector2(-9.0, -51.0 + bob),
		pos + Vector2(9.0, -51.0 + bob),
		pos + Vector2(12.0, -42.0 + bob),
	]), palette.ink_slate)
	draw_line(pos + Vector2(-8.0, -49.0 + bob), pos + Vector2(8.0, -49.0 + bob), Color(palette.grey_mid, 0.5), 1.5)
	# Sheng swift sword
	if is_spectral and sim.face == "sheng":
		var sx := facing
		var hilt := pos + Vector2(14.0 * sx, -6.0 + bob)
		var tip := pos + Vector2(42.0 * sx, -44.0 + bob)
		draw_line(hilt, tip, palette.bone_bright, 3.2)
		draw_line(hilt, tip, palette.grey_light, 1.2)
		draw_line(hilt + Vector2(-5.0, -3.0), hilt + Vector2(5.0, 3.0), palette.amber, 3.5)
	# Hexagonal lantern held forward
	var lantern_pos := pos + Vector2(21.0 * facing, -12.0 + bob)
	var arm_start := pos + Vector2(10.0 * facing, -14.0 + bob)
	draw_line(arm_start, lantern_pos + Vector2(0.0, -15.0), palette.ink_slate, 3.5)
	if not sim.hazards.blackout_active:
		var flicker := 1.0 + sin(visual_time * 8.0) * 0.06
		draw_circle(lantern_pos, 48.0 * flicker, Color(palette.amber, 0.10))
		draw_circle(lantern_pos, 26.0 * flicker, Color(palette.amber_bright, 0.20))
	_draw_hex_lantern(lantern_pos, 1.05, -sim.player.vel.x * 0.015, palette)

# --- Expressive Enemies ---
func _draw_ghost_shape(pos: Vector2, s: float, anim_phase: float, body_col: Color, is_elite: bool, flash: bool, palette: Dictionary) -> void:
	var bob := sin(visual_time * 3.2 + anim_phase) * 3.5 * s
	var sway := sin(visual_time * 4.2 + anim_phase) * 5.0 * s
	var p := pos + Vector2(0.0, bob)
	# Soft outer mist halo
	draw_circle(p, 24.0 * s, Color(body_col, 0.14))
	# Flowing 3-tendril ghostly tail
	var tail := PackedVector2Array([
		p + Vector2(-15.0, 2.0) * s,
		p + Vector2(15.0, 2.0) * s,
		p + Vector2(14.0 + sway * 0.6, 18.0) * s,
		p + Vector2(7.0 + sway, 28.0) * s,
		p + Vector2(2.0 + sway * 0.4, 18.0) * s,
		p + Vector2(-2.0 + sway * 0.8, 30.0) * s,
		p + Vector2(-8.0 + sway * 0.3, 19.0) * s,
		p + Vector2(-14.0 + sway * 0.6, 25.0) * s,
	])
	draw_colored_polygon(tail, Color(body_col, 0.86))
	draw_circle(p, 16.5 * s, Color(body_col, 0.96))
	# Hollow eyes & wailing mouth
	var eye_col: Color = palette.vermilion_bright if (is_elite and not flash) else palette.ink_deep
	if is_elite and not flash:
		draw_circle(p + Vector2(-5.5, -2.5) * s, 5.5 * s, Color(palette.vermilion, 0.35))
		draw_circle(p + Vector2(5.5, -2.5) * s, 5.5 * s, Color(palette.vermilion, 0.35))
	draw_circle(p + Vector2(-5.5, -2.5) * s, 3.0 * s, eye_col)
	draw_circle(p + Vector2(5.5, -2.5) * s, 3.0 * s, eye_col)
	draw_circle(p + Vector2(0.0, 5.5) * s, 3.2 * s, palette.ink_deep)
	if is_elite:
		# Subtle vermilion seal mark below elite ghost (per style bible!)
		draw_circle(p + Vector2(0.0, 15.0) * s, 5.5 * s, palette.vermilion)
		draw_arc(p + Vector2(0.0, 15.0) * s, 5.5 * s, 0.0, TAU, 16, palette.vermilion_dark, 1.5, true)

func _draw_enemy(enemy: Dictionary, palette: Dictionary) -> void:
	var pos: Vector2 = enemy.pos
	var flash := float(enemy.hit_flash) > 0.0
	var anim_phase: float = float(enemy.get("anim_phase", 0.0))
	var is_elite := bool(enemy.get("is_elite", false))
	var kind: String = str(enemy.kind)
	match kind:
		"ghost", "elite_ghost":
			var s := 1.42 if is_elite else 1.0
			var col: Color = palette.bone_bright if flash else (palette.bone if is_elite else palette.sage_light)
			_draw_ghost_shape(pos, s, anim_phase, col, is_elite, flash, palette)
		"jiangshi", "elite_jiangshi":
			var s := 1.32 if is_elite else 1.0
			var hop := -absf(sin(visual_time * 4.5 + anim_phase)) * 7.0 * s
			var p := pos + Vector2(0.0, hop)
			draw_circle(pos + Vector2(0.0, 20.0 * s), 18.0 * s, Color(palette.ink_deep, 0.48))
			var robe_col: Color = palette.bone_bright if flash else (palette.ink_slate if is_elite else palette.grey_dark)
			var robe := PackedVector2Array([
				p + Vector2(-14.0, -18.0) * s,
				p + Vector2(14.0, -18.0) * s,
				p + Vector2(18.0, 20.0) * s,
				p + Vector2(-18.0, 20.0) * s,
			])
			draw_colored_polygon(robe, robe_col)
			draw_polyline(PackedVector2Array([robe[0], robe[1], robe[2], robe[3], robe[0]]), palette.ink_deep, 1.8)
			# Outstretched stiff arms
			draw_line(p + Vector2(-13.0, -10.0) * s, p + Vector2(-29.0, 1.0) * s, palette.grey_mid, 5.5 * s)
			draw_line(p + Vector2(13.0, -10.0) * s, p + Vector2(29.0, 1.0) * s, palette.grey_mid, 5.5 * s)
			# Pale greenish face
			draw_circle(p + Vector2(0.0, -25.0) * s, 11.0 * s, palette.bone_bright if flash else palette.sage_mid)
			# Qing official hat
			draw_rect(Rect2(p + Vector2(-18.0, -39.0) * s, Vector2(36.0, 6.0) * s), palette.ink_deep)
			draw_colored_polygon(PackedVector2Array([
				p + Vector2(-12.0, -39.0) * s,
				p + Vector2(-7.0, -49.0) * s,
				p + Vector2(7.0, -49.0) * s,
				p + Vector2(12.0, -39.0) * s,
			]), palette.ink_slate)
			# Eyes (vermilion for elite, dark ink for normal)
			var eye_col: Color = palette.vermilion_bright if is_elite else palette.ink_deep
			draw_circle(p + Vector2(-4.5, -26.0) * s, 2.2 * s, eye_col)
			draw_circle(p + Vector2(4.5, -26.0) * s, 2.2 * s, eye_col)
			if is_elite:
				# Vermilion circular chest seal (per style bible!)
				draw_circle(p + Vector2(0.0, 0.0), 8.5 * s, palette.vermilion)
				draw_arc(p + Vector2(0.0, 0.0), 8.5 * s, 0.0, TAU, 18, palette.vermilion_dark, 1.8, true)
			else:
				# Fluttering yellow forehead talisman (镇尸符)
				var flutter := sin(visual_time * 7.0 + anim_phase) * 2.0
				var tal := PackedVector2Array([
					p + Vector2(-3.5, -35.0) * s,
					p + Vector2(3.5, -35.0) * s,
					p + Vector2(4.0 + flutter, -18.0) * s,
					p + Vector2(-3.0 + flutter, -18.0) * s,
				])
				draw_colored_polygon(tal, palette.bone)
				draw_line(p + Vector2(0.0, -32.0) * s, p + Vector2(flutter * 0.5, -21.0) * s, palette.ink_deep, 1.4)
		"wisp_caster":
			var bob := sin(visual_time * 4.2 + anim_phase) * 4.0
			var p := pos + Vector2(0.0, bob)
			draw_circle(p, 22.0, Color(palette.sage_light, 0.16))
			draw_circle(p, 13.0, palette.bone_bright if flash else palette.sage_mid)
			draw_circle(p, 7.0, palette.bone_bright)
			for k in range(3):
				var oa := visual_time * 3.0 + anim_phase + float(k) * TAU / 3.0
				draw_circle(p + Vector2(cos(oa), sin(oa)) * 18.0, 3.2, palette.sage_light)
		"boss_magistrate":
			var hover := sin(visual_time * 2.4) * 4.5
			var p := pos + Vector2(0.0, hover)
			draw_circle(pos + Vector2(0.0, 34.0), 42.0, Color(palette.vermilion, 0.20 if sim.boss_phase >= 2 else 0.10))
			draw_arc(pos + Vector2(0.0, 34.0), 46.0, 0.0, TAU, 36, Color(palette.vermilion, 0.48), 2.2, true)
			var robe := PackedVector2Array([
				p + Vector2(-26.0, -34.0),
				p + Vector2(26.0, -34.0),
				p + Vector2(36.0, 34.0),
				p + Vector2(-36.0, 34.0),
			])
			draw_colored_polygon(robe, palette.bone_bright if flash else palette.ink_slate)
			draw_polyline(PackedVector2Array([robe[0], robe[1], robe[2], robe[3], robe[0]]), palette.bone, 2.2)
			draw_circle(p + Vector2(0.0, -4.0), 12.0, palette.vermilion)
			draw_arc(p + Vector2(0.0, -4.0), 12.0, 0.0, TAU, 20, palette.bone_bright, 1.5, true)
			draw_circle(p + Vector2(0.0, -46.0), 17.0, palette.bone_bright)
			draw_circle(p + Vector2(-6.0, -47.0), 3.2, palette.vermilion_bright)
			draw_circle(p + Vector2(6.0, -47.0), 3.2, palette.vermilion_bright)
			draw_rect(Rect2(p + Vector2(-24.0, -64.0), Vector2(48.0, 9.0)), palette.ink_deep)
			draw_rect(Rect2(p + Vector2(-15.0, -78.0), Vector2(30.0, 15.0)), palette.ink_slate)
			draw_line(p + Vector2(-42.0, -62.0), p + Vector2(-22.0, -62.0), palette.ink_deep, 5.0)
			draw_line(p + Vector2(22.0, -62.0), p + Vector2(42.0, -62.0), palette.ink_deep, 5.0)
			draw_line(p + Vector2(24.0, 10.0), p + Vector2(46.0, -48.0), palette.bone, 5.5)
			draw_circle(p + Vector2(48.0, -52.0), 6.5, palette.vermilion_bright)
			draw_rect(Rect2(p + Vector2(-42.0, -14.0), Vector2(18.0, 24.0)), palette.bone)
			draw_rect(Rect2(p + Vector2(-42.0, -14.0), Vector2(18.0, 24.0)), palette.ink_deep, false, 1.8)
			if sim.boss_quote != "" and sim.boss_quote_timer > 0.0:
				var qw := body_font.get_string_size(sim.boss_quote, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
				var qa := clampf(sim.boss_quote_timer / 0.6, 0.0, 1.0)
				draw_rect(Rect2(p + Vector2(-qw * 0.5 - 10.0, -112.0), Vector2(qw + 20.0, 26.0)), Color(palette.ink_deep, 0.88 * qa))
				draw_rect(Rect2(p + Vector2(-qw * 0.5 - 10.0, -112.0), Vector2(qw + 20.0, 26.0)), Color(palette.vermilion, 0.85 * qa), false, 1.5)
				draw_string(body_font, p + Vector2(-qw * 0.5, -94.0), sim.boss_quote, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(palette.bone_bright, qa))
		"punisher":
			draw_circle(pos + Vector2(0.0, 22.0), 22.0, Color(palette.vermilion, 0.16))
			draw_colored_polygon(PackedVector2Array([
				pos + Vector2(-14.0, -28.0),
				pos + Vector2(14.0, -28.0),
				pos + Vector2(20.0, 22.0),
				pos + Vector2(-20.0, 22.0),
			]), palette.bone_bright if flash else palette.bone)
			draw_circle(pos + Vector2(0.0, -35.0), 12.0, palette.bone_bright)
			draw_rect(Rect2(pos + Vector2(-11.0, -64.0), Vector2(22.0, 22.0)), palette.bone)
			draw_rect(Rect2(pos + Vector2(-18.0, -45.0), Vector2(36.0, 6.0)), palette.ink_deep)
			draw_line(pos + Vector2(-11.0, -52.0), pos + Vector2(11.0, -52.0), palette.vermilion, 4.0)
			draw_circle(pos + Vector2(-4.0, -36.0), 2.4, palette.vermilion)
			draw_circle(pos + Vector2(4.0, -36.0), 2.4, palette.vermilion)
			draw_line(pos + Vector2(-12.0, -12.0), pos + Vector2(-26.0, 8.0), palette.bone_dark, 5.0)
			draw_line(pos + Vector2(12.0, -12.0), pos + Vector2(26.0, 8.0), palette.bone_dark, 5.0)
	# Elite / Punisher HP bar (Boss has dedicated top HUD bar)
	if (is_elite or kind == "punisher") and kind != "boss_magistrate":
		var bw := 44.0
		var ratio := clampf(float(enemy.hp) / maxf(1.0, float(enemy.max_hp)), 0.0, 1.0)
		var bar_pos := pos + Vector2(-bw * 0.5, -58.0 if is_elite else -74.0)
		draw_rect(Rect2(bar_pos, Vector2(bw, 5.0)), palette.ink_deep)
		draw_rect(Rect2(bar_pos + Vector2(1.0, 1.0), Vector2((bw - 2.0) * ratio, 3.0)), palette.vermilion)

# --- Combat VFX ---
func _draw_combat_vfx(palette: Dictionary) -> void:
	for eb in sim.enemy_bullets:
		var bp: Vector2 = eb.pos
		var br: float = float(eb.radius)
		var bc: Color = eb.get("color", palette.sage_light)
		draw_circle(bp, br * 1.8, Color(bc, 0.22))
		draw_circle(bp, br, bc)
		draw_circle(bp, br * 0.45, palette.bone_bright)
	for projectile in sim.projectiles:
		var from: Vector2 = projectile.from
		var to: Vector2 = projectile.to
		var max_l: float = maxf(0.01, float(projectile.get("max_life", 0.22)))
		var t: float = 1.0 - clampf(float(projectile.life) / max_l, 0.0, 1.0)
		var head := from.lerp(to, minf(1.0, t * 1.45))
		var tail := from.lerp(to, maxf(0.0, t * 1.45 - 0.55))
		var alpha := 1.0 - t * 0.85
		draw_line(tail, head, Color(palette.amber, 0.35 * alpha), 9.0)
		draw_line(tail, head, Color(palette.amber_bright, 0.90 * alpha), 3.0)
		draw_circle(head, 11.0 * alpha, Color(palette.amber, 0.25 * alpha))
		draw_circle(head, 5.5 * alpha, Color(palette.amber_bright, alpha))
	for slash in sim.slashes:
		var pos: Vector2 = slash.pos
		var max_l: float = maxf(0.01, float(slash.get("max_life", 0.24)))
		var u: float = 1.0 - clampf(float(slash.life) / max_l, 0.0, 1.0)
		var alpha := (1.0 - u)
		var face_kind: String = str(slash.face)
		if face_kind == "flip":
			var r: float = float(slash.radius) * (0.35 + u * 0.85)
			draw_arc(pos, r, 0.0, TAU, 48, Color(palette.amber_bright, alpha * 0.85), 6.0 * alpha + 1.5, true)
			draw_arc(pos, r * 0.78, 0.0, TAU, 40, Color(palette.bone_bright, alpha * 0.7), 3.0 * alpha + 1.0, true)
		elif face_kind == "gonglu":
			var r: float = float(slash.radius) * (0.25 + u * 0.80)
			draw_arc(pos, r, 0.0, TAU, 44, Color(palette.amber, alpha * 0.85), 5.0 * alpha + 1.5, true)
		elif face_kind == "sheng":
			var ang: float = float(slash.get("angle", 0.0))
			var r: float = float(slash.radius) * (0.75 + u * 0.35)
			draw_arc(pos, r, ang - 1.15, ang + 1.15, 22, Color(palette.bone_bright, alpha * 0.95), 7.5 * alpha + 1.5, true)
			draw_arc(pos, r * 0.82, ang - 0.9, ang + 0.9, 18, Color(palette.ink_slate, alpha * 0.65), 3.0, true)
		else:
			var ang: float = float(slash.get("angle", 0.0)) + u * 2.8
			var r: float = float(slash.radius) * (0.82 + u * 0.22)
			draw_arc(pos, r, ang, ang + PI * 1.45, 32, Color(palette.bone_bright, alpha * 0.88), 8.0 * alpha + 2.0, true)
			draw_arc(pos, r * 0.86, ang + PI, ang + PI * 2.3, 28, Color(palette.bone, alpha * 0.62), 5.0 * alpha + 1.0, true)
	for pt in sim.particles:
		var max_l: float = maxf(0.01, float(pt.get("max_life", 0.35)))
		var alpha := clampf(float(pt.life) / max_l, 0.0, 1.0)
		var sz: float = float(pt.get("size", 3.5)) * (0.5 + alpha * 0.8)
		draw_circle(pt.pos, sz, Color(pt.color, alpha * 0.85))
	for floater in sim.floaters:
		var pos: Vector2 = floater.pos
		var max_l: float = maxf(0.01, float(floater.get("max_life", 0.68)))
		var alpha := clampf(float(floater.life) / max_l, 0.0, 1.0)
		var fsize := int(16.0 * float(floater.get("scale", 1.0)))
		var col: Color = floater.get("color", palette.bone_bright)
		draw_string(number_font, pos + Vector2(1.0, 1.0), str(floater.text), HORIZONTAL_ALIGNMENT_CENTER, -1.0, fsize, Color(palette.ink_deep, alpha * 0.85))
		draw_string(number_font, pos, str(floater.text), HORIZONTAL_ALIGNMENT_CENTER, -1.0, fsize, Color(col, alpha))

func _draw_moon(palette: Dictionary, viewport_size: Vector2) -> void:
	var moon_pos := viewport_size * Vector2(0.76, 0.16) - sim.camera * 0.035
	draw_circle(moon_pos, 96.0, Color(palette.bone, 0.05))
	draw_circle(moon_pos, 64.0, Color(palette.bone, 0.13))
	draw_circle(moon_pos, 46.0, Color(palette.bone, 0.78))
	draw_circle(moon_pos + Vector2(15.0, -7.0), 12.0, Color(palette.grey_mid, 0.20))
	draw_circle(moon_pos + Vector2(-12.0, 14.0), 8.0, Color(palette.grey_mid, 0.16))

func _draw_foreground_mist(palette: Dictionary, viewport_size: Vector2) -> void:
	var mist_alpha := 0.022 + sim.realm_blend * 0.016
	for i in range(6):
		var x := fmod(visual_time * (10.0 + float(i) * 1.8) + float(i) * 270.0, viewport_size.x + 520.0) - 260.0
		var y := viewport_size.y * (0.22 + float(i % 3) * 0.28)
		draw_circle(Vector2(x, y), 165.0 + float(i) * 14.0, Color(palette.grey_light, mist_alpha))

func set_light_uniforms() -> void:
	var overlay = get_parent().get_node_or_null("ScreenLayer/LightOverlay")
	if overlay == null or overlay.material == null:
		return
	var mat: ShaderMaterial = overlay.material
	var viewport_size := get_viewport_rect().size
	if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:
		return
	mat.set_shader_parameter("viewport_size", viewport_size)
	mat.set_shader_parameter("time_sec", visual_time)
	if sim.phase == sim.Phase.TITLE:
		mat.set_shader_parameter("is_title", 1.0)
		mat.set_shader_parameter("light_center", Vector2(0.72, 0.44))
		mat.set_shader_parameter("light_radius", 340.0)
		return
	mat.set_shader_parameter("is_title", 0.0)
	var cam_pos: Vector2 = sim.camera + sim.shake_offset
	var light_world: Vector2 = sim.hazards.frozen_light if sim.hazards.blackout_active else sim.player.pos
	var light_center: Vector2 = light_world - cam_pos + viewport_size * 0.5
	var light_radius: float = sim.get_current_light_radius() + 15.0
	var blackout_warn_flicker := 0.0
	if (not sim.hazards.blackout_active) and sim.hazards.blackout_cycle <= 2.5:
		blackout_warn_flicker = sin(visual_time * 26.0) * 18.0
	mat.set_shader_parameter("light_center", light_center / viewport_size)
	mat.set_shader_parameter("light_radius", maxf(90.0, light_radius + blackout_warn_flicker))
	mat.set_shader_parameter("darkness", 0.84 if sim.hazards.blackout_active else (0.54 if sim.realm == "mortal" else 0.66))
	mat.set_shader_parameter("fog_amount", 0.18 if sim.realm == "mortal" else 0.28)
	mat.set_shader_parameter("realm_blend", sim.realm_blend)
	mat.set_shader_parameter("flip_wave", sim.flip_wave)
	mat.set_shader_parameter("danger_pulse", sim.danger_pulse)
	# Pass up to 4 nearest visible cold stone-lantern lights to shader
	var slots := [Vector4(-2, -2, 0, 0), Vector4(-2, -2, 0, 0), Vector4(-2, -2, 0, 0), Vector4(-2, -2, 0, 0)]
	var idx := 0
	for cl in sim.cold_lights:
		if idx >= 4:
			break
		var screen_pos: Vector2 = cl.pos - cam_pos + viewport_size * 0.5
		if screen_pos.x >= -180.0 and screen_pos.x <= viewport_size.x + 180.0 and screen_pos.y >= -180.0 and screen_pos.y <= viewport_size.y + 180.0:
			slots[idx] = Vector4(screen_pos.x / viewport_size.x, screen_pos.y / viewport_size.y, float(cl.radius), 0.72)
			idx += 1
	mat.set_shader_parameter("cold_light_0", slots[0])
	mat.set_shader_parameter("cold_light_1", slots[1])
	mat.set_shader_parameter("cold_light_2", slots[2])
	mat.set_shader_parameter("cold_light_3", slots[3])

func capture_screenshot(path: String) -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var error := image.save_png(path)
	if error != OK:
		push_error("screenshot save failed: " + error_string(error))
