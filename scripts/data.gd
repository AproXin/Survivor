extends RefCounted
class_name InkData

const WORLD_SIZE := 2200.0
const WORLD_HALF := WORLD_SIZE * 0.5
const RUN_DURATION := 60.0
const XP_PER_LEVEL := 12

const PLAYER_BASE := {
	"max_hp": 85.0,
	"mortal_speed": 175.0,
	"spectral_speed": 190.0,
	"pickup_radius": 68.0,
	"hit_invuln_sec": 0.55,
	"flip_cooldown_sec": 3.0,
	"flip_freeze_sec": 0.52,
	"flip_blast_radius": 155.0,
	"flip_blast_damage": 24.0,
	"lantern_interval": 0.72,
	"lantern_damage": 12.0,
	"lantern_range": 310.0,
	"sheng_interval": 0.36,
	"sheng_damage": 16.0,
	"sheng_range": 215.0,
	"dan_interval": 0.92,
	"dan_damage": 14.0,
	"dan_radius": 108.0,
}

const ENEMY_TABLE := {
	"ghost": {"name": "游魂", "hp": 16.0, "speed": 64.0, "damage": 6.0, "xp": 2.0, "radius": 17.0},
	"jiangshi": {"name": "行尸", "hp": 48.0, "speed": 50.0, "damage": 11.0, "xp": 4.0, "radius": 20.0},
	"punisher": {"name": "白纸差役", "hp": 520.0, "speed": 145.0, "damage": 16.0, "xp": 0.0, "radius": 26.0},
}

const FIXED_RULES := [
	{"id": "shadow", "title": "切莫践踏阴影", "description": "莫在阴影中驻足", "broken": false, "progress": 0.0},
	{"id": "stranger", "title": "遇白衣莫搭言", "description": "勿近白衣人", "broken": false, "progress": 0.0},
	{"id": "blackout", "title": "熄灯须立光中", "description": "灯灭不可离光", "broken": false, "progress": 0.0},
]

const FIXED_UPGRADES := [
	{"id": "talisman", "name": "朱砂辟邪符", "description": "受击无敌 +0.15 秒，行步速度 +8"},
	{"id": "crane", "name": "云韶引魂鹤", "description": "拾取范围 +45，人间每 4 秒回血 +2"},
	{"id": "sword", "name": "云韶断妄刃", "description": "生剑气伤害 +4，出剑间隔 -0.03 秒"},
]

static func palette() -> Dictionary:
	return {
		"ink_deep": Color("#06090B"),
		"ink_night": Color("#0E1418"),
		"ink_slate": Color("#1C2A30"),
		"grey_dark": Color("#3D4A48"),
		"grey_mid": Color("#5C6B6B"),
		"grey_light": Color("#8A9A94"),
		"sage_dark": Color("#49554F"),
		"sage_mid": Color("#6E7F74"),
		"sage_light": Color("#93A894"),
		"bone_dark": Color("#B9B09A"),
		"bone": Color("#EDE6D6"),
		"bone_bright": Color("#FAF6EA"),
		"amber_dark": Color("#B97F22"),
		"amber": Color("#E8B34A"),
		"amber_bright": Color("#F5D98A"),
		"vermilion_dark": Color("#7C1E10"),
		"vermilion": Color("#C8402A"),
		"vermilion_bright": Color("#E4654A"),
		"xp_dark": Color("#3D8A4E"),
		"xp_mid": Color("#57B96A"),
		"xp_bright": Color("#8FD694"),
	}

static func player_base() -> Dictionary:
	return PLAYER_BASE.duplicate(true)

static func enemy(kind: String) -> Dictionary:
	return ENEMY_TABLE.get(kind, ENEMY_TABLE.ghost).duplicate(true)

static func fixed_rules() -> Array:
	return FIXED_RULES.duplicate(true)

static func fixed_upgrades() -> Array:
	return FIXED_UPGRADES.duplicate(true)
