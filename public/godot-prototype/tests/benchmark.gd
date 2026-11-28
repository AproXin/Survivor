extends SceneTree

func _initialize() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	call_deferred("_run", scene)

func _run(scene: InkMain) -> void:
	scene.start_run()
	scene.player.hp = 100000.0
	scene.player.max_hp = 100000.0
	scene.attack_timer = 999.0
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
	var enemy_count := scene.enemies.size()
	print("BENCHMARK fps=", snappedf(fps, 0.1), " enemies=", enemy_count, " seconds=", snappedf(elapsed, 0.1))
	scene.queue_free()
	await _frames(2)
	quit(0 if fps >= 55.0 and enemy_count >= 95 else 1)

func _frames(count: int) -> void:
	for i in range(count):
		await process_frame
