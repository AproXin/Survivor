extends Node2D
class_name InkMain

signal hud_changed(snapshot: Dictionary)
signal level_up(choices: Array)
signal run_finished(summary: Dictionary)

enum Phase { TITLE, PLAYING, PAUSED, LEVELUP, ENDED }

const SAVE_PATH := "user://ink_night_save.json"

var phase: int = Phase.TITLE
var run_mode := "prototype" # "prototype" (60s classic) or "full_vigil" (9-rule + 16-upgrade + Boss)
var selected_mode := "full_vigil"
var lang := "zh"
var realm := "mortal"
var face := "sheng"
var time_sec := 0.0
var kills := 0
var coins := 0
var level := 1
var xp := 0.0
var xp_to_next := float(InkData.XP_PER_LEVEL)
var flip_cooldown := 0.0
var flip_freeze := 0.0
var attack_timer := 0.0
var invuln := 0.0
var muted := false
var audio_players: Dictionary = {}
var violations := 0
var spawn_timer := 0.0
var hud_timer := 0.0
var ended_victory := false
var rng := RandomNumberGenerator.new()

# Camera & visual juice state
var camera := Vector2.ZERO
var shake_trauma := 0.0
var shake_offset := Vector2.ZERO
var realm_blend := 0.0
var flip_wave := 0.0
var danger_pulse := 0.0
var elite_spawned := false
var first_elite_killed := false
var intro_1_done := false
var boss_spawned := false
var boss_phase := 0
var boss_defeated := false
var boss_quote := ""
var boss_quote_timer := 0.0
var first_flip_done := false
var first_break_done := false
var dawn_whisper_done := false
var subtitle_text := ""
var subtitle_elapsed := 0.0
var subtitle_total := 4.7
var alert_text := ""
var alert_timer := 0.0
var active_cue := ""
var bell_warned_rules: Dictionary = {}
var xp_chime_index := 0
var gonglu_timer := 5.0
var shadow_haste_timer := 0.0
var encore_available := false
var rolled_choices: Array = []

var save_data := {
	"coins": 0,
	"best_time": 0.0,
	"best_kills": 0,
	"total_runs": 0,
	"victories": 0,
	"meta_levels": {"vitality": 0, "swiftness": 0, "wick_power": 0, "spirit_pouch": 0},
}

var player := {
	"pos": Vector2.ZERO,
	"vel": Vector2.ZERO,
	"hp": 85.0,
	"max_hp": 85.0,
	"fuel": 100.0,
	"facing": 1.0,
	"walk": 0.0,
	"pickup_radius": 68.0,
	"speed_bonus": 0.0,
	"speed_mult": 1.0,
	"damage_mult": 1.0,
	"invuln_bonus": 0.0,
	"sheng_damage_bonus": 0.0,
	"sheng_interval_bonus": 0.0,
	"dan_damage_bonus": 0.0,
	"dan_radius_bonus": 0.0,
	"dan_interval_bonus": 0.0,
	"lantern_damage_bonus": 0.0,
	"lantern_range_bonus": 0.0,
	"global_damage_bonus": 0.0,
	"spectral_damage_bonus": 0.0,
	"flip_blast_bonus": 0.0,
	"flip_invuln_sec": 0.0,
	"flip_cooldown_reduce": 0.0,
	"light_mortal_bonus": 0.0,
	"light_spectral_bonus": 0.0,
	"fuel_drain_mult": 1.0,
	"taboo_grace_bonus": 0.0,
	"punisher_damage_reduce": 0.0,
	"punisher_slow_bonus": 0.0,
	"spectral_xp_mult": 1.0,
	"regen": 0.0,
	"regen_timer": 0.0,
}

var enemies: Array[Dictionary] = []
var enemy_bullets: Array[Dictionary] = []
var boss_aoes: Array[Dictionary] = []
var gems: Array[Dictionary] = []
var projectiles: Array[Dictionary] = []
var particles: Array[Dictionary] = []
var slashes: Array[Dictionary] = []
var floaters: Array[Dictionary] = []
var afterimages: Array[Dictionary] = []
var upgrade_levels: Dictionary = {}
var rules: Array = InkData.fixed_rules()
var cold_lights: Array[Dictionary] = []
var landmarks := {
	"spirit_gate": Vector2(-420.0, 360.0),
	"dark_pond": Vector2(440.0, 340.0),
	"ruined_wall": Vector2(-440.0, -340.0),
	"blank_stele": Vector2(0.0, -420.0),
}
var hazards := {
	"shadow_timer": 0.0,
	"shadow_zones": [],
	"white_stranger": {"active": false, "pos": Vector2.ZERO, "timer": 0.0, "line": ""},
	"blackout_active": false,
	"blackout_remaining": 0.0,
	"blackout_cycle": 28.0,
	"blackout_warned": false,
	"frozen_light": Vector2.ZERO,
	"frozen_radius": 235.0,
	"backward_timer": 0.0,
	"name_call": {"active": false, "pos": Vector2.ZERO, "timer": 14.0, "radius": 95.0},
	"door_knock": {"active": false, "timer": 18.0},
	"water_gong": {"active": false, "timer": 21.0},
	"stele_timer": 0.0,
	"wall_cooldown": 0.0,
}

@onready var world_view: InkRenderer = $WorldView
@onready var hud: InkHud = $ScreenLayer/Hud

func _ready() -> void:
	rng.randomize()
	_load_save()
	_ensure_input_actions()
	_reset_run_state()
	world_view.setup(self)
	_sync_cold_lights_from_scenery()
	hud.setup(self)
	_setup_audio()
	hud_changed.connect(hud.show_snapshot)
	level_up.connect(hud.show_level_up)
	run_finished.connect(hud.show_result)
	_emit_hud()

func _process(delta: float) -> void:
	step(delta)
	_update_visual_juice(delta)
	hud_timer += delta
	if hud_timer >= 0.08:
		hud_timer = 0.0
		_emit_hud()

# --- Persistent Save & Meta-Progression ---
func _load_save() -> void:
	if DisplayServer.get_name() == "headless":
		return
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		return
	var parsed = JSON.parse_string(f.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var d: Dictionary = parsed
	save_data.coins = maxi(0, int(d.get("coins", 0)))
	save_data.best_time = maxf(0.0, float(d.get("best_time", 0.0)))
	save_data.best_kills = maxi(0, int(d.get("best_kills", 0)))
	save_data.total_runs = maxi(0, int(d.get("total_runs", 0)))
	save_data.victories = maxi(0, int(d.get("victories", 0)))
	var ml: Dictionary = d.get("meta_levels", {})
	for key in ["vitality", "swiftness", "wick_power", "spirit_pouch"]:
		save_data.meta_levels[key] = clampi(int(ml.get(key, 0)), 0, 4)

func _persist_save() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		return
	f.store_string(JSON.stringify(save_data))

func buy_meta_upgrade(id: String) -> bool:
	var defs := InkData.meta_upgrades()
	for def in defs:
		if str(def.id) == id:
			var cur_lvl: int = int(save_data.meta_levels.get(id, 0))
			var max_lvl: int = int(def.max_level)
			if cur_lvl >= max_lvl:
				return false
			var costs: Array = def.costs
			var cost: int = int(costs[cur_lvl])
			if int(save_data.coins) < cost:
				return false
			save_data.coins = int(save_data.coins) - cost
			save_data.meta_levels[id] = cur_lvl + 1
			_persist_save()
			play_sfx("level")
			_emit_hud()
			return true
	return false

func _apply_meta_bonuses() -> void:
	if DisplayServer.get_name() == "headless" and run_mode == "prototype":
		return
	var ml: Dictionary = save_data.meta_levels
	var vit := int(ml.get("vitality", 0))
	var swf := int(ml.get("swiftness", 0))
	var wck := int(ml.get("wick_power", 0))
	var pch := int(ml.get("spirit_pouch", 0))
	player.max_hp = float(InkData.player_base().max_hp) + float(vit) * 15.0
	player.hp = player.max_hp
	player.speed_mult = 1.0 + float(swf) * 0.07
	player.damage_mult = 1.0 + float(wck) * 0.10
	player.pickup_radius = float(InkData.player_base().pickup_radius) + float(pch) * 22.0

func _sync_cold_lights_from_scenery() -> void:
	cold_lights.clear()
	if world_view == null:
		return
	for prop in world_view.scenery:
		if str(prop.get("kind", "")) == "stone_lantern":
			var p: Vector2 = prop.pos
			if p.length() >= 280.0:
				cold_lights.append({"pos": p, "radius": 135.0})

func _update_visual_juice(delta: float) -> void:
	var target_blend := 1.0 if realm == "spectral" else 0.0
	realm_blend = lerpf(realm_blend, target_blend, 1.0 - exp(-7.5 * delta))
	if flip_wave > 0.0:
		flip_wave = minf(1.0, flip_wave + delta * 1.9)
		if flip_wave >= 1.0:
			flip_wave = 0.0
	if shake_trauma > 0.0:
		shake_trauma = maxf(0.0, shake_trauma - delta * 2.6)
		var mag := shake_trauma * shake_trauma * 13.0
		shake_offset = Vector2(rng.randf_range(-mag, mag), rng.randf_range(-mag, mag))
	else:
		shake_offset = Vector2.ZERO
	var target_danger := 0.0
	if phase == Phase.PLAYING:
		for rule in rules:
			var prog: float = float(rule.get("progress", 0.0))
			if prog > 0.05:
				target_danger = maxf(target_danger, prog * 0.85)
		if hazards.white_stranger.active:
			var p_pos: Vector2 = player.pos
			var w_pos: Vector2 = hazards.white_stranger.pos
			var d: float = p_pos.distance_to(w_pos)
			if d < 175.0:
				target_danger = maxf(target_danger, clampf((175.0 - d) / 85.0, 0.0, 1.0) * 0.75)
		if hazards.blackout_active and not is_in_light(player.pos):
			target_danger = 0.9
		if invuln > 0.2:
			target_danger = maxf(target_danger, 0.7)
	danger_pulse = lerpf(danger_pulse, target_danger, 1.0 - exp(-9.0 * delta))
	if subtitle_text != "":
		subtitle_elapsed += delta
		if subtitle_elapsed >= subtitle_total:
			subtitle_text = ""
			subtitle_elapsed = 0.0
	if alert_timer > 0.0:
		alert_timer = maxf(0.0, alert_timer - delta)
		if alert_timer <= 0.0:
			alert_text = ""
	if boss_quote_timer > 0.0:
		boss_quote_timer = maxf(0.0, boss_quote_timer - delta)
		if boss_quote_timer <= 0.0:
			boss_quote = ""

func _subtitle_alpha() -> float:
	if subtitle_text == "":
		return 0.0
	if subtitle_elapsed < 0.3:
		return clampf(subtitle_elapsed / 0.3, 0.0, 1.0)
	if subtitle_elapsed <= 4.3:
		return 1.0
	return clampf((subtitle_total - subtitle_elapsed) / 0.4, 0.0, 1.0)

func _push_subtitle(text: String, duration: float = 4.7) -> void:
	subtitle_text = text
	subtitle_elapsed = 0.0
	subtitle_total = maxf(1.0, duration)

func _push_narrative(key: String) -> void:
	var entry: Dictionary = InkData.NARRATIVE_SUBTITLES.get(key, {})
	if entry.is_empty():
		return
	_push_subtitle(str(entry.get(lang, entry.get("zh", ""))), 4.7)

func _push_alert(zh_text: String, en_text: String, duration: float = 3.2) -> void:
	alert_text = zh_text if lang == "zh" else en_text
	alert_timer = duration

func toggle_lang() -> void:
	lang = "en" if lang == "zh" else "zh"
	_emit_hud()

func _add_trauma(amount: float) -> void:
	shake_trauma = minf(1.0, shake_trauma + amount)

func _ensure_input_actions() -> void:
	var bindings := {
		"move_left": [KEY_A, KEY_LEFT],
		"move_right": [KEY_D, KEY_RIGHT],
		"move_up": [KEY_W, KEY_UP],
		"move_down": [KEY_S, KEY_DOWN],
		"flip": [KEY_SPACE],
		"face": [KEY_Q],
		"pause": [KEY_ESCAPE],
		"confirm": [KEY_ENTER, KEY_KP_ENTER],
		"upgrade_1": [KEY_1, KEY_KP_1],
		"upgrade_2": [KEY_2, KEY_KP_2],
		"upgrade_3": [KEY_3, KEY_KP_3],
	}
	for raw_action in bindings:
		var action := StringName(raw_action)
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for key in bindings[raw_action]:
			var event := InputEventKey.new()
			event.physical_keycode = int(key)
			if not InputMap.action_has_event(action, event):
				InputMap.action_add_event(action, event)
	var joy_buttons := {
		"flip": JOY_BUTTON_A,
		"face": JOY_BUTTON_X,
		"pause": JOY_BUTTON_START,
		"confirm": JOY_BUTTON_A,
	}
	for raw_action in joy_buttons:
		var action := StringName(raw_action)
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		var event := InputEventJoypadButton.new()
		event.button_index = int(joy_buttons[raw_action])
		if not InputMap.action_has_event(action, event):
			InputMap.action_add_event(action, event)
	var joy_axes := {
		"move_left": {"axis": JOY_AXIS_LEFT_X, "value": -1.0},
		"move_right": {"axis": JOY_AXIS_LEFT_X, "value": 1.0},
		"move_up": {"axis": JOY_AXIS_LEFT_Y, "value": -1.0},
		"move_down": {"axis": JOY_AXIS_LEFT_Y, "value": 1.0},
	}
	for raw_action in joy_axes:
		var action := StringName(raw_action)
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		InputMap.action_set_deadzone(action, 0.2)
		var event := InputEventJoypadMotion.new()
		event.axis = int(joy_axes[raw_action].axis)
		event.axis_value = float(joy_axes[raw_action].value)
		if not InputMap.action_has_event(action, event):
			InputMap.action_add_event(action, event)

func _reset_run_state() -> void:
	phase = Phase.TITLE
	realm = "mortal"
	face = "sheng"
	time_sec = 0.0
	kills = 0
	coins = 0
	level = 1
	xp = 0.0
	xp_to_next = float(InkData.XP_PER_LEVEL)
	flip_cooldown = 0.0
	flip_freeze = 0.0
	attack_timer = 0.0
	invuln = 0.0
	violations = 0
	spawn_timer = 0.0
	ended_victory = false
	shake_trauma = 0.0
	shake_offset = Vector2.ZERO
	realm_blend = 0.0
	flip_wave = 0.0
	danger_pulse = 0.0
	elite_spawned = false
	first_elite_killed = false
	intro_1_done = false
	boss_spawned = false
	boss_phase = 0
	boss_defeated = false
	boss_quote = ""
	boss_quote_timer = 0.0
	first_flip_done = false
	first_break_done = false
	dawn_whisper_done = false
	subtitle_text = ""
	subtitle_elapsed = 0.0
	alert_text = ""
	alert_timer = 0.0
	active_cue = ""
	bell_warned_rules.clear()
	gonglu_timer = 5.0
	shadow_haste_timer = 0.0
	encore_available = false
	rolled_choices = []
	player = {
		"pos": Vector2.ZERO,
		"vel": Vector2.ZERO,
		"hp": 85.0,
		"max_hp": 85.0,
		"fuel": 100.0,
		"facing": 1.0,
		"walk": 0.0,
		"pickup_radius": 68.0,
		"speed_bonus": 0.0,
		"speed_mult": 1.0,
		"damage_mult": 1.0,
		"invuln_bonus": 0.0,
		"sheng_damage_bonus": 0.0,
		"sheng_interval_bonus": 0.0,
		"dan_damage_bonus": 0.0,
		"dan_radius_bonus": 0.0,
		"dan_interval_bonus": 0.0,
		"lantern_damage_bonus": 0.0,
		"lantern_range_bonus": 0.0,
		"global_damage_bonus": 0.0,
		"spectral_damage_bonus": 0.0,
		"flip_blast_bonus": 0.0,
		"flip_invuln_sec": 0.0,
		"flip_cooldown_reduce": 0.0,
		"light_mortal_bonus": 0.0,
		"light_spectral_bonus": 0.0,
		"fuel_drain_mult": 1.0,
		"taboo_grace_bonus": 0.0,
		"punisher_damage_reduce": 0.0,
		"punisher_slow_bonus": 0.0,
		"spectral_xp_mult": 1.0,
		"regen": 0.0,
		"regen_timer": 0.0,
	}
	enemies.clear()
	enemy_bullets.clear()
	boss_aoes.clear()
	gems.clear()
	projectiles.clear()
	particles.clear()
	slashes.clear()
	floaters.clear()
	afterimages.clear()
	upgrade_levels.clear()
	for up in InkData.full_upgrade_pool():
		upgrade_levels[str(up.id)] = 0
	rules = InkData.fixed_rules()
	hazards = {
		"shadow_timer": 0.0,
		"shadow_zones": [],
		"white_stranger": {"active": false, "pos": Vector2.ZERO, "timer": 0.0, "line": ""},
		"blackout_active": false,
		"blackout_remaining": 0.0,
		"blackout_cycle": 28.0,
		"blackout_warned": false,
		"frozen_light": Vector2.ZERO,
		"frozen_radius": 235.0,
		"backward_timer": 0.0,
		"name_call": {"active": false, "pos": Vector2.ZERO, "timer": 14.0, "radius": 95.0},
		"door_knock": {"active": false, "timer": 18.0},
		"water_gong": {"active": false, "timer": 21.0},
		"stele_timer": 0.0,
		"wall_cooldown": 0.0,
	}
	camera = Vector2.ZERO

func start_run() -> void:
	run_mode = "prototype"
	_reset_run_state()
	_apply_meta_bonuses()
	phase = Phase.PLAYING
	setup_taboos()
	_push_narrative("intro_0")
	_emit_hud()

func start_full_vigil() -> void:
	run_mode = "full_vigil"
	_reset_run_state()
	_apply_meta_bonuses()
	phase = Phase.PLAYING
	setup_random_taboos()
	_push_narrative("intro_0")
	_emit_hud()

func start_selected_mode() -> void:
	if selected_mode == "full_vigil":
		start_full_vigil()
	else:
		start_run()

func toggle_selected_mode() -> void:
	selected_mode = "prototype" if selected_mode == "full_vigil" else "full_vigil"
	_emit_hud()

func return_to_title() -> void:
	_reset_run_state()
	_emit_hud()

func toggle_pause() -> void:
	if phase == Phase.PLAYING:
		phase = Phase.PAUSED
	elif phase == Phase.PAUSED:
		phase = Phase.PLAYING
	_emit_hud()

func has_rule(rule_id: String) -> bool:
	for rule in rules:
		if str(rule.id) == rule_id:
			return true
	return false

func _set_rule_progress(rule_id: String, value: float) -> void:
	for rule in rules:
		if str(rule.id) == rule_id:
			rule.progress = clampf(value, 0.0, 1.0)
			return

func step(dt: float) -> void:
	if phase != Phase.PLAYING:
		return
	if run_mode == "prototype":
		time_sec = minf(time_sec + dt, InkData.RUN_DURATION)
	else:
		time_sec += dt
	flip_cooldown = maxf(0.0, flip_cooldown - dt)
	flip_freeze = maxf(0.0, flip_freeze - dt)
	invuln = maxf(0.0, invuln - dt)
	attack_timer = maxf(0.0, attack_timer - dt)
	shadow_haste_timer = maxf(0.0, shadow_haste_timer - dt)
	var drain_rate: float = 1.25 if run_mode == "prototype" else 0.72
	player.fuel = maxf(0.0, player.fuel - dt * drain_rate * float(player.fuel_drain_mult))
	if player.fuel <= 0.0:
		damage_player(999.0)
		return
	var move := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var base_spd: float = InkData.player_base().mortal_speed if realm == "mortal" else InkData.player_base().spectral_speed
	var haste_mult: float = 1.40 if shadow_haste_timer > 0.0 else 1.0
	var speed: float = (base_spd + float(player.speed_bonus)) * float(player.speed_mult) * haste_mult
	player.vel = move * speed
	player.pos += player.vel * dt
	player.pos.x = clampf(player.pos.x, -InkData.WORLD_HALF, InkData.WORLD_HALF)
	player.pos.y = clampf(player.pos.y, -InkData.WORLD_HALF, InkData.WORLD_HALF)
	if absf(move.x) > 0.01:
		player.facing = signf(move.x)
	if move.length_squared() > 0.01:
		player.walk += speed * dt
	var look_ahead: Vector2 = move * 34.0
	camera = camera.lerp(player.pos + look_ahead, 1.0 - exp(-7.5 * dt))
	update_taboos(dt)
	if flip_freeze <= 0.0:
		update_combat(dt)
	update_waves(dt)
	update_enemies(dt)
	update_enemy_bullets(dt)
	update_boss_aoes(dt)
	update_effects(dt)
	update_pickups(dt)
	if realm == "mortal" and float(player.regen) > 0.0:
		player.regen_timer += dt
		if player.regen_timer >= 4.0:
			player.regen_timer = 0.0
			player.hp = minf(player.max_hp, player.hp + player.regen)
			player.fuel = minf(100.0, player.fuel + 1.5)
	if not intro_1_done and time_sec >= 6.0:
		intro_1_done = true
		_push_narrative("intro_1")
	if run_mode == "prototype":
		if time_sec >= InkData.RUN_DURATION:
			finish_run(true)
	else:
		if not boss_spawned and time_sec >= InkData.FULL_VIGIL_BOSS_TIME:
			spawn_boss()

func get_boss_snapshot() -> Dictionary:
	for enemy in enemies:
		if bool(enemy.get("is_boss", false)):
			return {
				"active": true,
				"name": "纸扎判官",
				"hp": float(enemy.hp),
				"max_hp": float(enemy.max_hp),
				"phase": boss_phase,
			}
	return {"active": false}

func get_snapshot() -> Dictionary:
	return {
		"phase": phase,
		"lang": lang,
		"run_mode": run_mode,
		"selected_mode": selected_mode,
		"realm": realm,
		"face": face,
		"hp": player.hp,
		"max_hp": player.max_hp,
		"fuel": player.fuel,
		"level": level,
		"time": time_sec,
		"xp": xp,
		"xp_to_next": xp_to_next,
		"kills": kills,
		"coins": coins,
		"bank_coins": int(save_data.coins),
		"meta_levels": save_data.meta_levels.duplicate(true),
		"save_stats": {
			"best_time": float(save_data.best_time),
			"best_kills": int(save_data.best_kills),
			"total_runs": int(save_data.total_runs),
			"victories": int(save_data.victories),
		},
		"flip_cooldown": flip_cooldown,
		"flip_cooldown_max": maxf(1.2, float(InkData.player_base().flip_cooldown_sec) - float(player.flip_cooldown_reduce)),
		"rules": rules.duplicate(true),
		"violations": violations,
		"muted": muted,
		"upgrade_levels": upgrade_levels.duplicate(true),
		"blackout_active": hazards.blackout_active,
		"blackout_remaining": hazards.blackout_remaining,
		"blackout_warning": has_rule("blackout") and (not hazards.blackout_active) and hazards.blackout_cycle <= 2.5,
		"shadow_progress": clampf(hazards.shadow_timer, 0.0, 1.0),
		"boss": get_boss_snapshot(),
		"encore_available": encore_available,
		"active_cue": active_cue,
		"alert": alert_text,
		"alert_alpha": clampf(alert_timer / 0.5, 0.0, 1.0),
		"subtitle": subtitle_text,
		"subtitle_alpha": _subtitle_alpha(),
	}

func _emit_hud() -> void:
	hud_changed.emit(get_snapshot())

func spawn_enemy(kind: String, pos: Vector2) -> int:
	var archetype := InkData.enemy(kind)
	var spawn_pos := pos
	spawn_pos.x = clampf(spawn_pos.x, -InkData.WORLD_HALF, InkData.WORLD_HALF)
	spawn_pos.y = clampf(spawn_pos.y, -InkData.WORLD_HALF, InkData.WORLD_HALF)
	var spd: float = float(archetype.speed)
	var dmg: float = float(archetype.damage)
	if kind == "punisher":
		spd = maxf(80.0, spd - float(player.punisher_slow_bonus))
		dmg = maxf(6.0, dmg - float(player.punisher_damage_reduce))
	var enemy := {
		"kind": kind,
		"pos": spawn_pos,
		"hp": float(archetype.hp),
		"max_hp": float(archetype.hp),
		"speed": spd,
		"damage": dmg,
		"xp": float(archetype.xp),
		"coins": int(archetype.get("coins", 0)),
		"radius": float(archetype.radius),
		"is_elite": bool(archetype.get("is_elite", false)),
		"is_boss": bool(archetype.get("is_boss", false)),
		"hit_flash": 0.0,
		"knockback": Vector2.ZERO,
		"anim_phase": rng.randf_range(0.0, TAU),
		"cast_timer": rng.randf_range(1.6, 2.8),
		"aoe_timer": 3.4,
	}
	enemies.append(enemy)
	return enemies.size() - 1

func spawn_punisher() -> int:
	var angle := rng.randf_range(0.0, TAU)
	var p_pos: Vector2 = player.pos
	var pos: Vector2 = p_pos + Vector2(cos(angle), sin(angle)) * 420.0
	_add_trauma(0.45)
	return spawn_enemy("punisher", pos)

func spawn_boss() -> int:
	boss_spawned = true
	boss_phase = 1
	var p_pos: Vector2 = player.pos
	var pos: Vector2 = p_pos + Vector2(290.0, -70.0)
	_add_trauma(0.75)
	play_sfx("violation")
	boss_quote = InkData.BOSS_LINES.intro
	boss_quote_timer = 4.8
	_push_alert("子夜三更 · 纸扎判官亲临点卯！", "Midnight Third Watch: The Paper Judge Appears!", 3.8)
	_push_narrative("boss_spawn")
	var idx := spawn_enemy("boss_magistrate", pos)
	_emit_hud()
	return idx

func find_nearest_enemy(max_range: float) -> int:
	var best_index := -1
	var best_distance := max_range
	var p_pos: Vector2 = player.pos
	for i in range(enemies.size()):
		var distance: float = p_pos.distance_to(enemies[i].pos)
		if distance <= best_distance:
			best_distance = distance
			best_index = i
	return best_index

func find_nearest_enemies(max_range: float, max_count: int) -> Array[int]:
	var pairs: Array[Dictionary] = []
	var p_pos: Vector2 = player.pos
	for i in range(enemies.size()):
		var d: float = p_pos.distance_to(enemies[i].pos)
		if d <= max_range:
			pairs.append({"idx": i, "d": d})
	pairs.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a.d) < float(b.d))
	var out: Array[int] = []
	for i in range(mini(max_count, pairs.size())):
		out.append(int(pairs[i].idx))
	return out

func update_waves(dt: float) -> void:
	if not elite_spawned and time_sec >= 30.0 and enemies.size() < 98:
		elite_spawned = true
		var angle := rng.randf_range(0.0, TAU)
		var p_pos: Vector2 = player.pos
		var pos: Vector2 = p_pos + Vector2(cos(angle), sin(angle)) * 470.0
		var elite_kind := "elite_ghost" if rng.randf() < 0.5 else "elite_jiangshi"
		spawn_enemy(elite_kind, pos)
	spawn_timer -= dt
	if spawn_timer > 0.0 or enemies.size() >= 100:
		return
	spawn_timer = maxf(0.45, 1.38 - time_sec * 0.011)
	var count := 1 + int(time_sec / 25.0)
	var p_pos: Vector2 = player.pos
	for i in range(count):
		var angle := rng.randf_range(0.0, TAU)
		var radius := rng.randf_range(470.0, 620.0)
		var pos: Vector2 = p_pos + Vector2(cos(angle), sin(angle)) * radius
		var roll := rng.randf()
		var kind := "ghost"
		if run_mode == "full_vigil" and time_sec >= 18.0 and roll > 0.82:
			kind = "wisp_caster"
		elif roll > 0.70:
			kind = "jiangshi"
		spawn_enemy(kind, pos)

func _spawn_ink_burst(pos: Vector2, color: Color, count: int, speed_scale: float = 1.0) -> void:
	if particles.size() > 150:
		return
	for i in range(count):
		var a := rng.randf_range(0.0, TAU)
		var spd := rng.randf_range(38.0, 125.0) * speed_scale
		particles.append({
			"pos": pos + Vector2(rng.randf_range(-6.0, 6.0), rng.randf_range(-6.0, 6.0)),
			"vel": Vector2(cos(a), sin(a)) * spd,
			"life": rng.randf_range(0.22, 0.48),
			"max_life": 0.48,
			"size": rng.randf_range(2.2, 5.2),
			"color": color,
		})

func damage_enemy(index: int, amount: float) -> void:
	if index < 0 or index >= enemies.size():
		return
	var enemy := enemies[index]
	enemy.hp -= amount
	enemy.hit_flash = 0.14
	var p_pos: Vector2 = player.pos
	var away: Vector2 = enemy.pos - p_pos
	if away.length_squared() > 0.01:
		var kb_scale := 0.25 if bool(enemy.get("is_boss", false)) else (0.55 if bool(enemy.get("is_elite", false)) else 1.0)
		enemy.knockback = away.normalized() * 145.0 * kb_scale
	var pal := InkData.palette()
	var is_heavy := amount >= 20.0
	floaters.append({
		"pos": enemy.pos + Vector2(rng.randf_range(-8.0, 8.0), -28.0),
		"text": str(int(amount)),
		"life": 0.68,
		"max_life": 0.68,
		"color": pal.amber_bright if is_heavy else pal.bone_bright,
		"scale": 1.25 if is_heavy else 1.0,
	})
	_spawn_ink_burst(enemy.pos, pal.bone if realm == "spectral" else pal.amber_bright, 3, 0.7)
	# Boss Phase 2 transition at 50% HP
	if bool(enemy.get("is_boss", false)) and boss_phase == 1 and float(enemy.hp) > 0.0 and float(enemy.hp) <= float(enemy.max_hp) * 0.5:
		_trigger_boss_phase2(enemy)
	if enemy.hp > 0.0:
		return
	var was_boss := bool(enemy.get("is_boss", false))
	if enemy.xp > 0.0:
		gems.append({"pos": enemy.pos, "value": enemy.xp, "life": 24.0})
	var coin_drop := int(enemy.get("coins", 0))
	if coin_drop > 0:
		coins += coin_drop
	if realm == "spectral":
		player.fuel = minf(100.0, player.fuel + 0.6)
	_spawn_ink_burst(enemy.pos, pal.ink_slate, 7, 1.05)
	_spawn_ink_burst(enemy.pos, pal.sage_light, 4, 0.8)
	if bool(enemy.get("is_elite", false)):
		_add_trauma(0.45)
		if not was_boss and not first_elite_killed:
			first_elite_killed = true
			_push_narrative("first_elite")
	kills += 1
	enemies.remove_at(index)
	if was_boss:
		boss_defeated = true
		_add_trauma(0.85)
		boss_quote = InkData.BOSS_LINES.defeat
		boss_quote_timer = 5.0
		_push_narrative("boss_down")
		finish_run(true)

func _trigger_boss_phase2(boss: Dictionary) -> void:
	boss_phase = 2
	boss.speed = float(boss.speed) * 1.24
	_add_trauma(0.75)
	play_sfx("violation")
	boss_quote = InkData.BOSS_LINES.phase2
	boss_quote_timer = 4.6
	_push_narrative("boss_phase2")
	# Swap one active taboo rule live! ("换规矩！重来！")
	var active_ids: Array[String] = []
	for r in rules:
		active_ids.append(str(r.id))
	var candidates: Array[Dictionary] = []
	for candidate in InkData.full_rule_pool():
		if not active_ids.has(str(candidate.id)) and str(candidate.id) != "avoid_wall_shadow":
			candidates.append(candidate)
	if not candidates.is_empty() and rules.size() > 0:
		var pick: Dictionary = candidates[rng.randi_range(0, candidates.size() - 1)]
		rules[rules.size() - 1] = pick
		_push_alert("判官改章程！重订戒条：%s" % str(pick.title), "The Judge rewrote the rites! New taboo: %s" % str(pick.en_title), 3.6)
	# Radial 8-orb ink barrage
	var b_pos: Vector2 = boss.pos
	for k in range(8):
		var a := TAU * float(k) / 8.0
		enemy_bullets.append({
			"pos": b_pos,
			"vel": Vector2(cos(a), sin(a)) * 185.0,
			"radius": 9.0,
			"damage": 12.0,
			"life": 3.4,
			"color": InkData.palette().vermilion_bright,
		})

func damage_player(amount: float) -> void:
	if phase != Phase.PLAYING or invuln > 0.0:
		return
	player.hp = maxf(0.0, player.hp - amount)
	invuln = InkData.player_base().hit_invuln_sec + player.invuln_bonus
	_add_trauma(0.55)
	play_sfx("hit")
	_spawn_ink_burst(player.pos, InkData.palette().vermilion, 8, 1.1)
	if player.hp <= 0.0:
		if encore_available:
			encore_available = false
			player.hp = player.max_hp * 0.5
			player.fuel = maxf(player.fuel, 45.0)
			invuln = 1.8
			_add_trauma(0.70)
			play_sfx("flip")
			_push_subtitle("替身偶碎裂——借残魂再撑半程！", 4.0)
			var p_pos: Vector2 = player.pos
			slashes.append({"pos": p_pos, "radius": 180.0, "angle": 0.0, "life": 0.5, "max_life": 0.5, "face": "flip"})
			for i in range(enemies.size() - 1, -1, -1):
				if p_pos.distance_to(enemies[i].pos) <= 180.0:
					damage_enemy(i, 28.0)
			_emit_hud()
			return
		finish_run(false)

func update_combat(dt: float) -> void:
	# 戏台催阵鼓 (gonglu) periodic shockwave
	var gonglu_lvl := int(upgrade_levels.get("gonglu", 0))
	if gonglu_lvl > 0:
		gonglu_timer -= dt
		if gonglu_timer <= 0.0:
			gonglu_timer = maxf(2.6, 5.4 - float(gonglu_lvl) * 0.7)
			var p_pos: Vector2 = player.pos
			var radius := 155.0 + float(gonglu_lvl) * 18.0
			var dmg := (14.0 * float(gonglu_lvl) + float(player.global_damage_bonus)) * float(player.damage_mult)
			slashes.append({"pos": p_pos, "radius": radius, "angle": 0.0, "life": 0.36, "max_life": 0.36, "face": "gonglu"})
			play_sfx("flip")
			_add_trauma(0.25)
			for i in range(enemies.size() - 1, -1, -1):
				if p_pos.distance_to(enemies[i].pos) <= radius + float(enemies[i].radius):
					damage_enemy(i, dmg)
	attack_timer = maxf(0.0, attack_timer - dt)
	if attack_timer > 0.0 or flip_freeze > 0.0:
		return
	var base := InkData.player_base()
	var dmg_mult := float(player.damage_mult)
	var global_b := float(player.global_damage_bonus)
	if realm == "mortal":
		attack_timer = base.lantern_interval
		var lantern_lvl := int(upgrade_levels.get("lantern_fire", 0))
		var bolt_count := 1 + mini(2, maxi(0, lantern_lvl - 1))
		var targets := find_nearest_enemies(float(base.lantern_range) + float(player.lantern_range_bonus), bolt_count)
		if not targets.is_empty():
			var lantern_origin: Vector2 = player.pos + Vector2(20.0 * player.facing, -12.0)
			var dmg := (float(base.lantern_damage) + float(player.lantern_damage_bonus) + global_b) * dmg_mult
			targets.sort()
			targets.reverse()
			for idx in targets:
				if idx < enemies.size():
					var target_pos: Vector2 = enemies[idx].pos
					projectiles.append({"from": lantern_origin, "to": target_pos, "life": 0.22, "max_life": 0.22, "damage": dmg, "target": idx})
					damage_enemy(idx, dmg)
			play_sfx("lantern")
	elif face == "sheng":
		attack_timer = maxf(0.12, float(base.sheng_interval) + float(player.sheng_interval_bonus))
		var sword_lvl := int(upgrade_levels.get("sword", 0))
		var strike_count := 2 if sword_lvl >= 3 else 1
		var targets := find_nearest_enemies(float(base.sheng_range), strike_count)
		if not targets.is_empty():
			var dmg := (float(base.sheng_damage) + float(player.sheng_damage_bonus) + float(player.spectral_damage_bonus) + global_b) * dmg_mult
			var p_pos: Vector2 = player.pos
			targets.sort()
			targets.reverse()
			for idx in targets:
				if idx < enemies.size():
					var target_pos: Vector2 = enemies[idx].pos
					var dir_angle: float = (target_pos - p_pos).angle()
					slashes.append({"pos": target_pos, "radius": 58.0, "angle": dir_angle, "life": 0.20, "max_life": 0.20, "face": "sheng"})
					damage_enemy(idx, dmg)
			play_sfx("sword")
	else:
		attack_timer = maxf(0.45, float(base.dan_interval) + float(player.dan_interval_bonus))
		var dan_r := float(base.dan_radius) + float(player.dan_radius_bonus)
		var dmg := (float(base.dan_damage) + float(player.dan_damage_bonus) + float(player.spectral_damage_bonus) + global_b) * dmg_mult
		slashes.append({"pos": player.pos, "radius": dan_r, "angle": rng.randf_range(0.0, TAU), "life": 0.32, "max_life": 0.32, "face": "dan"})
		play_sfx("sleeve")
		var p_pos: Vector2 = player.pos
		for i in range(enemies.size() - 1, -1, -1):
			if p_pos.distance_to(enemies[i].pos) <= dan_r + float(enemies[i].radius):
				damage_enemy(i, dmg)

func update_enemies(dt: float) -> void:
	var cell_size := 52.0
	var grid: Dictionary = {}
	var count := enemies.size()
	if count > 1:
		for i in range(count):
			var p: Vector2 = enemies[i].pos
			var key := Vector2i(int(floor(p.x / cell_size)), int(floor(p.y / cell_size)))
			if not grid.has(key):
				grid[key] = [i]
			else:
				var bucket: Array = grid[key]
				if bucket.size() < 8:
					bucket.append(i)
	var p_pos: Vector2 = player.pos
	for i in range(count - 1, -1, -1):
		var enemy := enemies[i]
		enemy.hit_flash = maxf(0.0, enemy.hit_flash - dt)
		var pos: Vector2 = enemy.pos
		var direction: Vector2 = p_pos - pos
		var distance: float = direction.length()
		var sep := Vector2.ZERO
		if count > 1:
			var key := Vector2i(int(floor(pos.x / cell_size)), int(floor(pos.y / cell_size)))
			var bucket: Array = grid.get(key, [])
			for other_idx in bucket:
				if other_idx == i or other_idx >= count:
					continue
				var diff: Vector2 = pos - enemies[other_idx].pos
				var dist_sq := diff.length_squared()
				var min_d: float = float(enemy.radius) + float(enemies[other_idx].radius) * 0.65
				if dist_sq > 0.01 and dist_sq < min_d * min_d:
					var d := sqrt(dist_sq)
					sep += (diff / d) * (min_d - d) * 3.2
		var kind: String = str(enemy.kind)
		# Wisp caster keeps mid distance & shoots slow cold orbs
		if kind == "wisp_caster":
			var move_factor := 1.0 if distance > 220.0 else (-0.35 if distance < 140.0 else 0.1)
			if distance > 0.01:
				enemy.pos += (direction.normalized() * float(enemy.speed) * move_factor + enemy.knockback + sep) * dt
				enemy.knockback = enemy.knockback.lerp(Vector2.ZERO, 1.0 - exp(-10.0 * dt))
			enemy.cast_timer = float(enemy.cast_timer) - dt
			if float(enemy.cast_timer) <= 0.0 and distance < 460.0:
				enemy.cast_timer = 2.6
				enemy_bullets.append({
					"pos": enemy.pos,
					"vel": direction.normalized() * 160.0,
					"radius": 7.0,
					"damage": 9.0,
					"life": 3.2,
					"color": InkData.palette().sage_light,
				})
		elif bool(enemy.get("is_boss", false)):
			# Paper Judge Boss AI: pursues, casts ink arcs, and drops telegraphed Vermilion Seals
			if distance > 0.01:
				enemy.pos += (direction.normalized() * float(enemy.speed) + enemy.knockback) * dt
				enemy.knockback = enemy.knockback.lerp(Vector2.ZERO, 1.0 - exp(-10.0 * dt))
			enemy.cast_timer = float(enemy.cast_timer) - dt
			if float(enemy.cast_timer) <= 0.0:
				enemy.cast_timer = 2.0 if boss_phase == 2 else 2.8
				var base_ang: float = direction.angle()
				var fan := 5 if boss_phase == 2 else 3
				for k in range(fan):
					var offset := (float(k) - float(fan - 1) * 0.5) * 0.24
					var a := base_ang + offset
					enemy_bullets.append({
						"pos": enemy.pos,
						"vel": Vector2(cos(a), sin(a)) * (195.0 if boss_phase == 2 else 165.0),
						"radius": 8.5,
						"damage": 12.0,
						"life": 3.4,
						"color": InkData.palette().vermilion_bright,
					})
			enemy.aoe_timer = float(enemy.aoe_timer) - dt
			if float(enemy.aoe_timer) <= 0.0:
				enemy.aoe_timer = 3.2 if boss_phase == 2 else 4.5
				boss_aoes.append({
					"pos": p_pos + player.vel * 0.35,
					"radius": 88.0,
					"charge": 1.15,
					"max_charge": 1.15,
					"damage": 18.0,
				})
		else:
			if distance > 0.01:
				enemy.pos += (direction.normalized() * float(enemy.speed) + enemy.knockback + sep) * dt
				enemy.knockback = enemy.knockback.lerp(Vector2.ZERO, 1.0 - exp(-10.0 * dt))
		if distance <= float(enemy.radius) + 16.0:
			damage_player(float(enemy.damage))

func update_enemy_bullets(dt: float) -> void:
	var p_pos: Vector2 = player.pos
	for i in range(enemy_bullets.size() - 1, -1, -1):
		var b := enemy_bullets[i]
		b.life = float(b.life) - dt
		b.pos = Vector2(b.pos) + Vector2(b.vel) * dt
		if p_pos.distance_to(b.pos) <= float(b.radius) + 14.0:
			damage_player(float(b.damage))
			enemy_bullets.remove_at(i)
		elif float(b.life) <= 0.0:
			enemy_bullets.remove_at(i)

func update_boss_aoes(dt: float) -> void:
	var p_pos: Vector2 = player.pos
	for i in range(boss_aoes.size() - 1, -1, -1):
		var aoe := boss_aoes[i]
		aoe.charge = float(aoe.charge) - dt
		if float(aoe.charge) <= 0.0:
			var ap: Vector2 = aoe.pos
			var ar: float = float(aoe.radius)
			_spawn_ink_burst(ap, InkData.palette().vermilion, 12, 1.2)
			_add_trauma(0.32)
			if p_pos.distance_to(ap) <= ar:
				damage_player(float(aoe.damage))
			boss_aoes.remove_at(i)

func update_effects(dt: float) -> void:
	for i in range(projectiles.size() - 1, -1, -1):
		projectiles[i].life -= dt
		if projectiles[i].life <= 0.0:
			projectiles.remove_at(i)
	for i in range(slashes.size() - 1, -1, -1):
		slashes[i].life -= dt
		if slashes[i].life <= 0.0:
			slashes.remove_at(i)
	for i in range(floaters.size() - 1, -1, -1):
		floaters[i].life -= dt
		floaters[i].pos.y -= 30.0 * dt
		if floaters[i].life <= 0.0:
			floaters.remove_at(i)
	for i in range(particles.size() - 1, -1, -1):
		var pt := particles[i]
		pt.life -= dt
		pt.pos += pt.vel * dt
		pt.vel *= (1.0 - minf(1.0, 4.5 * dt))
		if pt.life <= 0.0:
			particles.remove_at(i)
	for i in range(afterimages.size() - 1, -1, -1):
		afterimages[i].life -= dt
		if afterimages[i].life <= 0.0:
			afterimages.remove_at(i)

func setup_taboos() -> void:
	rules = InkData.fixed_rules()
	_init_hazard_defaults()

func setup_random_taboos() -> void:
	var pool := InkData.full_rule_pool()
	pool.shuffle()
	rules = [pool[0], pool[1], pool[2]]
	_init_hazard_defaults()

func _init_hazard_defaults() -> void:
	hazards.shadow_zones = [
		{"pos": Vector2(-260.0, -120.0), "radius": 95.0},
		{"pos": Vector2(310.0, 180.0), "radius": 110.0},
		{"pos": Vector2(-120.0, 390.0), "radius": 85.0},
	]
	hazards.white_stranger = {
		"active": false,
		"pos": Vector2(900.0, 900.0),
		"timer": 18.0,
		"line": InkData.WHITE_STRANGER_LINES[0],
	}
	hazards.blackout_cycle = 28.0
	hazards.blackout_warned = false
	hazards.backward_timer = 0.0
	hazards.name_call = {"active": false, "pos": Vector2.ZERO, "timer": 14.0, "radius": 95.0}
	hazards.door_knock = {"active": false, "timer": 16.0}
	hazards.water_gong = {"active": false, "timer": 19.0}
	hazards.stele_timer = 0.0
	hazards.wall_cooldown = 0.0

func is_in_shadow(pos: Vector2) -> bool:
	for zone in hazards.shadow_zones:
		if pos.distance_to(zone.pos) <= zone.radius:
			return true
	return false

func get_current_light_radius() -> float:
	if hazards.blackout_active:
		return float(hazards.frozen_radius)
	if realm == "mortal":
		return 235.0 + float(player.light_mortal_bonus)
	return 185.0 + float(player.light_spectral_bonus)

func is_in_light(pos: Vector2) -> bool:
	var radius: float = get_current_light_radius()
	var center: Vector2 = hazards.frozen_light if hazards.blackout_active else player.pos
	if pos.distance_to(center) <= radius:
		return true
	if hazards.blackout_active:
		for cl in cold_lights:
			if pos.distance_to(cl.pos) <= float(cl.radius):
				return true
	return false

func update_taboos(dt: float) -> void:
	var p_pos: Vector2 = player.pos
	var grace: float = float(player.taboo_grace_bonus)
	# 1. 切莫践踏阴影
	if has_rule("shadow"):
		var threshold := 1.0 + grace
		if is_in_shadow(p_pos):
			hazards.shadow_timer += dt
			_set_rule_progress("shadow", hazards.shadow_timer / threshold)
			if hazards.shadow_timer >= threshold:
				hazards.shadow_timer = 0.0
				_set_rule_progress("shadow", 0.0)
				violate_rule("shadow")
		else:
			hazards.shadow_timer = 0.0
			_set_rule_progress("shadow", 0.0)
	# 2. 遇白衣莫搭言 (每 4s 轮换耳语台词)
	if has_rule("stranger"):
		if not hazards.white_stranger.active:
			hazards.white_stranger.timer -= dt
			if hazards.white_stranger.timer <= 0.0:
				hazards.white_stranger.active = true
				hazards.white_stranger.timer = 13.0
				var angle := rng.randf_range(0.0, TAU)
				hazards.white_stranger.pos = p_pos + Vector2(cos(angle), sin(angle)) * 330.0
				hazards.white_stranger["line_idx"] = 0
				hazards.white_stranger["line_timer"] = 0.0
				hazards.white_stranger.line = InkData.WHITE_STRANGER_LINES[0]
		else:
			var lt: float = float(hazards.white_stranger.get("line_timer", 0.0)) + dt
			if lt >= 4.0:
				lt = 0.0
				var li: int = (int(hazards.white_stranger.get("line_idx", 0)) + 1) % InkData.WHITE_STRANGER_LINES.size()
				hazards.white_stranger["line_idx"] = li
				hazards.white_stranger.line = InkData.WHITE_STRANGER_LINES[li]
			hazards.white_stranger["line_timer"] = lt
			if p_pos.distance_to(hazards.white_stranger.pos) <= 90.0:
				hazards.white_stranger.active = false
				hazards.white_stranger.timer = 22.0
				violate_rule("stranger")
	# 3. 熄灯须立光中
	if has_rule("blackout"):
		if not hazards.blackout_active:
			hazards.blackout_cycle -= dt
			if not hazards.blackout_warned and hazards.blackout_cycle <= 2.5:
				hazards.blackout_warned = true
			if hazards.blackout_cycle <= 0.0:
				hazards.blackout_active = true
				hazards.blackout_remaining = 5.0
				hazards.blackout_warned = false
				hazards.frozen_light = p_pos
				hazards.frozen_radius = get_current_light_radius()
		else:
			hazards.blackout_remaining -= dt
			if hazards.blackout_remaining <= 0.0:
				hazards.blackout_active = false
				hazards.blackout_cycle = 28.0
			elif not is_in_light(p_pos):
				hazards.blackout_active = false
				hazards.blackout_cycle = 28.0
				violate_rule("blackout")
	# 4. 不得倒退行走 (持续向南走超 2 秒)
	if has_rule("no_backward"):
		var threshold := 2.0 + grace
		var vel: Vector2 = player.vel
		if vel.y > 45.0:
			hazards.backward_timer = float(hazards.backward_timer) + dt
			_set_rule_progress("no_backward", float(hazards.backward_timer) / threshold)
			if float(hazards.backward_timer) >= threshold:
				hazards.backward_timer = 0.0
				_set_rule_progress("no_backward", 0.0)
				violate_rule("no_backward")
		else:
			hazards.backward_timer = maxf(0.0, float(hazards.backward_timer) - dt * 2.0)
			_set_rule_progress("no_backward", float(hazards.backward_timer) / threshold)
	# 5. 闻名切莫回头 (雾中唤名白圈)
	if has_rule("avoid_name_call"):
		var nc: Dictionary = hazards.name_call
		nc.timer = float(nc.timer) - dt
		if not bool(nc.active):
			if float(nc.timer) <= 0.0:
				nc.active = true
				nc.timer = 6.0
				var ang := rng.randf_range(0.0, TAU)
				nc.pos = p_pos + Vector2(cos(ang), sin(ang)) * 220.0
				_push_subtitle("有人在背后喊你的名字……莫入白圈。", 3.0)
		else:
			if p_pos.distance_to(nc.pos) <= float(nc.radius):
				nc.active = false
				nc.timer = 16.0
				violate_rule("avoid_name_call")
			elif float(nc.timer) <= 0.0:
				nc.active = false
				nc.timer = 15.0
	# 6. 叩门切莫轻启 (西南阴门)
	if has_rule("avoid_door_knock"):
		var dk: Dictionary = hazards.door_knock
		dk.timer = float(dk.timer) - dt
		if not bool(dk.active):
			if float(dk.timer) <= 0.0:
				dk.active = true
				dk.timer = 6.5
				_push_subtitle("西南阴门响起三声叩门……切莫踏近。", 3.0)
		else:
			if p_pos.distance_to(landmarks.spirit_gate) <= 115.0:
				dk.active = false
				dk.timer = 18.0
				violate_rule("avoid_door_knock")
			elif float(dk.timer) <= 0.0:
				dk.active = false
				dk.timer = 18.0
	# 7. 锣响切莫窥澜 (东南暗潭)
	if has_rule("avoid_water_gong"):
		var wg: Dictionary = hazards.water_gong
		wg.timer = float(wg.timer) - dt
		if not bool(wg.active):
			if float(wg.timer) <= 0.0:
				wg.active = true
				wg.timer = 6.5
				_push_subtitle("远处铜锣震响……切莫窥看东南暗潭。", 3.0)
		else:
			if p_pos.distance_to(landmarks.dark_pond) <= 125.0:
				wg.active = false
				wg.timer = 20.0
				violate_rule("avoid_water_gong")
			elif float(wg.timer) <= 0.0:
				wg.active = false
				wg.timer = 20.0
	# 8. 破晓莫越断垣 (西北断石界墙，判官登场后暂解)
	if has_rule("avoid_wall_shadow") and not boss_spawned:
		hazards.wall_cooldown = maxf(0.0, float(hazards.wall_cooldown) - dt)
		if p_pos.distance_to(landmarks.ruined_wall) <= 120.0 and float(hazards.wall_cooldown) <= 0.0:
			hazards.wall_cooldown = 5.0
			violate_rule("avoid_wall_shadow")
	# 9. 莫在残碑前驻足 (北侧无字残碑)
	if has_rule("no_stele_linger"):
		var threshold := 3.0 + grace
		if p_pos.distance_to(landmarks.blank_stele) <= 115.0:
			hazards.stele_timer = float(hazards.stele_timer) + dt
			_set_rule_progress("no_stele_linger", float(hazards.stele_timer) / threshold)
			if float(hazards.stele_timer) >= threshold:
				hazards.stele_timer = 0.0
				_set_rule_progress("no_stele_linger", 0.0)
				violate_rule("no_stele_linger")
		else:
			hazards.stele_timer = 0.0
			_set_rule_progress("no_stele_linger", 0.0)
	_refresh_active_cue(p_pos)

func _refresh_active_cue(p_pos: Vector2) -> void:
	var cue_rule_id := ""
	if has_rule("shadow") and is_in_shadow(p_pos):
		cue_rule_id = "shadow"
	elif has_rule("blackout") and (hazards.blackout_active or hazards.blackout_cycle <= 2.5):
		cue_rule_id = "blackout"
	elif has_rule("stranger") and hazards.white_stranger.active and p_pos.distance_to(hazards.white_stranger.pos) <= 230.0:
		cue_rule_id = "stranger"
	elif has_rule("no_backward") and float(hazards.backward_timer) > 0.35:
		cue_rule_id = "no_backward"
	elif has_rule("avoid_name_call") and bool(hazards.name_call.active):
		cue_rule_id = "avoid_name_call"
	elif has_rule("avoid_door_knock") and bool(hazards.door_knock.active):
		cue_rule_id = "avoid_door_knock"
	elif has_rule("avoid_water_gong") and bool(hazards.water_gong.active):
		cue_rule_id = "avoid_water_gong"
	elif has_rule("avoid_wall_shadow") and not boss_spawned and p_pos.distance_to(landmarks.ruined_wall) <= 220.0:
		cue_rule_id = "avoid_wall_shadow"
	elif has_rule("no_stele_linger") and p_pos.distance_to(landmarks.blank_stele) <= 180.0:
		cue_rule_id = "no_stele_linger"
	active_cue = ""
	for r in rules:
		var rid := str(r.id)
		if rid == cue_rule_id:
			active_cue = str(r.get("cue" if lang == "zh" else "en_cue", ""))
		if int(upgrade_levels.get("night_bell", 0)) > 0 and float(r.get("progress", 0.0)) >= 0.45:
			if not bool(bell_warned_rules.get(rid, false)):
				bell_warned_rules[rid] = true
				play_sfx("xp")
				_push_alert("惊铎急鸣！临近阴戒：%s" % str(r.title), "Chime Rings! Approaching taboo: %s" % str(r.get("en_title", r.title)), 2.4)
		else:
			bell_warned_rules[rid] = false

func violate_rule(rule_id: String) -> void:
	violations += 1
	var zh_title := rule_id
	var en_title := rule_id
	for rule in rules:
		if str(rule.id) == rule_id:
			rule.broken = true
			zh_title = str(rule.title)
			en_title = str(rule.get("en_title", zh_title))
	_push_alert("惊煞！触犯阴戒：%s，差役录名！" % zh_title, "Taboo Broken: %s! Bailiff recording!" % en_title, 3.2)
	if not first_break_done:
		first_break_done = true
		_push_narrative("first_break")
	spawn_punisher()
	play_sfx("violation")
	damage_player(8.0)

func update_pickups(dt: float) -> void:
	var p_pos: Vector2 = player.pos
	for i in range(gems.size() - 1, -1, -1):
		var gem := gems[i]
		gem.life -= dt
		var offset: Vector2 = p_pos - gem.pos
		var distance: float = offset.length()
		if distance <= float(player.pickup_radius):
			var pull_speed := 300.0 + (1.0 - distance / maxf(1.0, float(player.pickup_radius))) * 180.0
			gem.pos += offset.normalized() * pull_speed * dt
		if distance <= 18.0:
			play_sfx("xp")
			var gain := float(gem.value) * (float(player.spectral_xp_mult) if realm == "spectral" else 1.0)
			add_xp(gain)
			gems.remove_at(i)
		elif gem.life <= 0.0:
			gems.remove_at(i)

func _roll_upgrade_choices() -> Array:
	# Level 2 always offers the classic starter trio (ensures onboarding clarity & smoke.gd compatibility)
	if level == 2:
		return InkData.fixed_upgrades()
	var pool: Array = []
	for item in InkData.full_upgrade_pool():
		var uid: String = str(item.id)
		var max_l: int = int(item.get("max_level", 3))
		if int(upgrade_levels.get(uid, 0)) < max_l:
			pool.append(item)
	pool.shuffle()
	var chosen: Array = []
	for i in range(mini(3, pool.size())):
		chosen.append(pool[i])
	while chosen.size() < 3:
		chosen.append(InkData.FALLBACK_UPGRADE.duplicate(true))
	return chosen

func add_xp(amount: float) -> void:
	if phase != Phase.PLAYING:
		return
	xp += amount
	if xp < xp_to_next:
		return
	xp -= xp_to_next
	level += 1
	xp_to_next = float(InkData.XP_PER_LEVEL + (level - 1) * 5)
	rolled_choices = _roll_upgrade_choices()
	phase = Phase.LEVELUP
	play_sfx("level")
	level_up.emit(current_upgrade_choices())
	_emit_hud()

func current_upgrade_choices() -> Array:
	if rolled_choices.is_empty():
		return InkData.fixed_upgrades()
	return rolled_choices

func choose_upgrade(index: int) -> void:
	if phase != Phase.LEVELUP:
		return
	var choices := current_upgrade_choices()
	if index < 0 or index >= choices.size():
		return
	var choice: Dictionary = choices[index]
	var id: String = str(choice.id)
	var max_l: int = int(choice.get("max_level", 3))
	if id != "fallback_wick" and int(upgrade_levels.get(id, 0)) >= max_l:
		phase = Phase.PLAYING
		_emit_hud()
		return
	if id != "fallback_wick":
		upgrade_levels[id] = int(upgrade_levels.get(id, 0)) + 1
	match id:
		"talisman":
			player.invuln_bonus += 0.15
			player.speed_bonus += 8.0
		"crane":
			player.pickup_radius += 45.0
			player.regen += 2.0
		"sword":
			player.sheng_damage_bonus += 4.0
			player.sheng_interval_bonus -= 0.03
		"sleeve_spin":
			player.dan_damage_bonus += 3.0
			player.dan_radius_bonus += 18.0
			player.dan_interval_bonus -= 0.06
		"lantern_fire":
			player.lantern_damage_bonus += 5.0
			player.lantern_range_bonus += 18.0
		"mask_freeze":
			player.flip_blast_bonus += 10.0
			player.flip_invuln_sec += 0.9
		"troupe_gong":
			player.global_damage_bonus += 2.0
		"gonglu":
			gonglu_timer = minf(gonglu_timer, 1.5)
		"encore":
			encore_available = true
		"soul_shield":
			player.max_hp += 20.0
			player.hp = minf(player.max_hp, player.hp + 20.0)
		"lamp_oil":
			player.light_mortal_bonus += 30.0
			player.light_spectral_bonus += 20.0
			player.fuel_drain_mult *= 0.85
		"night_bell":
			player.taboo_grace_bonus += 0.4
		"taboo_book":
			player.punisher_damage_reduce += 3.0
			player.punisher_slow_bonus += 16.0
		"yin_yang_mirror":
			player.flip_cooldown_reduce += 0.35
			player.spectral_damage_bonus += 2.0
		"spirit_brand":
			player.spectral_xp_mult += 0.35
			player.light_spectral_bonus += 28.0
		"shadow_walker":
			pass
		"fallback_wick":
			player.global_damage_bonus += 1.0
			player.hp = minf(player.max_hp, player.hp + 10.0)
	phase = Phase.PLAYING
	_emit_hud()

func flip_realm() -> bool:
	if phase != Phase.PLAYING or flip_cooldown > 0.0:
		return false
	afterimages.append({
		"pos": player.pos,
		"realm": realm,
		"face": face,
		"facing": player.facing,
		"life": 0.45,
		"max_life": 0.45,
	})
	realm = "spectral" if realm == "mortal" else "mortal"
	flip_cooldown = maxf(1.2, float(InkData.player_base().flip_cooldown_sec) - float(player.flip_cooldown_reduce))
	flip_freeze = InkData.player_base().flip_freeze_sec
	if float(player.flip_invuln_sec) > 0.0:
		invuln = maxf(invuln, float(player.flip_invuln_sec))
	if int(upgrade_levels.get("shadow_walker", 0)) > 0:
		shadow_haste_timer = 2.0
	flip_wave = 0.01
	_add_trauma(0.42)
	player.fuel = maxf(0.0, player.fuel - 8.0)
	if not first_flip_done:
		first_flip_done = true
		_push_narrative("first_flip")
	var blast_radius: float = InkData.player_base().flip_blast_radius
	var blast_dmg: float = (float(InkData.player_base().flip_blast_damage) + float(player.flip_blast_bonus)) * float(player.damage_mult)
	var p_pos: Vector2 = player.pos
	for i in range(enemies.size() - 1, -1, -1):
		if p_pos.distance_to(enemies[i].pos) <= blast_radius:
			damage_enemy(i, blast_dmg)
	slashes.append({
		"pos": p_pos,
		"radius": blast_radius,
		"angle": 0.0,
		"life": 0.46,
		"max_life": 0.46,
		"face": "flip",
	})
	play_sfx("flip")
	_spawn_ink_burst(p_pos, InkData.palette().bone_bright, 14, 1.35)
	_spawn_ink_burst(p_pos, InkData.palette().amber_bright, 8, 1.0)
	return true

func toggle_face() -> void:
	if phase != Phase.PLAYING:
		return
	if realm == "spectral":
		face = "dan" if face == "sheng" else "sheng"
		play_sfx("sleeve" if face == "dan" else "sword")
		_spawn_ink_burst(player.pos, InkData.palette().bone_bright, 6, 0.7)
	else:
		face = "dan"
		flip_realm()

func trigger_flip_input() -> void:
	flip_realm()

func trigger_face_input() -> void:
	toggle_face()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		toggle_pause()
	elif event.is_action_pressed("confirm"):
		if phase == Phase.TITLE:
			start_selected_mode()
		elif phase == Phase.PAUSED:
			toggle_pause()
	elif event.is_action_pressed("flip"):
		trigger_flip_input()
	elif event.is_action_pressed("face"):
		trigger_face_input()
	elif event.is_action_pressed("upgrade_1"):
		choose_upgrade(0)
	elif event.is_action_pressed("upgrade_2"):
		choose_upgrade(1)
	elif event.is_action_pressed("upgrade_3"):
		choose_upgrade(2)

func finish_run(victory: bool) -> void:
	if phase == Phase.ENDED:
		return
	phase = Phase.ENDED
	ended_victory = victory
	if run_mode == "prototype":
		time_sec = minf(time_sec, InkData.RUN_DURATION)
	var kept := 0
	for rule in rules:
		if not rule.broken:
			kept += 1
	var reward_coins := coins + (12 if victory else 3) + kept * 2
	save_data.coins = int(save_data.coins) + reward_coins
	save_data.best_time = maxf(float(save_data.best_time), time_sec)
	save_data.best_kills = maxi(int(save_data.best_kills), kills)
	save_data.total_runs = int(save_data.total_runs) + 1
	if victory:
		save_data.victories = int(save_data.victories) + 1
	_persist_save()
	var summary := {
		"victory": victory,
		"run_mode": run_mode,
		"boss_defeated": boss_defeated,
		"time": time_sec,
		"kills": kills,
		"coins": reward_coins,
		"level": level,
		"rules_kept": kept,
		"rules_total": rules.size(),
		"violations": violations,
	}
	run_finished.emit(summary)
	_emit_hud()

func restart_run() -> void:
	if run_mode == "full_vigil":
		start_full_vigil()
	else:
		start_run()

func _exit_tree() -> void:
	for player_node in audio_players.values():
		player_node.stop()
	audio_players.clear()

func _setup_audio() -> void:
	var streams := {
		"lantern": _make_layered_sfx("lantern"),
		"sword": _make_layered_sfx("sword"),
		"sleeve": _make_layered_sfx("sleeve"),
		"hit": _make_layered_sfx("hit"),
		"flip": _make_layered_sfx("flip"),
		"level": _make_layered_sfx("level"),
		"violation": _make_layered_sfx("violation"),
		"xp": _make_layered_sfx("xp"),
	}
	for sfx_name in streams:
		var player_node := AudioStreamPlayer.new()
		player_node.stream = streams[sfx_name]
		add_child(player_node)
		audio_players[sfx_name] = player_node

func _make_tone(frequency: float, duration: float, volume: float) -> AudioStreamWAV:
	var mix_rate := 22050
	var sample_count := int(mix_rate * duration)
	var data := PackedByteArray()
	data.resize(sample_count * 2)
	for i in range(sample_count):
		var t := float(i) / float(mix_rate)
		var envelope := pow(1.0 - t / duration, 2.0)
		var value := sin(TAU * frequency * t) * envelope * volume
		data.encode_s16(i * 2, int(clampf(value, -1.0, 1.0) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = mix_rate
	stream.stereo = false
	stream.data = data
	return stream

func _make_layered_sfx(kind: String) -> AudioStreamWAV:
	var mix_rate := 22050
	var duration := 0.14
	match kind:
		"lantern": duration = 0.12
		"sword": duration = 0.14
		"sleeve": duration = 0.22
		"hit": duration = 0.14
		"flip": duration = 0.42
		"level": duration = 0.48
		"violation": duration = 0.50
		"xp": duration = 0.11
	var sample_count := int(mix_rate * duration)
	var data := PackedByteArray()
	data.resize(sample_count * 2)
	var noise_rng := RandomNumberGenerator.new()
	noise_rng.seed = kind.hash()
	var prev_noise := 0.0
	for i in range(sample_count):
		var t := float(i) / float(mix_rate)
		var u := t / duration
		var raw_noise := noise_rng.randf_range(-1.0, 1.0)
		var lp_noise := lerpf(prev_noise, raw_noise, 0.25)
		prev_noise = lp_noise
		var val := 0.0
		match kind:
			"lantern":
				var env := pow(1.0 - u, 2.2)
				var f := lerpf(580.0, 820.0, u)
				val = (sin(TAU * f * t) * 0.55 + sin(TAU * f * 1.5 * t) * 0.22 + lp_noise * 0.35) * env * 0.18
			"sword":
				var env := pow(1.0 - u, 1.8)
				var f := lerpf(1100.0, 260.0, pow(u, 0.6))
				var hp_noise := raw_noise - lp_noise
				val = (sin(TAU * f * t) * 0.45 + hp_noise * 0.55) * env * 0.22
			"sleeve":
				var env := sin(PI * u) * (1.0 - u * 0.4)
				var f := lerpf(320.0, 480.0, sin(PI * u))
				val = (lp_noise * 0.65 + sin(TAU * f * t) * 0.35) * env * 0.20
			"hit":
				var env := pow(1.0 - u, 2.4)
				var f := lerpf(160.0, 58.0, u)
				val = (sin(TAU * f * t) * 0.75 + lp_noise * 0.45) * env * 0.26
			"flip":
				var env := pow(1.0 - u, 1.7)
				var bell := sin(TAU * 196.0 * t) * 0.50 + sin(TAU * 392.0 * t) * 0.26 + sin(TAU * 523.0 * t) * 0.16 + sin(TAU * 711.0 * t) * 0.12
				val = (bell + lp_noise * 0.22 * pow(1.0 - u, 4.0)) * env * 0.24
			"level":
				var notes := [523.25, 587.33, 659.25, 783.99]
				var idx := mini(3, int(u * 4.0))
				var local_u := fmod(u * 4.0, 1.0)
				var env := pow(1.0 - local_u, 1.5) * (1.0 - u * 0.25)
				var f: float = notes[idx]
				val = (sin(TAU * f * t) * 0.65 + sin(TAU * f * 2.0 * t) * 0.25) * env * 0.20
			"violation":
				var env := pow(1.0 - u, 1.5)
				var clack := sin(TAU * 920.0 * t) * pow(maxf(0.0, 1.0 - u * 8.0), 3.0) * 0.5
				var gong := sin(TAU * 98.0 * t) * 0.55 + sin(TAU * 138.0 * t) * 0.35 + sin(TAU * 211.0 * t) * 0.22
				val = (clack + gong * env) * 0.28
			"xp":
				var env := pow(1.0 - u, 2.5)
				val = (sin(TAU * 880.0 * t) * 0.6 + sin(TAU * 1320.0 * t) * 0.3) * env * 0.12
		data.encode_s16(i * 2, int(clampf(val, -1.0, 1.0) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = mix_rate
	stream.stereo = false
	stream.data = data
	return stream

func play_sfx(sfx_name: String) -> void:
	if DisplayServer.get_name() == "headless" or muted or not audio_players.has(sfx_name):
		return
	var p: AudioStreamPlayer = audio_players[sfx_name]
	if sfx_name == "xp":
		var scale := [1.0, 1.122, 1.26, 1.498, 1.682]
		p.pitch_scale = scale[xp_chime_index % scale.size()]
		xp_chime_index += 1
	else:
		p.pitch_scale = rng.randf_range(0.96, 1.04)
	p.play()

func toggle_mute() -> void:
	muted = not muted
	AudioServer.set_bus_mute(0, muted)
	_emit_hud()
