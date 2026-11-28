class_name InkGamepadFocus
extends Node

## 《墨夜点灯人》手柄焦点导航与 InputMap 适配模块（Godot 4.7.2）
## 覆盖：
## 1. 全套游戏手柄 InputMap 绑定（左摇杆 + 十字键 + A/B/X/Y/LB/RB/Start），幂等可重复调用
## 2. 弹窗环形焦点链与二维网格焦点导航（渡墨镇三铺弹窗、升级三选一、暂停、结算）
## 3. 自动感知键鼠 / 手柄切换，动态刷新渡墨镇交互提示与按钮标签

signal input_device_changed(is_gamepad: bool)

var _using_gamepad: bool = false


func is_using_gamepad() -> bool:
	return _using_gamepad


func _input(event: InputEvent) -> void:
	if event is InputEventJoypadButton:
		var jb: InputEventJoypadButton = event as InputEventJoypadButton
		if jb.pressed and not _using_gamepad:
			_using_gamepad = true
			input_device_changed.emit(true)
	elif event is InputEventJoypadMotion:
		var jm: InputEventJoypadMotion = event as InputEventJoypadMotion
		if absf(jm.axis_value) > 0.35 and not _using_gamepad:
			_using_gamepad = true
			input_device_changed.emit(true)
	elif event is InputEventKey or event is InputEventMouseButton:
		if _using_gamepad:
			_using_gamepad = false
			input_device_changed.emit(false)


## 按项目约定安全补齐手柄按键映射，不覆盖原有 WASD/Space/Q/E/Esc/Enter 键位
static func register_joypad_actions() -> void:
	_ensure_axis("move_left", JOY_AXIS_LEFT_X, -1.0)
	_ensure_axis("move_right", JOY_AXIS_LEFT_X, 1.0)
	_ensure_axis("move_up", JOY_AXIS_LEFT_Y, -1.0)
	_ensure_axis("move_down", JOY_AXIS_LEFT_Y, 1.0)

	_ensure_button("move_left", JOY_BUTTON_DPAD_LEFT)
	_ensure_button("move_right", JOY_BUTTON_DPAD_RIGHT)
	_ensure_button("move_up", JOY_BUTTON_DPAD_UP)
	_ensure_button("move_down", JOY_BUTTON_DPAD_DOWN)

	# Space 翻界变脸 -> A / 右扳机 RB
	_ensure_button("flip_realm", JOY_BUTTON_A)
	_ensure_button("flip_realm", JOY_BUTTON_RIGHT_SHOULDER)

	# Q 切换生/旦 -> Y / 左扳机 LB
	_ensure_button("switch_form", JOY_BUTTON_Y)
	_ensure_button("switch_form", JOY_BUTTON_LEFT_SHOULDER)

	# E 渡墨镇交互 -> X
	_ensure_button("town_interact", JOY_BUTTON_X)

	# Esc 暂停/返回 -> Start / B
	_ensure_button("pause_game", JOY_BUTTON_START)
	_ensure_button("ui_cancel", JOY_BUTTON_B)
	_ensure_button("ui_accept", JOY_BUTTON_A)


static func _ensure_action(action_name: StringName) -> void:
	if not InputMap.has_action(action_name):
		InputMap.add_action(action_name, 0.25)


static func _ensure_button(action_name: StringName, button_index: JoyButton) -> void:
	_ensure_action(action_name)
	var existing: Array[InputEvent] = InputMap.action_get_events(action_name)
	for ev: InputEvent in existing:
		if ev is InputEventJoypadButton:
			var jb: InputEventJoypadButton = ev as InputEventJoypadButton
			if jb.button_index == button_index:
				return
	var added: InputEventJoypadButton = InputEventJoypadButton.new()
	added.button_index = button_index
	InputMap.action_add_event(action_name, added)


static func _ensure_axis(action_name: StringName, axis: JoyAxis, axis_value: float) -> void:
	_ensure_action(action_name)
	var existing: Array[InputEvent] = InputMap.action_get_events(action_name)
	for ev: InputEvent in existing:
		if ev is InputEventJoypadMotion:
			var jm: InputEventJoypadMotion = ev as InputEventJoypadMotion
			if jm.axis == axis and signf(jm.axis_value) == signf(axis_value):
				return
	var added: InputEventJoypadMotion = InputEventJoypadMotion.new()
	added.axis = axis
	added.axis_value = axis_value
	InputMap.action_add_event(action_name, added)


## 一维线性焦点链（升级三选一 / 老油坊三秘方 / 暂停 / 结算按钮）
## 自动跳过 disabled 按钮并支持首尾环形跳转
static func wire_focus_chain(controls: Array, horizontal: bool = true, wrap: bool = true) -> Control:
	var active: Array[Control] = _collect_focusable(controls)
	var count: int = active.size()
	if count == 0:
		return null

	for i: int in range(count):
		var cur: Control = active[i]
		cur.focus_mode = Control.FOCUS_ALL
		var prev_idx: int = (i - 1 + count) % count if wrap else maxi(i - 1, 0)
		var next_idx: int = (i + 1) % count if wrap else mini(i + 1, count - 1)
		var prev_path: NodePath = cur.get_path_to(active[prev_idx]) if cur.is_inside_tree() else NodePath("")
		var next_path: NodePath = cur.get_path_to(active[next_idx]) if cur.is_inside_tree() else NodePath("")

		if horizontal:
			cur.focus_neighbor_left = prev_path
			cur.focus_neighbor_right = next_path
		else:
			cur.focus_neighbor_top = prev_path
			cur.focus_neighbor_bottom = next_path
		cur.focus_previous = prev_path
		cur.focus_next = next_path

	if active[0].is_inside_tree():
		active[0].grab_focus()
	return active[0]


## 二维网格焦点导航（渡墨镇·辟邪祖火 2×2 修习卡 / 扎彩故铺护符区 + 底部离开按钮）
static func wire_grid_focus(grid_controls: Array, columns: int, footer_button: Control = null) -> Control:
	var cols: int = maxi(columns, 1)
	var active: Array[Control] = _collect_focusable(grid_controls)
	var count: int = active.size()
	if count == 0:
		if footer_button != null:
			footer_button.focus_mode = Control.FOCUS_ALL
			if footer_button.is_inside_tree():
				footer_button.grab_focus()
		return footer_button

	var rows: int = int(ceil(float(count) / float(cols)))
	for i: int in range(count):
		var cur: Control = active[i]
		cur.focus_mode = Control.FOCUS_ALL
		if not cur.is_inside_tree():
			continue

		var r: int = i / cols
		var c: int = i % cols
		var row_start: int = r * cols
		var row_end: int = mini(row_start + cols - 1, count - 1)

		var left_idx: int = i - 1 if i > row_start else row_end
		var right_idx: int = i + 1 if i < row_end else row_start
		cur.focus_neighbor_left = cur.get_path_to(active[left_idx])
		cur.focus_neighbor_right = cur.get_path_to(active[right_idx])

		var up_r: int = (r - 1 + rows) % rows
		var up_idx: int = mini(up_r * cols + c, count - 1)
		cur.focus_neighbor_top = cur.get_path_to(active[up_idx])

		if r == rows - 1 and footer_button != null and footer_button.is_inside_tree():
			cur.focus_neighbor_bottom = cur.get_path_to(footer_button)
		else:
			var down_r: int = (r + 1) % rows
			var down_idx: int = mini(down_r * cols + c, count - 1)
			cur.focus_neighbor_bottom = cur.get_path_to(active[down_idx])

	if footer_button != null:
		footer_button.focus_mode = Control.FOCUS_ALL
		if footer_button.is_inside_tree():
			var last_idx: int = count - 1
			footer_button.focus_neighbor_top = footer_button.get_path_to(active[last_idx])
			footer_button.focus_neighbor_bottom = footer_button.get_path_to(active[0])

	if active[0].is_inside_tree():
		active[0].grab_focus()
	return active[0]


static func _collect_focusable(controls: Array) -> Array[Control]:
	var result: Array[Control] = []
	for item: Variant in controls:
		if not (item is Control):
			continue
		var ctrl: Control = item as Control
		if not ctrl.visible:
			continue
		if ctrl is BaseButton:
			var btn: BaseButton = ctrl as BaseButton
			if btn.disabled:
				continue
		result.append(ctrl)
	return result


## 渡墨镇交互提示文案（随键鼠/手柄与中英双语切换）
static func get_interact_prompt(landmark_id: String, using_gamepad: bool, lang: String = "zh") -> String:
	var key_label: String = "[X / □]" if using_gamepad else "[E]"
	var leave_label: String = "[A / ✕]" if using_gamepad else "[E / Enter]"
	var zh_map: Dictionary = {
		"hearth": key_label + " 靠近辟邪祖火 · 修习魂魄",
		"oil_mill": key_label + " 进入老油坊 · 调配当夜灯油",
		"paper_shop": key_label + " 走入扎彩故铺 · 览戒请符",
		"north_gate": leave_label + " 执灯出城 · 踏入乱葬岗",
	}
	var en_map: Dictionary = {
		"hearth": key_label + " Ancestral Flame · Permanent Upgrades",
		"oil_mill": key_label + " Old Oil Mill · Blend Night Oil",
		"paper_shop": key_label + " Paper-Craft Shop · Taboos & Talismans",
		"north_gate": leave_label + " North Gate · Enter the Burial Ground",
	}
	var table: Dictionary = en_map if lang == "en" else zh_map
	var text_val: String = str(table.get(landmark_id, key_label + " 交互"))
	return text_val
