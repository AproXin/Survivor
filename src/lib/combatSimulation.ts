export type CombatFormId = 'mortal' | 'sheng' | 'dan';

export interface CombatPreviewParams {
  activeForm: CombatFormId;
  /** Mortal form slow percentage (0..40, baseline 15%) */
  slowPct: number;
  /** Sheng form straight-line pierce target cap (1..6, baseline 3) */
  pierceCount: number;
  /** Dan form water-sleeve outward knockback px (0..48, baseline 24px) */
  knockbackPx: number;
  /** Simulated clustered enemies inside engagement arc (1..5) */
  enemyCluster: number;
  /** Whether to include a 0.6s non-blocking form-switch window at t=5.0s */
  simulateSwitchWindow: boolean;
}

export interface CombatCurvePoint {
  t: number;
  mortalDps: number;
  shengDps: number;
  danDps: number;
  baselineTargetDps: number;
}

export interface FormSimulationSummary {
  id: CombatFormId;
  name: string;
  singleTargetDps: number;
  effectiveDps: number;
  peakDps: number;
  controlScore: number;
  effectiveTargets: number;
  attackIntervalSec: number;
  damagePerHit: number;
  deltaFromBaselinePct: number;
}

export interface CombatSimulationResult {
  points: CombatCurvePoint[];
  summaries: Record<CombatFormId, FormSimulationSummary>;
  maxChartDps: number;
}

export const COMBAT_BASELINE_SPEC = {
  mortal: {
    name: '提灯少年',
    damage: 24,
    intervalSec: 0.95,
    rangePx: 105,
    coneDeg: 120,
    slowPct: 15,
    slowDurationSec: 0.6,
  },
  sheng: {
    name: '武生（阳面）',
    damage: 13,
    intervalSec: 0.5,
    rangePx: 135,
    widthPx: 50,
    pierceCount: 3,
  },
  dan: {
    name: '青衣旦（阴面）',
    damage: 28,
    intervalSec: 1.1,
    rangePx: 125,
    arcDeg: 220,
    knockbackPx: 24,
  },
  switchDurationSec: 0.6,
} as const;

export const DEFAULT_PREVIEW_PARAMS: CombatPreviewParams = {
  activeForm: 'mortal',
  slowPct: 15,
  pierceCount: 3,
  knockbackPx: 24,
  enemyCluster: 3,
  simulateSwitchWindow: true,
};

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Pure deterministic 0–12s combat output curve estimator for validating
 * 《墨夜点灯人》 three-form combat baseline parity and crowd-control mechanics.
 */
export function simulateCombatCurve(params: CombatPreviewParams): CombatSimulationResult {
  const slowPct = Math.max(0, Math.min(40, params.slowPct));
  const pierceCount = Math.max(1, Math.min(6, Math.round(params.pierceCount)));
  const knockbackPx = Math.max(0, Math.min(48, params.knockbackPx));
  const cluster = Math.max(1, Math.min(5, Math.round(params.enemyCluster)));

  const mortalBaseSingle = COMBAT_BASELINE_SPEC.mortal.damage / COMBAT_BASELINE_SPEC.mortal.intervalSec;
  const shengBaseSingle = COMBAT_BASELINE_SPEC.sheng.damage / COMBAT_BASELINE_SPEC.sheng.intervalSec;
  const danBaseSingle = COMBAT_BASELINE_SPEC.dan.damage / COMBAT_BASELINE_SPEC.dan.intervalSec;

  // Effective target multiplier reflects geometry + user-adjusted crowd-control mechanics:
  // - Mortal 120° cone hits up to ~2.4 clustered enemies; higher slow keeps enemies inside cone longer (uptime boost)
  const mortalSlowRetention = 1 + (slowPct / 100) * 0.42;
  const mortalTargets = Math.min(cluster, 1 + (cluster - 1) * 0.52);

  // - Sheng 50px narrow piercing beam scales directly with min(cluster, pierceCount) with slight alignment falloff
  const shengTargets = Math.min(cluster, pierceCount) * (cluster > 1 ? 0.88 : 1.0);

  // - Dan 220° wide water-sleeve hits broad packs; higher knockback creates safe kiting space, slight spacing reset on follow-up swings
  const danTargets = Math.min(cluster, 1 + (cluster - 1) * 0.78);
  const danKnockbackSpacingFactor = 1 - Math.max(0, knockbackPx - 24) * 0.004 + Math.min(24, knockbackPx) * 0.003;

  const durationSec = 12;
  const stepSec = 0.25;
  const switchStart = 5.0;
  const switchEnd = switchStart + COMBAT_BASELINE_SPEC.switchDurationSec;

  const points: CombatCurvePoint[] = [];

  let mortalSum = 0;
  let shengSum = 0;
  let danSum = 0;
  let mortalPeak = 0;
  let shengPeak = 0;
  let danPeak = 0;

  for (let i = 0; i <= Math.round(durationSec / stepSec); i += 1) {
    const t = round1(i * stepSec);
    // Non-blocking 0.6s transform window dips weapon cadence briefly while player retains 100% movement speed
    const inSwitch = params.simulateSwitchWindow && t >= switchStart && t < switchEnd;
    const postSwitchBonus =
      params.simulateSwitchWindow && t >= switchEnd && t <= switchEnd + 1.25 ? 1.08 : 1.0;

    // Gentle ramp over first 1.5s as enemies enter attack range + natural attack-cadence oscillation
    const engageRamp = Math.min(1, 0.72 + (t / 1.5) * 0.28);
    const mortalCadence = 1 + Math.sin((t / COMBAT_BASELINE_SPEC.mortal.intervalSec) * Math.PI * 2) * 0.055;
    const shengCadence = 1 + Math.sin((t / COMBAT_BASELINE_SPEC.sheng.intervalSec) * Math.PI * 2) * 0.03;
    const danCadence = 1 + Math.sin((t / COMBAT_BASELINE_SPEC.dan.intervalSec) * Math.PI * 2) * 0.08;

    const switchScale = inSwitch ? 0.35 : postSwitchBonus;

    const mDps = round1(
      mortalBaseSingle * mortalTargets * mortalSlowRetention * engageRamp * mortalCadence * switchScale,
    );
    const sDps = round1(shengBaseSingle * shengTargets * engageRamp * shengCadence * switchScale);
    const dDps = round1(
      danBaseSingle * danTargets * danKnockbackSpacingFactor * engageRamp * danCadence * switchScale,
    );

    const baselineTarget = round1(25.6 * (cluster === 1 ? 1 : 1 + (cluster - 1) * 0.65));

    points.push({
      t,
      mortalDps: mDps,
      shengDps: sDps,
      danDps: dDps,
      baselineTargetDps: baselineTarget,
    });

    mortalSum += mDps;
    shengSum += sDps;
    danSum += dDps;
    if (mDps > mortalPeak) mortalPeak = mDps;
    if (sDps > shengPeak) shengPeak = sDps;
    if (dDps > danPeak) danPeak = dDps;
  }

  const count = Math.max(1, points.length);
  const mortalAvg = round1(mortalSum / count);
  const shengAvg = round1(shengSum / count);
  const danAvg = round1(danSum / count);

  const refBaseline = points[points.length - 1]?.baselineTargetDps ?? 25.6;

  // Control score (0–100): combines slow uptime, pierce threat suppression, or knockback peel
  const mortalControl = Math.min(100, Math.round(38 + slowPct * 1.45));
  const shengControl = Math.min(100, Math.round(24 + pierceCount * 11));
  const danControl = Math.min(100, Math.round(30 + knockbackPx * 1.35));

  const maxChartDps = Math.max(
    40,
    Math.ceil(Math.max(mortalPeak, shengPeak, danPeak, refBaseline) / 10) * 10 + 10,
  );

  return {
    points,
    maxChartDps,
    summaries: {
      mortal: {
        id: 'mortal',
        name: COMBAT_BASELINE_SPEC.mortal.name,
        singleTargetDps: round1(mortalBaseSingle),
        effectiveDps: mortalAvg,
        peakDps: mortalPeak,
        controlScore: mortalControl,
        effectiveTargets: round1(mortalTargets),
        attackIntervalSec: COMBAT_BASELINE_SPEC.mortal.intervalSec,
        damagePerHit: COMBAT_BASELINE_SPEC.mortal.damage,
        deltaFromBaselinePct: round1(((mortalAvg - refBaseline) / refBaseline) * 100),
      },
      sheng: {
        id: 'sheng',
        name: COMBAT_BASELINE_SPEC.sheng.name,
        singleTargetDps: round1(shengBaseSingle),
        effectiveDps: shengAvg,
        peakDps: shengPeak,
        controlScore: shengControl,
        effectiveTargets: round1(shengTargets),
        attackIntervalSec: COMBAT_BASELINE_SPEC.sheng.intervalSec,
        damagePerHit: COMBAT_BASELINE_SPEC.sheng.damage,
        deltaFromBaselinePct: round1(((shengAvg - refBaseline) / refBaseline) * 100),
      },
      dan: {
        id: 'dan',
        name: COMBAT_BASELINE_SPEC.dan.name,
        singleTargetDps: round1(danBaseSingle),
        effectiveDps: danAvg,
        peakDps: danPeak,
        controlScore: danControl,
        effectiveTargets: round1(danTargets),
        attackIntervalSec: COMBAT_BASELINE_SPEC.dan.intervalSec,
        damagePerHit: COMBAT_BASELINE_SPEC.dan.damage,
        deltaFromBaselinePct: round1(((danAvg - refBaseline) / refBaseline) * 100),
      },
    },
  };
}
