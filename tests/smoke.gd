extends SceneTree

var failures := 0

func _initialize() -> void:
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
