extends Node2D
class_name InkMain

signal hud_changed(snapshot: Dictionary)
signal level_up(choices: Array)
signal run_finished(summary: Dictionary)

enum Phase { TITLE, PLAYING, PAUSED, LEVELUP, ENDED }

var phase: int = Phase.TITLE
var realm := "mortal"
var face := "sheng"
var time_sec := 0.0
var kills := 0
var level := 1
var xp := 0.0
var xp_to_next := float(InkData.XP_PER_LEVEL)
var flip_cooldown := 0.0
var flip_freeze := 0.0
var attack_timer := 0.0
var invuln := 0.0
var muted := false
var violations := 0
var spawn_timer := 0.0
var hud_timer := 0.0
var ended_victory := false
var rng := RandomNumberGenerator.new()
var camera := Vector2.ZERO
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
	"invuln_bonus": 0.0,
	"sheng_damage_bonus": 0.0,
	"sheng_interval_bonus": 0.0,
	"regen": 0.0,
	"regen_timer": 0.0,
}
var enemies: Array[Dictionary] = []
var gems: Array[Dictionary] = []
var projectiles: Array[Dictionary] = []
var particles: Array[Dictionary] = []
var slashes: Array[Dictionary] = []
var floaters: Array[Dictionary] = []
var upgrade_levels := {"talisman": 0, "crane": 0, "sword": 0}
var rules: Array = InkData.fixed_rules()
var hazards := {
	"shadow_timer": 0.0,
	"shadow_zones": [],
	"white_stranger": {"active": false, "pos": Vector2.ZERO, "timer": 0.0},
	"blackout_active": false,
	"blackout_remaining": 0.0,
	"blackout_cycle": 28.0,
	"frozen_light": Vector2.ZERO,
	"frozen_radius": 235.0,
}

@onready var world_view: InkRenderer = $WorldView
@onready var hud: InkHud = $ScreenLayer/Hud

func _ready() -> void:
	rng.randomize()
	_ensure_input_actions()
	_reset_run_state()
	world_view.setup(self)
	hud.setup(self)
	hud_changed.connect(hud.show_snapshot)
	level_up.connect(hud.show_level_up)
	run_finished.connect(hud.show_result)
	_emit_hud()

func _process(delta: float) -> void:
	step(delta)
	hud_timer += delta
	if hud_timer >= 0.1:
		hud_timer = 0.0
		_emit_hud()

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
		InputMap.action_add_event(action, event)

func _reset_run_state() -> void:
	phase = Phase.TITLE
	realm = "mortal"
	face = "sheng"
	time_sec = 0.0
	kills = 0
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
		"invuln_bonus": 0.0,
		"sheng_damage_bonus": 0.0,
		"sheng_interval_bonus": 0.0,
		"regen": 0.0,
		"regen_timer": 0.0,
	}
	enemies.clear()
	gems.clear()
	projectiles.clear()
	particles.clear()
	slashes.clear()
	floaters.clear()
	upgrade_levels = {"talisman": 0, "crane": 0, "sword": 0}
	rules = InkData.fixed_rules()
	hazards = {
		"shadow_timer": 0.0,
		"shadow_zones": [],
		"white_stranger": {"active": false, "pos": Vector2.ZERO, "timer": 0.0},
		"blackout_active": false,
		"blackout_remaining": 0.0,
		"blackout_cycle": 28.0,
		"frozen_light": Vector2.ZERO,
		"frozen_radius": 235.0,
	}
	camera = Vector2.ZERO

func start_run() -> void:
	_reset_run_state()
	phase = Phase.PLAYING
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

func step(dt: float) -> void:
	if phase != Phase.PLAYING:
		return
	time_sec = minf(time_sec + dt, InkData.RUN_DURATION)
	flip_cooldown = maxf(0.0, flip_cooldown - dt)
	flip_freeze = maxf(0.0, flip_freeze - dt)
	invuln = maxf(0.0, invuln - dt)
	attack_timer = maxf(0.0, attack_timer - dt)
	player.fuel = maxf(0.0, player.fuel - dt * 1.25)
	if player.fuel <= 0.0:
		damage_player(999.0)
		return
	var move := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var speed: float = InkData.player_base().mortal_speed if realm == "mortal" else InkData.player_base().spectral_speed
	speed += player.speed_bonus
	player.vel = move * speed
	player.pos += player.vel * dt
	player.pos.x = clampf(player.pos.x, -InkData.WORLD_HALF, InkData.WORLD_HALF)
	player.pos.y = clampf(player.pos.y, -InkData.WORLD_HALF, InkData.WORLD_HALF)
	if absf(move.x) > 0.01:
		player.facing = signf(move.x)
	if move.length_squared() > 0.01:
		player.walk += speed * dt
	camera = camera.lerp(player.pos, 1.0 - exp(-8.0 * dt))
	if flip_freeze <= 0.0:
		update_combat(dt)
	update_waves(dt)
	update_enemies(dt)
	update_effects(dt)
	if time_sec >= InkData.RUN_DURATION:
		finish_run(true)

func get_snapshot() -> Dictionary:
	return {
		"phase": phase,
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
		"flip_cooldown": flip_cooldown,
		"rules": rules.duplicate(true),
		"violations": violations,
		"muted": muted,
	}

func _emit_hud() -> void:
	hud_changed.emit(get_snapshot())

func spawn_enemy(kind: String, pos: Vector2) -> int:
	var archetype := InkData.enemy(kind)
	var spawn_pos := pos
	spawn_pos.x = clampf(spawn_pos.x, -InkData.WORLD_HALF, InkData.WORLD_HALF)
	spawn_pos.y = clampf(spawn_pos.y, -InkData.WORLD_HALF, InkData.WORLD_HALF)
	var enemy := {
		"kind": kind,
		"pos": spawn_pos,
		"hp": archetype.hp,
		"max_hp": archetype.hp,
		"speed": archetype.speed,
		"damage": archetype.damage,
		"xp": archetype.xp,
		"radius": archetype.radius,
		"hit_flash": 0.0,
		"knockback": Vector2.ZERO,
	}
	enemies.append(enemy)
	return enemies.size() - 1

func spawn_punisher() -> int:
	var angle := rng.randf_range(0.0, TAU)
	var pos: Vector2 = player.pos + Vector2(cos(angle), sin(angle)) * 420.0
	return spawn_enemy("punisher", pos)

func find_nearest_enemy(max_range: float) -> int:
	var best_index := -1
	var best_distance := max_range
	for i in range(enemies.size()):
		var distance: float = player.pos.distance_to(enemies[i].pos)
		if distance <= best_distance:
			best_distance = distance
			best_index = i
	return best_index

func update_waves(dt: float) -> void:
	spawn_timer -= dt
	if spawn_timer > 0.0 or enemies.size() >= 100:
		return
	spawn_timer = maxf(0.45, 1.4 - time_sec * 0.012)
	var count := 1 + int(time_sec / 25.0)
	for i in range(count):
		var angle := rng.randf_range(0.0, TAU)
		var radius := rng.randf_range(480.0, 620.0)
		var pos: Vector2 = player.pos + Vector2(cos(angle), sin(angle)) * radius
		var kind := "ghost" if rng.randf() < 0.7 else "jiangshi"
		spawn_enemy(kind, pos)

func damage_enemy(index: int, amount: float) -> void:
	if index < 0 or index >= enemies.size():
		return
	enemies[index].hp -= amount
	enemies[index].hit_flash = 0.12
	var away: Vector2 = enemies[index].pos - player.pos
	if away.length_squared() > 0.01:
		enemies[index].knockback = away.normalized() * 140.0
	floaters.append({"pos": enemies[index].pos + Vector2(0.0, -28.0), "text": str(int(amount)), "life": 0.7})
	if enemies[index].hp > 0.0:
		return
	var enemy := enemies[index]
	if enemy.xp > 0.0:
		gems.append({"pos": enemy.pos, "value": enemy.xp, "life": 20.0})
	kills += 1
	enemies.remove_at(index)

func damage_player(amount: float) -> void:
	if phase != Phase.PLAYING or invuln > 0.0:
		return
	player.hp = maxf(0.0, player.hp - amount)
	invuln = InkData.player_base().hit_invuln_sec + player.invuln_bonus
	particles.append({"pos": player.pos, "vel": Vector2.ZERO, "life": 0.25, "color": InkData.palette().vermilion})
	if player.hp <= 0.0:
		finish_run(false)

func update_combat(dt: float) -> void:
	attack_timer = maxf(0.0, attack_timer - dt)
	if attack_timer > 0.0 or flip_freeze > 0.0:
		return
	var base := InkData.player_base()
	if realm == "mortal":
		attack_timer = base.lantern_interval
		var target := find_nearest_enemy(base.lantern_range)
		if target >= 0:
			var target_pos: Vector2 = enemies[target].pos
			projectiles.append({"from": player.pos, "to": target_pos, "life": 0.18, "damage": base.lantern_damage, "target": target})
			damage_enemy(target, base.lantern_damage)
	elif face == "sheng":
		attack_timer = maxf(0.12, base.sheng_interval + player.sheng_interval_bonus)
		var target := find_nearest_enemy(base.sheng_range)
		if target >= 0:
			slashes.append({"pos": enemies[target].pos, "radius": 54.0, "life": 0.18, "face": "sheng"})
			damage_enemy(target, base.sheng_damage + player.sheng_damage_bonus)
	else:
		attack_timer = base.dan_interval
		slashes.append({"pos": player.pos, "radius": base.dan_radius, "life": 0.28, "face": "dan"})
		for i in range(enemies.size() - 1, -1, -1):
			if player.pos.distance_to(enemies[i].pos) <= base.dan_radius + enemies[i].radius:
				damage_enemy(i, base.dan_damage)

func update_enemies(dt: float) -> void:
	for i in range(enemies.size() - 1, -1, -1):
		var enemy := enemies[i]
		enemy.hit_flash = maxf(0.0, enemy.hit_flash - dt)
		var direction: Vector2 = player.pos - enemy.pos
		var distance: float = direction.length()
		if distance > 0.01:
			enemy.pos += direction.normalized() * enemy.speed * dt + enemy.knockback * dt
			enemy.knockback = enemy.knockback.lerp(Vector2.ZERO, 1.0 - exp(-10.0 * dt))
		if distance <= enemy.radius + 16.0:
			damage_player(enemy.damage)

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
		floaters[i].pos.y -= 24.0 * dt
		if floaters[i].life <= 0.0:
			floaters.remove_at(i)
	for i in range(particles.size() - 1, -1, -1):
		particles[i].life -= dt
		if particles[i].life <= 0.0:
			particles.remove_at(i)

# Temporary stub; Task 9 replaces this with the real result flow.
func finish_run(_victory: bool) -> void:
	push_error("finish_run is not implemented until Task 9")

func toggle_mute() -> void:
	muted = not muted
	_emit_hud()
