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
	var hud_script = load("res://scripts/hud.gd")
	if hud_script == null:
		printerr("FAIL: scripts/hud.gd is missing")
		quit(1)
		return
	var hud = hud_script.new()
	_check(hud.format_time(65.9) == "01:05", "HUD time must format as MM:SS")
	_check(hud.format_time(0.0) == "00:00", "zero time must format as 00:00")
	hud.free()
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
	quit(1 if failures > 0 else 0)

func _check(condition: bool, message: String) -> void:
	if condition:
		print("PASS: ", message)
	else:
		printerr("FAIL: ", message)
		failures += 1

func _new_main():
	var packed = load("res://scenes/main.tscn")
	if packed == null:
		printerr("FAIL: scenes/main.tscn is missing")
		return null
	var scene = packed.instantiate()
	root.add_child(scene)
	return scene
