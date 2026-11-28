extends SceneTree

var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	_check(InkData.full_rule_pool().size() == 9, "full rule pool must contain 9 taboos")
	_check(InkData.full_upgrade_pool().size() == 16, "full upgrade pool must contain 16 upgrades")
	_check(InkData.meta_upgrades().size() == 4, "meta upgrades must contain 4 items")

	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	await process_frame

	# 1. Full vigil mode & random 9-choose-3 taboos
	scene.start_full_vigil()
	_check(scene.run_mode == "full_vigil", "start_full_vigil must set full_vigil mode")
	_check(scene.rules.size() == 3, "full vigil must draw 3 active rules")

	# 2. Test new taboos: no_backward, avoid_name_call, no_stele_linger
	scene.rules = [
		{"id": "no_backward", "title": "不得倒退行走", "broken": false, "progress": 0.0},
		{"id": "avoid_name_call", "title": "闻名切莫回头", "broken": false, "progress": 0.0},
		{"id": "no_stele_linger", "title": "莫在残碑前驻足", "broken": false, "progress": 0.0},
	]
	scene.player.vel = Vector2(0.0, 120.0)
	scene.update_taboos(2.2)
	_check(scene.violations == 1, "moving south >2s must violate no_backward")
	scene.hazards.name_call.active = true
	scene.hazards.name_call.pos = scene.player.pos
	scene.update_taboos(0.05)
	_check(scene.violations == 2, "stepping into name_call must violate avoid_name_call")
	scene.player.vel = Vector2.ZERO
	scene.player.pos = scene.landmarks.blank_stele
	scene.update_taboos(3.2)
	_check(scene.violations == 3, "lingering at blank stele >3s must violate no_stele_linger")

	# 3. Test Level 3+ full 16-upgrade pool & Encore revival
	scene.level = 3
	var rolled: Array = scene._roll_upgrade_choices()
	_check(rolled.size() == 3, "level 3+ must roll 3 choices from 16-item pool")
	scene.phase = scene.Phase.LEVELUP
	scene.rolled_choices = [InkData.full_upgrade_pool()[8]] # encore
	scene.choose_upgrade(0)
	_check(scene.encore_available, "choosing encore must arm cheat-death revival")
	scene.invuln = 0.0
	scene.player.hp = 5.0
	scene.damage_player(99.0)
	_check(scene.phase == scene.Phase.PLAYING, "encore must revive player instead of ending run")
	_check(not scene.encore_available, "encore must be consumed after revival")
	_check(scene.player.hp > 0.0, "encore revival must restore half HP")

	# 4. Test Paper Judge Boss 2-Phase fight & victory
	var boss_idx: int = scene.spawn_boss()
	_check(scene.boss_spawned and scene.boss_phase == 1, "spawn_boss must start phase 1")
	_check(scene.get_boss_snapshot().active, "boss snapshot must be active")
	scene.damage_enemy(boss_idx, 400.0)
	_check(scene.boss_phase == 2, "boss below 50% HP must enter phase 2")
	_check(scene.enemy_bullets.size() >= 8, "boss phase 2 must fire radial ink barrage")
	scene.damage_enemy(boss_idx, 9999.0)
	_check(scene.boss_defeated, "killing boss must set boss_defeated")
	_check(scene.phase == scene.Phase.ENDED and scene.ended_victory, "defeating boss must win the run")

	# 5. Test Meta-Progression purchase
	scene.save_data.coins = 50
	var bought: bool = scene.buy_meta_upgrade("vitality")
	_check(bought, "buying vitality with enough coins must succeed")
	_check(int(scene.save_data.meta_levels.vitality) == 1, "vitality meta level must increment to 1")
	_check(int(scene.save_data.coins) == 40, "coins must deduct cost (10)")

	# 6. Test Doc 37 text/narrative/bilingual/obsession-cue integration
	_check(InkData.GAME_META.title_zh == "墨夜点灯人", "official title must be 墨夜点灯人")
	_check(InkData.NARRATIVE_SUBTITLES.size() == 8, "narrative subtitles must contain all 8 Doc 37 cues")
	scene.start_run()
	_check(scene.subtitle_text == "今年没人肯来。我欠一个人情。", "intro_0 subtitle must fire on run start")
	scene.time_sec = 6.1
	scene.step(0.05)
	_check(scene.subtitle_text == "地上有九条忌。守三条，别给回应。", "intro_1 subtitle must fire at 6s")
	scene.player.pos = scene.hazards.shadow_zones[0].pos
	scene.update_taboos(0.1)
	_check(scene.active_cue == "地上的黑影……动了一下。", "shadow taboo must surface obsession cue")
	scene.toggle_lang()
	_check(scene.lang == "en", "language toggle must switch to English")
	scene.update_taboos(0.1)
	_check(scene.active_cue == "The shadow on the ground… just moved.", "English obsession cue must match Doc 37")

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
