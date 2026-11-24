import type { EnemyKind, OperaFace, Realm } from './types';
import type { CircleZone } from './rulesEngine';

export interface PlayerActor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  walkDist: number;
  scaleX: number;
  scaleY: number;
  hp: number;
  maxHp: number;
  lanternFuel: number;
  maxLanternFuel: number;
  invulnTimer: number;
  hitFlashTimer: number;
  flipAnimTimer: number;
  attackSwingTimer: number;
  attackAngle: number;
  sleeveAngle: number;
  lanternFlickerPhase: number;
}

export interface EnemyActor {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  xp: number;
  coins: number;
  radius: number;
  facing: number;
  phase: number;
  hitFlash: number;
  knockVx: number;
  knockVy: number;
  aiTimer: number;
  hopTimer: number;
  hopHeight: number;
  telegraphTimer: number;
  telegraphMax: number;
  telegraphX: number;
  telegraphY: number;
  dashTimer: number;
  dashVx: number;
  dashVy: number;
  dying: boolean;
  deathTimer: number;
  deathMax: number;
  lifeTimer: number;
  phase2Triggered?: boolean;
}

export interface ProjectileActor {
  active: boolean;
  fromEnemy: boolean;
  kind: 'lantern_ember' | 'enemy_orb' | 'boss_ink_bolt';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  maxLife: number;
  targetId: number;
}

export interface SlashEffect {
  x: number;
  y: number;
  angle: number;
  radius: number;
  life: number;
  maxLife: number;
  kind: 'sheng_sword' | 'dan_sleeve' | 'flip_wave' | 'gong_wave' | 'yinyang_wave' | 'boss_slam';
  color: string;
}

export interface PickupGem {
  id: number;
  x: number;
  y: number;
  kind: 'xp' | 'coin' | 'oil';
  value: number;
  bobPhase: number;
  magnetized: boolean;
}

export interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  alpha: number;
  kind: 'ember' | 'ink' | 'spark' | 'jade' | 'mist' | 'vermilion';
}

export interface FloatingNumber {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

export interface RuleHazardsState {
  blackoutActive: boolean;
  blackoutRemaining: number;
  blackoutFrozenLight: CircleZone | null;
  blackoutWarningTimer: number;
  inkShadows: { x: number; y: number; vx: number; vy: number; r: number; phase: number }[];
  nameCall: { active: boolean; x: number; y: number; r: number; maxR: number; timer: number; maxTimer: number } | null;
  whiteStranger: {
    active: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    timer: number;
    whisperIndex: number;
    whisperTimer: number;
  } | null;
  wallShadowActive: boolean;
  steleProgress: number;
  steleRuleActive: boolean;
  doorKnockActive: boolean;
  doorKnockTimer: number;
  waterGongActive: boolean;
  waterGongTimer: number;
  backwardProgress: number;
}

export interface RenderFrameState {
  timeSec: number;
  visualTime: number;
  isTitle: boolean;
  realm: Realm;
  face: OperaFace;
  cameraX: number;
  cameraY: number;
  shakeX: number;
  shakeY: number;
  lanternRadius: number;
  flipCooldown: number;
  flipCooldownMax: number;
  realmTransitionFlash: number;
  lowHpVignette: number;
  player: PlayerActor;
  enemies: EnemyActor[];
  projectiles: ProjectileActor[];
  slashes: SlashEffect[];
  gems: PickupGem[];
  particles: ParticleSlot[];
  floatingNumbers: FloatingNumber[];
  hazards: RuleHazardsState;
}
