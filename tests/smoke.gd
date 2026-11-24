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
