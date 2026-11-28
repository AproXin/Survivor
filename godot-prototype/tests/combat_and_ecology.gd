extends SceneTree

var passed: int = 0
var failed: int = 0

func _check(cond: bool, msg: String) -> void:
	if cond:
		passed += 1
	else:
		failed += 1
		printerr("FAIL: " + msg)

func _new_main() -> InkMain:
	var packed: PackedScene = load("res://scenes/main.tscn")
	var inst: InkMain = packed.instantiate()
	root.add_child(inst)
	return inst

func _initialize() -> void:
	await process_frame

	# 1. InkSpriteBank Aseprite JSON Tag + Legacy Compatibility (all 7 Cel-Ink actors)
	var bank: InkSpriteBank = InkSpriteBank.new()
	bank.load_manifest()
	for hero_key in ["player_mortal", "player_sheng", "player_dan"]:
		_check(bank.has_sheet(hero_key), hero_key + " sheet must load")
		for tag_name in ["idle", "move", "attack", "flip", "hit", "death"]:
			_check(bank.has_tag(hero_key, tag_name), hero_key + " must expose Aseprite tag: " + tag_name)
	for enemy_key in ["wolf", "boar", "treant", "shanxiao"]:
		_check(bank.has_sheet(enemy_key), enemy_key + " Cel-Ink sheet must load")
		for tag_name in ["idle", "move", "attack", "hit", "death"]:
			_check(bank.has_tag(enemy_key, tag_name), enemy_key + " must expose Aseprite tag: " + tag_name)
	var r_idle: Rect2 = bank.get_frame_region("player_mortal", "idle", 0.0)
	var r_move: Rect2 = bank.get_frame_region("player_mortal", "move", 0.0)
	var r_atk: Rect2 = bank.get_frame_region("player_mortal", "attack", 0.0)
	_check(r_idle.position.x != r_move.position.x, "idle and move tags must map to distinct frames")
	_check(r_move.position.x != r_atk.position.x, "move and attack tags must map to distinct frames")
	_check(bank.has_sheet("ghost") and not bank.has_tag("ghost", "idle"), "legacy 8-frame ghost sheet must remain compatible")

	# 2. Three-Form Combat Baseline (Mortal 120 deg slow / Sheng 3-pierce / Dan 220 deg knockback)
	var sim: InkMain = _new_main()
	await process_frame
	sim.start_run()
	sim.player.pos = Vector2.ZERO
	var baseline: Dictionary = InkData.combat_baseline()
	var mortal_b: Dictionary = baseline.get("mortal", {})
	var sheng_b: Dictionary = baseline.get("sheng", {})
	var dan_b: Dictionary = baseline.get("dan", {})
	_check(is_equal_approx(float(mortal_b.get("damage", 0.0)), 24.0), "mortal baseline dmg must be 24")
	_check(is_equal_approx(float(sheng_b.get("damage", 0.0)), 13.0), "sheng baseline dmg must be 13")
	_check(is_equal_approx(float(dan_b.get("damage", 0.0)), 28.0), "dan baseline dmg must be 28")

	# Test mortal 120° fan cone & 15% slow
	sim.enemies.clear()
	sim.spawn_enemy("jiangshi", Vector2(70.0, 0.0))
	sim.spawn_enemy("jiangshi", Vector2(65.0, 28.0))
	sim.attack_timer = 0.0
	sim.flip_freeze = 0.0
	sim.update_combat(0.016)
	_check(sim.enemies.size() == 2 and float(sim.enemies[0].hp) < 48.0 and float(sim.enemies[1].hp) < 48.0, "mortal lantern cone must hit multiple foes inside 120 deg")
	_check(float(sim.enemies[0].get("slow_timer", 0.0)) > 0.0, "mortal lantern cone must apply 0.6s slow")

	# Test sheng straight line pierce (up to 3 enemies)
	sim.enemies.clear()
	sim.realm = "spectral"
	sim.face = "sheng"
	sim.spawn_enemy("jiangshi", Vector2(40.0, 0.0))
	sim.spawn_enemy("jiangshi", Vector2(75.0, 0.0))
	sim.spawn_enemy("jiangshi", Vector2(110.0, 0.0))
	sim.spawn_enemy("jiangshi", Vector2(130.0, 0.0))
	sim.attack_timer = 0.0
	sim.flip_freeze = 0.0
	sim.update_combat(0.016)
	var sheng_hit_count: int = 0
	for e in sim.enemies:
		if float(e.hp) < 48.0:
			sheng_hit_count += 1
	_check(sheng_hit_count == 3, "sheng straight sword must pierce up to 3 aligned enemies")

	# Test dan 220° sweeping arc + knockback
	sim.enemies.clear()
	sim.face = "dan"
	sim.spawn_enemy("jiangshi", Vector2(80.0, 10.0))
	sim.attack_timer = 0.0
	sim.flip_freeze = 0.0
	sim.update_combat(0.016)
	_check(float(sim.enemies[0].hp) <= 20.0, "dan sleeve sweep must deal 28 base damage")
	_check(Vector2(sim.enemies[0].knockback).length() >= 180.0, "dan sleeve sweep must apply strong outward knockback")

	# Test 0.6s switch animation without blocking movement
	sim.switch_cooldown = 0.0
	sim.toggle_face()
	_check(sim.face == "sheng", "toggle_face must switch dan back to sheng")
	_check(is_equal_approx(sim.switch_anim_timer, 0.60), "switch_anim_timer must be 0.60s")
	sim.queue_free()

	# 3. Day/Night Ecology & Same-Site Dual-Realm Landmarks
	var eco: InkMain = _new_main()
	await process_frame
	eco.start_full_vigil()
	_check(eco.day_phase == "day" and is_equal_approx(eco.daylight_blend, 1.0), "full_vigil must start in daytime phase")
	eco.time_sec = 26.0
	eco.step(0.05)
	_check(eco.day_phase == "dusk", "full_vigil must transition to dusk after 24s")
	eco.time_sec = 38.0
	eco.step(0.05)
	_check(eco.day_phase == "night", "full_vigil must enter night after 36s")
	for kind in ["wolf", "boar", "treant", "shanxiao"]:
		var idx: int = eco.spawn_enemy(kind, Vector2(140.0, 40.0))
		_check(idx >= 0 and str(eco.enemies[idx].kind) == kind, "daytime enemy must spawn: " + kind)
	eco.update_enemies(0.05)
	eco.player.pos = Vector2(440.0, 340.0)
	var lm: Dictionary = eco.get_active_dual_landmark()
	_check(str(lm.get("id", "")) == "bridge", "dual-realm bridge landmark must resolve at stone bridge coords")
	eco.realm = "spectral"
	eco.funeral_procession["timer"] = 0.01
	eco._update_funeral_procession(0.05)
	_check(bool(eco.funeral_procession.get("active", false)), "spectral funeral procession must activate when timer expires")
	eco.queue_free()

	print("COMBAT_AND_ECOLOGY PASS: %d / %d" % [passed, passed + failed])
	quit(0 if failed == 0 else 1)
