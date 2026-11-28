import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PREVIEW_PARAMS,
  simulateCombatCurve,
} from '../src/lib/combatSimulation.ts';

test('single-target baseline DPS matches exact Godot 4.7.2 three-form parity (25.3 / 26.0 / 25.5)', () => {
  const res = simulateCombatCurve({
    ...DEFAULT_PREVIEW_PARAMS,
    enemyCluster: 1,
    simulateSwitchWindow: false,
  });
  assert.equal(res.summaries.mortal.singleTargetDps, 25.3);
  assert.equal(res.summaries.sheng.singleTargetDps, 26.0);
  assert.equal(res.summaries.dan.singleTargetDps, 25.5);
  assert.equal(res.points.length, 49);
});

test('increasing slow, pierce, and knockback dynamically updates effective DPS and control scores', () => {
  const low = simulateCombatCurve({
    activeForm: 'mortal',
    slowPct: 0,
    pierceCount: 1,
    knockbackPx: 0,
    enemyCluster: 4,
    simulateSwitchWindow: false,
  });
  const high = simulateCombatCurve({
    activeForm: 'mortal',
    slowPct: 30,
    pierceCount: 5,
    knockbackPx: 36,
    enemyCluster: 4,
    simulateSwitchWindow: false,
  });

  assert.ok(high.summaries.mortal.effectiveDps > low.summaries.mortal.effectiveDps);
  assert.ok(high.summaries.mortal.controlScore > low.summaries.mortal.controlScore);
  assert.ok(high.summaries.sheng.effectiveDps > low.summaries.sheng.effectiveDps);
  assert.ok(high.summaries.dan.controlScore > low.summaries.dan.controlScore);
});

test('0.6s non-blocking switch window produces visible cadence dip at t=5.0s..5.5s', () => {
  const withSwitch = simulateCombatCurve({
    ...DEFAULT_PREVIEW_PARAMS,
    simulateSwitchWindow: true,
  });
  const noSwitch = simulateCombatCurve({
    ...DEFAULT_PREVIEW_PARAMS,
    simulateSwitchWindow: false,
  });
  const at5sWith = withSwitch.points.find((p) => p.t === 5.0);
  const at5sNo = noSwitch.points.find((p) => p.t === 5.0);
  assert.ok(at5sWith && at5sNo);
  assert.ok(at5sWith.shengDps < at5sNo.shengDps * 0.6);
});
