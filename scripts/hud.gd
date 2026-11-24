extends Control
class_name InkHud

var sim: InkMain
var current_snapshot: Dictionary = {}
var current_choices: Array = []
var current_summary: Dictionary = {}
var modal_kind := "title"
var title_font: Font = ThemeDB.fallback_font
var body_font: Font = ThemeDB.fallback_font
var display_font: Font = ThemeDB.fallback_font
var mono_font: Font = ThemeDB.fallback_font
var parchment: StyleBoxFlat
var primary: StyleBoxFlat
var secondary: StyleBoxFlat
var transparent: StyleBoxFlat
var seal_style: StyleBoxFlat
var card_style: StyleBoxFlat
var start_button: Button
var bag_button: Button
var mute_button: Button
var pause_button: Button
var restart_button: Button
var title_button: Button
var upgrade_buttons: Array[Button] = []

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_font = _font_or_fallback("res://assets/fonts/MaShanZheng-Regular.ttf")
	body_font = _font_or_fallback("res://assets/fonts/NotoSerifSC[wght].ttf")
	display_font = _font_or_fallback("res://assets/fonts/Cinzel[wght].ttf")
	mono_font = _font_or_fallback("res://assets/fonts/JetBrainsMono[wght].ttf")
	parchment = _box(Color("#DED6C2"), Color("#232A2C"), 2)
	primary = _box(Color("#E8B34A"), Color("#0E1418"), 2)
	secondary = _box(Color(0.055, 0.078, 0.094, 0.94), Color("#5C6B6B"), 2)
	transparent = _box(Color(1, 1, 1, 0), Color(1, 1, 1, 0), 0)
	var palette := InkData.palette()
	seal_style = _box(palette.vermilion, palette.vermilion_dark, 2)
	card_style = _box(Color(0.98, 0.96, 0.9, 0.72), palette.grey_dark, 1)
	start_button = _make_button("执灯入夜", primary, func(): start_run())
	start_button.add_theme_color_override("font_color", Color("#0E1418"))
	start_button.add_theme_color_override("font_hover_color", Color("#0E1418"))
	start_button.add_theme_color_override("font_pressed_color", Color("#0E1418"))
	bag_button = _make_button("守夜行囊", secondary, func(): pass)
	bag_button.disabled = true
	mute_button = _make_button("静音", secondary, func(): toggle_mute())
	pause_button = _make_button("Ⅱ", secondary, func(): toggle_pause())
	restart_button = _make_button("再入墨夜", primary, func(): restart_run())
	restart_button.add_theme_color_override("font_color", Color("#0E1418"))
	restart_button.add_theme_color_override("font_hover_color", Color("#0E1418"))
	restart_button.add_theme_color_override("font_pressed_color", Color("#0E1418"))
	title_button = _make_button("返回标题", secondary, func(): return_to_title())
	for i in range(3):
		var button := _make_button("", transparent, choose_upgrade.bind(i))
		button.focus_mode = Control.FOCUS_ALL
		upgrade_buttons.append(button)
	resized.connect(_layout_buttons)
	_layout_buttons()
	queue_redraw()

func _font_or_fallback(path: String) -> Font:
	if ResourceLoader.exists(path):
		return load(path)
	return ThemeDB.fallback_font

func _box(background: Color, border: Color, border_width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(2)
	style.shadow_color = Color(0.02, 0.03, 0.04, 0.55)
	style.shadow_size = 8
	style.shadow_offset = Vector2(0, 5)
	return style

func _make_button(text: String, style: StyleBoxFlat, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2.ZERO
	button.clip_text = true
	button.add_theme_font_override("font", body_font)
	button.add_theme_font_size_override("font_size", 18)
	button.add_theme_color_override("font_color", Color("#EDE6D6"))
	button.add_theme_color_override("font_hover_color", Color("#FAF6EA"))
	button.add_theme_color_override("font_pressed_color", Color("#EDE6D6"))
	button.add_theme_color_override("font_disabled_color", Color("#8A9A94"))
	button.add_theme_stylebox_override("normal", style)
	button.add_theme_stylebox_override("hover", style)
	button.add_theme_stylebox_override("pressed", style)
	button.add_theme_stylebox_override("disabled", style)
	button.add_theme_stylebox_override("focus", transparent)
	button.pressed.connect(callback)
	add_child(button)
	return button

func setup(target: InkMain) -> void:
	sim = target
	queue_redraw()

func show_snapshot(snapshot: Dictionary) -> void:
	current_snapshot = snapshot
	match int(snapshot.get("phase", 0)):
		InkMain.Phase.TITLE:
			modal_kind = "title"
		InkMain.Phase.PLAYING:
			modal_kind = ""
		InkMain.Phase.PAUSED:
			modal_kind = "pause"
		InkMain.Phase.LEVELUP:
			modal_kind = "levelup"
		InkMain.Phase.ENDED:
			modal_kind = "result" if not current_summary.is_empty() else ""
	_update_button_visibility()
	queue_redraw()

func show_level_up(choices: Array) -> void:
	current_choices = choices
	modal_kind = "levelup"
	for i in range(upgrade_buttons.size()):
		upgrade_buttons[i].text = str(i + 1) if i < choices.size() else ""
	_update_button_visibility()
	if not upgrade_buttons.is_empty():
		upgrade_buttons[0].grab_focus()
	queue_redraw()

func show_result(summary: Dictionary) -> void:
	current_summary = summary
	modal_kind = "result"
	_update_button_visibility()
	queue_redraw()

func format_time(seconds: float) -> String:
	return "%02d:%02d" % [int(seconds / 60.0), int(seconds) % 60]

func start_run() -> void:
	if sim:
		sim.start_run()

func restart_run() -> void:
	if sim:
		sim.start_run()

func return_to_title() -> void:
	if sim:
		sim.return_to_title()

func toggle_pause() -> void:
	if sim:
		sim.toggle_pause()

func toggle_mute() -> void:
	if sim:
		sim.toggle_mute()

func choose_upgrade(index: int) -> void:
	if sim:
		sim.choose_upgrade(index)

func _update_button_visibility() -> void:
	var is_title := modal_kind == "title"
	var is_game := modal_kind == "" or modal_kind == "pause" or modal_kind == "levelup" or modal_kind == "result"
	start_button.visible = is_title
	bag_button.visible = is_title
	mute_button.visible = is_title or is_game
	pause_button.visible = is_game and modal_kind != "result"
	restart_button.visible = modal_kind == "result"
	title_button.visible = modal_kind == "result"
	for button in upgrade_buttons:
		button.visible = modal_kind == "levelup"
	mute_button.text = "静音" if not bool(current_snapshot.get("muted", false)) else "开启"

func _scale() -> float:
	if size.x <= 0.0 or size.y <= 0.0:
		return 1.0
	return minf(size.x / 1440.0, size.y / 900.0)

func _origin() -> Vector2:
	return (size - Vector2(1440.0, 900.0) * _scale()) * 0.5

func _design_rect(x: float, y: float, w: float, h: float) -> Rect2:
	return Rect2(_origin() + Vector2(x, y) * _scale(), Vector2(w, h) * _scale())

func _layout_buttons() -> void:
	if start_button == null:
		return
	_place(start_button, 100, 500, 190, 56)
	_place(bag_button, 310, 500, 160, 56)
	_place(mute_button, 1368, 84, 44, 44)
	_place(pause_button, 1368, 32, 44, 44)
	_place(restart_button, 564, 548, 150, 52)
	_place(title_button, 732, 548, 150, 52)
	var card_x := [260.0, 580.0, 900.0]
	for i in range(upgrade_buttons.size()):
		_place(upgrade_buttons[i], card_x[i], 292, 240, 300)

func _place(button: Button, x: float, y: float, w: float, h: float) -> void:
	button.position = _design_rect(x, y, w, h).position
	button.size = _design_rect(x, y, w, h).size

func _draw() -> void:
	draw_set_transform(_origin(), 0.0, Vector2(_scale(), _scale()))
	match modal_kind:
		"title":
			_draw_title()
		"":
			_draw_game_hud()
		"pause":
			_draw_game_hud()
			_draw_pause()
		"levelup":
			_draw_game_hud()
			_draw_level_up()
		"result":
			_draw_game_hud()
			_draw_result()
	draw_set_transform(Vector2.ZERO)

func _draw_title() -> void:
	var palette := InkData.palette()
	draw_style_box(parchment, Rect2(1210, 32, 202, 52))
	draw_circle(Vector2(1236, 58), 9, palette.amber)
	draw_string(mono_font, Vector2(1254, 65), "0", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, palette.ink_night)
	_draw_lantern_mark(Vector2(76, 222), palette)
	draw_string(title_font, Vector2(112, 286), "墨夜提灯", HORIZONTAL_ALIGNMENT_LEFT, -1, 76, palette.bone)
	draw_style_box(seal_style, Rect2(486, 218, 42, 42))
	draw_string(title_font, Vector2(492, 250), "守", HORIZONTAL_ALIGNMENT_LEFT, -1, 26, palette.bone_bright)
	draw_string(display_font, Vector2(116, 326), "INK-NIGHT · TWO REALMS", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, palette.bone_dark)
	draw_string(body_font, Vector2(100, 390), "提一盏暖灯入夜墓，翻界变脸化生旦，", HORIZONTAL_ALIGNMENT_LEFT, 540, 18, palette.bone)
	draw_string(body_font, Vector2(100, 420), "谨守三道夜游禁忌，熬至纸扎判官伏诛。", HORIZONTAL_ALIGNMENT_LEFT, 540, 18, palette.bone)
	draw_string(body_font, Vector2(100, 842), "WASD / 方向键 移动 · Space 翻界变脸 · Q 切换生/旦 · Esc 暂停 · Enter 开始", HORIZONTAL_ALIGNMENT_LEFT, 1200, 14, Color(palette.bone_dark, 0.85))

func _draw_lantern_mark(pos: Vector2, palette: Dictionary) -> void:
	draw_line(pos + Vector2(0, -28), pos + Vector2(0, -16), palette.amber, 3)
	draw_rect(Rect2(pos + Vector2(-10, -16), Vector2(20, 34)), palette.amber)
	draw_rect(Rect2(pos + Vector2(-7, -12), Vector2(14, 24)), palette.amber_bright)
	draw_line(pos + Vector2(-13, -18), pos + Vector2(13, -18), palette.ink_night, 4)
	draw_line(pos + Vector2(-13, 20), pos + Vector2(13, 20), palette.ink_night, 4)

func _draw_game_hud() -> void:
	var palette := InkData.palette()
	var hp := float(current_snapshot.get("hp", 85.0))
	var max_hp := maxf(1.0, float(current_snapshot.get("max_hp", 85.0)))
	var fuel := float(current_snapshot.get("fuel", 100.0))
	draw_style_box(parchment, Rect2(28, 28, 230, 140))
	draw_string(mono_font, Vector2(44, 54), "HP", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_night)
	draw_string(mono_font, Vector2(164, 54), "%d/%d" % [int(hp), int(max_hp)], HORIZONTAL_ALIGNMENT_LEFT, -1, 18, palette.ink_night)
	_bar(Rect2(44, 64, 198, 10), hp / max_hp, palette.amber)
	draw_string(body_font, Vector2(44, 96), "灯油", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_night)
	draw_string(mono_font, Vector2(196, 96), "%d%%" % int(fuel), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_night)
	_bar(Rect2(44, 106, 198, 8), fuel / 100.0, palette.amber)
	draw_string(mono_font, Vector2(44, 142), "LV %d" % int(current_snapshot.get("level", 1)), HORIZONTAL_ALIGNMENT_LEFT, -1, 15, palette.ink_night)
	draw_string(mono_font, Vector2(128, 142), "TIME " + format_time(float(current_snapshot.get("time", 0.0))), HORIZONTAL_ALIGNMENT_LEFT, -1, 15, palette.ink_night)
	var realm_text := "人间 · 提灯" if current_snapshot.get("realm", "mortal") == "mortal" else ("诡界 · 生剑" if current_snapshot.get("face", "sheng") == "sheng" else "诡界 · 旦")
	draw_string(body_font, Vector2(44, 162), realm_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, palette.grey_dark)
	draw_style_box(parchment, Rect2(440, 28, 560, 44))
	var rules: Array = current_snapshot.get("rules", [])
	var rule_text := "  ·  ".join(rules.map(func(rule): return str(rule.get("title", ""))))
	draw_string(body_font, Vector2(456, 57), "禁忌  " + rule_text, HORIZONTAL_ALIGNMENT_LEFT, 528, 14, palette.ink_night)
	draw_style_box(parchment, Rect2(1170, 28, 242, 132))
	draw_string(mono_font, Vector2(1188, 54), "COINS  x0", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_night)
	draw_string(mono_font, Vector2(1188, 84), "EXP  %d/%d" % [int(current_snapshot.get("xp", 0.0)), int(current_snapshot.get("xp_to_next", 12.0))], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_night)
	_bar(Rect2(1188, 96, 150, 8), float(current_snapshot.get("xp", 0.0)) / maxf(1.0, float(current_snapshot.get("xp_to_next", 12.0))), palette.xp_mid)
	draw_string(body_font, Vector2(1188, 132), "斩祟  %d" % int(current_snapshot.get("kills", 0)), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_night)
	if modal_kind == "":
		var prompt := "翻入诡界  [Space]" if current_snapshot.get("realm", "mortal") == "mortal" else "重返人间  [Space]"
		draw_style_box(secondary, Rect2(590, 832, 260, 42))
		draw_string(body_font, Vector2(622, 860), prompt, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, palette.amber_bright)

func _bar(rect: Rect2, ratio: float, color: Color) -> void:
	draw_rect(rect, Color("#0E1418"))
	draw_rect(Rect2(rect.position, Vector2(rect.size.x * clampf(ratio, 0.0, 1.0), rect.size.y)), color)

func _dim() -> void:
	draw_rect(Rect2(0, 0, 1440, 900), Color(0.02, 0.03, 0.04, 0.78))

func _draw_pause() -> void:
	var palette := InkData.palette()
	_dim()
	draw_style_box(parchment, Rect2(520, 280, 400, 320))
	draw_string(title_font, Vector2(632, 370), "守夜暂歇", HORIZONTAL_ALIGNMENT_LEFT, -1, 44, palette.ink_night)
	draw_string(body_font, Vector2(602, 420), "Esc 继续 · Enter 确认", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, palette.grey_dark)

func _draw_level_up() -> void:
	var palette := InkData.palette()
	_dim()
	draw_style_box(parchment, Rect2(220, 180, 1000, 540))
	draw_string(title_font, Vector2(600, 252), "灵息渐盛", HORIZONTAL_ALIGNMENT_LEFT, -1, 42, palette.ink_night)
	draw_string(body_font, Vector2(566, 282), "择一术法续行墨夜", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, palette.grey_dark)
	var xs := [260.0, 580.0, 900.0]
	for i in range(current_choices.size()):
		var choice: Dictionary = current_choices[i]
		draw_style_box(card_style, Rect2(xs[i], 292, 240, 300))
		draw_string(mono_font, Vector2(xs[i] + 18, 324), "[" + str(i + 1) + "]", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, palette.vermilion)
		draw_string(title_font, Vector2(xs[i] + 18, 374), str(choice.get("name", "")), HORIZONTAL_ALIGNMENT_LEFT, 204, 26, palette.ink_night)
		draw_string(body_font, Vector2(xs[i] + 18, 420), str(choice.get("description", "")), HORIZONTAL_ALIGNMENT_LEFT, 204, 15, palette.grey_dark)
		draw_string(body_font, Vector2(xs[i] + 18, 548), "按 " + str(i + 1) + " 或点击选择", HORIZONTAL_ALIGNMENT_LEFT, 204, 13, palette.grey_dark)

func _draw_result() -> void:
	var palette := InkData.palette()
	_dim()
	draw_style_box(parchment, Rect2(480, 230, 480, 440))
	var won := bool(current_summary.get("victory", false))
	draw_string(title_font, Vector2(592 if won else 566, 320), "守夜功成" if won else "灯尽夜沉", HORIZONTAL_ALIGNMENT_LEFT, -1, 48, palette.ink_night)
	draw_string(body_font, Vector2(562, 366), "守夜时长  " + format_time(float(current_summary.get("time", 0.0))), HORIZONTAL_ALIGNMENT_LEFT, -1, 17, palette.grey_dark)
	draw_string(body_font, Vector2(562, 404), "斩除邪祟  %d" % int(current_summary.get("kills", 0)), HORIZONTAL_ALIGNMENT_LEFT, -1, 17, palette.grey_dark)
	draw_string(body_font, Vector2(562, 442), "守规结果  %d/%d" % [int(current_summary.get("rules_kept", 0)), int(current_summary.get("rules_total", 3))], HORIZONTAL_ALIGNMENT_LEFT, -1, 17, palette.grey_dark)
	draw_string(body_font, Vector2(562, 480), "违规次数  %d" % int(current_summary.get("violations", 0)), HORIZONTAL_ALIGNMENT_LEFT, -1, 17, palette.grey_dark)
