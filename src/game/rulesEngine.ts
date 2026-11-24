import {
  BOSS_SPAWN_TIME_SEC,
  FALLBACK_UPGRADE,
  META_UPGRADES,
  PLAYER_BASE,
  RULE_POOL,
  UPGRADE_POOL,
} from './data';
import type {
  ActiveRuleState,
  EnemyKind,
  MetaUpgradeId,
  Realm,
  SaveData,
  UpgradeChoiceView,
  UpgradeId,
} from './types';

export interface CircleZone {
  x: number;
  y: number;
  r: number;
}

export interface RectZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function xpForNextLevel(level: number): number {
  return 7 + Math.max(1, level) * 5;
}

export function shuffleWith<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/** Draw 3 distinct active taboos from the 9-taboo pool. */
export function drawRunRules(count = 3, rng: () => number = Math.random): ActiveRuleState[] {
  const picked = shuffleWith(RULE_POOL, rng).slice(0, Math.min(count, RULE_POOL.length));
  return picked.map((r) => ({
    id: r.id,
    shortTitle: r.shortTitle,
    obsessionCue: r.obsessionCue,
    description: r.description,
    broken: false,
    progress: 0,
    suspended: false,
  }));
}

/** Boss half-HP mechanic: swap one active taboo for an unused taboo, preserving broken history. */
export function rewriteOneRuleForBoss(
  activeRules: ActiveRuleState[],
  rng: () => number = Math.random
): { rules: ActiveRuleState[]; replacedIndex: number; newRule: ActiveRuleState | null } {
  const activeIds = new Set(activeRules.map((r) => r.id));
  const candidates = RULE_POOL.filter((r) => !activeIds.has(r.id) && r.id !== 'avoid_wall_shadow');
  if (candidates.length === 0 || activeRules.length === 0) {
    return { rules: activeRules, replacedIndex: -1, newRule: null };
  }
  const unbrokenIndices = activeRules
    .map((r, idx) => (!r.broken ? idx : -1))
    .filter((idx) => idx >= 0);
  const poolIndices = unbrokenIndices.length > 0 ? unbrokenIndices : activeRules.map((_, idx) => idx);
  const replacedIndex = poolIndices[Math.floor(rng() * poolIndices.length)];
  const chosenDef = candidates[Math.floor(rng() * candidates.length)];
  const newRule: ActiveRuleState = {
    id: chosenDef.id,
    shortTitle: chosenDef.shortTitle,
    obsessionCue: chosenDef.obsessionCue,
    description: chosenDef.description,
    broken: false,
    progress: 0,
    suspended: false,
  };
  const nextRules = activeRules.map((r, idx) => (idx === replacedIndex ? newRule : { ...r }));
  return { rules: nextRules, replacedIndex, newRule };
}

/** Roll up to 3 upgrades from the 16-artifact pool, falling back to Dying Embers when all are maxed. */
export function rollUpgradeChoices(
  currentLevels: Partial<Record<UpgradeId, number>>,
  rng: () => number = Math.random
): UpgradeChoiceView[] {
  const available = UPGRADE_POOL.filter((u) => (currentLevels[u.id] ?? 0) < u.maxLevel);
  if (available.length === 0) {
    return [
      {
        id: FALLBACK_UPGRADE.id,
        name: FALLBACK_UPGRADE.name,
        category: FALLBACK_UPGRADE.category,
        currentLevel: currentLevels[FALLBACK_UPGRADE.id] ?? 0,
        maxLevel: FALLBACK_UPGRADE.maxLevel,
        summary: FALLBACK_UPGRADE.summary,
        effectPerLevel: FALLBACK_UPGRADE.effectPerLevel,
      },
    ];
  }
  const picked = shuffleWith(available, rng).slice(0, Math.min(3, available.length));
  return picked.map((u) => ({
    id: u.id,
    name: u.name,
    category: u.category,
    currentLevel: currentLevels[u.id] ?? 0,
    maxLevel: u.maxLevel,
    summary: u.summary,
    effectPerLevel: u.effectPerLevel,
  }));
}

/** Compute effective player stats from Dumo Town ancestral upgrades + 16 in-run classical artifacts. */
export function computePlayerStats(
  metaLevels: Record<MetaUpgradeId, number>,
  runLevels: Partial<Record<UpgradeId, number>>
) {
  const dmgMult = 1 + (metaLevels.wick_power ?? 0) * 0.1;
  const speedMult = 1 + (metaLevels.swiftness ?? 0) * 0.07;

  const swordLvl = runLevels.sword_flurry ?? 0;
  const sleeveLvl = runLevels.sleeve_spin ?? 0;
  const fireLvl = runLevels.lantern_fire ?? 0;
  const maskLvl = runLevels.mask_freeze ?? 0;
  const troupeLvl = runLevels.troupe_gong ?? 0;
  const gongluLvl = runLevels.gonglu ?? 0;
  const shieldLvl = runLevels.soul_shield ?? 0;
  const oilLvl = runLevels.lamp_oil ?? 0;
  const bellLvl = runLevels.night_bell ?? 0;
  const tabooLvl = runLevels.taboo_book ?? 0;
  const talismanLvl = runLevels.ghost_talisman ?? 0;
  const mirrorLvl = runLevels.yin_yang_mirror ?? 0;
  const craneLvl = runLevels.paper_crane ?? 0;
  const brandLvl = runLevels.spirit_brand ?? 0;
  const shadowLvl = runLevels.shadow_walker ?? 0;
  const fallbackLvl = runLevels.fallback_wick ?? 0;

  const flatAllDmg = troupeLvl * 2;
  const flatOperaDmg = mirrorLvl * 2;
  const flatSpeed = talismanLvl * 8;

  return {
    maxHp: PLAYER_BASE.maxHp + (metaLevels.vitality ?? 0) * 15 + shieldLvl * 20,
    mortalSpeed: PLAYER_BASE.mortalSpeed * speedMult + flatSpeed,
    spectralSpeed: PLAYER_BASE.spectralSpeed * speedMult + flatSpeed,
    hitInvulnSec: PLAYER_BASE.hitInvulnSec + talismanLvl * 0.15,
    pickupRadius: PLAYER_BASE.pickupRadius + (metaLevels.spirit_pouch ?? 0) * 22 + craneLvl * 45,
    mortalLanternBonus: oilLvl * 30 + fireLvl * 15,
    spectralLanternBonus: oilLvl * 20 + brandLvl * 28,
    lanternDamage: Math.round(
      (PLAYER_BASE.lanternDamage + fireLvl * 5 + flatAllDmg + fallbackLvl) * dmgMult
    ),
    lanternProjectiles: 1 + fireLvl,
    lanternInterval: Math.max(0.42, PLAYER_BASE.lanternInterval * Math.pow(0.95, fireLvl)),
    shengDamage: Math.round(
      (PLAYER_BASE.shengDamage + swordLvl * 4 + flatAllDmg + flatOperaDmg) * dmgMult
    ),
    shengInterval: Math.max(0.18, PLAYER_BASE.shengInterval - swordLvl * 0.03),
    shengDoubleSlash: swordLvl >= 3,
    danDamage: Math.round(
      (PLAYER_BASE.danDamage + sleeveLvl * 3 + flatAllDmg + flatOperaDmg) * dmgMult
    ),
    danRadius: PLAYER_BASE.danRadius + sleeveLvl * 18,
    danInterval: Math.max(0.5, PLAYER_BASE.danInterval * Math.pow(0.91, sleeveLvl)),
    flipDamage: Math.round((PLAYER_BASE.flipBlastDamage + maskLvl * 10 + mirrorLvl * 8) * dmgMult),
    flipCooldown: Math.max(1.5, PLAYER_BASE.flipCooldownSec - mirrorLvl * 0.25 - maskLvl * 0.15),
    flipInvulnSec: maskLvl > 0 ? 1.0 + (maskLvl - 1) * 0.35 : 0.35,
    flipSpeedBurstSec: shadowLvl > 0 ? 2.0 + (shadowLvl - 1) * 0.5 : 0,
    hasYinYangWave: mirrorLvl > 0,
    gongInterval: gongluLvl > 0 ? Math.max(3.0, 5.0 - (gongluLvl - 1) * 0.8) : 0,
    gongDamage: gongluLvl > 0 ? Math.round((16 + gongluLvl * 14) * dmgMult) : 0,
    craneHealAmount: craneLvl * 2,
    spectralXpMult: 2.0 + brandLvl * 0.7,
    ruleGraceMult: 1 + bellLvl * 0.35,
    earlyBellWarningSec: bellLvl > 0 ? 0.5 : 0,
    punisherDuration: Math.max(6, 18 - tabooLvl * 4),
    punisherDamageReduction: tabooLvl * 3,
    coinBonusMult: 1 + tabooLvl * 0.2 + (metaLevels.spirit_pouch ?? 0) * 0.12,
  };
}

export function isPointInAnyLight(px: number, py: number, lights: readonly CircleZone[]): boolean {
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    const dx = px - l.x;
    const dy = py - l.y;
    if (dx * dx + dy * dy <= l.r * l.r) return true;
  }
  return false;
}

export function isPointInRect(px: number, py: number, rect: RectZone): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

export function isPointInCircle(px: number, py: number, circle: CircleZone): boolean {
  const dx = px - circle.x;
  const dy = py - circle.y;
  return dx * dx + dy * dy <= circle.r * circle.r;
}

export function getWaveDirective(timeSec: number, realm: Realm): {
  spawnInterval: number;
  hpScale: number;
  pickEnemy: (rng?: () => number) => EnemyKind;
} {
  const progress = Math.min(1, Math.max(0, timeSec / BOSS_SPAWN_TIME_SEC));
  const baseInterval = 1.28 - progress * 0.72;
  const realmFactor = realm === 'spectral' ? 0.52 : 1.0;
  const spawnInterval = Math.max(0.28, baseInterval * realmFactor);
  const hpScale = 1 + progress * 0.85;

  const pickEnemy = (rng: () => number = Math.random): EnemyKind => {
    const roll = rng();
    if (timeSec < 32) return 'ghost';
    if (timeSec < 75) return roll < 0.72 ? 'ghost' : 'jiangshi';
    if (roll < 0.5) return 'ghost';
    if (roll < 0.8) return 'jiangshi';
    return 'wisp_caster';
  };

  return { spawnInterval, hpScale, pickEnemy };
}

export function purchaseMetaUpgrade(save: SaveData, id: MetaUpgradeId): SaveData | null {
  const def = META_UPGRADES.find((m) => m.id === id);
  if (!def) return null;
  const currentLvl = save.metaLevels[id] ?? 0;
  if (currentLvl >= def.maxLevel) return null;
  const cost = def.costs[currentLvl];
  if (save.coins < cost) return null;
  return {
    ...save,
    coins: save.coins - cost,
    metaLevels: {
      ...save.metaLevels,
      [id]: currentLvl + 1,
    },
  };
}

export function calculateRunCoins(params: {
  kills: number;
  pickedCoins: number;
  flawlessVigil: boolean;
  bossDefeated: boolean;
  coinBonusMult: number;
}): number {
  const killBonus = Math.floor(params.kills / 10);
  const vigilBonus = params.flawlessVigil ? 10 : 0;
  const bossBonus = params.bossDefeated ? 25 : 0;
  const raw = params.pickedCoins + killBonus + vigilBonus + bossBonus;
  return Math.max(0, Math.round(raw * params.coinBonusMult));
}
