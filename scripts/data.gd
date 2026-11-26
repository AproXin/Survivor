extends RefCounted
class_name InkData

const WORLD_SIZE := 2200.0
const WORLD_HALF := WORLD_SIZE * 0.5
const RUN_DURATION := 60.0
const FULL_VIGIL_BOSS_TIME := 90.0
const XP_PER_LEVEL := 12

const GAME_META := {
	"title_zh": "墨夜点灯人",
	"title_en": "INK NIGHT: THE LAMP BEARER",
	"subtitle_zh": "中元夜，替人点一盏灯，守到天明。",
	"subtitle_en": "On Ghost Festival, I light a lamp for the dead — and keep it till dawn.",
	"hub_title_zh": "渡墨镇 · 避幽祖火",
	"hub_title_en": "Dumo Town · Ancestral Fire",
	"hub_desc_zh": "镇心长明祖火庇护阳世，老油坊、扎彩故铺与界关皆在此间。",
	"hub_desc_en": "The ancestral bronze furnace holds back the sinking ink beyond the stone gate.",
}

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
	"ghost": {"name": "游魂", "hp": 16.0, "speed": 64.0, "damage": 6.0, "xp": 2.0, "coins": 0, "radius": 17.0, "is_elite": false, "is_boss": false},
	"jiangshi": {"name": "行尸", "hp": 48.0, "speed": 50.0, "damage": 11.0, "xp": 4.0, "coins": 1, "radius": 20.0, "is_elite": false, "is_boss": false},
	"wisp_caster": {"name": "鬼火灵", "hp": 28.0, "speed": 72.0, "damage": 9.0, "xp": 4.0, "coins": 1, "radius": 16.0, "is_elite": false, "is_boss": false},
	"elite_ghost": {"name": "红眼大幽魂", "hp": 140.0, "speed": 70.0, "damage": 13.0, "xp": 14.0, "coins": 5, "radius": 28.0, "is_elite": true, "is_boss": false},
	"elite_jiangshi": {"name": "红眼印章尸", "hp": 195.0, "speed": 52.0, "damage": 16.0, "xp": 18.0, "coins": 7, "radius": 29.0, "is_elite": true, "is_boss": false},
	"punisher": {"name": "白纸差役", "hp": 520.0, "speed": 145.0, "damage": 16.0, "xp": 0.0, "coins": 0, "radius": 26.0, "is_elite": false, "is_boss": false},
	"boss_magistrate": {"name": "纸扎判官", "hp": 720.0, "speed": 78.0, "damage": 18.0, "xp": 60.0, "coins": 28, "radius": 38.0, "is_elite": true, "is_boss": true},
}

# 乱葬岗九大禁忌：戒律主句 + 执念微语 + 英文对照（对齐 37 号终审稿）
const FIXED_RULES := [
	{
		"id": "shadow",
		"title": "切莫践踏阴影",
		"en_title": "Do not step on the shadows.",
		"cue": "地上的黑影……动了一下。",
		"en_cue": "The shadow on the ground… just moved.",
		"description": "莫在阴影中驻足",
		"broken": false,
		"progress": 0.0,
	},
	{
		"id": "stranger",
		"title": "遇白衣莫搭言",
		"en_title": "Figure in white asks the way, approach not.",
		"cue": "一个白衣人拦住你问路。",
		"en_cue": "A pale figure stops you to ask the way.",
		"description": "勿近白衣人",
		"broken": false,
		"progress": 0.0,
	},
	{
		"id": "blackout",
		"title": "熄灯须立光中",
		"en_title": "When lights out, stay in the light.",
		"cue": "灯要灭了。站住，别动。",
		"en_cue": "The flame is dying. Freeze.",
		"description": "灯灭不可离光",
		"broken": false,
		"progress": 0.0,
	},
]

const FULL_RULE_POOL := [
	{"id": "no_backward", "title": "不得倒退行走", "en_title": "Do not walk backwards.", "cue": "身后有人跟着你走。", "en_cue": "Someone is following your footsteps.", "broken": false, "progress": 0.0},
	{"id": "blackout", "title": "熄灯须立光中", "en_title": "When lights out, stay in the light.", "cue": "灯要灭了。站住，别动。", "en_cue": "The flame is dying. Freeze.", "broken": false, "progress": 0.0},
	{"id": "avoid_name_call", "title": "闻名切莫回头", "en_title": "Heard your name? Do not approach.", "cue": "有人在背后喊你的名字。", "en_cue": "A voice behind calls your name.", "broken": false, "progress": 0.0},
	{"id": "avoid_door_knock", "title": "叩门切莫轻启", "en_title": "Heard knocking? Do not open.", "cue": "三下敲门声。", "en_cue": "Three hollow knocks at the door.", "broken": false, "progress": 0.0},
	{"id": "avoid_water_gong", "title": "锣响切莫窥澜", "en_title": "After the gong, look not at the water.", "cue": "锣响了。水里有东西在看你。", "en_cue": "The gong sounds. Eyes watch from the deep.", "broken": false, "progress": 0.0},
	{"id": "shadow", "title": "切莫践踏阴影", "en_title": "Do not step on the shadows.", "cue": "地上的黑影……动了一下。", "en_cue": "The shadow on the ground… just moved.", "broken": false, "progress": 0.0},
	{"id": "stranger", "title": "遇白衣莫搭言", "en_title": "Figure in white asks the way, approach not.", "cue": "一个白衣人拦住你问路。", "en_cue": "A pale figure stops you to ask the way.", "broken": false, "progress": 0.0},
	{"id": "avoid_wall_shadow", "title": "破晓莫越断垣", "en_title": "Before dawn, go not behind broken walls.", "cue": "墙后头，比墙这边黑。", "en_cue": "Behind the wall, it is darker.", "broken": false, "progress": 0.0},
	{"id": "no_stele_linger", "title": "莫在残碑前驻足", "en_title": "Do not linger before the gravestone.", "cue": "碑上没有字。等着刻你的名字。", "en_cue": "The stone is blank. Waiting for your name.", "broken": false, "progress": 0.0},
]

# 局内 16 项戏班与民俗双轨名物升级（对齐 37 号终审稿）
const FIXED_UPGRADES := [
	{
		"id": "talisman",
		"name": "朱砂辟邪符",
		"en_name": "Cinnabar Talisman",
		"category": "规则道具",
		"max_level": 3,
		"description": "受击无敌时间 +0.15s，行步速度 +8。",
		"en_description": "Invuln +0.15s, move speed +8 per lv.",
	},
	{
		"id": "crane",
		"name": "云韶引魂鹤",
		"en_name": "Soul-Guiding Crane",
		"category": "世界道具",
		"max_level": 3,
		"description": "远距汲取墨魄宝石，立于人间回补气血。",
		"en_description": "Draw distant gems; restore HP over time in human world.",
	},
	{
		"id": "sword",
		"name": "云韶断妄刃",
		"en_name": "Severing Blade",
		"category": "形态 · 生",
		"max_level": 4,
		"description": "武生剑气伤害 +4，出剑间隔 -0.03s。",
		"en_description": "Sheng sword: +4 dmg, -0.03s interval.",
	},
]

const FULL_UPGRADE_POOL := [
	{"id": "talisman", "name": "朱砂辟邪符", "en_name": "Cinnabar Talisman", "category": "规则道具", "max_level": 3, "description": "受击无敌时间 +0.15s，行步速度 +8。", "en_description": "Invuln +0.15s, move speed +8 per lv."},
	{"id": "crane", "name": "云韶引魂鹤", "en_name": "Soul-Guiding Crane", "category": "世界道具", "max_level": 3, "description": "远距汲取墨魄宝石，立于人间回补气血。", "en_description": "Draw distant gems; restore HP over time in human world."},
	{"id": "sword", "name": "云韶断妄刃", "en_name": "Severing Blade", "category": "形态 · 生", "max_level": 4, "description": "武生剑气伤害 +4，出剑间隔 -0.03s。", "en_description": "Sheng sword: +4 dmg, -0.03s interval."},
	{"id": "sleeve_spin", "name": "白绫回风袖", "en_name": "Wind-Whirl Sleeve", "category": "形态 · 旦", "max_level": 4, "description": "青衣水袖范围 +18，伤害 +3，转速加快。", "en_description": "Dan sleeve: +18 range, +3 dmg, faster spin."},
	{"id": "lantern_fire", "name": "照夜长明火", "en_name": "Everlasting Flame", "category": "形态 · 少年", "max_level": 4, "description": "少年灯火伤害 +5，照耀半径 +15。", "en_description": "Boy soul flame: +5 dmg, +15 radius."},
	{"id": "mask_freeze", "name": "破煞油彩", "en_name": "Warding Greasepaint", "category": "变脸与破界", "max_level": 3, "description": "翻界定格伤害 +10，翻界后获 1 秒无敌。", "en_description": "Flip burst +10 dmg; gain 1s invuln on flip."},
	{"id": "troupe_gong", "name": "云韶金锣", "en_name": "Golden Troupe Gong", "category": "行当通用", "max_level": 3, "description": "三形态普攻伤害全量 +2，声震百鬼。", "en_description": "All forms attack damage +2 across the board."},
	{"id": "gonglu", "name": "戏台催阵鼓", "en_name": "Urgent Stage Drum", "category": "行当通用", "max_level": 3, "description": "每 5 秒轰出震波击退近敌，间隔再缩短。", "en_description": "Shockwave every 5s knocks back foes; cooldown reduced."},
	{"id": "encore", "name": "还魂替身偶", "en_name": "Soul-Calling Effigy", "category": "行当通用", "max_level": 1, "description": "气绝时以半血还魂复起，每局仅一次。", "en_description": "Revive at 50% HP once per run."},
	{"id": "soul_shield", "name": "扎彩保命甲", "en_name": "Paper-Armor Ward", "category": "行当通用", "max_level": 3, "description": "气血上限 +20，强健身魄抵御阴煞。", "en_description": "Max HP +20 to withstand deathly chill."},
	{"id": "lamp_oil", "name": "松脂明心油", "en_name": "Pine-Resin Lamp Oil", "category": "规则道具", "max_level": 3, "description": "灯圈范围扩张：人间每级 +30，诡界 +20。", "en_description": "Lantern radius +30 (human) / +20 (spirit) per lv."},
	{"id": "night_bell", "name": "更夫惊魂铎", "en_name": "Watchman's Chime", "category": "规则道具", "max_level": 3, "description": "临破规前提前 0.5 秒急促鸣响预警。", "en_description": "Rings 0.5s earlier before a taboo breaks."},
	{"id": "taboo_book", "name": "阴司勾名折", "en_name": "Bailiff's Roster", "category": "规则道具", "max_level": 3, "description": "白纸差役追猎时长 -4s，触碰伤害 -3。", "en_description": "Bailiff hunt -4s, contact damage -3 per lv."},
	{"id": "yin_yang_mirror", "name": "照妖阴阳鉴", "en_name": "Yin-Yang Speculum", "category": "世界道具", "max_level": 3, "description": "翻界轰出阴阳煞震，生旦二相伤害 +2。", "en_description": "World-flip shockwave; Sheng/Dan forms +2 dmg."},
	{"id": "spirit_brand", "name": "冥河引渡印", "en_name": "Styx Passage Seal", "category": "世界道具", "max_level": 3, "description": "诡界收割墨魄倍增，诡界灯火圈大幅扩张。", "en_description": "Spirit world exp boosted; lantern radius expanded."},
	{"id": "shadow_walker", "name": "化雾踏影步", "en_name": "Mist-Shadow Stride", "category": "世界道具", "max_level": 3, "description": "翻界瞬间身如残雾，2 秒内疾行如风。", "en_description": "Move speed +40% for 2s after world flip."},
]

const FALLBACK_UPGRADE := {
	"id": "fallback_wick",
	"name": "残灯余烬",
	"en_name": "Dying Embers",
	"category": "终局保底",
	"max_level": 99,
	"description": "万物皆满，唯心火不熄：少年平A伤害 +1。",
	"en_description": "All maxed: Boy lantern damage +1.",
}

const META_UPGRADES := [
	{"id": "vitality", "name": "熬身", "en_name": "Vigor", "desc": "借祖火温养气血，初始气血上限 +15/级。", "en_desc": "Ancestral fire fortifies max HP +15/lv.", "max_level": 4, "costs": [10, 20, 35, 55]},
	{"id": "swiftness", "name": "行步", "en_name": "Stride", "desc": "轻履过荒坟，人间与诡界移速 +7%/级。", "en_desc": "Move speed +7%/lv across both realms.", "max_level": 4, "costs": [12, 24, 40, 60]},
	{"id": "wick_power", "name": "芯火", "en_name": "Wick", "desc": "添老油坊秘芯，三形态镇煞威力 +10%/级。", "en_desc": "All forms attack power +10%/lv.", "max_level": 4, "costs": [15, 30, 50, 75]},
	{"id": "spirit_pouch", "name": "聚灵", "en_name": "Spirit Pouch", "desc": "缝扎彩故铺灵囊，墨魄汲取半径 +22/级。", "en_desc": "Gem draw radius +22/lv.", "max_level": 4, "costs": [10, 22, 38, 58]},
]

const OIL_BLENDS := [
	{"id": "pine_oil", "name": "松脂清油", "en_name": "Pine-Resin Oil", "tag": "稳健守规", "desc": "人间灯圈 +28，灯油燃耗 -15%。", "en_desc": "Mortal light +28, oil drain -15%."},
	{"id": "tung_oil", "name": "桐油烈芯", "en_name": "Fierce Tung Wick", "tag": "高攻速杀", "desc": "全形态攻击威力 +15%，灯油燃耗 +10%。", "en_desc": "All attack dmg +15%, oil drain +10%."},
	{"id": "spirit_wax", "name": "冥蜡冷芯", "en_name": "Spirit-Wax Core", "tag": "高频变脸", "desc": "翻界冷却 -0.45 秒，行步速度 +12。", "en_desc": "Flip cooldown -0.45s, move speed +12."},
]

const PAPER_CHARMS := [
	{"id": "paper_ward", "name": "纸扎替身符", "en_name": "Paper Effigy Charm", "cost": 15, "desc": "本夜自带一次气绝半血复起并震退周敌。", "en_desc": "Start tonight with 1 cheat-death revival."},
	{"id": "calm_talisman", "name": "镇魂安神符", "en_name": "Soul-Calming Ward", "cost": 12, "desc": "本夜破戒宽限 +0.45 秒，白纸差役触伤 -4。", "en_desc": "Taboo grace +0.45s, Bailiff damage -4 tonight."},
]

const WHITE_STRANGER_LINES := [
	"……请问，往生祠往哪边走？",
	"你……看见我丢的那只鞋了吗？",
	"前头那口大水井……还开着吗？",
]

const BOSS_LINES := {
	"intro": "吉时已至——何人代吾执笔，点断幽冥？！",
	"phase2": "生生死死，全乱了！换规矩！重来！",
	"defeat": "三十年了……这盏灯，总算有人接住了……",
}

const NARRATIVE_SUBTITLES := {
	"intro_0": {"zh": "今年没人肯来。我欠一个人情。", "en": "No one would come. I owe someone a debt."},
	"intro_1": {"zh": "地上有九条忌。守三条，别给回应。", "en": "Nine taboos lie here. Keep three — never reply."},
	"first_flip": {"zh": "翻过去那面，身与脸都不是自己的了。", "en": "On the other side, neither face nor flesh is yours."},
	"first_break": {"zh": "名字被记下了。别停步。", "en": "Your name is written. Keep moving."},
	"first_elite": {"zh": "它也有放不下的执念。但路不能让。", "en": "It had obsessions too. But the path is mine."},
	"boss_spawn": {"zh": "主持葬礼的人来了。他认得你。", "en": "The one holding the funeral is here. He knows you."},
	"boss_phase2": {"zh": "章程不对……这场大醮，得推倒重来！", "en": "The rites are wrong… This funeral must begin anew!"},
	"boss_down": {"zh": "醮坛火散了。天……快亮了。", "en": "The sacrificial fires fade. Dawn… draws near."},
}

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

static func full_rule_pool() -> Array:
	return FULL_RULE_POOL.duplicate(true)

static func fixed_upgrades() -> Array:
	return FIXED_UPGRADES.duplicate(true)

static func full_upgrade_pool() -> Array:
	return FULL_UPGRADE_POOL.duplicate(true)

static func meta_upgrades() -> Array:
	return META_UPGRADES.duplicate(true)

static func oil_blends() -> Array:
	return OIL_BLENDS.duplicate(true)

static func paper_charms() -> Array:
	return PAPER_CHARMS.duplicate(true)
