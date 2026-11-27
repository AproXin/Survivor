extends SceneTree

var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	# 1. SpriteBank manifest & 96x96 / 64x64 protocol checks
	var bank := InkSpriteBank.new()
	bank.load_manifest()
	_check(bank.specs.size() == 15, "sprite manifest must define 15 character/enemy specs (11 night + 4 day)")
	_check(int(bank.get_spec("player_mortal").size) == 96, "player_mortal must be 96x96 tier")
	_check(int(bank.get_spec("boss_magistrate").size) == 96, "boss_magistrate must be 96x96 tier")
	_check(int(bank.get_spec("ghost").size) == 64, "ghost must be 64x64 tier")
	_check(int(bank.get_spec("punisher").size) == 64, "punisher must be 64x64 tier")
	_check(bank.sheets.size() == 15 and bank.has_sheet("ghost") and bank.has_sheet("wolf"), "all 15 real PNG sprite sheets must load")
	_check(not bank.has_sheet("__missing_sprite__"), "missing PNG must fall back gracefully without sheet")

	# Runtime 8-frame 96x96 strip (768x96) => 4 walk + 1 hit + 3 death
	var img := Image.create(768, 96, false, Image.FORMAT_RGBA8)
	var tex := ImageTexture.create_from_image(img)
	var sheet := bank.register_texture("player_mortal", tex)
	_check(int(sheet.hframes) == 8, "768x96 strip must parse as 8 frames")
	_check(bool(sheet.has_full_protocol), "8-frame strip must enable full W+1+3 protocol")
	_check(int(sheet.walk_count) == 4, "8-frame strip must have 4 walk frames")
	_check(int(sheet.hit_frame) == 4, "hit frame must be index 4")
	_check(int(sheet.death_start) == 5 and int(sheet.death_count) == 3, "death frames must be indices 5..7")
	var hit_rect := bank.get_frame_region("player_mortal", "hit", 0.0)
	_check(hit_rect == Rect2(384.0, 0.0, 96.0, 96.0), "hit region must slice exact 96x96 frame 4")
	var death_last := bank.get_frame_region("player_mortal", "death", 10.0)
	_check(death_last == Rect2(672.0, 0.0, 96.0, 96.0), "death region must clamp at final frame 7")

	# 2. Walkable Dumo Town safe zone checks
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.selected_mode = "full_vigil"
	scene.enter_town()
	_check(scene.phase == scene.Phase.TOWN, "enter_town must enter Phase.TOWN")
	var fuel_before: float = scene.player.fuel
	scene.step(2.0)
	_check(is_equal_approx(scene.player.fuel, fuel_before), "town safe zone must not drain lantern oil")
	_check(scene.enemies.is_empty(), "town safe zone must not spawn enemies")

	# Walk near Ancestral Furnace
	scene.player.pos = scene.town_spots.furnace + Vector2(0.0, 40.0)
	scene.step(0.05)
	_check(scene.town_nearby == "furnace", "standing near furnace must detect furnace interaction")

	# Walk near Old Oil Shop & pick Tung Oil blend
	scene.player.pos = scene.town_spots.oil_shop + Vector2(0.0, 40.0)
	scene.step(0.05)
	_check(scene.town_nearby == "oil_shop", "standing near oil_shop must detect oil_shop interaction")
	_check(scene.select_oil_blend("tung_oil"), "selecting tung_oil at Old Oil Shop must succeed")
	_check(scene.selected_oil == "tung_oil", "selected_oil must update to tung_oil")

	# Walk near Paper-Craft Shop & buy Paper Effigy Charm
	scene.player.pos = scene.town_spots.paper_shop + Vector2(0.0, 40.0)
	scene.step(0.05)
	_check(scene.town_nearby == "paper_shop", "standing near paper_shop must detect paper_shop interaction")
	scene.save_data.coins = 30
	_check(scene.buy_paper_charm("paper_ward"), "buying paper_ward at Paper-Craft Shop must succeed")
	_check(int(scene.save_data.coins) == 15, "paper_ward must deduct 15 coins")

	# Walk north through North Iron Gate => depart into graveyard vigil with Oil + Charm applied!
	scene.player.pos = Vector2(0.0, -195.0)
	scene.step(0.05)
	_check(scene.phase == scene.Phase.PLAYING, "walking through North Iron Gate must start graveyard vigil")
	_check(scene.run_mode == "full_vigil", "departing in full_vigil mode must start full_vigil")
	_check(scene.encore_available, "paper_ward charm must arm encore revival upon departure")
	_check(scene.player.damage_mult > 1.1, "tung_oil blend must boost damage multiplier upon departure")

	scene.queue_free()
	await process_frame
	await process_frame
	quit(1 if failures > 0 else 0)

func _check(condition: bool, message: String) -> void:
	if condition:
		print("PASS: ", message)
	else:
		printerr("FAIL: ", message)
		failures += 1
