# 墨夜提灯 Godot 技术样片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop-only Godot 4.7.2 vertical slice with a title screen, movement, lantern combat, realm flipping, three working taboos, upgrades and a 60-second result screen, then decide whether full migration is justified.

**Architecture:** One `Node2D` simulation drives a custom `CanvasItem` renderer and a separate `CanvasLayer` UI. All art is procedural. Gameplay data lives in one `RefCounted` data script. A `SceneTree` smoke script tests deterministic logic without opening a window.

**Tech Stack:** Godot 4.7.2, GDScript, CanvasItem `_draw()`, CanvasLayer/Control, InputMap, AudioStreamWAV, packed Google Fonts.

**Spec:** `/Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype/docs/superpowers/specs/2026-11-25-godot-prototype-design.md`

## Global Constraints

- Godot version is exactly `4.7.2.stable.official.ed1daf0bf`.
- Project root is `/Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype`.
- Desktop macOS only. Do not configure or test web export.
- Existing React project `/Users/yuanxxx/Desktop/claude-ai/task-1/Survivor` is read-only.
- Design resolution is `1440×900`; support window resizing with `canvas_items` stretch.
- Use the exact 18-color palette plus 3 XP greens from the spec.
- Run length is exactly `60.0` seconds. No boss, elites, punisher, meta progression, save system or Steam integration.
- The three sample taboos must all execute logic; displaying an unwired rule is a failure.
- Target `60 FPS` with `100` active enemies on the M1 Mac.
- Use TDD: write a failing smoke assertion before each logic change, then implement the smallest passing change.
- After adding or renaming a `class_name` script, run the headless editor import command once before `--script` tests so Godot refreshes its global class cache.
- Do not run `git commit` during execution unless the user explicitly authorizes implementation commits. Commit commands below are prepared but gated.
- Do not push to any remote.

## File Map

| File | Responsibility |
|---|---|
| `project.godot` | Engine config, main scene, viewport, rendering method |
| `.gitignore` | Exclude `.godot/`, temporary files and `.DS_Store` |
| `scenes/main.tscn` | Root simulation, world renderer, screen-copy light overlay, HUD layer |
| `scripts/data.gd` | Palette, player/enemy balance, fixed rules and upgrades |
| `scripts/main.gd` | State machine, input, simulation, combat, taboos, audio control |
| `scripts/renderer.gd` | Procedural world, entities, effects, lighting uniforms, screenshots |
| `scripts/hud.gd` | Title, HUD, pause, upgrade and result UI |
| `shaders/night_light.gdshader` | Screen-space lantern light, darkness, fog and vignette |
| `assets/fonts/` | Ma Shan Zheng, Noto Serif SC, Cinzel, JetBrains Mono and OFL licenses |
| `tests/smoke.gd` | Deterministic headless logic tests |
| `tests/capture.gd` | Windowed screenshot capture |
| `tests/benchmark.gd` | 100-enemy FPS benchmark |
| `docs/verification.md` | Test evidence, screenshots, failures and migration verdict |

---

### Task 1: Bootstrap the Godot project and lock the data contract

**Files:**
- Create: `project.godot`
- Create: `.gitignore`
- Create: `scripts/data.gd`
- Create: `tests/smoke.gd`

**Interfaces:**
- Consumes: approved spec and current `src/game/palette.ts`, `src/game/data.ts`.
- Produces: `InkData.palette() -> Dictionary`, `InkData.player_base() -> Dictionary`, `InkData.enemy(kind: String) -> Dictionary`, `InkData.fixed_rules() -> Array`, `InkData.fixed_upgrades() -> Array`, constants `WORLD_SIZE`, `WORLD_HALF`, `RUN_DURATION`, `XP_PER_LEVEL`.

- [ ] **Step 1: Create the failing data test**

Create `tests/smoke.gd`:

```gdscript
extends SceneTree

var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var data_script = load("res://scripts/data.gd")
	if data_script == null:
		printerr("FAIL: scripts/data.gd is missing")
		quit(1)
		return
	var data = data_script.new()
	_check(data.palette().size() == 21, "palette must contain 18 main colors plus 3 XP colors")
	_check(data.player_base().max_hp == 85.0, "player max HP must be 85")
	_check(data.enemy("ghost").hp == 16.0, "ghost HP must be 16")
	_check(data.enemy("jiangshi").speed == 50.0, "jiangshi speed must be 50")
	_check(data.fixed_rules().size() == 3, "sample must have exactly three rules")
	_check(data.fixed_upgrades().size() == 3, "sample must have exactly three upgrades")
	_check(data.RUN_DURATION == 60.0, "run duration must be 60 seconds")
	quit(1 if failures > 0 else 0)

func _check(condition: bool, message: String) -> void:
	if condition:
		print("PASS: ", message)
	else:
		printerr("FAIL: ", message)
		failures += 1
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --headless --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype --script res://tests/smoke.gd
```

Expected: failure because `res://scripts/data.gd` does not exist.

- [ ] **Step 3: Create `project.godot` and `.gitignore`**

`project.godot`:

```ini
config_version=5

[application]
config/name="墨夜提灯 Godot 技术样片"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.7", "GL Compatibility")

[display]
window/size/viewport_width=1440
window/size/viewport_height=900
window/size/window_width_override=1440
window/size/window_height_override=900
window/stretch/mode="canvas_items"
window/stretch/aspect="expand"

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
textures/default_filters/use_nearest_mipmap_filter=false
```

`.gitignore`:

```gitignore
.godot/
*.tmp
.DS_Store
```

- [ ] **Step 4: Create `scripts/data.gd`**

```gdscript
extends RefCounted
class_name InkData

const WORLD_SIZE := 2200.0
const WORLD_HALF := WORLD_SIZE * 0.5
const RUN_DURATION := 60.0
const XP_PER_LEVEL := 12

const PLAYER_BASE := {
	"max_hp": 85.0,
	"mortal_speed": 175.0,
	"spectral_speed": 190.0,
	"pickup_radius": 68.0,
	"hit_invuln_sec": 0.55,
	"flip_cooldown_sec": 3.0,
	"flip_freeze_sec": 0.52,
	"flip_blast_radius": 155.0,
	"flip_blast_damage": 24.0,
	"lantern_interval": 0.72,
	"lantern_damage": 12.0,
	"lantern_range": 310.0,
	"sheng_interval": 0.36,
	"sheng_damage": 16.0,
	"sheng_range": 215.0,
	"dan_interval": 0.92,
	"dan_damage": 14.0,
	"dan_radius": 108.0,
}

const ENEMY_TABLE := {
	"ghost": {"name": "游魂", "hp": 16.0, "speed": 64.0, "damage": 6.0, "xp": 2.0, "radius": 17.0},
	"jiangshi": {"name": "行尸", "hp": 48.0, "speed": 50.0, "damage": 11.0, "xp": 4.0, "radius": 20.0},
	"punisher": {"name": "白纸差役", "hp": 520.0, "speed": 145.0, "damage": 16.0, "xp": 0.0, "radius": 26.0},
}

const FIXED_RULES := [
	{"id": "shadow", "title": "切莫践踏阴影", "description": "莫在阴影中驻足", "broken": false, "progress": 0.0},
	{"id": "stranger", "title": "遇白衣莫搭言", "description": "勿近白衣人", "broken": false, "progress": 0.0},
	{"id": "blackout", "title": "熄灯须立光中", "description": "灯灭不可离光", "broken": false, "progress": 0.0},
]

const FIXED_UPGRADES := [
	{"id": "talisman", "name": "朱砂辟邪符", "description": "受击无敌 +0.15 秒，行步速度 +8"},
	{"id": "crane", "name": "云韶引魂鹤", "description": "拾取范围 +45，人间每 4 秒回血 +2"},
	{"id": "sword", "name": "云韶断妄刃", "description": "生剑气伤害 +4，出剑间隔 -0.03 秒"},
]

static func palette() -> Dictionary:
	return {
		"ink_deep": Color("#06090B"),
		"ink_night": Color("#0E1418"),
		"ink_slate": Color("#1C2A30"),
		"grey_dark": Color("#3D4A48"),
		"grey_mid": Color("#5C6B6B"),
		"grey_light": Color("#8A9A94"),
		"sage_dark": Color("#49554F"),
		"sage_mid": Color("#6E7F74"),
		"sage_light": Color("#93A894"),
		"bone_dark": Color("#B9B09A"),
		"bone": Color("#EDE6D6"),
		"bone_bright": Color("#FAF6EA"),
		"amber_dark": Color("#B97F22"),
		"amber": Color("#E8B34A"),
		"amber_bright": Color("#F5D98A"),
		"vermilion_dark": Color("#7C1E10"),
		"vermilion": Color("#C8402A"),
		"vermilion_bright": Color("#E4654A"),
		"xp_dark": Color("#3D8A4E"),
		"xp_mid": Color("#57B96A"),
		"xp_bright": Color("#8FD694"),
	}

static func player_base() -> Dictionary:
	return PLAYER_BASE.duplicate(true)

static func enemy(kind: String) -> Dictionary:
	return ENEMY_TABLE.get(kind, ENEMY_TABLE.ghost).duplicate(true)

static func fixed_rules() -> Array:
	return FIXED_RULES.duplicate(true)

static func fixed_upgrades() -> Array:
	return FIXED_UPGRADES.duplicate(true)
```

- [ ] **Step 5: Run the test and confirm it passes**

Run the same Godot command. Expected: seven `PASS` lines and exit code `0`.

- [ ] **Step 6: Commit only if implementation commits were authorized**

```bash
git add project.godot .gitignore scripts/data.gd tests/smoke.gd
git commit -m "feat: bootstrap Godot prototype data contract"
```

---

### Task 2: Implement the state machine, input and deterministic movement

**Files:**
- Create: `scenes/main.tscn`
- Create: `scripts/main.gd`
- Modify: `tests/smoke.gd`

**Interfaces:**
- Consumes: `InkData` from Task 1.
- Produces: `InkMain.start_run()`, `return_to_title()`, `toggle_pause()`, `step(dt: float)`, `get_snapshot() -> Dictionary`; signals `hud_changed(snapshot: Dictionary)`, `level_up(choices: Array)`, `run_finished(summary: Dictionary)`; properties `phase`, `realm`, `face`, `time_sec`, `player`, `camera`, `enemies`, `gems`, `projectiles`, `particles`, `slashes`, `floaters`, `hazards`, `violations`.

- [ ] **Step 1: Add failing state and movement tests**

Append these calls inside `_run()` before `quit()`:

```gdscript
	var main_scene = _new_main()
	if main_scene == null:
		quit(1)
		return
	await process_frame
	var right_event_count := InputMap.action_get_events("move_right").size()
	main_scene._ensure_input_actions()
	_check(InputMap.action_get_events("move_right").size() == right_event_count, "input setup must be idempotent")
	_check(main_scene.phase == main_scene.Phase.TITLE, "initial phase must be title")
	main_scene.start_run()
	_check(main_scene.phase == main_scene.Phase.PLAYING, "start_run must enter playing")
	main_scene.step(1.0)
	_check(is_equal_approx(main_scene.time_sec, 1.0), "playing time must advance")
	main_scene.toggle_pause()
	var paused_time: float = main_scene.time_sec
	main_scene.step(1.0)
	_check(is_equal_approx(main_scene.time_sec, paused_time), "paused time must not advance")
	main_scene.toggle_pause()
	Input.action_press("move_right")
	main_scene.step(1.0)
	Input.action_release("move_right")
	_check(is_equal_approx(main_scene.player.pos.x, 175.0), "right movement must be 175 units in one second")
	_check(is_equal_approx(main_scene.player.pos.y, 0.0), "right movement must not change vertical position")
	main_scene.player.pos = Vector2.ZERO
	Input.action_press("move_right")
	Input.action_press("move_down")
	main_scene.step(1.0)
	Input.action_release("move_right")
	Input.action_release("move_down")
	_check(is_equal_approx(main_scene.player.pos.length(), 175.0), "diagonal movement must preserve total speed")
	_check(is_equal_approx(main_scene.player.pos.x, main_scene.player.pos.y), "diagonal movement must be normalized")
	main_scene.player.pos = Vector2(data.WORLD_HALF - 1.0, 0.0)
	Input.action_press("move_right")
	main_scene.step(0.1)
	Input.action_release("move_right")
	_check(main_scene.player.pos.x <= data.WORLD_HALF, "player must stay inside world bounds")
	main_scene.queue_free()
```

Add this helper to `tests/smoke.gd`. It intentionally has no `InkMain` return type so the RED run can fail cleanly before the class exists:

```gdscript
func _new_main():
	var packed = load("res://scenes/main.tscn")
	if packed == null:
		printerr("FAIL: scenes/main.tscn is missing")
		return null
	var scene = packed.instantiate()
	root.add_child(scene)
	return scene
```

- [ ] **Step 2: Run and confirm failure**

Expected: failure because `scenes/main.tscn` and `scripts/main.gd` do not exist.

- [ ] **Step 3: Create the minimal scene**

`scenes/main.tscn`:

```gdscene
[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/main.gd" id="1_main"]

[node name="Main" type="Node2D"]
script = ExtResource("1_main")
```

- [ ] **Step 4: Create `scripts/main.gd`**

```gdscript
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

func _ready() -> void:
	rng.randomize()
	_ensure_input_actions()
	_reset_run_state()
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

# Temporary stubs; later tasks replace these with real implementations.
func damage_player(_amount: float) -> void:
	push_error("damage_player is not implemented until Task 5")

func finish_run(_victory: bool) -> void:
	push_error("finish_run is not implemented until Task 9")

func toggle_mute() -> void:
	muted = not muted
	_emit_hud()
```

Tasks 5, 9 and 10 replace the stubs with real implementations. Task 2 tests do not reach the damage or finish branches.

- [ ] **Step 5: Run the test and confirm state/movement pass**

```bash
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --headless --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype --editor --quit
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --headless --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype --script res://tests/smoke.gd
```

Expected: all previous data checks plus state and movement checks pass.

- [ ] **Step 6: Commit only if implementation commits were authorized**

```bash
git add scenes/main.tscn scripts/main.gd tests/smoke.gd
git commit -m "feat: add Godot state machine and movement"
```

---

### Task 3: Draw the graveyard, player and lantern lighting

**Files:**
- Create: `scripts/renderer.gd`
- Create: `shaders/night_light.gdshader`
- Modify: `scenes/main.tscn`
- Modify: `scripts/main.gd`
- Modify: `tests/smoke.gd`

**Interfaces:**
- Consumes: `InkMain` simulation and viewport size.
- Produces: `InkRenderer.setup(sim)`, `InkRenderer.make_scenery(seed_value: int) -> Array`, `InkRenderer.capture_screenshot(path: String)`, `InkRenderer.set_light_uniforms()`.

- [ ] **Step 1: Add a failing deterministic scenery test**

```gdscript
	var renderer_script = load("res://scripts/renderer.gd")
	if renderer_script == null:
		printerr("FAIL: scripts/renderer.gd is missing")
		quit(1)
		return
	var renderer = renderer_script.new()
	var scenery_a = renderer.make_scenery(20261125)
	var scenery_b = renderer.make_scenery(20261125)
	_check(scenery_a.size() >= 60, "scenery must contain at least 60 props")
	_check(scenery_a == scenery_b, "same seed must produce identical scenery")
	_check(scenery_a[0].pos == scenery_b[0].pos, "scenery positions must be deterministic")
	renderer.free()
```

- [ ] **Step 2: Run and confirm failure**

Expected: failure because `renderer.gd` does not exist.

- [ ] **Step 3: Port the drawing surface using this exact mapping**

Read these current web renderer methods and port only the sample-required ones:

| Current TypeScript method | Godot implementation |
|---|---|
| `drawMoonAndSkyMist` | `draw_circle`, low-alpha `draw_circle` mist bands |
| `drawDirtRoadAndGround` | world-fill `draw_rect`, layered `draw_polygon` road |
| `drawTombstone` | `draw_rect`, `draw_arc`, `draw_line`, glyph `draw_string` |
| `drawBrokenWall` | `draw_rect` blocks with deterministic offsets |
| `drawStoneLantern` | stacked rectangles and amber light circles |
| `drawBamboo` | `draw_line` stems and `draw_polygon` leaves |
| `drawGrassTuft` | 3–5 `draw_line` strokes |
| `drawLanternYouthBody` | body polygons, hat rectangles, lantern circle |
| `drawAtmosphericLighting` | `BackBufferCopy` plus `night_light.gdshader` |
| `drawForegroundMist` | 6 slow translucent ellipses/circles |

Use this coordinate rule: world drawing happens under `draw_set_transform(viewport_size * 0.5 - sim.camera)`. Reset with `draw_set_transform(Vector2.ZERO)` before screen-space effects.

- [ ] **Step 4: Create `scripts/renderer.gd`**

```gdscript
extends Node2D
class_name InkRenderer

var sim: InkMain
var scenery: Array[Dictionary] = []
var visual_time := 0.0

func setup(target: InkMain) -> void:
	sim = target
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
	_draw_player(palette)
	draw_set_transform(Vector2.ZERO)
	_draw_moon(palette, viewport_size)
	_draw_foreground_mist(palette, viewport_size)

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
	var font := ThemeDB.fallback_font
	draw_string(font, pos + Vector2(-10.0, 4.0), glyph, HORIZONTAL_ALIGNMENT_LEFT, -1.0, int(18.0 * scale_value), palette.grey_light)

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

func _draw_player(palette: Dictionary) -> void:
	var pos: Vector2 = sim.player.pos
	var bob := sin(sim.player.walk * 0.08) * 2.0 if sim.player.vel.length_squared() > 1.0 else 0.0
	draw_circle(pos + Vector2(0.0, 18.0), 18.0, Color(0.0, 0.0, 0.0, 0.35))
	draw_rect(Rect2(pos + Vector2(-13.0, -24.0 + bob), Vector2(26.0, 38.0)), palette.grey_mid)
	draw_circle(pos + Vector2(0.0, -30.0 + bob), 11.0, palette.bone_dark)
	draw_rect(Rect2(pos + Vector2(-17.0, -42.0 + bob), Vector2(34.0, 7.0)), palette.ink_deep)
	draw_rect(Rect2(pos + Vector2(-12.0, -49.0 + bob), Vector2(24.0, 8.0)), palette.ink_slate)
	var lantern_pos := pos + Vector2(20.0 * sim.player.facing, -10.0 + bob)
	draw_circle(lantern_pos, 42.0, Color(palette.amber, 0.08))
	draw_circle(lantern_pos, 25.0, Color(palette.amber, 0.15))
	draw_rect(Rect2(lantern_pos - Vector2(7.0, 10.0), Vector2(14.0, 20.0)), palette.amber)
	draw_rect(Rect2(lantern_pos - Vector2(9.0, 12.0), Vector2(18.0, 16.0)), palette.amber_bright)
	draw_line(lantern_pos + Vector2(0.0, -14.0), lantern_pos + Vector2(0.0, -10.0), palette.ink_deep, 2.0)

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
	var light_center: Vector2 = sim.player.pos - sim.camera + viewport_size * 0.5
	overlay.material.set_shader_parameter("light_center", light_center / viewport_size)
	overlay.material.set_shader_parameter("viewport_size", viewport_size)
	overlay.material.set_shader_parameter("light_radius", 235.0 if sim.realm == "mortal" else 185.0)
	overlay.material.set_shader_parameter("darkness", 0.62 if sim.realm == "mortal" else 0.72)

func capture_screenshot(path: String) -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var error := image.save_png(path)
	if error != OK:
		push_error("screenshot save failed: " + error_string(error))
```

- [ ] **Step 5: Create `shaders/night_light.gdshader`**

```gdshader
shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;
uniform vec2 light_center = vec2(0.5, 0.5);
uniform vec2 viewport_size = vec2(1440.0, 900.0);
uniform float light_radius = 235.0;
uniform float darkness = 0.62;
uniform float fog_amount = 0.16;

void fragment() {
	vec3 source = texture(screen_texture, SCREEN_UV).rgb;
	float distance_to_light = length((SCREEN_UV - light_center) * viewport_size);
	float light = 1.0 - smoothstep(light_radius * 0.25, light_radius, distance_to_light);
	float vignette = smoothstep(0.25, 0.78, length(SCREEN_UV - vec2(0.5)));
	vec3 color = source * mix(1.0 - darkness, 1.0, light);
	color = mix(color, vec3(0.035, 0.05, 0.06), vignette * 0.28 + fog_amount * 0.12);
	COLOR = vec4(color, 1.0);
}
```

- [ ] **Step 6: Replace `scenes/main.tscn` with the layered scene**

```gdscene
[gd_scene load_steps=5 format=3]

[ext_resource type="Script" path="res://scripts/main.gd" id="1_main"]
[ext_resource type="Script" path="res://scripts/renderer.gd" id="2_renderer"]
[ext_resource type="Shader" path="res://shaders/night_light.gdshader" id="3_light"]

[sub_resource type="ShaderMaterial" id="ShaderMaterial_night"]
shader = ExtResource("3_light")

[node name="Main" type="Node2D"]
script = ExtResource("1_main")

[node name="WorldView" type="Node2D" parent="."]
script = ExtResource("2_renderer")

[node name="ScreenLayer" type="CanvasLayer" parent="."]

[node name="BackBufferCopy" type="BackBufferCopy" parent="ScreenLayer"]
copy_mode = 2

[node name="LightOverlay" type="ColorRect" parent="ScreenLayer"]
material = SubResource("ShaderMaterial_night")
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
grow_horizontal = 2
grow_vertical = 2
mouse_filter = 2
```

- [ ] **Step 7: Connect renderer in `main.gd` `_ready()`**

Add this class member near the other `@onready` variables:

```gdscript
@onready var world_view: InkRenderer = $WorldView
```

In `_ready()`, after `_reset_run_state()` and before `_emit_hud()`, call:

```gdscript
	world_view.setup(self)
```

- [ ] **Step 8: Run headless import and smoke test**

```bash
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --headless --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype --editor --quit
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --headless --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype --script res://tests/smoke.gd
```

Expected: no import errors; deterministic scenery assertions pass.

- [ ] **Step 9: Open the window and inspect the title background**

```bash
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype
```

Expected: graveyard, moon, bamboo, player and lantern light render. No black screen.

- [ ] **Step 10: Commit only if implementation commits were authorized**

```bash
git add scenes/main.tscn scripts/main.gd scripts/renderer.gd shaders/night_light.gdshader tests/smoke.gd
git commit -m "feat: draw ink-night graveyard and lantern lighting"
```

---

### Task 4: Add fonts, title screen and HUD

**Files:**
- Create: `assets/fonts/MaShanZheng-Regular.ttf`
- Create: `assets/fonts/NotoSerifSC[wght].ttf`
- Create: `assets/fonts/Cinzel[wght].ttf`
- Create: `assets/fonts/JetBrainsMono[wght].ttf`
- Create: four matching `OFL.txt` license files
- Create: `scripts/hud.gd`
- Modify: `scenes/main.tscn`
- Modify: `tests/smoke.gd`

**Interfaces:**
- Consumes: `InkMain.get_snapshot()`, `hud_changed`, `level_up`, `run_finished`.
- Produces: `InkHud.setup(sim)`, `InkHud.show_snapshot(snapshot: Dictionary)`, `InkHud.show_level_up(choices: Array)`, `InkHud.show_result(summary: Dictionary)`; buttons call `sim.start_run()`, `sim.toggle_pause()`, `sim.choose_upgrade(index)` and `sim.return_to_title()`.

- [ ] **Step 1: Download fonts and licenses**

```bash
cd /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype
mkdir -p assets/fonts
curl -L --fail -o assets/fonts/MaShanZheng-Regular.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf
curl -L --fail -o assets/fonts/MaShanZheng-OFL.txt https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/OFL.txt
curl -L --fail -o 'assets/fonts/NotoSerifSC[wght].ttf' 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf'
curl -L --fail -o assets/fonts/NotoSerifSC-OFL.txt https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt
curl -L --fail -o 'assets/fonts/Cinzel[wght].ttf' 'https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf'
curl -L --fail -o assets/fonts/Cinzel-OFL.txt https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/OFL.txt
curl -L --fail -o 'assets/fonts/JetBrainsMono[wght].ttf' 'https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf'
curl -L --fail -o assets/fonts/JetBrainsMono-OFL.txt https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/OFL.txt
```

- [ ] **Step 2: Add a failing time-format test**

```gdscript
	var hud_script = load("res://scripts/hud.gd")
	if hud_script == null:
		printerr("FAIL: scripts/hud.gd is missing")
		quit(1)
		return
	var hud = hud_script.new()
	_check(hud.format_time(65.9) == "01:05", "HUD time must format as MM:SS")
	_check(hud.format_time(0.0) == "00:00", "zero time must format as 00:00")
	hud.free()
```

- [ ] **Step 3: Run and confirm failure**

Expected: failure because `hud.gd` does not exist.

- [ ] **Step 4: Build `scripts/hud.gd` from the current React components**

Port `src/components/TitleOverlay.tsx`, `src/components/GameHud.tsx`, and `src/components/Modals.tsx` with these exact node responsibilities:

- In `renderer.gd`, add `var body_font: Font = ThemeDB.fallback_font` and set `body_font = load("res://assets/fonts/NotoSerifSC[wght].ttf")` inside `setup()`. Replace the tombstone `ThemeDB.fallback_font` call with `body_font`.
- Root `Control` fills the viewport and has `mouse_filter = IGNORE`.
- `TitlePanel` contains title brush font `72`, subtitle `18`, primary Button `执灯入夜`, disabled Button `守夜行囊`, and control hint `14`.
- `GameHud` contains left parchment `Panel`, top-center rule `HBoxContainer`, right `Panel`, fuel/HP `ProgressBar`s and pause/mute buttons.
- `ModalLayer` contains a centered `PanelContainer` with `VBoxContainer`; reuse it for level-up, pause and result.
- Colors and border widths come from `src/index.css:38-119`. Primary amber buttons (`执灯入夜`, `再入墨夜`) use ink-dark text; the HP bar uses amber, not vermilion, because vermilion is reserved for taboos and alerts.

Implement these exact public methods:

```gdscript
func setup(target: InkMain) -> void
func show_snapshot(snapshot: Dictionary) -> void
func show_level_up(choices: Array) -> void
func show_result(summary: Dictionary) -> void
func format_time(seconds: float) -> String:
	return "%02d:%02d" % [int(seconds / 60.0), int(seconds) % 60]
```

`show_snapshot()` must hide title/modal panels when `snapshot.phase == PLAYING`, show the title panel for `TITLE`, show pause modal for `PAUSED`, and update HP/fuel/time/XP/rule labels every call. `show_level_up()` creates exactly three Buttons labelled `1`, `2`, `3`, connects them to `sim.choose_upgrade(index)`, and calls `grab_focus()` on the first Button so gamepad Confirm works. `show_result()` shows time, kills, violations and a restart button.

- [ ] **Step 5: Add HUD to `scenes/main.tscn`**

Change `load_steps=5` to `load_steps=6`, then add this ext resource:

```gdscene
[ext_resource type="Script" path="res://scripts/hud.gd" id="4_hud"]
```

Add this node under `ScreenLayer`:

```gdscene
[node name="Hud" type="Control" parent="ScreenLayer"]
layout_mode = 3
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
grow_horizontal = 2
grow_vertical = 2
mouse_filter = 0
script = ExtResource("4_hud")
```

- [ ] **Step 6: Connect HUD signals in `main.gd`**

```gdscript
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
```

- [ ] **Step 7: Run headless test and capture title screenshot**

```bash
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --headless --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype --script res://tests/smoke.gd
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype
```

Expected: title text, buttons and HUD render with bundled fonts; no missing-font boxes.

- [ ] **Step 8: Commit only if implementation commits were authorized**

```bash
git add assets/fonts scripts/hud.gd scenes/main.tscn scripts/main.gd tests/smoke.gd
git commit -m "feat: add title screen and ink-parchment HUD"
```

---

### Task 5: Implement player attacks, enemies, contact damage and drops

**Files:**
- Modify: `scripts/main.gd`
- Modify: `scripts/renderer.gd`
- Modify: `tests/smoke.gd`

**Interfaces:**
- Consumes: state and data from Tasks 1–4.
- Produces: `spawn_enemy(kind: String, pos: Vector2) -> int`, `spawn_punisher() -> int`, `damage_enemy(index: int, amount: float)`, `damage_player(amount: float)`, `find_nearest_enemy(max_range: float) -> int`, `update_waves(dt: float)`, `update_combat(dt: float)`, `update_enemies(dt: float)`, `update_effects(dt: float)`.

- [ ] **Step 1: Add failing combat tests**

```gdscript
	var combat_scene = _new_main()
	await process_frame
	if not combat_scene.has_method("spawn_enemy"):
		printerr("FAIL: combat methods are missing")
		quit(1)
		return
	combat_scene.start_run()
	var enemy_index = combat_scene.spawn_enemy("ghost", Vector2(80.0, 0.0))
	_check(combat_scene.enemies[enemy_index].hp == 16.0, "spawned ghost must have 16 HP")
	combat_scene.damage_enemy(enemy_index, 1.0)
	_check(combat_scene.enemies[enemy_index].hp == 15.0, "nonlethal hit must reduce enemy HP")
	_check(combat_scene.enemies[enemy_index].knockback.length() > 0.0, "hit must apply knockback")
	combat_scene.damage_enemy(enemy_index, 15.0)
	_check(combat_scene.enemies.is_empty(), "dead enemy must be removed")
	_check(combat_scene.gems.size() == 1, "dead ghost must drop one gem")
	_check(combat_scene.kills == 1, "kill count must increment")
	combat_scene.spawn_enemy("jiangshi", combat_scene.player.pos)
	combat_scene.damage_player(11.0)
	_check(combat_scene.player.hp == 74.0, "contact damage must reduce HP")
	combat_scene.damage_player(11.0)
	_check(combat_scene.player.hp == 74.0, "invulnerability must block immediate second hit")
	combat_scene.queue_free()
```

- [ ] **Step 2: Run and confirm failure**

Expected: failures for missing combat methods.

- [ ] **Step 3: Add combat methods to `main.gd`**

Port behavior from `src/game/engine.ts:935-1093`, `1134-1457`, `1458-1582`, `1642-1757`, `2060-2192`. Use the following exact method bodies as the simulation contract:

```gdscript
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
```

- [ ] **Step 4: Call combat updates from `step()`**

After camera smoothing and before the 60-second finish check:

```gdscript
	if flip_freeze <= 0.0:
		update_combat(dt)
	update_waves(dt)
	update_enemies(dt)
	update_effects(dt)
```

- [ ] **Step 5: Port enemy and effect drawing**

Add renderer calls for `sim.enemies`, `sim.gems`, `sim.projectiles`, `sim.slashes`, `sim.floaters`, and `sim.particles`. Port `drawGhostSprite`, `drawJiangshiSprite`, `drawSlashEffect`, `drawProjectile`, `drawParticles`, `drawFloatingNumbers` from the current renderer. Use the exact palette keys from Task 1.

- [ ] **Step 6: Run tests and a 20-second manual combat check**

Expected: enemies chase, lantern auto-attacks, ghosts die and drop gems, contact damage respects invulnerability, death opens the result path.

- [ ] **Step 7: Commit only if implementation commits were authorized**

```bash
git add scripts/main.gd scripts/renderer.gd tests/smoke.gd
git commit -m "feat: add survivor combat and enemy drops"
```

---

### Task 6: Implement realm flipping, opera faces and attack feel

**Files:**
- Modify: `scripts/main.gd`
- Modify: `scripts/renderer.gd`
- Modify: `tests/smoke.gd`

**Interfaces:**
- Consumes: combat methods from Task 5.
- Produces: `flip_realm() -> bool`, `toggle_face()`, `trigger_flip_input()`, `trigger_face_input()`; updated `hazards.frozen_light`.

- [ ] **Step 1: Add failing flip tests**

```gdscript
	var flip_scene = _new_main()
	await process_frame
	if not flip_scene.has_method("flip_realm"):
		printerr("FAIL: realm flip methods are missing")
		quit(1)
		return
	flip_scene.start_run()
	flip_scene.spawn_enemy("ghost", Vector2(60.0, 0.0))
	_check(flip_scene.flip_realm(), "first flip must succeed")
	_check(flip_scene.realm == "spectral", "flip must enter spectral realm")
	_check(flip_scene.flip_freeze > 0.0, "flip must freeze simulation briefly")
	_check(flip_scene.enemies.is_empty(), "flip blast must kill nearby ghost")
	_check(not flip_scene.flip_realm(), "flip must fail during cooldown")
	flip_scene.face = "sheng"
	flip_scene.toggle_face()
	_check(flip_scene.face == "dan", "Q must toggle sheng to dan")
	flip_scene.queue_free()
```

- [ ] **Step 2: Run and confirm failure**

Expected: missing flip methods fail.

- [ ] **Step 3: Port `tryFlipRealm` and `toggleOperaFace`**

Port `src/game/engine.ts:835-934` with this contract:

```gdscript
func flip_realm() -> bool:
	if phase != Phase.PLAYING or flip_cooldown > 0.0:
		return false
	realm = "spectral" if realm == "mortal" else "mortal"
	flip_cooldown = InkData.player_base().flip_cooldown_sec
	flip_freeze = InkData.player_base().flip_freeze_sec
	player.fuel = maxf(0.0, player.fuel - 8.0)
	var blast_radius: float = InkData.player_base().flip_blast_radius
	for i in range(enemies.size() - 1, -1, -1):
		if player.pos.distance_to(enemies[i].pos) <= blast_radius:
			damage_enemy(i, InkData.player_base().flip_blast_damage)
	slashes.append({"pos": player.pos, "radius": blast_radius, "life": 0.42, "face": "flip"})
	particles.append({"pos": player.pos, "vel": Vector2.ZERO, "life": 0.35, "color": InkData.palette().bone_bright})
	return true

func toggle_face() -> void:
	if phase != Phase.PLAYING:
		return
	if realm == "spectral":
		face = "dan" if face == "sheng" else "sheng"
	else:
		face = "dan"
		flip_realm()

func trigger_flip_input() -> void:
	flip_realm()

func trigger_face_input() -> void:
	toggle_face()
```

- [ ] **Step 4: Bind actions in `_unhandled_input()`**

```gdscript
func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		toggle_pause()
	elif event.is_action_pressed("confirm") and phase == Phase.TITLE:
		start_run()
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
```

- [ ] **Step 5: Add flip and opera rendering**

Port `drawShengOperaBody`, `drawDanOperaBody`, `drawSlashEffect`, and the `realmTransitionFlash` portion of `drawAtmosphericLighting`. Spectral realm must use darkness `0.72` and lantern radius `185`; mortal uses `0.62` and `235`.

- [ ] **Step 6: Run tests and manually verify feel**

Expected: Space flips realm, creates a radial blast, freezes briefly and starts cooldown; Q changes attack style; HUD text changes between `人间·提灯` and `诡界·生剑/旦`.

- [ ] **Step 7: Commit only if implementation commits were authorized**

```bash
git add scripts/main.gd scripts/renderer.gd tests/smoke.gd
git commit -m "feat: add realm flipping and opera attacks"
```

---

### Task 7: Implement pickups, XP, level-up and fixed upgrades

**Files:**
- Modify: `scripts/main.gd`
- Modify: `scripts/hud.gd`
- Modify: `tests/smoke.gd`

**Interfaces:**
- Consumes: drops and combat from Task 5.
- Produces: `update_pickups(dt: float)`, `add_xp(amount: float)`, `choose_upgrade(index: int)`, `current_upgrade_choices() -> Array`.

- [ ] **Step 1: Add failing pickup and upgrade tests**

```gdscript
	var upgrade_scene = _new_main()
	await process_frame
	if not upgrade_scene.has_method("update_pickups"):
		printerr("FAIL: pickup and upgrade methods are missing")
		quit(1)
		return
	upgrade_scene.start_run()
	upgrade_scene.gems.append({"pos": upgrade_scene.player.pos, "value": 12.0, "life": 20.0})
	upgrade_scene.update_pickups(0.016)
	_check(upgrade_scene.phase == upgrade_scene.Phase.LEVELUP, "enough XP must open level-up")
	_check(upgrade_scene.level == 2, "level must increment")
	_check(upgrade_scene.current_upgrade_choices().size() == 3, "level-up must offer three choices")
	upgrade_scene.player.hp = 50.0
	upgrade_scene.choose_upgrade(0)
	_check(is_equal_approx(upgrade_scene.player.invuln_bonus, 0.15), "talisman must add invulnerability")
	_check(is_equal_approx(upgrade_scene.player.speed_bonus, 8.0), "talisman must add speed")
	_check(upgrade_scene.phase == upgrade_scene.Phase.PLAYING, "choosing upgrade must resume")
	upgrade_scene.phase = upgrade_scene.Phase.LEVELUP
	upgrade_scene.choose_upgrade(1)
	_check(is_equal_approx(upgrade_scene.player.pickup_radius, 113.0), "crane must add pickup radius")
	_check(is_equal_approx(upgrade_scene.player.regen, 2.0), "crane must add mortal regeneration")
	upgrade_scene.phase = upgrade_scene.Phase.LEVELUP
	upgrade_scene.choose_upgrade(2)
	_check(is_equal_approx(upgrade_scene.player.sheng_damage_bonus, 4.0), "sword upgrade must add sheng damage")
	_check(is_equal_approx(upgrade_scene.player.sheng_interval_bonus, -0.03), "sword upgrade must reduce sheng interval")
	upgrade_scene.phase = upgrade_scene.Phase.LEVELUP
	upgrade_scene.upgrade_levels.talisman = 3
	upgrade_scene.choose_upgrade(0)
	_check(upgrade_scene.phase == upgrade_scene.Phase.PLAYING, "maxed upgrade choice must not softlock")
	upgrade_scene.queue_free()
```

- [ ] **Step 2: Run and confirm failure**

Expected: missing pickup/upgrade methods fail.

- [ ] **Step 3: Implement pickups and upgrades**

```gdscript
func update_pickups(dt: float) -> void:
	for i in range(gems.size() - 1, -1, -1):
		var gem := gems[i]
		gem.life -= dt
		var offset: Vector2 = player.pos - gem.pos
		var distance := offset.length()
		if distance <= player.pickup_radius:
			gem.pos += offset.normalized() * 260.0 * dt
		if distance <= 18.0:
			add_xp(gem.value)
			gems.remove_at(i)
		elif gem.life <= 0.0:
			gems.remove_at(i)

func add_xp(amount: float) -> void:
	if phase != Phase.PLAYING:
		return
	xp += amount
	if xp < xp_to_next:
		return
	xp -= xp_to_next
	level += 1
	xp_to_next = float(InkData.XP_PER_LEVEL + (level - 1) * 5)
	phase = Phase.LEVELUP
	level_up.emit(current_upgrade_choices())
	_emit_hud()

func current_upgrade_choices() -> Array:
	return InkData.fixed_upgrades()

func choose_upgrade(index: int) -> void:
	if phase != Phase.LEVELUP:
		return
	var choices := current_upgrade_choices()
	if index < 0 or index >= choices.size():
		return
	var id: String = choices[index].id
	if upgrade_levels[id] >= 3:
		phase = Phase.PLAYING
		_emit_hud()
		return
	upgrade_levels[id] += 1
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
	phase = Phase.PLAYING
	_emit_hud()
```

- [ ] **Step 4: Apply pickups and crane regeneration in `step()`**

Call `update_pickups(dt)` after `update_effects(dt)`. Then add:

```gdscript
	if realm == "mortal" and player.regen > 0.0:
		player.regen_timer += dt
		if player.regen_timer >= 4.0:
			player.regen_timer = 0.0
			player.hp = minf(player.max_hp, player.hp + player.regen)
```

- [ ] **Step 5: Draw gems and test the full loop**

Port `drawPickupGem` from the current renderer. Run smoke test, then play until level 2 and choose each upgrade in separate runs.

- [ ] **Step 6: Commit only if implementation commits were authorized**

```bash
git add scripts/main.gd scripts/hud.gd tests/smoke.gd
git commit -m "feat: add XP pickups and level-up choices"
```

---

### Task 8: Implement all three fixed taboos

**Files:**
- Modify: `scripts/main.gd`
- Modify: `scripts/renderer.gd`
- Modify: `tests/smoke.gd`

**Interfaces:**
- Consumes: enemies, damage and HUD from earlier tasks.
- Produces: `setup_taboos()`, `update_taboos(dt: float)`, `violate_rule(rule_id: String)`, `is_in_shadow(pos: Vector2) -> bool`, `is_in_light(pos: Vector2) -> bool`.

- [ ] **Step 1: Add three failing taboo tests**

```gdscript
	var taboo_scene = _new_main()
	await process_frame
	if not taboo_scene.has_method("setup_taboos"):
		printerr("FAIL: taboo methods are missing")
		quit(1)
		return
	taboo_scene.start_run()
	taboo_scene.setup_taboos()
	var shadow_pos: Vector2 = taboo_scene.hazards.shadow_zones[0].pos
	taboo_scene.player.pos = shadow_pos
	taboo_scene.update_taboos(1.1)
	_check(taboo_scene.violations == 1, "shadow taboo must trigger after one second")
	_check(not taboo_scene.enemies.is_empty(), "shadow violation must spawn punisher")
	taboo_scene.hazards.white_stranger.active = true
	taboo_scene.hazards.white_stranger.pos = taboo_scene.player.pos + Vector2(20.0, 0.0)
	taboo_scene.update_taboos(0.016)
	_check(taboo_scene.violations == 2, "white stranger proximity must violate rule")
	taboo_scene.hazards.blackout_active = true
	taboo_scene.hazards.blackout_remaining = 5.0
	taboo_scene.hazards.frozen_light = Vector2(500.0, 500.0)
	taboo_scene.player.pos = Vector2.ZERO
	taboo_scene.update_taboos(0.016)
	_check(taboo_scene.violations == 3, "leaving frozen light during blackout must violate rule")
	taboo_scene.queue_free()
```

- [ ] **Step 2: Run and confirm failure**

Expected: missing taboo methods fail.

- [ ] **Step 3: Implement taboo setup and evaluation**

```gdscript
func setup_taboos() -> void:
	hazards.shadow_zones = [
		{"pos": Vector2(-260.0, -120.0), "radius": 95.0},
		{"pos": Vector2(310.0, 180.0), "radius": 110.0},
		{"pos": Vector2(-120.0, 390.0), "radius": 85.0},
	]
	hazards.white_stranger = {"active": false, "pos": Vector2(900.0, 900.0), "timer": 18.0}
	hazards.blackout_cycle = 28.0

func is_in_shadow(pos: Vector2) -> bool:
	for zone in hazards.shadow_zones:
		if pos.distance_to(zone.pos) <= zone.radius:
			return true
	return false

func is_in_light(pos: Vector2) -> bool:
	var radius: float = hazards.frozen_radius if hazards.blackout_active else (235.0 if realm == "mortal" else 185.0)
	var center: Vector2 = hazards.frozen_light if hazards.blackout_active else player.pos
	return pos.distance_to(center) <= radius

func update_taboos(dt: float) -> void:
	if is_in_shadow(player.pos):
		hazards.shadow_timer += dt
		if hazards.shadow_timer >= 1.0:
			hazards.shadow_timer = 0.0
			violate_rule("shadow")
	else:
		hazards.shadow_timer = 0.0
	if not hazards.white_stranger.active:
		hazards.white_stranger.timer -= dt
		if hazards.white_stranger.timer <= 0.0:
			hazards.white_stranger.active = true
			hazards.white_stranger.timer = 13.0
			var angle := rng.randf_range(0.0, TAU)
			hazards.white_stranger.pos = player.pos + Vector2(cos(angle), sin(angle)) * 330.0
	elif player.pos.distance_to(hazards.white_stranger.pos) <= 90.0:
		hazards.white_stranger.active = false
		hazards.white_stranger.timer = 22.0
		violate_rule("stranger")
	if not hazards.blackout_active:
		hazards.blackout_cycle -= dt
		if hazards.blackout_cycle <= 0.0:
			hazards.blackout_active = true
			hazards.blackout_remaining = 5.0
			hazards.frozen_light = player.pos
			hazards.frozen_radius = 235.0 if realm == "mortal" else 185.0
	else:
		hazards.blackout_remaining -= dt
		if hazards.blackout_remaining <= 0.0:
			hazards.blackout_active = false
			hazards.blackout_cycle = 28.0
		elif not is_in_light(player.pos):
			hazards.blackout_active = false
			hazards.blackout_cycle = 28.0
			violate_rule("blackout")

func violate_rule(rule_id: String) -> void:
	violations += 1
	for rule in rules:
		if rule.id == rule_id:
			rule.broken = true
	spawn_punisher()
	damage_player(8.0)
```

- [ ] **Step 4: Call `setup_taboos()` on run start and `update_taboos(dt)` each frame**

Add `setup_taboos()` at the end of `start_run()`. Add `update_taboos(dt)` in `step()` after movement and before combat.

- [ ] **Step 5: Draw taboo indicators**

- Shadow zones: translucent black polygons/circles with a thin vermilion edge only while the player is inside.
- White stranger: port `drawWhiteStranger` from the current renderer.
- Blackout: set shader `light_center` to `hazards.frozen_light` and `light_radius` to `hazards.frozen_radius` while active.
- Rule HUD: mark broken rules with vermilion and show violation count.

- [ ] **Step 6: Run tests and manually trigger each rule**

Expected: all three assertions pass; each rule visibly warns and spawns a pursuer.

- [ ] **Step 7: Commit only if implementation commits were authorized**

```bash
git add scripts/main.gd scripts/renderer.gd tests/smoke.gd
git commit -m "feat: implement three working night taboos"
```

---

### Task 9: Complete pause, success, defeat, restart and title flow

**Files:**
- Modify: `scripts/main.gd`
- Modify: `scripts/hud.gd`
- Modify: `tests/smoke.gd`

**Interfaces:**
- Consumes: all prior simulation systems.
- Produces: `finish_run(victory: bool)`, `restart_run()`, result summary keys `victory`, `time`, `kills`, `level`, `rules_kept`, `rules_total`, `violations`.

- [ ] **Step 1: Add failing end-flow tests**

```gdscript
	var end_scene = _new_main()
	await process_frame
	end_scene.start_run()
	end_scene.time_sec = InkData.RUN_DURATION
	end_scene.step(0.016)
	_check(end_scene.phase == end_scene.Phase.ENDED, "60 seconds must end the run")
	_check(end_scene.ended_victory, "surviving 60 seconds must be victory")
	if not end_scene.has_method("restart_run"):
		printerr("FAIL: restart_run is missing")
		quit(1)
		return
	end_scene.restart_run()
	_check(end_scene.phase == end_scene.Phase.PLAYING, "restart must begin a clean run")
	_check(end_scene.time_sec == 0.0, "restart must reset timer")
	_check(end_scene.player.hp == 85.0, "restart must reset HP")
	_check(end_scene.enemies.is_empty(), "restart must clear enemies")
	end_scene.player.hp = 1.0
	end_scene.invuln = 0.0
	end_scene.damage_player(99.0)
	_check(end_scene.phase == end_scene.Phase.ENDED, "lethal damage must end run")
	_check(not end_scene.ended_victory, "death must not count as victory")
	end_scene.restart_run()
	end_scene.return_to_title()
	_check(end_scene.phase == end_scene.Phase.TITLE, "return title must restore title phase")
	end_scene.queue_free()
```

- [ ] **Step 2: Run and confirm failure**

Expected: `finish_run()` and `restart_run()` are missing or incomplete.

- [ ] **Step 3: Implement end flow**

```gdscript
func finish_run(victory: bool) -> void:
	if phase == Phase.ENDED:
		return
	phase = Phase.ENDED
	ended_victory = victory
	time_sec = minf(time_sec, InkData.RUN_DURATION)
	var kept := 0
	for rule in rules:
		if not rule.broken:
			kept += 1
	var summary := {
		"victory": victory,
		"time": time_sec,
		"kills": kills,
		"level": level,
		"rules_kept": kept,
		"rules_total": rules.size(),
		"violations": violations,
	}
	run_finished.emit(summary)
	_emit_hud()

func restart_run() -> void:
	start_run()
```

- [ ] **Step 4: Implement result panel in `hud.gd`**

Show title `灯尽夜沉` on defeat or `守夜功成` on victory. Show formatted time, kills, `rules_kept/rules_total`, violations, and Buttons `再入墨夜` and `返回标题`. Connect them to `sim.restart_run()` and `sim.return_to_title()`.

- [ ] **Step 5: Run tests and both result paths**

Expected: success at 60 seconds, defeat at zero HP, clean restart and title return.

- [ ] **Step 6: Commit only if implementation commits were authorized**

```bash
git add scripts/main.gd scripts/hud.gd tests/smoke.gd
git commit -m "feat: complete pause and run result flow"
```

---

### Task 10: Add synthesized sound effects and mute

**Files:**
- Modify: `scripts/main.gd`
- Modify: `tests/smoke.gd`

**Interfaces:**
- Consumes: combat and UI state.
- Produces: `play_sfx(name: String)`, `toggle_mute()`, `_make_tone(frequency: float, duration: float, volume: float) -> AudioStreamWAV`.

- [ ] **Step 1: Add failing audio tests**

```gdscript
	var audio_scene = _new_main()
	await process_frame
	if not audio_scene.has_method("_make_tone"):
		printerr("FAIL: audio synthesis is missing")
		quit(1)
		return
	var stream: AudioStreamWAV = audio_scene._make_tone(440.0, 0.1, 0.2)
	_check(stream.data.size() > 0, "synthesized audio must contain PCM data")
	_check(stream.mix_rate == 22050, "audio sample rate must be 22050")
	audio_scene.toggle_mute()
	_check(audio_scene.muted, "mute toggle must update state")
	_check(AudioServer.is_bus_mute(0), "master bus must mute")
	audio_scene.toggle_mute()
	_check(not AudioServer.is_bus_mute(0), "master bus must unmute")
	audio_scene.queue_free()
	await process_frame
	await process_frame
```

- [ ] **Step 2: Run and confirm failure**

Expected: audio methods are missing.

- [ ] **Step 3: Implement audio**

```gdscript
var audio_players: Dictionary = {}

func _exit_tree() -> void:
	for player_node in audio_players.values():
		player_node.stop()
	audio_players.clear()

func _setup_audio() -> void:
	var definitions := {
		"lantern": [660.0, 0.08, 0.16],
		"sword": [220.0, 0.12, 0.20],
		"sleeve": [330.0, 0.16, 0.18],
		"hit": [110.0, 0.10, 0.22],
		"flip": [520.0, 0.28, 0.20],
		"level": [880.0, 0.30, 0.18],
		"violation": [92.0, 0.35, 0.24],
	}
	for name in definitions:
		var player_node := AudioStreamPlayer.new()
		player_node.stream = _make_tone(definitions[name][0], definitions[name][1], definitions[name][2])
		add_child(player_node)
		audio_players[name] = player_node

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

func play_sfx(name: String) -> void:
	if DisplayServer.get_name() == "headless" or muted or not audio_players.has(name):
		return
	audio_players[name].play()

func toggle_mute() -> void:
	muted = not muted
	AudioServer.set_bus_mute(0, muted)
	_emit_hud()
```

Call `_setup_audio()` in `_ready()`. Call `play_sfx()` in lantern attack, sword/sleeve attack, `damage_player`, `flip_realm`, `add_xp` and `violate_rule`.

- [ ] **Step 4: Run audio test and manual mute check**

Expected: PCM data exists, bus mute toggles, all seven effects are audible in a windowed run.

- [ ] **Step 5: Commit only if implementation commits were authorized**

```bash
git add scripts/main.gd tests/smoke.gd
git commit -m "feat: add synthesized combat audio and mute"
```

---

### Task 11: Capture screenshots, benchmark 100 enemies and write the verdict

**Files:**
- Create: `tests/capture.gd`
- Create: `tests/benchmark.gd`
- Create: `docs/screenshots/title.png`
- Create: `docs/screenshots/mortal.png`
- Create: `docs/screenshots/spectral.png`
- Create: `docs/screenshots/levelup.png`
- Create: `docs/screenshots/pause.png`
- Create: `docs/screenshots/result.png`
- Create: `docs/verification.md`

**Interfaces:**
- Consumes: complete sample from Tasks 1–10.
- Produces: six screenshots, FPS report, smoke report and migration verdict.

- [ ] **Step 1: Create `tests/capture.gd`**

```gdscript
extends SceneTree

var shot_index := 0

func _initialize() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	call_deferred("_run", scene)

func _run(scene: InkMain) -> void:
	DirAccess.make_dir_recursive_absolute("res://docs/screenshots")
	await _frames(8)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/title.png")
	scene.start_run()
	await _frames(120)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/mortal.png")
	scene.flip_realm()
	await _frames(45)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/spectral.png")
	scene.add_xp(999.0)
	await _frames(8)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/levelup.png")
	scene.choose_upgrade(0)
	scene.toggle_pause()
	await _frames(8)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/pause.png")
	scene.toggle_pause()
	scene.finish_run(true)
	await _frames(8)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/result.png")
	quit(0)

func _frames(count: int) -> void:
	for i in range(count):
		await process_frame
```

- [ ] **Step 2: Run capture and verify six files**

```bash
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype --script res://tests/capture.gd
ls -lh /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype/docs/screenshots
```

Expected: six non-empty PNG files.

- [ ] **Step 3: Create `tests/benchmark.gd`**

```gdscript
extends SceneTree

func _initialize() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	call_deferred("_run", scene)

func _run(scene: InkMain) -> void:
	scene.start_run()
	for i in range(100):
		var angle := TAU * float(i) / 100.0
		var radius := 380.0 + float(i % 7) * 35.0
		scene.spawn_enemy("ghost" if i % 2 == 0 else "jiangshi", Vector2(cos(angle), sin(angle)) * radius)
	var frames := 0
	var start := Time.get_ticks_msec()
	while Time.get_ticks_msec() - start < 5000:
		await process_frame
		frames += 1
	var elapsed := float(Time.get_ticks_msec() - start) / 1000.0
	var fps := float(frames) / elapsed
	print("BENCHMARK fps=", snappedf(fps, 0.1), " enemies=100 seconds=", snappedf(elapsed, 0.1))
	quit(0 if fps >= 55.0 else 1)
```

- [ ] **Step 4: Run full smoke and benchmark**

```bash
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --headless --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype --editor --quit
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --headless --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype --script res://tests/smoke.gd
/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot --path /Users/yuanxxx/Agents/qoder/tasks/ink/godot-prototype --script res://tests/benchmark.gd
```

Expected: import clean, smoke exit `0`, benchmark at least `55.0 FPS` average over five seconds.

- [ ] **Step 5: Perform visual comparison**

Open the six PNGs beside `/tmp/ink_title.png`, `/tmp/ink_fixed.png`, `/tmp/ink_spectral.png`, `/tmp/ink_levelup.png`, and `/tmp/ink_soak.png`. Check:

- same left-third title composition;
- same palette and amber-only lantern;
- same parchment HUD layout;
- recognizably same tombstones, bamboo, moon, ghosts and XP gems;
- spectral realm visibly darker than mortal;
- no font fallback boxes, clipped labels or stretched panels.

- [ ] **Step 6: Write `docs/verification.md`**

Record exact command outputs, FPS, six screenshot links, all failed checks, manual feel notes, time spent and one verdict: `PASS`, `FAIL`, or `PASS WITH LIMITATIONS`. Do not write PASS if any hard gate failed.

- [ ] **Step 7: Commit verification only if implementation commits were authorized**

```bash
git add tests/capture.gd tests/benchmark.gd docs/screenshots docs/verification.md
git commit -m "test: verify Godot prototype visuals and performance"
```

---

## Final Acceptance Checklist

- [ ] Godot 4.7.2 imports the project with no errors.
- [ ] Title, start, mute and control hints work.
- [ ] WASD/arrows and gamepad movement are normalized and bounded.
- [ ] Lantern, sheng and dan attacks work with visible feedback.
- [ ] Space flips realm with cooldown, freeze, blast and lighting change.
- [ ] Q toggles opera face as specified.
- [ ] Two enemy types chase, damage, die and drop XP.
- [ ] Level-up offers three working upgrades.
- [ ] Shadow, white-stranger and blackout taboos all trigger.
- [ ] Pause, 60-second victory, death, restart and title return work.
- [ ] Seven synthesized sound effects and mute work.
- [ ] Six screenshots exist and are visually compared.
- [ ] 100-enemy benchmark reaches at least 55 FPS average.
- [ ] `docs/verification.md` contains evidence and a migration verdict.
- [ ] Existing React project has no modifications.
