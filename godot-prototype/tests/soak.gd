extends SceneTree

func _initialize() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	call_deferred("_run", scene)

func _run(scene: InkMain) -> void:
	scene.start_run()
	scene.player.hp = 100000.0
	scene.player.max_hp = 100000.0
	var started := Time.get_ticks_msec()
	while scene.phase != scene.Phase.ENDED and Time.get_ticks_msec() - started < 70000:
		await process_frame
		if scene.phase == scene.Phase.LEVELUP:
			scene.choose_upgrade(0)
	var elapsed := float(Time.get_ticks_msec() - started) / 1000.0
	var passed := scene.ended_victory and is_equal_approx(scene.time_sec, 60.0)
	print("SOAK seconds=", snappedf(elapsed, 0.1), " phase=", scene.phase, " victory=", scene.ended_victory, " kills=", scene.kills, " level=", scene.level, " fps=", snappedf(Engine.get_frames_per_second(), 0.1))
	scene.queue_free()
	await _frames(2)
	quit(0 if passed else 1)

func _frames(count: int) -> void:
	for i in range(count):
		await process_frame
