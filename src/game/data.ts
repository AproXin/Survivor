import type {
  EnemyKind,
  MetaUpgradeDef,
  MetaUpgradeId,
  RuleDef,
  SaveData,
  UpgradeDef,
} from './types';

export const WORLD_SIZE = 2200;
export const WORLD_HALF = WORLD_SIZE / 2;

// Tight 4-minute vigil climax so players experience full arc + Paper Judge Boss in one sitting
export const BOSS_SPAWN_TIME_SEC = 240;
export const ELITE_INTERVAL_SEC = 65;

export const PLAYER_BASE = {
  maxHp: 85,
  mortalSpeed: 175,
  spectralSpeed: 190,
  pickupRadius: 68,
  hitInvulnSec: 0.55,
  flipCooldownSec: 3.0,
  flipFreezeSec: 0.52,
  flipBlastRadius: 155,
  flipBlastDamage: 24,
  lanternInterval: 0.72,
  lanternDamage: 12,
  lanternRange: 310,
  shengInterval: 0.36,
  shengDamage: 16,
  shengRange: 215,
  danInterval: 0.92,
  danDamage: 14,
  danRadius: 108,
} as const;

export interface EnemyArchetype {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  coins: number;
  radius: number;
  isElite?: boolean;
  isBoss?: boolean;
  isPunisher?: boolean;
}

export const ENEMY_TABLE: Record<EnemyKind, EnemyArchetype> = {
  ghost: {
    kind: 'ghost',
    name: '游魂',
    hp: 16,
    speed: 64,
    damage: 6,
    xp: 2,
    coins: 0,
    radius: 17,
  },
  jiangshi: {
    kind: 'jiangshi',
    name: '行尸',
    hp: 48,
    speed: 50,
    damage: 11,
    xp: 4,
    coins: 1,
    radius: 20,
  },
  wisp_caster: {
    kind: 'wisp_caster',
    name: '鬼火灵',
    hp: 28,
    speed: 74,
    damage: 9,
    xp: 4,
    coins: 1,
    radius: 16,
  },
  elite_ghost: {
    kind: 'elite_ghost',
    name: '红眼大幽魂',
    hp: 210,
    speed: 72,
    damage: 14,
    xp: 18,
    coins: 6,
    radius: 30,
    isElite: true,
  },
  elite_jiangshi: {
    kind: 'elite_jiangshi',
    name: '红眼印章尸',
    hp: 310,
    speed: 52,
    damage: 18,
    xp: 22,
    coins: 8,
    radius: 30,
    isElite: true,
  },
  punisher: {
    kind: 'punisher',
    name: '白纸差役',
    hp: 520,
    speed: 145,
    damage: 16,
    xp: 0,
    coins: 0,
    radius: 26,
    isPunisher: true,
  },
  boss_magistrate: {
    kind: 'boss_magistrate',
    name: '纸扎判官',
    hp: 1350,
    speed: 78,
    damage: 20,
    xp: 60,
    coins: 28,
    radius: 38,
    isBoss: true,
  },
};

/** 乱葬岗九大禁忌：戒律主句 + 执念微语 */
export const RULE_POOL: RuleDef[] = [
  {
    id: 'no_backward',
    shortTitle: '不得倒退行走',
    obsessionCue: '身后有人跟着你走。',
    description: '切莫持续向南（来路方向）倒退行走超过两息。',
  },
  {
    id: 'blackout_stay_in_light',
    shortTitle: '熄灯须立光中',
    obsessionCue: '灯要灭了。站住，别动。',
    description: '灯火暂熄五息，须立于残留暖圈或冷色月光鬼火中。',
  },
  {
    id: 'avoid_name_call',
    shortTitle: '闻名切莫回头',
    obsessionCue: '有人在背后喊你的名字。',
    description: '雾中响起唤名波纹时，切莫步入声源白圈。',
  },
  {
    id: 'avoid_door_knock',
    shortTitle: '叩门切莫轻启',
    obsessionCue: '三下敲门声。',
    description: '西南断路阴门响起三声叩门时，切莫踏入门前石阶。',
  },
  {
    id: 'avoid_water_gong',
    shortTitle: '锣响切莫窥澜',
    obsessionCue: '锣响了。水里有东西在看你。',
    description: '远处铜锣震响期间，切莫靠近东南暗潭水面。',
  },
  {
    id: 'avoid_ink_shadow',
    shortTitle: '切莫践踏阴影',
    obsessionCue: '地上的黑影……动了一下。',
    description: '地面游走的浓墨黑影，切莫踏入其中。',
  },
  {
    id: 'avoid_white_stranger',
    shortTitle: '遇白衣莫搭言',
    obsessionCue: '一个白衣人拦住你问路。',
    description: '素面白衣人于雾中拦路问询，切莫步入其身周禁圈。',
  },
  {
    id: 'avoid_wall_shadow',
    shortTitle: '破晓莫越断垣',
    obsessionCue: '墙后头，比墙这边黑。',
    description: '天明前勿入西北断石界墙背阴区（判官亲临时此戒暂解）。',
  },
  {
    id: 'no_stele_linger',
    shortTitle: '莫在残碑前驻足',
    obsessionCue: '碑上没有字。等着刻你的名字。',
    description: '勿在北侧无字残碑前青石区驻足超过三息。',
  },
];

/** 规则 7 白衣人问路轮换耳语 */
export const WHITE_STRANGER_LINES = [
  '……请问，往生祠往哪边走？',
  '你……看见我丢的那只鞋了吗？',
  '前头那口大水井……还开着吗？',
] as const;

/** 纸扎判官定场与转折台词 */
export const BOSS_LINES = {
  intro: '吉时已至——何人代吾执笔，点断幽冥？！',
  phase2: '生生死死，全乱了！换规矩！重来！',
  defeat: '三十年了……这盏灯，总算有人接住了……',
} as const;

/** 局内右下角微叙事字幕 */
export const NARRATIVE_SUBTITLES = {
  intro_0: '今年没人肯来。我欠一个人情。',
  intro_1: '地上有九条忌。守三条，别给回应。',
  first_flip: '翻过去那面，身与脸都不是自己的了。',
  first_break: '名字被记下了。别停步。',
  first_elite: '它也有放不下的执念。但路不能让。',
  boss_spawn: '主持葬礼的人来了。他认得你。',
  boss_phase2: '章程不对……这场大醮，得推倒重来！',
  boss_down: '醮坛火散了。天……快亮了。',
} as const;

/** 16 项戏班与民俗名物升级 */
export const UPGRADE_POOL: UpgradeDef[] = [
  {
    id: 'sword_flurry',
    name: '云韶断妄刃',
    category: '形态 · 生',
    maxLevel: 4,
    summary: '武生剑气伤害 +4，出剑间隔 -0.03s。',
    effectPerLevel: '快剑伤害 +4 · 攻速加快 · 三阶双斩',
  },
  {
    id: 'sleeve_spin',
    name: '白绫回风袖',
    category: '形态 · 旦',
    maxLevel: 4,
    summary: '青衣水袖范围 +18，伤害 +3，转速加快。',
    effectPerLevel: '水袖伤害 +3 · 范围 +18 · 回旋更快',
  },
  {
    id: 'lantern_fire',
    name: '照夜长明火',
    category: '形态 · 少年',
    maxLevel: 4,
    summary: '少年灯火伤害 +5，照耀半径 +15。',
    effectPerLevel: '灯焰 +1 枚 · 伤害 +5 · 光圈 +15',
  },
  {
    id: 'mask_freeze',
    name: '破煞油彩',
    category: '变脸与破界',
    maxLevel: 3,
    summary: '翻界定格伤害 +10，翻界后获 1 秒无敌。',
    effectPerLevel: '定格伤害 +10 · 翻界无敌延长',
  },
  {
    id: 'troupe_gong',
    name: '云韶金锣',
    category: '行当通用',
    maxLevel: 3,
    summary: '三形态普攻伤害全量 +2，声震百鬼。',
    effectPerLevel: '全形态攻击伤害 +2',
  },
  {
    id: 'gonglu',
    name: '戏台催阵鼓',
    category: '行当通用',
    maxLevel: 3,
    summary: '每 5 秒轰出震波击退近敌，间隔再缩短。',
    effectPerLevel: '周期鼓震伤害 +14 · 击退近敌',
  },
  {
    id: 'encore',
    name: '还魂替身偶',
    category: '行当通用',
    maxLevel: 1,
    summary: '气绝时以半血还魂复起，每局仅一次。',
    effectPerLevel: '气绝时半血复起并震退周敌',
  },
  {
    id: 'soul_shield',
    name: '扎彩保命甲',
    category: '行当通用',
    maxLevel: 3,
    summary: '气血上限 +20，强健身魄抵御阴煞。',
    effectPerLevel: '气血上限 +20 并恢复 20 气血',
  },
  {
    id: 'lamp_oil',
    name: '松脂明心油',
    category: '规则道具',
    maxLevel: 3,
    summary: '灯圈范围扩张：人间每级 +30，诡界 +20。',
    effectPerLevel: '人间光圈 +30 · 诡界 +20 · 燃耗减缓',
  },
  {
    id: 'night_bell',
    name: '更夫惊魂铎',
    category: '规则道具',
    maxLevel: 3,
    summary: '临破规前提前 0.5 秒急促鸣响预警。',
    effectPerLevel: '破戒宽限延长 · 提前鸣铎示警',
  },
  {
    id: 'taboo_book',
    name: '阴司勾名折',
    category: '规则道具',
    maxLevel: 3,
    summary: '白纸差役追猎时长 -4s，触碰伤害 -3。',
    effectPerLevel: '差役追猎 -4s · 触伤 -3 · 香火资 +20%',
  },
  {
    id: 'ghost_talisman',
    name: '朱砂辟邪符',
    category: '规则道具',
    maxLevel: 3,
    summary: '受击无敌时间 +0.15s，行步速度 +8。',
    effectPerLevel: '受击无敌 +0.15s · 移速 +8',
  },
  {
    id: 'yin_yang_mirror',
    name: '照妖阴阳鉴',
    category: '世界道具',
    maxLevel: 3,
    summary: '翻界轰出阴阳煞震，生旦二相伤害 +2。',
    effectPerLevel: '翻界双环煞震 · 生旦伤害 +2 · 冷却缩短',
  },
  {
    id: 'paper_crane',
    name: '云韶引魂鹤',
    category: '世界道具',
    maxLevel: 3,
    summary: '远距汲取墨魄宝石，立于人间回补气血。',
    effectPerLevel: '拾取范围 +45 · 人间每 4 秒回血 +2',
  },
  {
    id: 'spirit_brand',
    name: '冥河引渡印',
    category: '世界道具',
    maxLevel: 3,
    summary: '诡界收割墨魄倍增，诡界灯火圈大幅扩张。',
    effectPerLevel: '诡界经验 +35% · 诡界光圈 +28',
  },
  {
    id: 'shadow_walker',
    name: '化雾踏影步',
    category: '世界道具',
    maxLevel: 3,
    summary: '翻界瞬间身如残雾，2 秒内疾行如风。',
    effectPerLevel: '翻界后 2 秒移速 +40%',
  },
];

export const FALLBACK_UPGRADE: UpgradeDef = {
  id: 'fallback_wick',
  name: '残灯余烬',
  category: '终局保底',
  maxLevel: 99,
  summary: '万物皆满，唯心火不熄：少年平A伤害 +1。',
  effectPerLevel: '少年灯火伤害 +1 · 恢复 10 气血',
  isFallback: true,
};

/** 渡墨镇 · 避幽祖火 局外修习 */
export const META_UPGRADES: MetaUpgradeDef[] = [
  {
    id: 'vitality',
    name: '熬身',
    description: '借祖火温养气血，提升出城初始气血上限。',
    maxLevel: 4,
    costs: [10, 20, 35, 55],
    bonusLabel: (lvl) => `气血上限 +${lvl * 15}`,
  },
  {
    id: 'swiftness',
    name: '行步',
    description: '轻履过荒坟，提升人间与诡界步履速度。',
    maxLevel: 4,
    costs: [12, 24, 40, 60],
    bonusLabel: (lvl) => `行步移速 +${lvl * 7}%`,
  },
  {
    id: 'wick_power',
    name: '芯火',
    description: '添老油坊秘芯，提升三形态镇煞威力。',
    maxLevel: 4,
    costs: [15, 30, 50, 75],
    bonusLabel: (lvl) => `全形态威力 +${lvl * 10}%`,
  },
  {
    id: 'spirit_pouch',
    name: '聚灵',
    description: '缝扎彩故铺灵囊，扩大墨魄汲取半径。',
    maxLevel: 4,
    costs: [10, 22, 38, 58],
    bonusLabel: (lvl) => `汲取半径 +${lvl * 22}`,
  },
];

export const DEFAULT_SAVE: SaveData = {
  coins: 0,
  bestTime: 0,
  bestKills: 0,
  totalRuns: 0,
  victories: 0,
  muted: false,
  metaLevels: {
    vitality: 0,
    swiftness: 0,
    wick_power: 0,
    spirit_pouch: 0,
  },
};

export const SAVE_STORAGE_KEY = 'ink_night_lamp_bearer_save_v1';

export function loadSaveData(): SaveData {
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE, metaLevels: { ...DEFAULT_SAVE.metaLevels } };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      coins: typeof parsed.coins === 'number' && Number.isFinite(parsed.coins) ? Math.max(0, Math.floor(parsed.coins)) : 0,
      bestTime: typeof parsed.bestTime === 'number' && Number.isFinite(parsed.bestTime) ? Math.max(0, parsed.bestTime) : 0,
      bestKills: typeof parsed.bestKills === 'number' && Number.isFinite(parsed.bestKills) ? Math.max(0, Math.floor(parsed.bestKills)) : 0,
      totalRuns: typeof parsed.totalRuns === 'number' && Number.isFinite(parsed.totalRuns) ? Math.max(0, Math.floor(parsed.totalRuns)) : 0,
      victories: typeof parsed.victories === 'number' && Number.isFinite(parsed.victories) ? Math.max(0, Math.floor(parsed.victories)) : 0,
      muted: Boolean(parsed.muted),
      metaLevels: {
        vitality: clampMeta(parsed.metaLevels?.vitality, 'vitality'),
        swiftness: clampMeta(parsed.metaLevels?.swiftness, 'swiftness'),
        wick_power: clampMeta(parsed.metaLevels?.wick_power, 'wick_power'),
        spirit_pouch: clampMeta(parsed.metaLevels?.spirit_pouch, 'spirit_pouch'),
      },
    };
  } catch {
    return { ...DEFAULT_SAVE, metaLevels: { ...DEFAULT_SAVE.metaLevels } };
  }
}

function clampMeta(val: unknown, id: MetaUpgradeId): number {
  const def = META_UPGRADES.find((m) => m.id === id);
  const max = def ? def.maxLevel : 4;
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(max, Math.floor(val)));
}

export function persistSaveData(save: SaveData): void {
  try {
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Ignore storage errors
  }
}
