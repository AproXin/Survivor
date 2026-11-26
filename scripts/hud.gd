extends Control
class_name InkHud

var sim: InkMain
var current_snapshot: Dictionary = {}
var current_choices: Array = []
var current_summary: Dictionary = {}
var modal_kind := "title"
var ui_time := 0.0
var hovered_card := -1

var title_font: Font = ThemeDB.fallback_font
var body_font: Font = ThemeDB.fallback_font
var display_font: Font = ThemeDB.fallback_font
var mono_font: Font = ThemeDB.fallback_font

var parchment: StyleBoxFlat
var primary: StyleBoxFlat
var primary_hover: StyleBoxFlat
var secondary: StyleBoxFlat
var secondary_hover: StyleBoxFlat
var transparent: StyleBoxFlat
var seal_style: StyleBoxFlat

var start_button: Button
var bag_button: Button
var mode_button: Button
var close_bag_button: Button
var mute_button: Button
var lang_button: Button
var pause_button: Button
var restart_button: Button
var title_button: Button
var upgrade_buttons: Array[Button] = []
var meta_buttons: Array[Button] = []
var oil_buttons: Array[Button] = []
var charm_buttons: Array[Button] = []

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_font = _font_or_fallback("res://assets/fonts/MaShanZheng-Regular.ttf")
	body_font = _font_or_fallback("res://assets/fonts/NotoSerifSC[wght].ttf")
	display_font = _font_or_fallback("res://assets/fonts/Cinzel[wght].ttf")
	mono_font = _font_or_fallback("res://assets/fonts/JetBrainsMono[wght].ttf")
	var palette := InkData.palette()
	parchment = _box(Color("#E8E0CE"), Color("#1C2A30"), 2, true)
	primary = _box(palette.amber, palette.ink_night, 2, true)
	primary_hover = _box(palette.amber_bright, palette.ink_deep, 2, true)
	secondary = _box(Color(0.055, 0.078, 0.094, 0.92), palette.grey_mid, 2, false)
	secondary_hover = _box(Color(0.11, 0.16, 0.19, 0.96), palette.bone_dark, 2, false)
	transparent = _box(Color(1, 1, 1, 0), Color(1, 1, 1, 0), 0, false)
	seal_style = _box(palette.vermilion, palette.vermilion_dark, 2, false)

	start_button = _make_button("执灯入夜", primary, primary_hover, func(): start_selected_mode())
	start_button.add_theme_color_override("font_color", palette.ink_deep)
	start_button.add_theme_color_override("font_hover_color", palette.ink_deep)
	start_button.add_theme_color_override("font_pressed_color", palette.ink_deep)

	bag_button = _make_button("渡墨镇 · 祖火", secondary, secondary_hover, func(): open_bag())
	mode_button = _make_button("模式：完整守夜 · 九忌判官", secondary, secondary_hover, func(): toggle_mode())
	mode_button.add_theme_font_size_override("font_size", 14)
	close_bag_button = _make_button("返回标题", secondary, secondary_hover, func(): close_bag())

	mute_button = _make_button("静音", secondary, secondary_hover, func(): toggle_mute())
	lang_button = _make_button("EN", secondary, secondary_hover, func(): toggle_lang())
	lang_button.add_theme_font_size_override("font_size", 14)
	pause_button = _make_button("Ⅱ", secondary, secondary_hover, func(): toggle_pause())

	restart_button = _make_button("再入墨夜", primary, primary_hover, func(): restart_run())
	restart_button.add_theme_color_override("font_color", palette.ink_deep)
	restart_button.add_theme_color_override("font_hover_color", palette.ink_deep)
	restart_button.add_theme_color_override("font_pressed_color", palette.ink_deep)

	title_button = _make_button("返回标题", secondary, secondary_hover, func(): return_to_title())

	for i in range(3):
		var button := _make_button("", transparent, transparent, choose_upgrade.bind(i))
		button.focus_mode = Control.FOCUS_ALL
		var idx := i
		button.mouse_entered.connect(func():
			hovered_card = idx
			queue_redraw()
		)
		button.mouse_exited.connect(func():
			if hovered_card == idx:
				hovered_card = -1
				queue_redraw()
		)
		button.focus_entered.connect(func():
			hovered_card = idx
			queue_redraw()
		)
		upgrade_buttons.append(button)

	var meta_defs := InkData.meta_upgrades()
	for i in range(meta_defs.size()):
		var mid: String = str(meta_defs[i].id)
		var btn := _make_button("研习", primary, primary_hover, func(): buy_meta(mid))
		btn.add_theme_font_size_override("font_size", 15)
		btn.add_theme_color_override("font_color", palette.ink_deep)
		btn.add_theme_color_override("font_hover_color", palette.ink_deep)
		meta_buttons.append(btn)
	var oil_defs := InkData.oil_blends()
	for i in range(oil_defs.size()):
		var oid: String = str(oil_defs[i].id)
		var btn := _make_button("免费换油", primary, primary_hover, func(): pick_oil(oid))
		btn.add_theme_font_size_override("font_size", 15)
		btn.add_theme_color_override("font_color", palette.ink_deep)
		btn.add_theme_color_override("font_hover_color", palette.ink_deep)
		oil_buttons.append(btn)
	var charm_defs := InkData.paper_charms()
	for i in range(charm_defs.size()):
		var cid: String = str(charm_defs[i].id)
		var btn := _make_button("请符", primary, primary_hover, func(): buy_charm(cid))
		btn.add_theme_font_size_override("font_size", 15)
		btn.add_theme_color_override("font_color", palette.ink_deep)
		btn.add_theme_color_override("font_hover_color", palette.ink_deep)
		charm_buttons.append(btn)

	resized.connect(_layout_buttons)
	_layout_buttons()
	queue_redraw()

func _process(delta: float) -> void:
	ui_time += delta
	if modal_kind == "title" or modal_kind == "":
		queue_redraw()

func _is_en() -> bool:
	return str(current_snapshot.get("lang", "zh")) == "en"

func _tr(zh: String, en: String) -> String:
	return en if _is_en() else zh

func _font_or_fallback(path: String) -> Font:
	if ResourceLoader.exists(path):
		return load(path)
	return ThemeDB.fallback_font

func _box(background: Color, border: Color, border_width: int, with_shadow: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(2)
	if with_shadow:
		style.shadow_color = Color(0.02, 0.03, 0.04, 0.50)
		style.shadow_size = 8
		style.shadow_offset = Vector2(0, 4)
	return style

func _make_button(text: String, normal_style: StyleBoxFlat, hover_style: StyleBoxFlat, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2.ZERO
	button.clip_text = true
	button.add_theme_font_override("font", body_font)
	button.add_theme_font_size_override("font_size", 18)
	button.add_theme_color_override("font_color", Color("#EDE6D6"))
	button.add_theme_color_override("font_hover_color", Color("#FAF6EA"))
	button.add_theme_color_override("font_pressed_color", Color("#EDE6D6"))
	button.add_theme_color_override("font_disabled_color", Color("#6E7F74"))
	button.add_theme_stylebox_override("normal", normal_style)
	button.add_theme_stylebox_override("hover", hover_style)
	button.add_theme_stylebox_override("pressed", normal_style)
	button.add_theme_stylebox_override("disabled", secondary)
	button.add_theme_stylebox_override("focus", transparent)
	button.pressed.connect(callback)
	add_child(button)
	return button

func setup(target: InkMain) -> void:
	sim = target
	queue_redraw()

func show_snapshot(snapshot: Dictionary) -> void:
	current_snapshot = snapshot
	var p := int(snapshot.get("phase", 0))
	if p == InkMain.Phase.TITLE:
		if modal_kind != "bag":
			modal_kind = "title"
	elif p == InkMain.Phase.TOWN:
		if bool(snapshot.get("town_modal_open", false)):
			var tk := str(snapshot.get("town_modal_kind", "bag"))
			modal_kind = tk if tk != "" else "bag"
		else:
			modal_kind = "town"
	elif p == InkMain.Phase.PLAYING:
		modal_kind = ""
	elif p == InkMain.Phase.PAUSED:
		modal_kind = "pause"
	elif p == InkMain.Phase.LEVELUP:
		modal_kind = "levelup"
	elif p == InkMain.Phase.ENDED:
		modal_kind = "result" if not current_summary.is_empty() else ""
	_update_button_visibility()
	queue_redraw()

func show_level_up(choices: Array) -> void:
	current_choices = choices
	modal_kind = "levelup"
	hovered_card = 0
	for i in range(upgrade_buttons.size()):
		upgrade_buttons[i].text = ""
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

func start_selected_mode() -> void:
	if sim:
		sim.start_selected_mode()

func toggle_mode() -> void:
	if sim:
		sim.toggle_selected_mode()

func toggle_lang() -> void:
	if sim:
		sim.toggle_lang()

func open_bag() -> void:
	modal_kind = "bag"
	_update_button_visibility()
	queue_redraw()

func open_town_modal(kind: String) -> void:
	modal_kind = kind
	_update_button_visibility()
	queue_redraw()

func close_bag() -> void:
	if sim and sim.phase == InkMain.Phase.TOWN:
		sim.town_modal_open = false
		sim.town_modal_kind = ""
		modal_kind = "town"
	else:
		modal_kind = "title"
	_update_button_visibility()
	queue_redraw()

func buy_meta(id: String) -> void:
	if sim:
		sim.buy_meta_upgrade(id)

func pick_oil(id: String) -> void:
	if sim:
		sim.select_oil_blend(id)

func buy_charm(id: String) -> void:
	if sim:
		sim.buy_paper_charm(id)

func restart_run() -> void:
	if sim:
		sim.restart_run()

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
	var is_town := modal_kind == "town"
	var is_bag := modal_kind == "bag"
	var is_oil := modal_kind == "oil_shop"
	var is_paper := modal_kind == "paper_shop"
	var is_any_town_modal := is_bag or is_oil or is_paper
	var is_game := modal_kind == "" or modal_kind == "pause" or modal_kind == "levelup" or modal_kind == "result"
	start_button.visible = is_title
	bag_button.visible = is_title
	mode_button.visible = is_title
	close_bag_button.visible = is_any_town_modal
	mute_button.visible = is_title or is_town or is_any_town_modal or is_game
	lang_button.visible = is_title or is_town or is_any_town_modal
	pause_button.visible = is_game and modal_kind != "result"
	restart_button.visible = modal_kind == "result"
	title_button.visible = modal_kind == "result"
	for button in upgrade_buttons:
		button.visible = modal_kind == "levelup"
	start_button.text = _tr("执灯入夜", "Light the Lamp")
	bag_button.text = _tr("渡墨镇 · 祖火", "Dumo Town")
	close_bag_button.text = _tr("返回渡墨镇", "Back to Town") if (sim and sim.phase == InkMain.Phase.TOWN) else _tr("返回标题", "Back")
	restart_button.text = _tr("再入墨夜", "Vigil Again")
	title_button.text = _tr("返回标题", "Title")
	lang_button.text = "中" if _is_en() else "EN"
	var sel_mode := str(current_snapshot.get("selected_mode", "full_vigil"))
	if sel_mode == "full_vigil":
		mode_button.text = _tr("模式：完整守夜 · 九忌判官", "Mode: Full Vigil · Paper Judge")
	else:
		mode_button.text = _tr("模式：60 秒速战样片", "Mode: 60s Prototype")
	mute_button.text = _tr("静音", "Mute") if not bool(current_snapshot.get("muted", false)) else _tr("开启", "On")
	var meta_defs := InkData.meta_upgrades()
	var meta_lvls: Dictionary = current_snapshot.get("meta_levels", {})
	var bank := int(current_snapshot.get("bank_coins", 0))
	for i in range(meta_buttons.size()):
		meta_buttons[i].visible = is_bag
		if is_bag and i < meta_defs.size():
			var def: Dictionary = meta_defs[i]
			var lvl := int(meta_lvls.get(str(def.id), 0))
			var max_l := int(def.max_level)
			if lvl >= max_l:
				meta_buttons[i].text = _tr("已圆满", "Maxed")
				meta_buttons[i].disabled = true
			else:
				var cost := int(def.costs[lvl])
				meta_buttons[i].text = _tr("研习 (%d 钱)" % cost, "Train (%d)" % cost)
				meta_buttons[i].disabled = bank < cost
	var oil_defs := InkData.oil_blends()
	var cur_oil := str(current_snapshot.get("selected_oil", "pine_oil"))
	for i in range(oil_buttons.size()):
		oil_buttons[i].visible = is_oil
		if is_oil and i < oil_defs.size():
			var is_sel := str(oil_defs[i].id) == cur_oil
			oil_buttons[i].text = _tr("已添此油", "Active") if is_sel else _tr("免费换油", "Select")
			oil_buttons[i].disabled = is_sel
	var charm_defs := InkData.paper_charms()
	var cur_charm := str(current_snapshot.get("selected_charm", ""))
	for i in range(charm_buttons.size()):
		charm_buttons[i].visible = is_paper
		if is_paper and i < charm_defs.size():
			var cdef: Dictionary = charm_defs[i]
			var is_sel := str(cdef.id) == cur_charm
			var cost := int(cdef.cost)
			if is_sel:
				charm_buttons[i].text = _tr("本夜已佩戴", "Equipped")
				charm_buttons[i].disabled = true
			else:
				charm_buttons[i].text = _tr("请符 (%d 钱)" % cost, "Buy (%d)" % cost)
				charm_buttons[i].disabled = bank < cost

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
	_place(start_button, 100, 492, 196, 56)
	_place(bag_button, 314, 492, 168, 56)
	_place(mode_button, 100, 566, 382, 40)
	_place(close_bag_button, 645, 656, 150, 44)
	_place(mute_button, 1368, 84, 44, 44)
	_place(lang_button, 1368, 136, 44, 36)
	_place(pause_button, 1368, 32, 44, 44)
	_place(restart_button, 554, 600, 154, 52)
	_place(title_button, 732, 600, 154, 52)
	var card_x := [254.0, 578.0, 902.0]
	for i in range(upgrade_buttons.size()):
		_place(upgrade_buttons[i], card_x[i], 290, 284, 344)
	for i in range(meta_buttons.size()):
		var col := i % 2
		var row := i / 2
		var bx := 310.0 + float(col) * 430.0
		var by := 376.0 + float(row) * 144.0
		_place(meta_buttons[i], bx + 244.0, by + 34.0, 130, 40)
	var oil_x := [290.0, 585.0, 880.0]
	for i in range(oil_buttons.size()):
		_place(oil_buttons[i], oil_x[i] + 62.0, 548.0, 146, 40)
	for i in range(charm_buttons.size()):
		var cx := 310.0 + float(i) * 430.0
		_place(charm_buttons[i], cx + 252.0, 568.0, 124, 38)

func _place(button: Button, x: float, y: float, w: float, h: float) -> void:
	button.position = _design_rect(x, y, w, h).position
	button.size = _design_rect(x, y, w, h).size

func _draw() -> void:
	draw_set_transform(_origin(), 0.0, Vector2(_scale(), _scale()))
	match modal_kind:
		"title":
			_draw_title()
		"town":
			_draw_town_hud()
		"bag":
			if sim and sim.phase == InkMain.Phase.TOWN:
				_draw_town_hud()
			else:
				_draw_title()
			_draw_bag_modal()
		"oil_shop":
			_draw_town_hud()
			_draw_oil_shop_modal()
		"paper_shop":
			_draw_town_hud()
			_draw_paper_shop_modal()
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

func _oil_name(oil_id: String) -> String:
	for item in InkData.oil_blends():
		if str(item.id) == oil_id:
			return str(item.en_name) if _is_en() else str(item.name)
	return oil_id

func _charm_name(charm_id: String) -> String:
	if charm_id == "":
		return _tr("无", "None")
	for item in InkData.paper_charms():
		if str(item.id) == charm_id:
			return str(item.en_name) if _is_en() else str(item.name)
	return charm_id

func _draw_town_hud() -> void:
	var palette := InkData.palette()
	_draw_parchment_panel(Rect2(26, 26, 300, 134), palette)
	draw_string(title_font, Vector2(44, 60), _tr("渡墨镇 · 安全区", "Dumo Town · Safe"), HORIZONTAL_ALIGNMENT_LEFT, -1, 24, palette.ink_night)
	var bank := int(current_snapshot.get("bank_coins", 0))
	draw_string(mono_font, Vector2(44, 88), _tr("香火资  %d 钱  ·  阴邪不侵", "Coins %d  ·  Warded") % bank, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, palette.grey_dark)
	var oil_lbl := _oil_name(str(current_snapshot.get("selected_oil", "pine_oil")))
	var charm_lbl := _charm_name(str(current_snapshot.get("selected_charm", "")))
	draw_string(body_font, Vector2(44, 116), _tr("当夜灯油：%s" % oil_lbl, "Oil: %s" % oil_lbl), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, palette.amber_dark)
	draw_string(body_font, Vector2(44, 140), _tr("纸扎护符：%s" % charm_lbl, "Charm: %s" % charm_lbl), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, palette.ink_slate)
	var nearby := str(current_snapshot.get("town_nearby", ""))
	var prompt := _tr("WASD 游历渡墨镇  ·  向北出镇北铁门入乱葬岗  ·  [Enter] 径直出城  ·  [Esc] 回标题", "WASD Explore Town  ·  Walk North through Gate  ·  [Enter] Depart  ·  [Esc] Title")
	match nearby:
		"furnace":
			prompt = _tr("[E] 参拜辟邪祖火 · 永久修习", "[E] Ancestral Furnace · Permanent Upgrades")
		"oil_shop":
			prompt = _tr("[E] 老油坊 · 调配当夜灯油（免费三选一）", "[E] Old Oil Shop · Nightly Lamp Oil")
		"paper_shop":
			prompt = _tr("[E] 扎彩故铺 · 阅九大阴戒录 / 请纸扎护身符", "[E] Paper-Craft Shop · Taboo Ledger & Charms")
		"north_gate":
			prompt = _tr("[E] / ↑ 领签出镇北铁门 · 入乱葬岗", "[E] / ↑ Step through North Gate")
	var pw := body_font.get_string_size(prompt, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x + 48.0
	var px := 720.0 - pw * 0.5
	draw_rect(Rect2(px, 826, pw, 44), Color(palette.ink_deep, 0.88))
	draw_rect(Rect2(px, 826, pw, 44), palette.amber if nearby != "" else palette.grey_mid, false, 1.8)
	draw_string(body_font, Vector2(px + 24.0, 855), prompt, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, palette.amber_bright if nearby != "" else palette.bone)
	var sub := str(current_snapshot.get("subtitle", ""))
	var sub_alpha := float(current_snapshot.get("subtitle_alpha", 0.0))
	if sub != "" and sub_alpha > 0.01:
		var sw := body_font.get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
		var sx := 1412.0 - sw - 28.0
		draw_rect(Rect2(sx, 774, sw + 28.0, 40), Color(palette.ink_deep, 0.72 * sub_alpha))
		draw_line(Vector2(sx, 774), Vector2(sx, 814), Color(palette.amber, 0.70 * sub_alpha), 2.2)
		draw_string(body_font, Vector2(sx + 14.0, 801), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(palette.bone_dark, sub_alpha))

func _draw_oil_shop_modal() -> void:
	var palette := InkData.palette()
	_dim()
	_draw_parchment_panel(Rect2(250, 150, 940, 570), palette, Color("#E5DEC9"))
	draw_string(title_font, Vector2(250, 222), _tr("老油坊 · 当夜添油", "Old Oil Shop · Nightly Blend"), HORIZONTAL_ALIGNMENT_CENTER, 940, 42, palette.ink_night)
	draw_string(body_font, Vector2(250, 256), _tr("出城前免费择一秘油灌入提灯，决定本夜行路流派。", "Pick one free oil blend before stepping beyond the Iron Gate."), HORIZONTAL_ALIGNMENT_CENTER, 940, 15, palette.grey_dark)
	var oil_defs := InkData.oil_blends()
	var cur_oil := str(current_snapshot.get("selected_oil", "pine_oil"))
	var xs := [290.0, 585.0, 880.0]
	for i in range(oil_defs.size()):
		var def: Dictionary = oil_defs[i]
		var is_sel := str(def.id) == cur_oil
		var card := Rect2(xs[i], 296, 270, 316)
		draw_rect(card, Color("#FAF6EA") if is_sel else Color("#F3ECE0"))
		draw_rect(card, palette.amber_dark if is_sel else palette.grey_dark, false, 2.8 if is_sel else 1.6)
		draw_rect(Rect2(xs[i] + 18, 314, 78, 22), Color(palette.amber_dark if is_sel else palette.ink_slate, 0.18))
		draw_string(body_font, Vector2(xs[i] + 26, 330), str(def.tag), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, palette.ink_night)
		var oname := str(def.en_name) if _is_en() else str(def.name)
		var odesc := str(def.en_desc) if _is_en() else str(def.desc)
		draw_string(title_font, Vector2(xs[i] + 20, 384), oname, HORIZONTAL_ALIGNMENT_LEFT, 230, 30 if not _is_en() else 22, palette.ink_night)
		draw_line(Vector2(xs[i] + 20, 404), Vector2(xs[i] + 250, 404), Color(palette.grey_mid, 0.4), 1.0)
		draw_multiline_string(body_font, Vector2(xs[i] + 20, 434), odesc, HORIZONTAL_ALIGNMENT_LEFT, 230.0, 16, -1, palette.ink_slate)

func _draw_paper_shop_modal() -> void:
	var palette := InkData.palette()
	_dim()
	_draw_parchment_panel(Rect2(220, 130, 1000, 594), palette, Color("#E5DEC9"))
	draw_string(title_font, Vector2(220, 194), _tr("扎彩故铺 · 阴戒录与护身符", "Paper-Craft Shop · Taboos & Charms"), HORIZONTAL_ALIGNMENT_CENTER, 1000, 38, palette.ink_night)
	var bank := int(current_snapshot.get("bank_coins", 0))
	draw_string(body_font, Vector2(220, 224), _tr("乱葬岗九大阴戒速览（每夜抽三）  ·  现有香火资 %d 钱" % bank, "All 9 Graveyard Taboos (3 active nightly)  ·  Coins: %d" % bank), HORIZONTAL_ALIGNMENT_CENTER, 1000, 14, palette.grey_dark)
	var pool := InkData.full_rule_pool()
	for i in range(pool.size()):
		var r: Dictionary = pool[i]
		var col := i % 3
		var row := i / 3
		var rx := 254.0 + float(col) * 316.0
		var ry := 244.0 + float(row) * 82.0
		draw_rect(Rect2(rx, ry, 300, 72), Color("#F4EEE1"))
		draw_rect(Rect2(rx, ry, 300, 72), Color(palette.grey_mid, 0.55), false, 1.2)
		var rt := str(r.en_title) if _is_en() else str(r.title)
		var rc := str(r.en_cue) if _is_en() else ("「%s」" % str(r.cue))
		draw_string(body_font, Vector2(rx + 12, ry + 26), "%d. %s" % [i + 1, rt], HORIZONTAL_ALIGNMENT_LEFT, 276, 14 if not _is_en() else 12, palette.ink_night)
		draw_string(body_font, Vector2(rx + 12, ry + 52), rc, HORIZONTAL_ALIGNMENT_LEFT, 276, 12, palette.grey_dark)
	draw_line(Vector2(254, 502), Vector2(1186, 502), Color(palette.grey_dark, 0.45), 1.2)
	draw_string(body_font, Vector2(254, 524), _tr("当夜纸扎护身符（出城生效，每夜限佩一张）：", "Single-Run Paper Charms (1 per night):"), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_slate)
	var charms := InkData.paper_charms()
	var cur_charm := str(current_snapshot.get("selected_charm", ""))
	for i in range(charms.size()):
		var cdef: Dictionary = charms[i]
		var cx := 310.0 + float(i) * 430.0
		var is_sel := str(cdef.id) == cur_charm
		draw_rect(Rect2(cx, 536, 392, 98), Color("#FAF6EA") if is_sel else Color("#F4EEE1"))
		draw_rect(Rect2(cx, 536, 392, 98), palette.amber_dark if is_sel else palette.grey_dark, false, 2.2 if is_sel else 1.4)
		var cname := str(cdef.en_name) if _is_en() else str(cdef.name)
		var cdesc := str(cdef.en_desc) if _is_en() else str(cdef.desc)
		draw_string(title_font, Vector2(cx + 16, 568), cname, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, palette.ink_night)
		draw_multiline_string(body_font, Vector2(cx + 16, 594), cdesc, HORIZONTAL_ALIGNMENT_LEFT, 226.0, 13, -1, palette.grey_dark)

func _draw_parchment_panel(rect: Rect2, palette: Dictionary, bg: Color = Color("#E6DEC8")) -> void:
	draw_rect(Rect2(rect.position + Vector2(0.0, 5.0), rect.size), Color(palette.ink_deep, 0.48))
	draw_rect(rect, bg)
	draw_rect(rect, palette.ink_night, false, 2.2)
	var inner := rect.grow(-5.0)
	draw_rect(inner, Color(palette.grey_dark, 0.45), false, 1.0)
	var c := 8.0
	var corners := [
		[rect.position + Vector2(3, 3 + c), rect.position + Vector2(3, 3), rect.position + Vector2(3 + c, 3)],
		[rect.position + Vector2(rect.size.x - 3 - c, 3), rect.position + Vector2(rect.size.x - 3, 3), rect.position + Vector2(rect.size.x - 3, 3 + c)],
		[rect.position + Vector2(3, rect.size.y - 3 - c), rect.position + Vector2(3, rect.size.y - 3), rect.position + Vector2(3 + c, rect.size.y - 3)],
		[rect.position + Vector2(rect.size.x - 3 - c, rect.size.y - 3), rect.position + Vector2(rect.size.x - 3, rect.size.y - 3), rect.position + Vector2(rect.size.x - 3, rect.size.y - 3 - c)],
	]
	for pts in corners:
		draw_polyline(PackedVector2Array(pts), palette.ink_night, 1.8)

func _draw_title() -> void:
	var palette := InkData.palette()
	# Smooth horizontal ink readability fade on left half (no hard vertical seam)
	for s in range(20):
		var t := float(s) / 20.0
		var a := pow(1.0 - t, 1.65) * 0.72
		draw_rect(Rect2(float(s) * 44.0, 0.0, 45.0, 900.0), Color(palette.ink_deep, a))
	var bank := int(current_snapshot.get("bank_coins", 0))
	_draw_parchment_panel(Rect2(1210, 30, 202, 48), palette)
	draw_circle(Vector2(1236, 54), 9.0, palette.amber)
	draw_circle(Vector2(1236, 54), 3.0, palette.ink_night)
	draw_string(mono_font, Vector2(1254, 61), "COINS  x%d" % bank, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, palette.ink_night)
	_draw_lantern_mark(Vector2(82, 232), palette)
	draw_string(title_font, Vector2(118, 290), InkData.GAME_META.title_zh, HORIZONTAL_ALIGNMENT_LEFT, -1, 74, palette.bone_bright)
	draw_style_box(seal_style, Rect2(508, 222, 42, 42))
	draw_rect(Rect2(511, 225, 36, 36), Color(palette.bone_bright, 0.45), false, 1.0)
	draw_string(title_font, Vector2(514, 253), "守", HORIZONTAL_ALIGNMENT_LEFT, -1, 26, palette.bone_bright)
	draw_string(display_font, Vector2(122, 332), InkData.GAME_META.title_en, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, palette.bone_dark)
	draw_line(Vector2(100, 356), Vector2(520, 356), Color(palette.amber, 0.45), 1.5)
	var sub := InkData.GAME_META.subtitle_en if _is_en() else InkData.GAME_META.subtitle_zh
	draw_multiline_string(body_font, Vector2(100, 396), sub, HORIZONTAL_ALIGNMENT_LEFT, 480.0, 19, -1, palette.bone)
	var flavor := _tr("出渡墨镇照壁入乱葬岗，谨守三戒，莫应死者。", "Step beyond Dumo Town's warded gate. Keep three taboos — never reply.")
	draw_multiline_string(body_font, Vector2(100, 434), flavor, HORIZONTAL_ALIGNMENT_LEFT, 480.0, 14, -1, palette.bone_dark)
	draw_rect(Rect2(96, 822, 740, 34), Color(palette.ink_deep, 0.72))
	var ctrl := _tr("WASD / 方向键 移动  ·  Space 翻界变脸  ·  Q 切换生/旦  ·  Esc 暂停  ·  Enter 开始", "WASD Move  ·  Space Flip Realm  ·  Q Switch Sheng/Dan  ·  Esc Pause  ·  Enter Start")
	draw_string(body_font, Vector2(108, 845), ctrl, HORIZONTAL_ALIGNMENT_LEFT, 1200, 14, Color(palette.bone_dark, 0.90))

func _draw_bag_modal() -> void:
	var palette := InkData.palette()
	_dim()
	_draw_parchment_panel(Rect2(260, 160, 920, 560), palette, Color("#E5DEC9"))
	var h_title := InkData.GAME_META.hub_title_en if _is_en() else InkData.GAME_META.hub_title_zh
	draw_string(title_font, Vector2(260, 226), h_title, HORIZONTAL_ALIGNMENT_CENTER, 920, 42, palette.ink_night)
	var h_desc := InkData.GAME_META.hub_desc_en if _is_en() else InkData.GAME_META.hub_desc_zh
	draw_string(body_font, Vector2(260, 258), h_desc, HORIZONTAL_ALIGNMENT_CENTER, 920, 14, palette.grey_dark)
	var bank := int(current_snapshot.get("bank_coins", 0))
	var stats: Dictionary = current_snapshot.get("save_stats", {})
	var stat_line := _tr(
		"香火资：%d 钱   |   最佳守更：%s   |   最高荡除：%d 具   |   完醮：%d",
		"Coins: %d   |   Best Vigil: %s   |   Best Banished: %d   |   Clears: %d"
	) % [
		bank,
		format_time(float(stats.get("best_time", 0.0))),
		int(stats.get("best_kills", 0)),
		int(stats.get("victories", 0)),
	]
	draw_string(mono_font, Vector2(310, 304), stat_line, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_slate)
	draw_line(Vector2(304, 322), Vector2(1136, 322), Color(palette.grey_dark, 0.45), 1.2)
	var meta_defs := InkData.meta_upgrades()
	var meta_lvls: Dictionary = current_snapshot.get("meta_levels", {})
	for i in range(meta_defs.size()):
		var def: Dictionary = meta_defs[i]
		var col := i % 2
		var row := i / 2
		var bx := 310.0 + float(col) * 430.0
		var by := 346.0 + float(row) * 144.0
		var card := Rect2(bx, by, 392, 118)
		draw_rect(card, Color("#F4EEE1"))
		draw_rect(card, palette.grey_dark, false, 1.6)
		var lvl := int(meta_lvls.get(str(def.id), 0))
		var m_name := str(def.en_name) if _is_en() else str(def.name)
		var m_desc := str(def.en_desc) if _is_en() else str(def.desc)
		draw_string(title_font, Vector2(bx + 18, by + 40), m_name, HORIZONTAL_ALIGNMENT_LEFT, -1, 26, palette.ink_night)
		for p in range(4):
			var pip := Vector2(bx + 116 + float(p) * 16.0, by + 30.0)
			draw_circle(pip, 4.5, palette.amber_dark if p < lvl else Color(palette.grey_mid, 0.35))
			draw_arc(pip, 4.5, 0.0, TAU, 12, palette.ink_night, 1.0, true)
		draw_multiline_string(body_font, Vector2(bx + 18, by + 68), m_desc, HORIZONTAL_ALIGNMENT_LEFT, 216.0, 14, -1, palette.grey_dark)

func _draw_lantern_mark(pos: Vector2, palette: Dictionary) -> void:
	var pulse := 1.0 + sin(ui_time * 4.8) * 0.08
	draw_circle(pos + Vector2(0, 2), 26.0 * pulse, Color(palette.amber, 0.16))
	draw_line(pos + Vector2(0, -30), pos + Vector2(0, -18), palette.amber, 3.0)
	draw_colored_polygon(PackedVector2Array([
		pos + Vector2(-9, -16),
		pos + Vector2(9, -16),
		pos + Vector2(12, 1),
		pos + Vector2(9, 18),
		pos + Vector2(-9, 18),
		pos + Vector2(-12, 1),
	]), palette.amber)
	draw_rect(Rect2(pos + Vector2(-6, -11), Vector2(12, 23)), palette.amber_bright)
	draw_line(pos + Vector2(-13, -17), pos + Vector2(13, -17), palette.ink_night, 3.5)
	draw_line(pos + Vector2(-13, 19), pos + Vector2(13, 19), palette.ink_night, 3.5)
	draw_line(pos + Vector2(0, 19), pos + Vector2(0, 30), palette.amber_dark, 2.0)

func _draw_game_hud() -> void:
	var palette := InkData.palette()
	var hp := float(current_snapshot.get("hp", 85.0))
	var max_hp := maxf(1.0, float(current_snapshot.get("max_hp", 85.0)))
	var fuel := float(current_snapshot.get("fuel", 100.0))
	var is_mortal := str(current_snapshot.get("realm", "mortal")) == "mortal"
	var face_str := str(current_snapshot.get("face", "sheng"))

	_draw_parchment_panel(Rect2(26, 26, 244, 152), palette)
	draw_string(mono_font, Vector2(42, 52), "HP", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_night)
	draw_string(mono_font, Vector2(168, 52), "%d/%d" % [int(hp), int(max_hp)], HORIZONTAL_ALIGNMENT_LEFT, -1, 17, palette.vermilion if hp / max_hp < 0.3 else palette.ink_night)
	_bar(Rect2(42, 61, 212, 11), hp / max_hp, palette.vermilion if hp / max_hp < 0.3 else palette.amber)
	draw_string(body_font, Vector2(42, 95), _tr("灯油", "OIL"), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_night)
	var fuel_col: Color = palette.vermilion if fuel < 25.0 else palette.amber_dark
	draw_string(mono_font, Vector2(204, 95), "%d%%" % int(fuel), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_night)
	_bar(Rect2(42, 104, 212, 8), fuel / 100.0, fuel_col)
	draw_string(mono_font, Vector2(42, 138), "LV %d" % int(current_snapshot.get("level", 1)), HORIZONTAL_ALIGNMENT_LEFT, -1, 15, palette.ink_night)
	draw_string(mono_font, Vector2(130, 138), "TIME " + format_time(float(current_snapshot.get("time", 0.0))), HORIZONTAL_ALIGNMENT_LEFT, -1, 15, palette.ink_night)
	var realm_text := _tr("人间 · 提灯", "Mortal · Lamp") if is_mortal else (_tr("诡界 · 生剑", "Spirit · Sheng") if face_str == "sheng" else _tr("诡界 · 旦袖", "Spirit · Dan"))
	draw_rect(Rect2(42, 148, 102, 20), palette.ink_slate if not is_mortal else Color(palette.amber_dark, 0.22))
	draw_string(body_font, Vector2(48, 163), realm_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, palette.bone_bright if not is_mortal else palette.ink_night)
	if bool(current_snapshot.get("encore_available", false)):
		draw_rect(Rect2(150, 148, 62, 20), palette.vermilion)
		draw_string(body_font, Vector2(158, 163), _tr("替身偶", "Effigy"), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, palette.bone_bright)

	# Top-Center Parchment: Permanent Rule Commands (戒律主句)
	_draw_parchment_panel(Rect2(390, 26, 660, 48), palette)
	var rules: Array = current_snapshot.get("rules", [])
	draw_rect(Rect2(404, 38, 42, 24), palette.ink_night)
	draw_string(body_font, Vector2(411, 55), _tr("阴戒", "TABOO"), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, palette.bone_bright)
	var rule_x: float = 458.0
	for i in range(rules.size()):
		var rule: Dictionary = rules[i]
		var broken := bool(rule.get("broken", false))
		var prog := float(rule.get("progress", 0.0))
		var title_str := str(rule.get("en_title", rule.get("title", ""))) if _is_en() else str(rule.get("title", ""))
		var prefix := "  ·  " if i > 0 else ""
		if prefix != "":
			draw_string(body_font, Vector2(rule_x, 56), prefix, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.grey_mid)
			rule_x += body_font.get_string_size(prefix, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
		var fsize := 12 if _is_en() else 15
		var tw := body_font.get_string_size(title_str, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize).x
		if prog > 0.01:
			draw_rect(Rect2(rule_x - 4.0, 38.0, (tw + 8.0) * prog, 24.0), Color(palette.vermilion, 0.28))
		var col: Color = palette.vermilion if broken else palette.ink_night
		draw_string(body_font, Vector2(rule_x, 56), title_str, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, col)
		if broken:
			draw_line(Vector2(rule_x, 51), Vector2(rule_x + tw, 51), palette.vermilion, 1.8)
		rule_x += tw

	# Dynamic Double-Layer Obsession Cue (执念微语) & Top Alerts / Boss Bar
	var y_cursor := 82.0
	var boss: Dictionary = current_snapshot.get("boss", {})
	if bool(boss.get("active", false)):
		var b_hp := float(boss.get("hp", 0.0))
		var b_max := maxf(1.0, float(boss.get("max_hp", 1.0)))
		var b_phase := int(boss.get("phase", 1))
		var bar_r := Rect2(440, y_cursor, 560, 44)
		draw_rect(bar_r, Color(palette.ink_deep, 0.90))
		draw_rect(bar_r, palette.vermilion, false, 2.0)
		var b_label := _tr("纸扎判官  ·  " + ("二相 · 换规矩" if b_phase >= 2 else "一相 · 点幽冥"), "Paper Judge  ·  Phase %d" % b_phase)
		draw_string(body_font, Vector2(456, y_cursor + 20), b_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.bone_bright)
		draw_string(mono_font, Vector2(912, y_cursor + 20), "%d/%d" % [int(b_hp), int(b_max)], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, palette.vermilion_bright)
		_bar(Rect2(456, y_cursor + 27, 528, 10), b_hp / b_max, palette.vermilion_bright)
		y_cursor += 50.0
	var alert_str := str(current_snapshot.get("alert", ""))
	var alert_a := float(current_snapshot.get("alert_alpha", 0.0))
	if alert_str != "" and alert_a > 0.02:
		var aw := body_font.get_string_size(alert_str, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x + 36.0
		var ax := 720.0 - aw * 0.5
		draw_rect(Rect2(ax, y_cursor, aw, 32), Color(palette.ink_deep, 0.90 * alert_a))
		draw_rect(Rect2(ax, y_cursor, aw, 32), Color(palette.vermilion_bright, alert_a), false, 1.8)
		draw_string(body_font, Vector2(ax + 18.0, y_cursor + 21), alert_str, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(palette.bone_bright, alert_a))
		y_cursor += 38.0
	var cue_str := str(current_snapshot.get("active_cue", ""))
	if cue_str != "":
		var formatted_cue := "「%s」" % cue_str if not _is_en() else cue_str
		var cw := body_font.get_string_size(formatted_cue, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x + 28.0
		var cx := 720.0 - cw * 0.5
		draw_rect(Rect2(cx, y_cursor, cw, 28), Color(palette.ink_deep, 0.78))
		draw_string(body_font, Vector2(cx + 14.0, y_cursor + 19), formatted_cue, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.bone_dark)

	# Top-Right Parchment: Coins / EXP / Banished
	_draw_parchment_panel(Rect2(1162, 26, 250, 138), palette)
	draw_circle(Vector2(1184, 51), 7.5, palette.amber)
	draw_circle(Vector2(1184, 51), 2.5, palette.ink_night)
	draw_string(mono_font, Vector2(1198, 56), "COINS  x%d" % int(current_snapshot.get("coins", 0)), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_night)
	draw_string(mono_font, Vector2(1178, 86), "EXP  %d/%d" % [int(current_snapshot.get("xp", 0.0)), int(current_snapshot.get("xp_to_next", 12.0))], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, palette.ink_night)
	_bar(Rect2(1178, 96, 174, 9), float(current_snapshot.get("xp", 0.0)) / maxf(1.0, float(current_snapshot.get("xp_to_next", 12.0))), palette.xp_mid)
	draw_string(body_font, Vector2(1178, 136), _tr("荡除  %d 具" % int(current_snapshot.get("kills", 0)), "Banished %d" % int(current_snapshot.get("kills", 0))), HORIZONTAL_ALIGNMENT_LEFT, -1, 15, palette.ink_night)

	if modal_kind == "":
		var cd := float(current_snapshot.get("flip_cooldown", 0.0))
		var cd_max := maxf(0.1, float(current_snapshot.get("flip_cooldown_max", 3.0)))
		var ready_ratio := 1.0 - clampf(cd / cd_max, 0.0, 1.0)
		var bar_rect := Rect2(566, 828, 308, 44)
		draw_rect(bar_rect, Color(palette.ink_deep, 0.88))
		draw_rect(Rect2(bar_rect.position, Vector2(bar_rect.size.x * ready_ratio, 4.0)), palette.amber if cd <= 0.0 else palette.grey_mid)
		draw_rect(bar_rect, palette.amber if cd <= 0.0 else palette.grey_dark, false, 1.6)
		var prompt := (_tr("翻入诡界  [Space]", "Enter Spirit [Space]") if is_mortal else _tr("重返人间  [Space]", "Return Mortal [Space]")) if cd <= 0.0 else (_tr("翻界调息  %.1fs", "Cooldown %.1fs") % cd)
		draw_string(body_font, Vector2(592, 857), prompt, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, palette.amber_bright if cd <= 0.0 else palette.grey_light)
		var q_label := _tr("[Q] 切旦", "[Q] Dan") if (is_mortal or face_str == "sheng") else _tr("[Q] 切生", "[Q] Sheng")
		draw_rect(Rect2(784, 837, 78, 26), Color(palette.ink_slate, 0.92))
		draw_string(body_font, Vector2(794, 855), q_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, palette.bone)

		# Corner Micro-Narrative Subtitle (Doc 37 Section V: bottom-right, 18px #B9B09A, 0.3/4.0/0.4s)
		var sub := str(current_snapshot.get("subtitle", ""))
		var sub_alpha := float(current_snapshot.get("subtitle_alpha", 0.0))
		if sub != "" and sub_alpha > 0.01:
			var sw := body_font.get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
			var sx := 1412.0 - sw - 28.0
			draw_rect(Rect2(sx, 828, sw + 28.0, 40), Color(palette.ink_deep, 0.72 * sub_alpha))
			draw_line(Vector2(sx, 828), Vector2(sx, 868), Color(palette.amber, 0.70 * sub_alpha), 2.2)
			draw_string(body_font, Vector2(sx + 14.0, 855), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(palette.bone_dark, sub_alpha))

func _bar(rect: Rect2, ratio: float, color: Color) -> void:
	draw_rect(rect, Color("#0E1418"))
	draw_rect(Rect2(rect.position + Vector2(1.0, 1.0), Vector2(maxf(0.0, (rect.size.x - 2.0) * clampf(ratio, 0.0, 1.0)), rect.size.y - 2.0)), color)

func _dim() -> void:
	draw_rect(Rect2(0, 0, 1440, 900), Color(0.02, 0.03, 0.04, 0.78))

func _draw_pause() -> void:
	var palette := InkData.palette()
	_dim()
	_draw_parchment_panel(Rect2(500, 280, 440, 300), palette)
	draw_string(title_font, Vector2(500, 372), _tr("守夜暂歇", "Vigil Paused"), HORIZONTAL_ALIGNMENT_CENTER, 440, 44, palette.ink_night)
	draw_line(Vector2(560, 396), Vector2(880, 396), Color(palette.grey_dark, 0.45), 1.2)
	draw_string(body_font, Vector2(500, 444), _tr("Esc / Enter 继续守更", "Esc / Enter to Resume"), HORIZONTAL_ALIGNMENT_CENTER, 440, 17, palette.grey_dark)
	draw_string(body_font, Vector2(500, 482), _tr("Space 翻界  ·  Q 切换生/旦", "Space Flip  ·  Q Sheng/Dan"), HORIZONTAL_ALIGNMENT_CENTER, 440, 15, palette.grey_mid)

func _draw_upgrade_emblem(id: String, center: Vector2, palette: Dictionary) -> void:
	draw_circle(center, 26.0, Color(palette.ink_night, 0.08))
	draw_arc(center, 26.0, 0.0, TAU, 28, Color(palette.grey_dark, 0.45), 1.4, true)
	match id:
		"talisman", "taboo_book":
			draw_rect(Rect2(center + Vector2(-9, -15), Vector2(18, 30)), palette.amber)
			draw_rect(Rect2(center + Vector2(-9, -15), Vector2(18, 30)), palette.ink_night, false, 1.6)
			draw_line(center + Vector2(0, -10), center + Vector2(0, 10), palette.vermilion, 2.2)
			draw_line(center + Vector2(-5, -4), center + Vector2(5, -4), palette.vermilion, 1.8)
		"crane", "shadow_walker":
			draw_colored_polygon(PackedVector2Array([center + Vector2(-18, 4), center + Vector2(-2, -12), center + Vector2(16, -8), center + Vector2(2, 6)]), palette.ink_slate)
			draw_colored_polygon(PackedVector2Array([center + Vector2(-2, -4), center + Vector2(14, 12), center + Vector2(-6, 10)]), palette.grey_mid)
		"sword":
			draw_line(center + Vector2(-14, 14), center + Vector2(14, -14), palette.ink_night, 3.8)
			draw_line(center + Vector2(-10, 10), center + Vector2(14, -14), palette.grey_light, 1.6)
			draw_line(center + Vector2(-11, 3), center + Vector2(-3, 11), palette.amber_dark, 3.2)
		"sleeve_spin":
			draw_arc(center, 15.0, 0.2, PI * 1.4, 18, palette.ink_slate, 4.0, true)
			draw_arc(center, 9.0, PI, TAU * 1.1, 16, palette.grey_mid, 3.0, true)
		"lantern_fire", "lamp_oil", "fallback_wick":
			draw_circle(center, 10.0, palette.amber)
			draw_circle(center, 5.0, palette.amber_bright)
			draw_arc(center, 15.0, 0.0, TAU, 20, palette.amber_dark, 1.8, true)
		"troupe_gong", "gonglu", "night_bell":
			draw_circle(center, 14.0, palette.amber_dark)
			draw_circle(center, 10.0, palette.amber)
			draw_circle(center, 4.0, palette.ink_night)
		"encore", "soul_shield":
			draw_rect(Rect2(center + Vector2(-11, -13), Vector2(22, 26)), palette.ink_slate)
			draw_circle(center + Vector2(0, -4), 6.0, palette.bone_bright)
			draw_rect(Rect2(center + Vector2(-11, -13), Vector2(22, 26)), palette.amber_dark, false, 1.8)
		_:
			draw_circle(center, 14.0, palette.ink_night)
			draw_arc(center, 14.0, -PI * 0.5, PI * 0.5, 18, palette.bone_bright, 7.0, true)
			draw_circle(center + Vector2(0, -6), 3.0, palette.bone_bright)
			draw_circle(center + Vector2(0, 6), 3.0, palette.ink_night)

func _draw_level_up() -> void:
	var palette := InkData.palette()
	_dim()
	_draw_parchment_panel(Rect2(204, 152, 1032, 540), palette, Color("#E5DEC9"))
	draw_string(title_font, Vector2(204, 224), _tr("灵息渐盛", "Spirit Rises"), HORIZONTAL_ALIGNMENT_CENTER, 1032, 46, palette.ink_night)
	draw_string(body_font, Vector2(204, 256), _tr("择一名物续行墨夜", "Choose a relic for the night"), HORIZONTAL_ALIGNMENT_CENTER, 1032, 16, palette.grey_dark)
	var xs := [254.0, 578.0, 902.0]
	var levels: Dictionary = current_snapshot.get("upgrade_levels", {})
	for i in range(current_choices.size()):
		var choice: Dictionary = current_choices[i]
		var card_rect := Rect2(xs[i], 290, 284, 344)
		var is_focus := hovered_card == i
		var card_bg := Color("#FAF6EA") if is_focus else Color("#F3ECE0")
		var border_col: Color = palette.amber_dark if is_focus else palette.grey_dark
		draw_rect(Rect2(card_rect.position + Vector2(0.0, 4.0), card_rect.size), Color(palette.ink_deep, 0.22))
		draw_rect(card_rect, card_bg)
		draw_rect(card_rect, border_col, false, 2.8 if is_focus else 1.6)
		draw_rect(card_rect.grow(-5.0), Color(palette.grey_mid, 0.35), false, 1.0)
		draw_string(mono_font, Vector2(xs[i] + 18, 322), "[%d]" % (i + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, 16, palette.vermilion)
		var cat := str(choice.get("category", "术法"))
		draw_rect(Rect2(xs[i] + 178, 304, 88, 22), Color(palette.ink_slate, 0.14))
		draw_string(body_font, Vector2(xs[i] + 186, 320), cat, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, palette.ink_slate)
		var uid := str(choice.get("id", ""))
		_draw_upgrade_emblem(uid, Vector2(xs[i] + 142, 378), palette)
		var u_name := str(choice.get("en_name", choice.get("name", ""))) if _is_en() else str(choice.get("name", ""))
		var u_desc := str(choice.get("en_description", choice.get("description", ""))) if _is_en() else str(choice.get("description", ""))
		draw_string(title_font, Vector2(xs[i] + 22, 444), u_name, HORIZONTAL_ALIGNMENT_LEFT, 240, 22 if _is_en() else 28, palette.ink_night)
		var cur_lvl := int(levels.get(uid, 0))
		var max_l := mini(4, int(choice.get("max_level", 3)))
		if uid != "fallback_wick":
			for p in range(max_l):
				var pip_pos := Vector2(xs[i] + 28 + float(p) * 16.0, 464.0)
				draw_circle(pip_pos, 4.5, palette.amber_dark if p < cur_lvl else Color(palette.grey_mid, 0.35))
				draw_arc(pip_pos, 4.5, 0.0, TAU, 12, palette.ink_night, 1.0, true)
			var lvl_label := _tr("已满阶", "MAX") if cur_lvl >= max_l else (_tr("阶位 %d → %d", "Lv %d → %d") % [cur_lvl, cur_lvl + 1])
			draw_string(mono_font, Vector2(xs[i] + 34 + float(max_l) * 16.0, 469), lvl_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, palette.grey_dark)
		draw_multiline_string(body_font, Vector2(xs[i] + 22, 502), u_desc, HORIZONTAL_ALIGNMENT_LEFT, 240.0, 14 if _is_en() else 15, -1, palette.ink_slate)
		draw_line(Vector2(xs[i] + 20, 588), Vector2(xs[i] + 264, 588), Color(palette.grey_mid, 0.35), 1.0)
		draw_string(body_font, Vector2(xs[i] + 74, 616), _tr("按 %d 或点击择取", "Press %d or Click") % (i + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, palette.amber_dark if is_focus else palette.grey_dark)

func _draw_result() -> void:
	var palette := InkData.palette()
	_dim()
	_draw_parchment_panel(Rect2(430, 186, 580, 492), palette)
	var won := bool(current_summary.get("victory", false))
	var boss_won := bool(current_summary.get("boss_defeated", false))
	var viol := int(current_summary.get("violations", 0))
	var rules_total := int(current_summary.get("rules_total", 3))
	var broken_count := rules_total - int(current_summary.get("rules_kept", 0))
	var heading := _tr("更鼓破晓，醮事粗成", "Dawn Breaks, The Rites Concluded") if won else _tr("长夜未央，命灯已竭", "Night Endless, Lamp Extinguished")
	draw_string(title_font, Vector2(492, 266), heading, HORIZONTAL_ALIGNMENT_LEFT, -1, 32 if _is_en() else 40, palette.ink_night)
	var rank := "甲" if (won and viol == 0) else ("乙" if won else "丙")
	draw_style_box(seal_style, Rect2(936, 224, 48, 48))
	draw_rect(Rect2(939, 227, 42, 42), Color(palette.bone_bright, 0.45), false, 1.0)
	draw_string(title_font, Vector2(946, 260), rank, HORIZONTAL_ALIGNMENT_LEFT, -1, 30, palette.bone_bright)
	draw_line(Vector2(476, 290), Vector2(964, 290), Color(palette.grey_dark, 0.45), 1.2)
	var rows := [
		[_tr("守更巡夜", "Vigil Endured"), format_time(float(current_summary.get("time", 0.0)))],
		[_tr("荡除阴秽", "Evils Banished"), _tr("%d 具", "%d") % int(current_summary.get("kills", 0))],
		[_tr("触犯阴戒", "Taboos Broken"), _tr("%d / %d 条", "%d / %d") % [broken_count, rules_total]],
		[_tr("敛获香火资", "Incense Bounty"), _tr("+%d 钱", "+%d Coins") % int(current_summary.get("coins", 0))],
	]
	if boss_won:
		rows.append([_tr("纸扎判官", "Paper Judge"), _tr("判官伏案，执笔人退", "The Judge Overthrown")])
	for idx in range(rows.size()):
		var y := 334.0 + float(idx) * 38.0
		draw_string(body_font, Vector2(496, y), rows[idx][0], HORIZONTAL_ALIGNMENT_LEFT, -1, 17, palette.grey_dark)
		draw_string(mono_font, Vector2(746, y), rows[idx][1], HORIZONTAL_ALIGNMENT_LEFT, -1, 16, palette.vermilion if (idx == 2 and broken_count > 0) else palette.ink_night)
	# Verdict Banner (Doc 37 Section IV)
	var verdict := ""
	if won and viol == 0:
		verdict = _tr("全节完醮（三戒不染，得授全金）", "Pristine Vigil (No taboos broken, full bounty)")
	elif won:
		verdict = _tr("沾煞损节（戒条有失，差役录名）", "Tainted Vigil (Taboo violated, recorded)")
	else:
		verdict = _tr("中途力竭（长夜漫漫，未逢主坛）", "Fell in the Dark (Died before the altar)")
	draw_rect(Rect2(476, 536, 488, 38), Color(palette.ink_slate, 0.12))
	draw_string(body_font, Vector2(496, 561), verdict, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, palette.vermilion if viol > 0 or not won else palette.ink_night)
