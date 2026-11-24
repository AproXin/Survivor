import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRunCoins,
  computePlayerStats,
  drawRunRules,
  getWaveDirective,
  isPointInAnyLight,
  isPointInCircle,
  isPointInRect,
  purchaseMetaUpgrade,
  rewriteOneRuleForBoss,
  rollUpgradeChoices,
  xpForNextLevel,
} from './rulesEngine';
import { DEFAULT_SAVE, FALLBACK_UPGRADE, RULE_POOL, UPGRADE_POOL } from './data';
import {
  appGameReducer,
  createInitialAppGameState,
  gameActions,
} from './gameReducer';
import type { UpgradeId } from './types';

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('canonical pool contains all 9 taboos and 16 classical upgrades', () => {
  assert.equal(RULE_POOL.length, 9);
  assert.equal(UPGRADE_POOL.length, 16);
  assert.ok(RULE_POOL.every((r) => r.shortTitle.length > 0 && r.obsessionCue.length > 0));
});

test('xpForNextLevel follows monotonic curve calibrated for opening minute', () => {
  assert.equal(xpForNextLevel(1), 12);
  assert.equal(xpForNextLevel(2), 17);
  assert.ok(xpForNextLevel(5) > xpForNextLevel(4));
});

test('drawRunRules returns 3 unique rules with unbroken initial state and obsession cues', () => {
  const rules = drawRunRules(3, seededRng(42));
  assert.equal(rules.length, 3);
  const ids = new Set(rules.map((r) => r.id));
  assert.equal(ids.size, 3);
  assert.ok(rules.every((r) => !r.broken && r.progress === 0 && r.obsessionCue.length > 0));
});

test('rewriteOneRuleForBoss swaps one rule for an unused non-wall rule without losing broken flags', () => {
  const initial = drawRunRules(3, seededRng(7));
  initial[0].broken = true;
  const result = rewriteOneRuleForBoss(initial, seededRng(99));
  assert.ok(result.replacedIndex >= 0);
  assert.ok(result.newRule !== null);
  assert.equal(result.rules[0].broken, true);
  assert.equal(result.rules.length, 3);
  const newIds = new Set(result.rules.map((r) => r.id));
  assert.equal(newIds.size, 3);
  assert.notEqual(result.newRule?.id, 'avoid_wall_shadow');
});

test('rollUpgradeChoices returns 3 distinct upgrades and falls back to Dying Embers when all 16 are maxed', () => {
  const firstChoices = rollUpgradeChoices({}, seededRng(11));
  assert.equal(firstChoices.length, 3);
  assert.equal(new Set(firstChoices.map((c) => c.id)).size, 3);

  const maxed: Partial<Record<UpgradeId, number>> = {};
  for (const u of UPGRADE_POOL) {
    maxed[u.id] = u.maxLevel;
  }
  const fallback = rollUpgradeChoices(maxed, seededRng(11));
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].id, FALLBACK_UPGRADE.id);
});

test('computePlayerStats scales all 16 classical upgrades and Dumo Town ancestral fire bonuses', () => {
  const base = computePlayerStats(DEFAULT_SAVE.metaLevels, {});
  const upgraded = computePlayerStats(
    { vitality: 2, swiftness: 2, wick_power: 2, spirit_pouch: 2 },
    {
      sword_flurry: 3,
      lantern_fire: 2,
      yin_yang_mirror: 2,
      paper_crane: 1,
      soul_shield: 1,
      shadow_walker: 1,
      spirit_brand: 2,
    }
  );
  assert.equal(upgraded.maxHp, base.maxHp + 30 + 20);
  assert.ok(upgraded.mortalSpeed > base.mortalSpeed);
  assert.ok(upgraded.shengDamage > base.shengDamage);
  assert.equal(upgraded.shengDoubleSlash, true);
  assert.equal(upgraded.lanternProjectiles, 3);
  assert.ok(upgraded.flipCooldown < base.flipCooldown);
  assert.ok(upgraded.pickupRadius > base.pickupRadius + 60);
  assert.ok(upgraded.flipSpeedBurstSec >= 2.0);
  assert.ok(upgraded.spectralXpMult > 3.0);
});

test('spatial rule helpers accurately test light circles, hazard rings, and wall shadow rect', () => {
  const lights = [
    { x: 0, y: 0, r: 100 },
    { x: 300, y: 200, r: 80 },
  ];
  assert.equal(isPointInAnyLight(50, 50, lights), true);
  assert.equal(isPointInAnyLight(290, 210, lights), true);
  assert.equal(isPointInAnyLight(180, 0, lights), false);

  assert.equal(isPointInCircle(10, 10, { x: 0, y: 0, r: 15 }), true);
  assert.equal(isPointInCircle(20, 20, { x: 0, y: 0, r: 15 }), false);

  assert.equal(isPointInRect(50, 50, { x: 0, y: 0, w: 100, h: 100 }), true);
  assert.equal(isPointInRect(150, 50, { x: 0, y: 0, w: 100, h: 100 }), false);
});

test('getWaveDirective halves spawn interval in spectral realm and introduces enemy archetypes over time', () => {
  const earlyMortal = getWaveDirective(10, 'mortal');
  const earlySpectral = getWaveDirective(10, 'spectral');
  assert.ok(earlySpectral.spawnInterval < earlyMortal.spawnInterval * 0.6);
  assert.equal(earlyMortal.pickEnemy(seededRng(1)), 'ghost');

  const mid = getWaveDirective(100, 'mortal');
  const seen = new Set<string>();
  const rng = seededRng(123);
  for (let i = 0; i < 40; i++) {
    seen.add(mid.pickEnemy(rng));
  }
  assert.ok(seen.has('ghost') && seen.has('jiangshi') && seen.has('wisp_caster'));
});

test('purchaseMetaUpgrade deducts coins and increments level, rejecting insufficient coins', () => {
  const broke = purchaseMetaUpgrade(DEFAULT_SAVE, 'vitality');
  assert.equal(broke, null);

  const rich = { ...DEFAULT_SAVE, coins: 25 };
  const bought = purchaseMetaUpgrade(rich, 'vitality');
  assert.ok(bought !== null);
  assert.equal(bought?.coins, 15);
  assert.equal(bought?.metaLevels.vitality, 1);
});

test('calculateRunCoins rewards flawless vigil and boss defeat', () => {
  const normal = calculateRunCoins({
    kills: 50,
    pickedCoins: 10,
    flawlessVigil: false,
    bossDefeated: false,
    coinBonusMult: 1,
  });
  const flawlessBoss = calculateRunCoins({
    kills: 50,
    pickedCoins: 10,
    flawlessVigil: true,
    bossDefeated: true,
    coinBonusMult: 1,
  });
  assert.equal(normal, 15);
  assert.equal(flawlessBoss, 50);
});

test('appGameReducer tracks health, decrements/refills lantern fuel, and toggles human/spirit world phase', () => {
  let state = createInitialAppGameState(false);
  assert.equal(state.worldPhase, 'human');
  assert.equal(state.lanternFuel, 100);

  state = appGameReducer(state, gameActions.decrementFuel(22));
  assert.equal(state.lanternFuel, 78);
  assert.equal(state.hud.lanternFuel, 78);

  state = appGameReducer(state, gameActions.decrementFuel(200));
  assert.equal(state.lanternFuel, 0);

  state = appGameReducer(state, gameActions.refillFuel(45));
  assert.equal(state.lanternFuel, 45);

  state = appGameReducer(state, gameActions.setHealth(40, 100));
  assert.equal(state.playerHealth, 40);
  assert.equal(state.maxHealth, 100);

  state = appGameReducer(state, gameActions.setWorldPhase('spirit'));
  assert.equal(state.worldPhase, 'spirit');
  assert.equal(state.realm, 'spectral');
});
