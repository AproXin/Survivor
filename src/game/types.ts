export type GamePhase = 'title' | 'playing' | 'paused' | 'levelup' | 'gameover';
export type Realm = 'mortal' | 'spectral';
export type OperaFace = 'sheng' | 'dan';

export type EnemyKind =
  | 'ghost'
  | 'jiangshi'
  | 'wisp_caster'
  | 'elite_ghost'
  | 'elite_jiangshi'
  | 'punisher'
  | 'boss_magistrate';

export type RuleId =
  | 'no_backward'
  | 'blackout_stay_in_light'
  | 'avoid_name_call'
  | 'avoid_door_knock'
  | 'avoid_water_gong'
  | 'avoid_ink_shadow'
  | 'avoid_white_stranger'
  | 'avoid_wall_shadow'
  | 'no_stele_linger';

export type UpgradeId =
  | 'sword_flurry'
  | 'sleeve_spin'
  | 'lantern_fire'
  | 'mask_freeze'
  | 'troupe_gong'
  | 'gonglu'
  | 'encore'
  | 'soul_shield'
  | 'lamp_oil'
  | 'night_bell'
  | 'taboo_book'
  | 'ghost_talisman'
  | 'yin_yang_mirror'
  | 'paper_crane'
  | 'spirit_brand'
  | 'shadow_walker'
  | 'fallback_wick';

export type MetaUpgradeId = 'vitality' | 'swiftness' | 'wick_power' | 'spirit_pouch';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  category: string;
  maxLevel: number;
  summary: string;
  effectPerLevel: string;
  isFallback?: boolean;
}

export interface RuleDef {
  id: RuleId;
  shortTitle: string;
  obsessionCue: string;
  description: string;
}

export interface ActiveRuleState {
  id: RuleId;
  shortTitle: string;
  obsessionCue: string;
  description: string;
  broken: boolean;
  progress: number; // 0..1 warning proximity
  suspended?: boolean;
}

export interface MetaUpgradeDef {
  id: MetaUpgradeId;
  name: string;
  description: string;
  maxLevel: number;
  costs: number[];
  bonusLabel: (level: number) => string;
}

export interface SaveData {
  coins: number;
  bestTime: number;
  bestKills: number;
  totalRuns: number;
  victories: number;
  muted: boolean;
  metaLevels: Record<MetaUpgradeId, number>;
}

export interface SubtitleState {
  text: string;
  speaker?: string;
  key: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  realm: Realm;
  face: OperaFace;
  hp: number;
  maxHp: number;
  lanternFuel: number;
  maxLanternFuel: number;
  level: number;
  xp: number;
  xpToNext: number;
  timeSec: number;
  bossTargetTime: number;
  kills: number;
  runCoins: number;
  flipCooldown: number;
  flipCooldownMax: number;
  rules: ActiveRuleState[];
  rulesBrokenCount: number;
  activeObsessionCue: string;
  blackoutRemaining: number;
  gongWaterRemaining: number;
  punisherActive: boolean;
  punisherRemaining: number;
  bossActive: boolean;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  bossPhase2: boolean;
  bossSpeech: string;
  encoreAvailable: boolean;
  alertText: string;
  alertTone: 'warning' | 'violation' | 'realm' | 'boss';
  alertKey: number;
  subtitle: SubtitleState | null;
  upgradeChoices: UpgradeChoiceView[];
  upgradeLevels: Partial<Record<UpgradeId, number>>;
  endSummary: RunSummary | null;
  muted: boolean;
}

export interface UpgradeChoiceView {
  id: UpgradeId;
  name: string;
  category: string;
  currentLevel: number;
  maxLevel: number;
  summary: string;
  effectPerLevel: string;
}

export interface RunSummary {
  victory: boolean;
  timeSec: number;
  kills: number;
  level: number;
  rulesKept: number;
  rulesTotal: number;
  rulesBrokenCount: number;
  flawlessVigil: boolean;
  reachedBoss: boolean;
  coinsEarned: number;
  bossDefeated: boolean;
  bestTime: number;
}
