extends SceneTree

## 《墨夜点灯人》自动化测试：环境音场 + 手柄焦点导航（Godot 4.7.2 无头模式）
## 运行命令：
## $GODOT --headless --path $PROJECT --script tests/sound_and_gamepad.gd

const SoundscapeScript = preload("res://scripts/ambient_soundscape.gd")
const GamepadFocusScript = preload("res://scripts/gamepad_focus.gd")

var _passed: int = 0
var _failed: int = 0


func _assert_true(cond: bool, label: String) -> void:
	if cond:
		_passed += 1
		print("[PASS] " + label)
	else:
		_failed += 1
		push_error("[FAIL] " + label)


func _rms(samples: PackedFloat32Array) -> float:
	if samples.is_empty():
		return 0.0
	var acc: float = 0.0
	for s: float in samples:
		acc += s * s
	return sqrt(acc / float(samples.size()))


func _max_abs(samples: PackedFloat32Array) -> float:
	var m: float = 0.0
	for s: float in samples:
		var a: float = absf(s)
		if a > m:
			m = a
	return m


func _all_finite(samples: PackedFloat32Array) -> bool:
	for s: float in samples:
		if is_nan(s) or is_inf(s):
			return false
	return true


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_run_soundscape_tests()
	_run_gamepad_focus_tests()

	print("========================================")
	print("sound_and_gamepad: %d passed, %d failed" % [_passed, _failed])
	print("========================================")
	quit(0 if _failed == 0 else 1)


func _run_soundscape_tests() -> void:
	var snd: Node = SoundscapeScript.new()
	root.add_child(snd)

	# 1. 渡墨镇安全区：低频夜风轻柔且不削波
	snd.call("update_state", "TOWN", 0.0, false, false, false, 0.0)
	var town_buf: PackedFloat32Array = snd.call("synthesize_preview_samples", 4096)
	var town_rms: float = _rms(town_buf)
	_assert_true(_all_finite(town_buf), "soundscape: town samples finite")
	_assert_true(town_rms > 0.0005, "soundscape: town wind audible (rms=%f)" % town_rms)
	_assert_true(_max_abs(town_buf) <= 0.96, "soundscape: town peak bounded")

	# 2. 诡界 + 熄灯状态
	snd.call("update_state", "PLAYING", 1.0, true, false, false, 0.6)
	var spec_buf: PackedFloat32Array = snd.call("synthesize_preview_samples", 4096)
	_assert_true(_all_finite(spec_buf), "soundscape: spectral blackout finite")
	_assert_true(_rms(spec_buf) > 0.002, "soundscape: spectral drone active")

	# 3. 纸扎判官二相：竹篾沙沙层叠加，能量高于安全区
	snd.call("update_state", "PLAYING", 0.5, false, true, true, 1.0)
	var boss_buf: PackedFloat32Array = snd.call("synthesize_preview_samples", 4096)
	var boss_rms: float = _rms(boss_buf)
	_assert_true(_all_finite(boss_buf), "soundscape: boss phase2 finite")
	_assert_true(boss_rms > town_rms, "soundscape: boss bamboo rustle louder than town")
	_assert_true(_max_abs(boss_buf) <= 0.96, "soundscape: boss peak bounded")

	# 4. 静音开关完全归零
	snd.call("set_muted", true)
	var muted_buf: PackedFloat32Array = snd.call("synthesize_preview_samples", 512)
	_assert_true(_max_abs(muted_buf) == 0.0, "soundscape: mute outputs pure silence")
	snd.call("set_muted", false)
	snd.queue_free()


func _run_gamepad_focus_tests() -> void:
	# 1. 手柄 InputMap 注册与幂等性
	InkGamepadFocus.register_joypad_actions()
	var first_count: int = InputMap.action_get_events("flip_realm").size()
	InkGamepadFocus.register_joypad_actions()
	var second_count: int = InputMap.action_get_events("flip_realm").size()
	_assert_true(InputMap.has_action("flip_realm"), "gamepad: flip_realm action exists")
	_assert_true(InputMap.has_action("switch_form"), "gamepad: switch_form action exists")
	_assert_true(InputMap.has_action("town_interact"), "gamepad: town_interact action exists")
	_assert_true(first_count == second_count and first_count >= 2, "gamepad: register_joypad_actions idempotent")

	# 2. 线性焦点链跳过 disabled 并首尾闭环（如升级三选一 / 老油坊）
	var box: HBoxContainer = HBoxContainer.new()
	root.add_child(box)
	var b1: Button = Button.new()
	var b2: Button = Button.new()
	var b3: Button = Button.new()
	b2.disabled = true
	box.add_child(b1)
	box.add_child(b2)
	box.add_child(b3)

	var focused: Control = InkGamepadFocus.wire_focus_chain([b1, b2, b3], true, true)
	_assert_true(focused == b1, "gamepad: wire_focus_chain returns first enabled button")
	_assert_true(b1.get_node_or_null(b1.focus_neighbor_right) == b3, "gamepad: linear chain skips disabled button")
	_assert_true(b3.get_node_or_null(b3.focus_neighbor_right) == b1, "gamepad: linear chain wraps around")

	# 3. 2×2 网格 + 底部离开按钮（渡墨镇·辟邪祖火）
	var grid: GridContainer = GridContainer.new()
	root.add_child(grid)
	var cells: Array = []
	for _k: int in range(4):
		var c: Button = Button.new()
		grid.add_child(c)
		cells.append(c)
	var leave_btn: Button = Button.new()
	grid.add_child(leave_btn)

	var grid_first: Control = InkGamepadFocus.wire_grid_focus(cells, 2, leave_btn)
	var c0: Button = cells[0] as Button
	var c2: Button = cells[2] as Button
	_assert_true(grid_first == c0, "gamepad: grid focuses top-left card")
	_assert_true(c0.get_node_or_null(c0.focus_neighbor_bottom) == c2, "gamepad: grid vertical navigation works")
	_assert_true(c2.get_node_or_null(c2.focus_neighbor_bottom) == leave_btn, "gamepad: bottom row links to footer button")
	_assert_true(leave_btn.get_node_or_null(leave_btn.focus_neighbor_bottom) == c0, "gamepad: footer wraps to top-left")

	# 4. 渡墨镇双语与手柄交互提示
	var zh_kb: String = str(InkGamepadFocus.get_interact_prompt("oil_mill", false, "zh"))
	var zh_gp: String = str(InkGamepadFocus.get_interact_prompt("oil_mill", true, "zh"))
	var en_gp: String = str(InkGamepadFocus.get_interact_prompt("north_gate", true, "en"))
	_assert_true(zh_kb.contains("[E]") and zh_kb.contains("老油坊"), "gamepad: zh keyboard prompt correct")
	_assert_true(zh_gp.contains("[X / □]") and zh_gp.contains("老油坊"), "gamepad: zh gamepad prompt correct")
	_assert_true(en_gp.contains("[A / ✕]") and en_gp.contains("North Gate"), "gamepad: en gamepad prompt correct")

	box.queue_free()
	grid.queue_free()
