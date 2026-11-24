extends SceneTree

func _initialize() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	call_deferred("_run", scene)

func _run(scene: InkMain) -> void:
	DirAccess.make_dir_recursive_absolute("res://docs/screenshots")
	await _frames(12)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/title.png")
	scene.start_run()
	await _frames(90)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/mortal.png")
	scene.flip_realm()
	await _frames(45)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/spectral.png")
	scene.add_xp(999.0)
	await _frames(10)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/levelup.png")
	scene.choose_upgrade(0)
	scene.toggle_pause()
	await _frames(10)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/pause.png")
	scene.toggle_pause()
	scene.finish_run(true)
	await _frames(10)
	await scene.get_node("WorldView").capture_screenshot("res://docs/screenshots/result.png")
	scene.queue_free()
	await _frames(2)
	quit(0)

func _frames(count: int) -> void:
	for i in range(count):
		await process_frame
