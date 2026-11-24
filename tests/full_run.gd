extends SceneTree

var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.start_run()
	scene.player.hp = 100000.0
	scene.player.max_hp = 100000.0
	for i in range(1400):
		if scene.phase == scene.Phase.ENDED:
			break
		if scene.phase == scene.Phase.LEVELUP:
			scene.choose_upgrade(i % 3)
		scene.step(0.05)
	_check(scene.phase == scene.Phase.ENDED, "accelerated 60-second run must end")
	_check(scene.ended_victory, "accelerated 60-second run must survive")
	_check(is_equal_approx(scene.time_sec, 60.0), "run clock must stop at 60 seconds")
	_check(scene.kills > 0, "auto combat must record kills")
	print("FULL_RUN time=", snappedf(scene.time_sec, 0.1), " kills=", scene.kills, " level=", scene.level, " violations=", scene.violations, " enemies=", scene.enemies.size(), " phase=", scene.phase, " victory=", scene.ended_victory, " fuel=", scene.player.fuel)
	scene.queue_free()
	await _frames(2)
	quit(1 if failures > 0 else 0)

func _check(condition: bool, message: String) -> void:
	if condition:
		print("PASS: ", message)
	else:
		printerr("FAIL: ", message)
		failures += 1

func _frames(count: int) -> void:
	for i in range(count):
		await process_frame
