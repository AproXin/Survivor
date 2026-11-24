import { InkAudioEngine } from './audio';
import {
  BOSS_SPAWN_TIME_SEC,
  ELITE_INTERVAL_SEC,
  ENEMY_TABLE,
  PLAYER_BASE,
  WORLD_HALF,
} from './data';
import { PALETTE, REALM_LIGHTING } from './palette';
import { InkNightRenderer } from './renderer';
import type {
  EnemyActor,
  FloatingNumber,
  ParticleSlot,
  PickupGem,
  PlayerActor,
  ProjectileActor,
  RenderFrameState,
  RuleHazardsState,
  SlashEffect,
} from './renderState';
import {
  calculateRunCoins,
  computePlayerStats,
  drawRunRules,
  getWaveDirective,
  isPointInAnyLight,
  isPointInCircle,
  isPointInRect,
  rewriteOneRuleForBoss,
  rollUpgradeChoices,
  xpForNextLevel,
} from './rulesEngine';
import type {
  ActiveRuleState,
  EnemyKind,
  GamePhase,
  HudSnapshot,
  OperaFace,
  Realm,
  RunSummary,
  SaveData,
  UpgradeChoiceView,
  UpgradeId,
} from './types';
import { createGraveyardWorld, type GraveyardWorld } from './worldGen';

const PARTICLE_POOL_SIZE = 420;
const PROJECTILE_POOL_SIZE = 96;
const FLOAT_NUM_POOL_SIZE = 60;
const MAX_CONCURRENT_TELEGRAPHERS = 3;

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRunFinished: (summary: RunSummary) => void;
}

export class InkNightEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: InkNightRenderer;
  private audio: InkAudioEngine;
  private world: GraveyardWorld;
  private callbacks: EngineCallbacks;
  private saveData: SaveData;

  private rafId = 0;
  private lastTs = 0;
  private running = false;
  private resizeObserver: ResizeObserver | null = null;
  private viewWidth = 1280;
  private viewHeight = 720;

  // Input state: separate continuous held from edge-triggered justPressed + input buffers
  private heldKeys = new Set<string>();
  private justPressed = new Set<string>();
  private flipBufferTimer = 0;
  private faceBufferTimer = 0;
  private loopTimerId = 0;

  // Core simulation state
  private phase: GamePhase = 'title';
  private realm: Realm = 'mortal';
  private face: OperaFace = 'sheng';
  private timeSec = 0;
  private visualTime = 0;
  private hitstopTimer = 0;
  private trauma = 0;
  private realmTransitionFlash = 0;
  private endBeatTimer = 0;
  private pendingDefeat = false;

  // Camera
  private cameraX = -120;
  private cameraY = 0;

  // Player & progression
  private player!: PlayerActor;
  private level = 1;
  private xp = 0;
  private xpToNext = 12;
  private kills = 0;
  private pickedCoins = 0;
  private upgradeLevels: Partial<Record<UpgradeId, number>> = {};
  private upgradeChoices: UpgradeChoiceView[] = [];
  private encoreUsed = false;
  private endSummary: RunSummary | null = null;

  // Combat timers
  private attackTimer = 0;
  private flipCooldown = 0;
  private gongTimer = 4.5;
  private craneHealTimer = 4.0;

  // Wave & Boss state
  private spawnTimer = 1.4;
  private nextEliteTime = ELITE_INTERVAL_SEC;
  private eliteIndex = 0;
  private bossSpawned = false;
  private bossDefeated = false;
  private nextEntityId = 1;

  // Rules & hazards
  private rules: ActiveRuleState[] = [];
  private hazards!: RuleHazardsState;
  private blackoutCycleTimer = 26;
  private nameCallCycleTimer = 19;
  private whiteStrangerCycleTimer = 29;
  private shadowViolationGrace = 0;
  private wallViolationGrace = 0;
  private blackoutGrace = 0;
  private nameCallGrace = 0;
  private strangerGrace = 0;
  private lastBellTime = -10;

  // Alert banner
  private alertText = '';
  private alertTone: HudSnapshot['alertTone'] = 'warning';
  private alertKey = 0;
  private alertTimer = 0;

  // Actors & zero-GC object pools
  private enemies: EnemyActor[] = [];
  private gems: PickupGem[] = [];
  private slashes: SlashEffect[] = [];
  private projectiles: ProjectileActor[] = [];
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;
  private floatingNumbers: FloatingNumber[] = [];
  private floatNumCursor = 0;

  // Ambient title-screen decorative ghosts
  private titleGhosts: EnemyActor[] = [];

  // HUD sync throttle
  private hudSyncTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    initialSave: SaveData,
    callbacks: EngineCallbacks
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D rendering context');
    }
    this.ctx = context;
    this.saveData = initialSave;
    this.callbacks = callbacks;
    this.renderer = new InkNightRenderer();
    this.audio = new InkAudioEngine(initialSave.muted);
    this.world = createGraveyardWorld(202611);

    this.initPools();
    this.resetWorldState('title');
    this.spawnTitleShowcaseGhosts();
    this.bindEvents();
  }

  private initPools(): void {
    this.particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 3,
      life: 0,
      maxLife: 0.4,
      color: PALETTE.amber,
      alpha: 1,
      kind: 'ember',
    }));
    this.projectiles = Array.from({ length: PROJECTILE_POOL_SIZE }, () => ({
      active: false,
      fromEnemy: false,
      kind: 'lantern_ember',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 7,
      damage: 10,
      life: 0,
      maxLife: 1.5,
      targetId: -1,
    }));
    this.floatingNumbers = Array.from({ length: FLOAT_NUM_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vy: -36,
      text: '',
      color: PALETTE.boneBright,
      scale: 1,
      life: 0,
      maxLife: 0.65,
    }));
  }

  private spawnTitleShowcaseGhosts(): void {
    this.titleGhosts = [];
    const coords = [
      { x: -240, y: -120, kind: 'ghost' as EnemyKind },
      { x: 250, y: -145, kind: 'elite_ghost' as EnemyKind },
      { x: 310, y: 110, kind: 'jiangshi' as EnemyKind },
      { x: -195, y: 155, kind: 'ghost' as EnemyKind },
      { x: 185, y: 195, kind: 'ghost' as EnemyKind },
      { x: -320, y: 30, kind: 'jiangshi' as EnemyKind },
    ];
    coords.forEach((c, idx) => {
      const def = ENEMY_TABLE[c.kind];
      this.titleGhosts.push({
        id: idx + 1,
        kind: c.kind,
        x: c.x,
        y: c.y,
        vx: 0,
        vy: 0,
        hp: def.hp,
        maxHp: def.hp,
        speed: def.speed,
        damage: def.damage,
        xp: def.xp,
        coins: def.coins,
        radius: def.radius,
        facing: c.x > 60 ? -1 : 1,
        phase: idx * 1.3,
        hitFlash: 0,
        knockVx: 0,
        knockVy: 0,
        aiTimer: 2,
        hopTimer: 1,
        hopHeight: 0,
        telegraphTimer: 0,
        telegraphMax: 0.6,
        telegraphX: 0,
        telegraphY: 0,
        dashTimer: 0,
        dashVx: 0,
        dashVy: 0,
        dying: false,
        deathTimer: 0,
        deathMax: 0.35,
        lifeTimer: 999,
      });
    });
  }

  public updateSaveData(save: SaveData): void {
    this.saveData = save;
    this.audio.setMuted(save.muted);
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
    this.saveData = { ...this.saveData, muted };
    this.emitHud(true);
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.syncCanvasSize();
    this.lastTs = performance.now();
    this.emitHud(true);
    this.rafId = requestAnimationFrame(this.loop);
  }

  public destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.loopTimerId);
    this.unbindEvents();
    this.resizeObserver?.disconnect();
  }

  public startNewRun(): void {
    this.heldKeys.clear();
    this.justPressed.clear();
    this.resetWorldState('playing');
    this.audio.playRealmFlip(false);
    this.emitHud(true);
  }

  public returnToTitle(): void {
    this.heldKeys.clear();
    this.justPressed.clear();
    this.resetWorldState('title');
    this.spawnTitleShowcaseGhosts();
    this.emitHud(true);
  }

  public togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.heldKeys.clear();
      this.emitHud(true);
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      this.heldKeys.clear();
      this.emitHud(true);
    }
  }

  public triggerRealmFlipFromUi(): void {
    if (this.phase === 'playing') {
      this.tryFlipRealm(false);
    }
  }

  public triggerFaceToggleFromUi(): void {
    if (this.phase === 'playing' && this.realm === 'spectral') {
      this.toggleOperaFace();
    }
  }

  public selectUpgrade(id: UpgradeId): void {
    if (this.phase !== 'levelup') return;
    const prev = this.upgradeLevels[id] ?? 0;
    this.upgradeLevels[id] = prev + 1;

    if (id === 'ember_fallback') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
    }
    if (id === 'lamp_oil') {
      this.player.lanternFuel = Math.min(this.player.maxLanternFuel, this.player.lanternFuel + 30);
    }

    const stats = computePlayerStats(this.saveData.metaLevels, this.upgradeLevels);
    this.player.maxHp = stats.maxHp;

    this.upgradeChoices = [];
    this.phase = 'playing';
    this.heldKeys.clear();
    this.audio.playXpPickup();
    this.emitHud(true);
  }

  private resetWorldState(targetPhase: GamePhase): void {
    this.phase = targetPhase;
    this.realm = 'mortal';
    this.face = 'sheng';
    this.timeSec = 0;
    this.hitstopTimer = 0;
    this.trauma = 0;
    this.realmTransitionFlash = 0;
    this.endBeatTimer = 0;
    this.pendingDefeat = false;

    this.upgradeLevels = {};
    this.upgradeChoices = [];
    this.encoreUsed = false;
    this.endSummary = null;

    const stats = computePlayerStats(this.saveData.metaLevels, {});
    this.player = {
      x: targetPhase === 'title' ? 120 : 0,
      y: targetPhase === 'title' ? 24 : 0,
      vx: 0,
      vy: 0,
      facing: 1,
      walkDist: 0,
      scaleX: 1,
      scaleY: 1,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      lanternFuel: 100,
      maxLanternFuel: 100,
      invulnTimer: 0,
      hitFlashTimer: 0,
      flipAnimTimer: 0,
      attackSwingTimer: 0,
      attackAngle: 0,
      sleeveAngle: 0,
      lanternFlickerPhase: 0,
    };

    this.cameraX = targetPhase === 'title' ? -60 : 0;
    this.cameraY = 0;

    this.level = 1;
    this.xp = 0;
    this.xpToNext = xpForNextLevel(1);
    this.kills = 0;
    this.pickedCoins = 0;

    this.attackTimer = 0.25;
    this.flipCooldown = 0;
    this.gongTimer = 4.5;
    this.craneHealTimer = 4.0;

    this.spawnTimer = 1.6;
    this.nextEliteTime = ELITE_INTERVAL_SEC;
    this.eliteIndex = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.nextEntityId = 10;

    this.rules = drawRunRules(3);
    const hasInkShadow = this.rules.some((r) => r.id === 'avoid_ink_shadow');
    const hasWallShadow = this.rules.some((r) => r.id === 'avoid_wall_shadow');
    const hasStele = this.rules.some((r) => r.id === 'no_stele_linger');

    this.hazards = {
      blackoutActive: false,
      blackoutRemaining: 0,
      blackoutFrozenLight: null,
      blackoutWarningTimer: 0,
      inkShadows: hasInkShadow
        ? [
            { x: -240, y: -150, vx: 34, vy: 22, r: 52, phase: 0.4 },
            { x: 260, y: 170, vx: -28, vy: -30, r: 56, phase: 2.3 },
          ]
        : [],
      nameCall: null,
      whiteStranger: null,
      wallShadowActive: hasWallShadow,
      steleProgress: 0,
      steleRuleActive: hasStele,
    };

    this.blackoutCycleTimer = 28;
    this.nameCallCycleTimer = 20;
    this.whiteStrangerCycleTimer = 26;
    this.shadowViolationGrace = 0;
    this.wallViolationGrace = 0;
    this.blackoutGrace = 0;
    this.nameCallGrace = 0;
    this.strangerGrace = 0;

    this.alertText = '';
    this.alertTimer = 0;

    this.enemies = [];
    this.gems = [];
    this.slashes = [];
    for (let i = 0; i < this.projectiles.length; i++) this.projectiles[i].active = false;
    for (let i = 0; i < this.particles.length; i++) this.particles[i].active = false;
    for (let i = 0; i < this.floatingNumbers.length; i++) this.floatingNumbers[i].active = false;

    // Seed a couple of atmospheric jade gems nearby in playing mode to visually introduce pickups
    if (targetPhase === 'playing') {
      this.gems.push(
        { id: 1, x: 96, y: 42, kind: 'xp', value: 2, bobPhase: 0.5, magnetized: false },
        { id: 2, x: -108, y: -56, kind: 'xp', value: 2, bobPhase: 1.8, magnetized: false }
      );
    }
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);

    const parent = this.canvas.parentElement;
    if (parent && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
      this.resizeObserver.observe(parent);
    }
    window.addEventListener('resize', this.syncCanvasSize);
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('resize', this.syncCanvasSize);
  }

  private syncCanvasSize = (): void => {
    const parent = this.canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : this.canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width || window.innerWidth));
    const h = Math.max(240, Math.floor(rect.height || window.innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewWidth = w;
    this.viewHeight = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (
      code === 'Space' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      if (this.phase === 'playing' || this.phase === 'title' || this.phase === 'levelup') {
        e.preventDefault();
      }
    }

    if (!this.heldKeys.has(code)) {
      this.justPressed.add(code);
      if (this.phase === 'playing') {
        if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') {
          this.flipBufferTimer = 0.16;
        } else if (code === 'KeyQ' || code === 'KeyE') {
          this.faceBufferTimer = 0.16;
        }
      }
    }
    this.heldKeys.add(code);

    // Global discrete shortcuts
    if (code === 'KeyM' && !e.repeat) {
      this.setMuted(!this.audio.isMuted());
      return;
    }

    if ((code === 'Escape' || code === 'KeyP') && !e.repeat) {
      if (this.phase === 'playing' || this.phase === 'paused') {
        this.togglePause();
      }
      return;
    }

    if (this.phase === 'levelup' && !e.repeat) {
      if (code === 'Digit1' && this.upgradeChoices[0]) this.selectUpgrade(this.upgradeChoices[0].id);
      if (code === 'Digit2' && this.upgradeChoices[1]) this.selectUpgrade(this.upgradeChoices[1].id);
      if (code === 'Digit3' && this.upgradeChoices[2]) this.selectUpgrade(this.upgradeChoices[2].id);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.heldKeys.clear();
    this.justPressed.clear();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.heldKeys.clear();
      this.justPressed.clear();
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this.phase === 'playing') {
      e.preventDefault();
      if (this.realm === 'spectral') {
        this.toggleOperaFace();
      } else {
        this.tryFlipRealm(false);
      }
    }
  };

  private loop = (ts: number): void => {
    if (!this.running) return;
    const frameStart = performance.now();
    const rawDt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    const dt = Math.min(Math.max(rawDt, 0.0001), 0.05);

    this.stepFrame(dt);
    this.renderFrame();

    this.justPressed.clear();
    const elapsedMs = performance.now() - frameStart;
    if (elapsedMs > 24) {
      // Yield to browser compositor/input queue on software-rendered environments
      this.loopTimerId = window.setTimeout(() => {
        if (this.running) this.rafId = requestAnimationFrame(this.loop);
      }, 16);
    } else {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private stepFrame(dt: number): void {
    this.visualTime += dt;

    // Decaying camera trauma & visual flashes run even during hitstop
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    this.realmTransitionFlash = Math.max(0, this.realmTransitionFlash - dt * 2.4);
    if (this.alertTimer > 0) {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) {
        this.alertText = '';
      }
    }

    if (this.phase === 'title') {
      this.stepTitleShowcase(dt);
      return;
    }

    if (this.phase !== 'playing') {
      return;
    }

    // Brief defeat beat before Game Over modal opens
    if (this.pendingDefeat) {
      this.endBeatTimer -= dt;
      this.updateParticles(dt);
      this.updateFloatingNumbers(dt);
      if (this.endBeatTimer <= 0) {
        this.pendingDefeat = false;
        this.finishRun(false);
      }
      return;
    }

    // Real sim-level hitstop freeze (visual shake/particles continue ticking!)
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.updateParticles(dt);
      this.updateSlashes(dt);
      this.updateFloatingNumbers(dt);
      return;
    }

    this.timeSec += dt;

    const stats = computePlayerStats(this.saveData.metaLevels, this.upgradeLevels);

    // 1. Handle edge-triggered & buffered player actions (Realm Flip & Face Toggle)
    if (this.flipCooldown > 0) {
      this.flipCooldown = Math.max(0, this.flipCooldown - dt);
    }
    if (this.flipBufferTimer > 0) {
      this.flipBufferTimer = Math.max(0, this.flipBufferTimer - dt);
      if (this.flipCooldown <= 0) {
        this.flipBufferTimer = 0;
        this.tryFlipRealm(false);
      }
    }
    if (this.faceBufferTimer > 0) {
      this.faceBufferTimer = Math.max(0, this.faceBufferTimer - dt);
      if (this.realm === 'spectral') {
        this.faceBufferTimer = 0;
        this.toggleOperaFace();
      } else if (this.flipCooldown <= 0) {
        this.faceBufferTimer = 0;
        this.face = 'dan';
        this.tryFlipRealm(false);
      }
    }

    // 2. Player movement (WASD + Arrows, normalized diagonal, smooth camera damp)
    let mx = 0;
    let my = 0;
    if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) my -= 1;
    if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) my += 1;
    if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) mx -= 1;
    if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) mx += 1;

    const moveSpeed = this.realm === 'mortal' ? stats.mortalSpeed : stats.spectralSpeed;
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      this.player.vx = mx * moveSpeed;
      this.player.vy = my * moveSpeed;
      if (mx !== 0) this.player.facing = mx > 0 ? 1 : -1;
      this.player.walkDist += moveSpeed * dt;
    } else {
      this.player.vx = 0;
      this.player.vy = 0;
    }

    this.player.x = clamp(this.player.x + this.player.vx * dt, -WORLD_HALF + 48, WORLD_HALF - 48);
    this.player.y = clamp(this.player.y + this.player.vy * dt, -WORLD_HALF + 48, WORLD_HALF - 48);

    // Soft collision push-out from broken stone wall & grand stele plinth
    this.resolvePropCollisions();

    // Squash-and-stretch elastic recovery
    this.player.scaleX += (1 - this.player.scaleX) * Math.min(1, dt * 14);
    this.player.scaleY += (1 - this.player.scaleY) * Math.min(1, dt * 14);
    this.player.invulnTimer = Math.max(0, this.player.invulnTimer - dt);
    this.player.hitFlashTimer = Math.max(0, this.player.hitFlashTimer - dt);
    this.player.flipAnimTimer = Math.max(0, this.player.flipAnimTimer - dt);
    this.player.attackSwingTimer = Math.max(0, this.player.attackSwingTimer - dt);
    this.player.sleeveAngle += dt * 3.8;

    // Lantern fuel gradual burn (slower in Mortal, slightly faster in Spectral; lamp_oil slows drain)
    const oilDrainMult = Math.max(0.55, 1 - (this.upgradeLevels.lamp_oil ?? 0) * 0.12);
    const fuelDrainRate = (this.realm === 'spectral' ? 2.1 : 1.15) * oilDrainMult;
    this.player.lanternFuel = Math.max(8, this.player.lanternFuel - fuelDrainRate * dt);

    // Ambient warm lantern ember sparks
    if (!this.hazards.blackoutActive && Math.random() < dt * 11) {
      this.spawnParticle(
        this.player.x + this.player.facing * 14 + (Math.random() - 0.5) * 14,
        this.player.y - 26 + (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 18,
        -18 - Math.random() * 22,
        2.5,
        0.55 + Math.random() * 0.35,
        Math.random() > 0.4 ? PALETTE.amberBright : PALETTE.amber,
        0.85,
        'ember'
      );
    }

    // Smooth camera follow
    const camLerp = 1 - Math.exp(-8.5 * dt);
    this.cameraX += (this.player.x - this.cameraX) * camLerp;
    this.cameraY += (this.player.y - this.cameraY) * camLerp;

    // 3. Auto-attacks & passive upgrades (Gong shockwave, Paper Crane heal)
    this.stepPlayerCombat(dt, stats);

    // 4. Wave Director (regular waves, elites, Boss at BOSS_SPAWN_TIME_SEC)
    this.stepWaveDirector(dt);

    // 5. Update Enemies (distinct AI policies + attack token pool)
    this.stepEnemies(dt, stats);

    // 6. Update Projectiles
    this.stepProjectiles(dt);

    // 7. Update Pickups (XP gems, Coins, Lantern Oil)
    this.stepPickups(dt, stats);

    // 8. Evaluate Active Folk Rules & Hazards
    this.stepRules(dt, stats);

    // 9. Update VFX pools
    this.updateSlashes(dt);
    this.updateParticles(dt);
    this.updateFloatingNumbers(dt);

    // 10. Throttled HUD sync (~10Hz) so React stays ultra-lightweight
    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.1) {
      this.hudSyncTimer = 0;
      this.emitHud(false);
    }
  }

  private stepTitleShowcase(dt: number): void {
    // Gentle atmospheric camera pan around the Lantern Youth centered on the right third
    const targetCamX = -75 + Math.sin(this.visualTime * 0.25) * 28;
    const targetCamY = -12 + Math.cos(this.visualTime * 0.2) * 18;
    this.cameraX += (targetCamX - this.cameraX) * Math.min(1, dt * 3);
    this.cameraY += (targetCamY - this.cameraY) * Math.min(1, dt * 3);

    this.player.x = 135;
    this.player.y = 26;
    this.player.facing = -1;

    // Ambient floating firefly sparks around title lantern
    if (Math.random() < dt * 10) {
      this.spawnParticle(
        this.player.x - 16 + (Math.random() - 0.5) * 22,
        this.player.y - 30 + (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        -15 - Math.random() * 18,
        2.6,
        0.75 + Math.random() * 0.45,
        PALETTE.amberBright,
        0.85,
        'ember'
      );
    }
    this.updateParticles(dt);
  }

  private resolvePropCollisions(): void {
    // Broken wall solid rect
    const w = this.world.brokenWall;
    const pad = 16;
    if (
      this.player.x > w.x - pad &&
      this.player.x < w.x + w.w + pad &&
      this.player.y > w.y - pad &&
      this.player.y < w.y + w.h + pad
    ) {
      const dl = Math.abs(this.player.x - (w.x - pad));
      const dr = Math.abs(w.x + w.w + pad - this.player.x);
      const dt = Math.abs(this.player.y - (w.y - pad));
      const db = Math.abs(w.y + w.h + pad - this.player.y);
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) this.player.x = w.x - pad;
      else if (m === dr) this.player.x = w.x + w.w + pad;
      else if (m === dt) this.player.y = w.y - pad;
      else this.player.y = w.y + w.h + pad;
    }

    // Grand stele plinth circle
    const gs = this.world.grandStele;
    const dx = this.player.x - gs.x;
    const dy = this.player.y - gs.y;
    const minDist = 36;
    const d2 = dx * dx + dy * dy;
    if (d2 < minDist * minDist && d2 > 0.001) {
      const d = Math.sqrt(d2);
      this.player.x = gs.x + (dx / d) * minDist;
      this.player.y = gs.y + (dy / d) * minDist;
    }
  }

  private tryFlipRealm(forcedByBoss: boolean): void {
    const stats = computePlayerStats(this.saveData.metaLevels, this.upgradeLevels);
    if (!forcedByBoss && this.flipCooldown > 0) return;

    this.realm = this.realm === 'mortal' ? 'spectral' : 'mortal';
    this.flipCooldown = forcedByBoss ? 1.5 : stats.flipCooldown;
    this.player.flipAnimTimer = PLAYER_BASE.flipFreezeSec;
    this.player.invulnTimer = Math.max(this.player.invulnTimer, stats.flipInvulnSec);
    this.player.scaleX = 1.24;
    this.player.scaleY = 0.8;

    this.hitstopTimer = 0.06;
    this.trauma = Math.min(1, this.trauma + 0.52);
    this.realmTransitionFlash = 1.0;

    this.audio.playRealmFlip(this.realm === 'spectral');

    // Expanding ink-and-gold shockwave damaging & pushing back close foes
    const blastRadius = PLAYER_BASE.flipBlastRadius + (stats.hasYinYangWave ? 42 : 0);
    this.slashes.push({
      x: this.player.x,
      y: this.player.y,
      angle: 0,
      radius: blastRadius,
      life: 0.36,
      maxLife: 0.36,
      kind: stats.hasYinYangWave ? 'yinyang_wave' : 'flip_wave',
      color: this.realm === 'spectral' ? PALETTE.boneBright : PALETTE.amberBright,
    });

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dying) continue;
      const dx = e.x - this.player.x;
      const dy = e.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= blastRadius + e.radius) {
        const nx = dist > 1 ? dx / dist : 1;
        const ny = dist > 1 ? dy / dist : 0;
        this.damageEnemy(e, stats.flipDamage, nx * 240, ny * 240, true);
      }
    }

    // Burst of ink & gold petals
    for (let i = 0; i < 24; i++) {
      const ang = (Math.PI * 2 * i) / 24 + Math.random() * 0.2;
      const spd = 90 + Math.random() * 140;
      this.spawnParticle(
        this.player.x,
        this.player.y - 16,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd,
        3.8,
        0.48 + Math.random() * 0.25,
        this.realm === 'spectral' ? PALETTE.bone : PALETTE.amberBright,
        0.95,
        this.realm === 'spectral' ? 'ink' : 'ember'
      );
    }

    if (!forcedByBoss) {
      this.pushAlert(
        this.realm === 'spectral'
          ? `翻入诡界 · ${this.face === 'sheng' ? '生脸快剑' : '旦脸水袖'}（双倍经验）`
          : '重返人间 · 提灯守夜',
        'realm',
        2.1
      );
    }

    this.emitHud(true);
  }

  private toggleOperaFace(): void {
    this.face = this.face === 'sheng' ? 'dan' : 'sheng';
    this.player.scaleX = 0.84;
    this.player.scaleY = 1.18;
    this.audio.playFaceToggle(this.face === 'dan');
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.spawnParticle(
        this.player.x,
        this.player.y - 22,
        Math.cos(ang) * 85,
        Math.sin(ang) * 85,
        3.2,
        0.35,
        PALETTE.boneBright,
        0.9,
        'ink'
      );
    }
    this.pushAlert(
      this.face === 'sheng' ? '变脸 · 生（净面快剑）' : '变脸 · 旦（骨白水袖）',
      'realm',
      1.6
    );
    this.emitHud(true);
  }

  private stepPlayerCombat(
    dt: number,
    stats: ReturnType<typeof computePlayerStats>
  ): void {
    // Paper Crane gentle HP regeneration in Mortal Realm
    if (stats.craneHealAmount > 0 && this.realm === 'mortal' && this.player.hp < this.player.maxHp) {
      this.craneHealTimer -= dt;
      if (this.craneHealTimer <= 0) {
        this.craneHealTimer = 4.0;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + stats.craneHealAmount);
        this.spawnFloatingNumber(
          this.player.x,
          this.player.y - 42,
          `+${stats.craneHealAmount}`,
          PALETTE.xpBright,
          0.95
        );
      }
    }

    // Periodic Bronze Gong Shockwave (gong_wave upgrade)
    if (stats.gongInterval > 0) {
      this.gongTimer -= dt;
      if (this.gongTimer <= 0) {
        this.gongTimer = stats.gongInterval;
        const gongR = 148;
        this.slashes.push({
          x: this.player.x,
          y: this.player.y,
          angle: 0,
          radius: gongR,
          life: 0.34,
          maxLife: 0.34,
          kind: 'gong_wave',
          color: PALETTE.amber,
        });
        this.audio.playRuleBell(false);
        this.trauma = Math.min(1, this.trauma + 0.2);
        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          if (e.dying) continue;
          const dx = e.x - this.player.x;
          const dy = e.y - this.player.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= gongR + e.radius) {
            const nx = dist > 1 ? dx / dist : 1;
            const ny = dist > 1 ? dy / dist : 0;
            this.damageEnemy(e, stats.gongDamage, nx * 280, ny * 280, false);
          }
        }
      }
    }

    // Primary Form Auto-Attack
    this.attackTimer -= dt;
    if (this.attackTimer > 0) return;

    if (this.realm === 'mortal') {
      const target = this.findNearestEnemy(PLAYER_BASE.lanternRange);
      if (!target) {
        this.attackTimer = 0.14;
        return;
      }
      this.attackTimer = stats.lanternInterval;
      this.audio.playLanternCast();
      const baseAngle = Math.atan2(target.y - (this.player.y - 22), target.x - this.player.x);
      const count = stats.lanternProjectiles;
      for (let i = 0; i < count; i++) {
        const spread = count === 1 ? 0 : (i - (count - 1) * 0.5) * 0.24;
        const ang = baseAngle + spread;
        this.spawnProjectile({
          fromEnemy: false,
          kind: 'lantern_ember',
          x: this.player.x + this.player.facing * 14,
          y: this.player.y - 24,
          vx: Math.cos(ang) * 340,
          vy: Math.sin(ang) * 340,
          radius: 7,
          damage: stats.lanternDamage,
          life: 1.35,
          targetId: target.id,
        });
      }
    } else if (this.face === 'sheng') {
      // Sheng — Swift Ink Blade directional crescent slash
      const target = this.findNearestEnemy(PLAYER_BASE.shengRange);
      if (!target) {
        this.attackTimer = 0.12;
        return;
      }
      this.attackTimer = stats.shengInterval;
      const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
      this.player.attackAngle = angle;
      this.player.attackSwingTimer = 0.18;
      this.audio.playSwordSlash();

      const slashCount = stats.shengDoubleSlash ? 2 : 1;
      for (let s = 0; s < slashCount; s++) {
        const slashAng = s === 0 ? angle : angle + Math.PI;
        const reach = 104;
        this.slashes.push({
          x: this.player.x + Math.cos(slashAng) * 18,
          y: this.player.y - 14 + Math.sin(slashAng) * 18,
          angle: slashAng,
          radius: reach,
          life: 0.18,
          maxLife: 0.18,
          kind: 'sheng_sword',
          color: PALETTE.boneBright,
        });

        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          if (e.dying) continue;
          const dx = e.x - this.player.x;
          const dy = e.y - this.player.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= reach + e.radius + 14) {
            const eAng = Math.atan2(dy, dx);
            const diff = Math.abs(normalizeAngle(eAng - slashAng));
            if (diff <= 1.05 || dist < 44) {
              const nx = dist > 1 ? dx / dist : Math.cos(slashAng);
              const ny = dist > 1 ? dy / dist : Math.sin(slashAng);
              this.damageEnemy(e, stats.shengDamage, nx * 135, ny * 135, false);
            }
          }
        }
      }
    } else {
      // Dan — Bone-White Water Sleeves circular sweep
      this.attackTimer = stats.danInterval;
      this.audio.playSleeveSweep();
      const radius = stats.danRadius;
      this.slashes.push({
        x: this.player.x,
        y: this.player.y - 14,
        angle: this.player.sleeveAngle,
        radius,
        life: 0.34,
        maxLife: 0.34,
        kind: 'dan_sleeve',
        color: PALETTE.boneBright,
      });

      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.dying) continue;
        const dx = e.x - this.player.x;
        const dy = e.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= radius + e.radius) {
          const nx = dist > 1 ? dx / dist : 1;
          const ny = dist > 1 ? dy / dist : 0;
          this.damageEnemy(e, stats.danDamage, nx * 195, ny * 195, false);
        }
      }
    }
  }

  private stepWaveDirector(dt: number): void {
    const bossAlive = this.enemies.some((e) => e.kind === 'boss_magistrate' && !e.dying);

    // Spawn Paper-Effigy Magistrate Boss at climax time
    if (!this.bossSpawned && this.timeSec >= BOSS_SPAWN_TIME_SEC) {
      this.bossSpawned = true;
      this.spawnEnemy('boss_magistrate', 1);
      // Suspend broken-wall shadow rule during Boss fight (per spec)
      this.hazards.wallShadowActive = false;
      this.rules.forEach((r) => {
        if (r.id === 'avoid_wall_shadow') r.suspended = true;
      });
      this.audio.playRuleBell(true);
      this.trauma = Math.min(1, this.trauma + 0.65);
      this.pushAlert('纸扎判官降临！击破判官即可迎来天明', 'boss', 4.0);
      this.emitHud(true);
    }

    // Periodic Elites (paused while Boss is alive)
    if (!bossAlive && !this.bossDefeated && this.timeSec >= this.nextEliteTime && this.timeSec < BOSS_SPAWN_TIME_SEC - 10) {
      this.nextEliteTime += ELITE_INTERVAL_SEC;
      const eliteKind: EnemyKind = this.eliteIndex % 2 === 0 ? 'elite_ghost' : 'elite_jiangshi';
      this.eliteIndex += 1;
      const hpScale = 1 + (this.timeSec / BOSS_SPAWN_TIME_SEC) * 0.55;
      this.spawnEnemy(eliteKind, hpScale);
      this.audio.playRuleBell(false);
      this.pushAlert(`精英现身 · ${ENEMY_TABLE[eliteKind].name}`, 'warning', 2.8);
    }

    // Regular wave spawns
    const directive = getWaveDirective(this.timeSec, this.realm);
    this.spawnTimer -= dt;
    const maxCap = bossAlive ? 38 : 65;
    if (this.spawnTimer <= 0 && this.enemies.length < maxCap) {
      this.spawnTimer = directive.spawnInterval;
      const kind = directive.pickEnemy();
      this.spawnEnemy(kind, directive.hpScale);
    }
  }

  private spawnEnemy(kind: EnemyKind, hpScale: number): EnemyActor {
    const def = ENEMY_TABLE[kind];
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(this.viewWidth, this.viewHeight) * 0.58 + 75;
    const x = clamp(this.player.x + Math.cos(angle) * dist, -WORLD_HALF + 60, WORLD_HALF - 60);
    const y = clamp(this.player.y + Math.sin(angle) * dist, -WORLD_HALF + 60, WORLD_HALF - 60);
    const maxHp = Math.round(def.hp * hpScale);

    const enemy: EnemyActor = {
      id: this.nextEntityId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: maxHp,
      maxHp,
      speed: def.speed,
      damage: def.damage,
      xp: def.xp,
      coins: def.coins,
      radius: def.radius,
      facing: x > this.player.x ? -1 : 1,
      phase: Math.random() * Math.PI * 2,
      hitFlash: 0,
      knockVx: 0,
      knockVy: 0,
      aiTimer: 1.6 + Math.random() * 1.6,
      hopTimer: 0.4 + Math.random() * 0.7,
      hopHeight: 0,
      telegraphTimer: 0,
      telegraphMax: 0.65,
      telegraphX: x,
      telegraphY: y,
      dashTimer: 0,
      dashVx: 0,
      dashVy: 0,
      dying: false,
      deathTimer: 0,
      deathMax: kind === 'boss_magistrate' ? 0.75 : 0.34,
      lifeTimer: 18,
      phase2Triggered: false,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  private stepEnemies(
    dt: number,
    stats: ReturnType<typeof computePlayerStats>
  ): void {
    // Count current telegraphing/dashing enemies to respect attack token pool
    let activeTelegraphers = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      if (!this.enemies[i].dying && (this.enemies[i].telegraphTimer > 0 || this.enemies[i].dashTimer > 0)) {
        activeTelegraphers++;
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hitFlash > 0) e.hitFlash -= dt;

      // KO dissolve transition
      if (e.dying) {
        e.deathTimer -= dt;
        e.x += e.knockVx * dt * 0.35;
        e.y += e.knockVy * dt * 0.35;
        e.knockVx *= Math.exp(-8 * dt);
        e.knockVy *= Math.exp(-8 * dt);
        if (e.deathTimer <= 0) {
          this.enemies.splice(i, 1);
        }
        continue;
      }

      // Punisher timer expiry
      if (e.kind === 'punisher') {
        e.lifeTimer -= dt;
        if (e.lifeTimer <= 0) {
          e.dying = true;
          e.deathTimer = 0.45;
          e.deathMax = 0.45;
          this.pushAlert('惩罚者已退回墨雾之中', 'realm', 2.0);
          continue;
        }
      }

      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      e.facing = dx >= 0 ? 1 : -1;

      // Distinct AI movement policies by archetype
      if (e.kind === 'ghost') {
        // Policy 1: Weaving Swarm Drift (sinusoidal lateral weave toward hero)
        const perpX = -ny;
        const perpY = nx;
        const weave = Math.sin(this.visualTime * 2.8 + e.phase) * 0.55;
        e.vx = (nx + perpX * weave) * e.speed;
        e.vy = (ny + perpY * weave) * e.speed;
      } else if (e.kind === 'jiangshi') {
        // Policy 2: Rhythmic Crouch -> Hop Burst -> Pause
        e.hopTimer -= dt;
        if (e.hopTimer <= 0) {
          e.hopTimer = 1.05;
        }
        if (e.hopTimer > 0.52) {
          // Airborne forward hop
          const p = (e.hopTimer - 0.52) / 0.53;
          e.hopHeight = Math.sin(p * Math.PI) * 20;
          e.vx = nx * e.speed * 1.95;
          e.vy = ny * e.speed * 1.95;
        } else {
          // Grounded pause/crouch
          e.hopHeight = 0;
          e.vx = nx * e.speed * 0.14;
          e.vy = ny * e.speed * 0.14;
        }
      } else if (e.kind === 'wisp_caster') {
        // Policy 3: Mid-Range Kiter/Orbiter with telegraphed ranged orb cast
        const desired = 215;
        const perpX = -ny;
        const perpY = nx;
        if (e.telegraphTimer > 0) {
          e.vx *= 0.85;
          e.vy *= 0.85;
          e.telegraphTimer -= dt;
          if (e.telegraphTimer <= 0) {
            this.spawnProjectile({
              fromEnemy: true,
              kind: 'enemy_orb',
              x: e.x,
              y: e.y - 16,
              vx: nx * 195,
              vy: ny * 195,
              radius: 7,
              damage: e.damage,
              life: 2.6,
              targetId: -1,
            });
          }
        } else {
          const radial = dist > desired + 35 ? 1 : dist < desired - 40 ? -0.7 : 0;
          e.vx = (nx * radial + perpX * 0.72) * e.speed;
          e.vy = (ny * radial + perpY * 0.72) * e.speed;
          e.aiTimer -= dt;
          if (e.aiTimer <= 0 && dist < 340 && activeTelegraphers < MAX_CONCURRENT_TELEGRAPHERS) {
            e.aiTimer = 3.1 + Math.random();
            e.telegraphMax = 0.65;
            e.telegraphTimer = 0.65;
            e.telegraphX = this.player.x;
            e.telegraphY = this.player.y;
            activeTelegraphers++;
          }
        }
      } else if (e.kind === 'elite_ghost') {
        // Policy 4: Line-of-Sight Telegraphed Phantom Dash
        if (e.dashTimer > 0) {
          e.dashTimer -= dt;
          e.vx = e.dashVx;
          e.vy = e.dashVy;
        } else if (e.telegraphTimer > 0) {
          e.vx = 0;
          e.vy = 0;
          e.telegraphTimer -= dt;
          if (e.telegraphTimer <= 0) {
            const tdx = e.telegraphX - e.x;
            const tdy = e.telegraphY - e.y;
            const td = Math.hypot(tdx, tdy) || 1;
            e.dashVx = (tdx / td) * 330;
            e.dashVy = (tdy / td) * 330;
            e.dashTimer = 0.55;
            this.audio.playSleeveSweep();
          }
        } else {
          e.vx = nx * e.speed;
          e.vy = ny * e.speed;
          e.aiTimer -= dt;
          if (e.aiTimer <= 0 && dist < 340 && activeTelegraphers < MAX_CONCURRENT_TELEGRAPHERS) {
            e.aiTimer = 3.8;
            e.telegraphMax = 0.7;
            e.telegraphTimer = 0.7;
            e.telegraphX = this.player.x + nx * 65;
            e.telegraphY = this.player.y + ny * 65;
            activeTelegraphers++;
          }
        }
      } else if (e.kind === 'elite_jiangshi') {
        // Policy 5: Heavy Leap Slam with Telegraphed Shockwave Ring
        if (e.telegraphTimer > 0) {
          e.vx = 0;
          e.vy = 0;
          e.telegraphTimer -= dt;
          const pct = 1 - e.telegraphTimer / e.telegraphMax;
          e.hopHeight = Math.sin(pct * Math.PI) * 34;
          if (e.telegraphTimer <= 0) {
            e.hopHeight = 0;
            const slamR = 105;
            this.slashes.push({
              x: e.x,
              y: e.y,
              angle: 0,
              radius: slamR,
              life: 0.34,
              maxLife: 0.34,
              kind: 'boss_slam',
              color: PALETTE.vermilionBright,
            });
            this.audio.playHit(true);
            this.trauma = Math.min(1, this.trauma + 0.35);
            if (dist <= slamR) {
              this.damagePlayer(e.damage);
            }
          }
        } else {
          e.hopHeight = Math.abs(Math.sin(this.visualTime * 4 + e.phase)) * 8;
          e.vx = nx * e.speed;
          e.vy = ny * e.speed;
          e.aiTimer -= dt;
          if (e.aiTimer <= 0 && dist < 175 && activeTelegraphers < MAX_CONCURRENT_TELEGRAPHERS) {
            e.aiTimer = 4.2;
            e.telegraphMax = 0.72;
            e.telegraphTimer = 0.72;
            activeTelegraphers++;
          }
        }
      } else if (e.kind === 'boss_magistrate') {
        // Boss: Paper-Effigy Magistrate — alternates phantom brush dash & crimson talisman fan
        if (e.dashTimer > 0) {
          e.dashTimer -= dt;
          e.vx = e.dashVx;
          e.vy = e.dashVy;
        } else if (e.telegraphTimer > 0) {
          e.vx = 0;
          e.vy = 0;
          e.telegraphTimer -= dt;
          if (e.telegraphTimer <= 0) {
            const tdx = e.telegraphX - e.x;
            const tdy = e.telegraphY - e.y;
            const td = Math.hypot(tdx, tdy) || 1;
            e.dashVx = (tdx / td) * 340;
            e.dashVy = (tdy / td) * 340;
            e.dashTimer = 0.52;
            // Also fire a 5-bolt calligraphy ink fan
            const baseAng = Math.atan2(dy, dx);
            const boltCount = e.phase2Triggered ? 7 : 5;
            for (let b = 0; b < boltCount; b++) {
              const ang = baseAng + (b - (boltCount - 1) * 0.5) * 0.25;
              this.spawnProjectile({
                fromEnemy: true,
                kind: 'boss_ink_bolt',
                x: e.x,
                y: e.y - 26,
                vx: Math.cos(ang) * 215,
                vy: Math.sin(ang) * 215,
                radius: 8,
                damage: 14,
                life: 3.0,
                targetId: -1,
              });
            }
            this.audio.playRealmFlip(true);
          }
        } else {
          e.vx = nx * (e.phase2Triggered ? e.speed * 1.18 : e.speed);
          e.vy = ny * (e.phase2Triggered ? e.speed * 1.18 : e.speed);
          e.aiTimer -= dt;
          if (e.aiTimer <= 0 && dist < 440) {
            e.aiTimer = e.phase2Triggered ? 2.8 : 3.6;
            e.telegraphMax = 0.72;
            e.telegraphTimer = 0.72;
            e.telegraphX = this.player.x + nx * 70;
            e.telegraphY = this.player.y + ny * 70;
          }
        }
      } else {
        // Punisher relentless pursuit
        e.vx = nx * e.speed;
        e.vy = ny * e.speed;
      }

      // Apply velocity + decaying knockback
      e.x += (e.vx + e.knockVx) * dt;
      e.y += (e.vy + e.knockVy) * dt;
      e.knockVx *= Math.exp(-9 * dt);
      e.knockVy *= Math.exp(-9 * dt);

      // Soft separation between nearby enemies so swarms read as distinct silhouettes
      for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
        const o = this.enemies[j];
        if (o.dying) continue;
        const sdx = e.x - o.x;
        const sdy = e.y - o.y;
        const minSep = e.radius + o.radius - 2;
        const d2 = sdx * sdx + sdy * sdy;
        if (d2 > 0.01 && d2 < minSep * minSep) {
          const d = Math.sqrt(d2);
          const push = (minSep - d) * 0.35;
          const px = (sdx / d) * push;
          const py = (sdy / d) * push;
          e.x += px;
          e.y += py;
          o.x -= px;
          o.y -= py;
        }
      }

      // Player contact damage
      const cdx = this.player.x - e.x;
      const cdy = this.player.y - e.y;
      const hitR = e.radius + 13;
      if (cdx * cdx + cdy * cdy <= hitR * hitR) {
        const dmg =
          e.kind === 'punisher' ? Math.round(e.damage * stats.punisherDamageMult) : e.damage;
        this.damagePlayer(dmg);
      }
    }
  }

  private damageEnemy(
    e: EnemyActor,
    amount: number,
    knockX: number,
    knockY: number,
    heavy: boolean
  ): void {
    if (e.dying) return;
    e.hp -= amount;
    e.hitFlash = 0.09;
    const kbResist = e.kind === 'boss_magistrate' ? 0.15 : e.kind === 'punisher' ? 0.25 : 1.0;
    e.knockVx += knockX * kbResist;
    e.knockVy += knockY * kbResist;

    this.spawnFloatingNumber(
      e.x + (Math.random() - 0.5) * 14,
      e.y - e.radius - 10,
      `${Math.round(amount)}`,
      heavy ? PALETTE.amberBright : PALETTE.boneBright,
      heavy ? 1.15 : 0.92
    );

    const sparkCount = heavy ? 9 : 4;
    for (let i = 0; i < sparkCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 45 + Math.random() * 110;
      this.spawnParticle(
        e.x,
        e.y - 16,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd,
        heavy ? 3.5 : 2.5,
        0.28 + Math.random() * 0.2,
        e.kind.startsWith('elite') || e.kind === 'boss_magistrate'
          ? PALETTE.vermilionBright
          : PALETTE.bone,
        0.9,
        'spark'
      );
    }

    // Boss 50% HP Phase 2 trigger: Rewrite 1 active rule + Force Spectral Flip!
    if (e.kind === 'boss_magistrate' && !e.phase2Triggered && e.hp > 0 && e.hp <= e.maxHp * 0.5) {
      e.phase2Triggered = true;
      const swap = rewriteOneRuleForBoss(this.rules);
      this.rules = swap.rules;
      this.syncHazardFlagsFromRules();
      this.hitstopTimer = 0.08;
      this.trauma = Math.min(1, this.trauma + 0.75);
      if (this.realm !== 'spectral') {
        this.tryFlipRealm(true);
      } else {
        this.audio.playRealmFlip(true);
      }
      this.pushAlert(
        swap.newRule
          ? `判官改律！新禁忌「${swap.newRule.shortTitle}」并强翻诡界！`
          : '判官震怒！强行翻入诡界！',
        'boss',
        3.8
      );
      this.emitHud(true);
    }

    if (e.hp <= 0) {
      e.dying = true;
      e.deathTimer = e.deathMax;
      this.kills += 1;

      const isBig = e.kind === 'boss_magistrate' || e.kind === 'elite_ghost' || e.kind === 'elite_jiangshi';
      this.audio.playHit(isBig || heavy);
      if (isBig) {
        this.hitstopTimer = e.kind === 'boss_magistrate' ? 0.08 : 0.045;
        this.trauma = Math.min(1, this.trauma + (e.kind === 'boss_magistrate' ? 0.8 : 0.4));
      }

      // Ink-dissolve death burst
      const count = isBig ? 24 : 11;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * (isBig ? 170 : 95);
        this.spawnParticle(
          e.x,
          e.y - 14,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd - 20,
          isBig ? 4.5 : 3.2,
          0.42 + Math.random() * 0.35,
          isBig && i % 3 === 0 ? PALETTE.vermilion : PALETTE.greyLight,
          0.85,
          'ink'
        );
      }

      // Drops: XP Jade Gem (doubled value in Spectral Realm!), Coins, occasional Lantern Oil drop
      if (e.xp > 0) {
        const xpVal = this.realm === 'spectral' ? e.xp * 2 : e.xp;
        this.dropOrMergeGem(e.x, e.y, 'xp', xpVal);
      }
      if (e.coins > 0) {
        this.dropOrMergeGem(e.x + 12, e.y + 6, 'coin', e.coins);
      }
      if (isBig || Math.random() < 0.14) {
        this.gems.push({
          id: this.nextEntityId++,
          x: e.x - 10,
          y: e.y - 6,
          kind: 'oil',
          value: isBig ? 35 : 18,
          bobPhase: Math.random() * 6.28,
          magnetized: false,
        });
      }

      // Victory upon defeating Paper-Effigy Magistrate Boss!
      if (e.kind === 'boss_magistrate') {
        this.bossDefeated = true;
        this.audio.playFanfare(true);
        this.finishRun(true);
      }
    } else if (heavy) {
      this.audio.playHit(false);
    }
  }

  private damagePlayer(amount: number): void {
    if (this.player.invulnTimer > 0 || this.pendingDefeat) return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.player.invulnTimer = PLAYER_BASE.hitInvulnSec;
    this.player.hitFlashTimer = 0.14;
    this.player.scaleX = 1.2;
    this.player.scaleY = 0.82;
    this.trauma = Math.min(1, this.trauma + 0.45);
    this.hitstopTimer = 0.04;
    this.audio.playPlayerHurt();

    this.spawnFloatingNumber(
      this.player.x,
      this.player.y - 44,
      `-${Math.round(amount)}`,
      PALETTE.vermilionBright,
      1.12
    );

    if (this.player.hp <= 0) {
      // Check Encore (戏台返场) one-time revive!
      if ((this.upgradeLevels.encore ?? 0) > 0 && !this.encoreUsed) {
        this.encoreUsed = true;
        this.player.hp = Math.round(this.player.maxHp * 0.5);
        this.player.lanternFuel = this.player.maxLanternFuel;
        this.player.invulnTimer = 2.0;
        this.trauma = 0.7;
        this.audio.playRealmFlip(true);
        this.slashes.push({
          x: this.player.x,
          y: this.player.y,
          angle: 0,
          radius: 220,
          life: 0.45,
          maxLife: 0.45,
          kind: 'flip_wave',
          color: PALETTE.amberBright,
        });
        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          if (e.dying) continue;
          const dx = e.x - this.player.x;
          const dy = e.y - this.player.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < 240) {
            this.damageEnemy(e, 45, (dx / d) * 320, (dy / d) * 320, true);
          }
        }
        this.pushAlert('戏台返场！重燃灯火再战墨夜', 'realm', 2.8);
      } else {
        this.pendingDefeat = true;
        this.endBeatTimer = 0.55;
        this.audio.playDefeat();
      }
    }

    this.emitHud(true);
  }

  private stepProjectiles(dt: number): void {
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      // Gentle homing for lantern ember wisps
      if (p.kind === 'lantern_ember') {
        const target = this.enemies.find((e) => e.id === p.targetId && !e.dying);
        if (target) {
          const dx = target.x - p.x;
          const dy = target.y - 14 - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const speed = Math.hypot(p.vx, p.vy) || 340;
          const desiredVx = (dx / d) * speed;
          const desiredVy = (dy / d) * speed;
          p.vx += (desiredVx - p.vx) * Math.min(1, dt * 6);
          p.vy += (desiredVy - p.vy) * Math.min(1, dt * 6);
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.fromEnemy) {
        const dx = this.player.x - p.x;
        const dy = this.player.y - 14 - p.y;
        const hitR = p.radius + 12;
        if (dx * dx + dy * dy <= hitR * hitR) {
          p.active = false;
          this.damagePlayer(p.damage);
        }
      } else {
        for (let j = 0; j < this.enemies.length; j++) {
          const e = this.enemies[j];
          if (e.dying) continue;
          const dx = e.x - p.x;
          const dy = e.y - 12 - p.y;
          const hitR = e.radius + p.radius;
          if (dx * dx + dy * dy <= hitR * hitR) {
            p.active = false;
            const len = Math.hypot(p.vx, p.vy) || 1;
            this.damageEnemy(e, p.damage, (p.vx / len) * 95, (p.vy / len) * 95, false);
            break;
          }
        }
      }
    }
  }

  private stepPickups(
    dt: number,
    stats: ReturnType<typeof computePlayerStats>
  ): void {
    const magnetR2 = stats.pickupRadius * stats.pickupRadius;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const dx = this.player.x - g.x;
      const dy = this.player.y - g.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= magnetR2) {
        g.magnetized = true;
      }
      if (g.magnetized) {
        const d = Math.sqrt(d2) || 1;
        const pullSpeed = 370;
        g.x += (dx / d) * pullSpeed * dt;
        g.y += (dy / d) * pullSpeed * dt;
      }
      if (d2 <= 24 * 24) {
        this.gems.splice(i, 1);
        if (g.kind === 'xp') {
          this.xp += g.value;
          this.audio.playXpPickup();
          for (let k = 0; k < 4; k++) {
            this.spawnParticle(
              this.player.x,
              this.player.y - 16,
              (Math.random() - 0.5) * 60,
              -20 - Math.random() * 45,
              2.6,
              0.3,
              PALETTE.xpBright,
              0.9,
              'jade'
            );
          }
          if (this.xp >= this.xpToNext) {
            this.xp -= this.xpToNext;
            this.level += 1;
            this.xpToNext = xpForNextLevel(this.level);
            this.upgradeChoices = rollUpgradeChoices(this.upgradeLevels);
            this.phase = 'levelup';
            this.heldKeys.clear();
            this.audio.playFanfare(false);
            this.emitHud(true);
            return;
          }
        } else if (g.kind === 'coin') {
          this.pickedCoins += g.value;
          this.audio.playXpPickup();
          this.spawnFloatingNumber(this.player.x, this.player.y - 36, `+${g.value}铜`, PALETTE.amberBright, 0.9);
        } else {
          // Lantern oil refill
          this.player.lanternFuel = Math.min(this.player.maxLanternFuel, this.player.lanternFuel + g.value);
          this.audio.playLanternCast();
          this.spawnFloatingNumber(this.player.x, this.player.y - 36, `+${g.value}灯油`, PALETTE.amberBright, 0.9);
        }
      }
    }
  }

  private stepRules(
    dt: number,
    stats: ReturnType<typeof computePlayerStats>
  ): void {
    const graceMult = stats.ruleGraceMult;

    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i];
      if (rule.suspended) {
        rule.progress = 0;
        continue;
      }

      if (rule.id === 'no_stele_linger') {
        const inside = isPointInCircle(this.player.x, this.player.y, this.world.grandSteleZone);
        if (inside) {
          rule.progress = Math.min(1, rule.progress + dt / (3.0 * graceMult));
          this.hazards.steleProgress = rule.progress;
          if (rule.progress > 0.45 && this.timeSec - this.lastBellTime > 1.2) {
            this.lastBellTime = this.timeSec;
            this.audio.playRuleBell(false);
          }
          if (rule.progress >= 1) {
            rule.progress = 0;
            this.hazards.steleProgress = 0;
            this.triggerRuleViolation(rule, stats);
          }
        } else {
          rule.progress = Math.max(0, rule.progress - dt * 0.8);
          this.hazards.steleProgress = rule.progress;
        }
      }

      if (rule.id === 'blackout_stay_in_light') {
        if (!this.hazards.blackoutActive) {
          this.blackoutCycleTimer -= dt;
          if (this.blackoutCycleTimer <= 2.2 && this.blackoutCycleTimer > 0) {
            this.hazards.blackoutWarningTimer = this.blackoutCycleTimer;
          } else {
            this.hazards.blackoutWarningTimer = 0;
          }
          if (this.blackoutCycleTimer <= 0) {
            this.hazards.blackoutActive = true;
            this.hazards.blackoutRemaining = 5.0;
            this.hazards.blackoutWarningTimer = 0;
            const curRadius =
              (this.realm === 'mortal'
                ? REALM_LIGHTING.mortal.lanternRadius
                : REALM_LIGHTING.spectral.lanternRadius) + stats.lanternRadiusBonus;
            this.hazards.blackoutFrozenLight = {
              x: this.player.x,
              y: this.player.y,
              r: curRadius * 0.62,
            };
            this.blackoutGrace = 0;
            this.audio.playRuleBell(false);
            this.pushAlert('灯火暂熄 5 秒！留在冻住光圈或冷光处', 'warning', 2.6);
            this.emitHud(true);
          }
        } else {
          this.hazards.blackoutRemaining -= dt;
          const lights = this.hazards.blackoutFrozenLight
            ? [this.hazards.blackoutFrozenLight, ...this.world.coldLights]
            : this.world.coldLights;
          const safe = isPointInAnyLight(this.player.x, this.player.y, lights);
          if (!safe) {
            this.blackoutGrace += dt;
            rule.progress = Math.min(1, this.blackoutGrace / (0.85 * graceMult));
            if (rule.progress >= 1) {
              this.blackoutGrace = 0;
              rule.progress = 0;
              this.hazards.blackoutActive = false;
              this.hazards.blackoutRemaining = 0;
              this.hazards.blackoutFrozenLight = null;
              this.blackoutCycleTimer = 34;
              this.triggerRuleViolation(rule, stats);
            }
          } else {
            this.blackoutGrace = Math.max(0, this.blackoutGrace - dt * 1.6);
            rule.progress = Math.max(0, rule.progress - dt * 2);
          }

          if (this.hazards.blackoutRemaining <= 0) {
            this.hazards.blackoutActive = false;
            this.hazards.blackoutFrozenLight = null;
            this.blackoutCycleTimer = 34;
            rule.progress = 0;
            this.emitHud(true);
          }
        }
      }

      if (rule.id === 'avoid_ink_shadow') {
        let stepped = false;
        for (let s = 0; s < this.hazards.inkShadows.length; s++) {
          const sh = this.hazards.inkShadows[s];
          sh.x += sh.vx * dt;
          sh.y += sh.vy * dt;
          // Gently steer back if too far from player
          const ddx = this.player.x - sh.x;
          const ddy = this.player.y - sh.y;
          const dist = Math.hypot(ddx, ddy);
          if (dist > 560) {
            sh.vx = (ddx / dist) * 42;
            sh.vy = (ddy / dist) * 42;
          }
          if (isPointInCircle(this.player.x, this.player.y, { x: sh.x, y: sh.y, r: sh.r * 0.85 })) {
            stepped = true;
          }
        }
        if (stepped) {
          this.shadowViolationGrace += dt;
          rule.progress = Math.min(1, this.shadowViolationGrace / (0.65 * graceMult));
          if (rule.progress >= 1) {
            this.shadowViolationGrace = 0;
            rule.progress = 0;
            this.triggerRuleViolation(rule, stats);
          }
        } else {
          this.shadowViolationGrace = Math.max(0, this.shadowViolationGrace - dt * 2);
          rule.progress = Math.max(0, rule.progress - dt * 2);
        }
      }

      if (rule.id === 'avoid_name_call') {
        if (!this.hazards.nameCall || !this.hazards.nameCall.active) {
          this.nameCallCycleTimer -= dt;
          if (this.nameCallCycleTimer <= 0) {
            this.nameCallCycleTimer = 26;
            const ang = Math.random() * Math.PI * 2;
            const dist = 210 + Math.random() * 80;
            this.hazards.nameCall = {
              active: true,
              x: clamp(this.player.x + Math.cos(ang) * dist, -WORLD_HALF + 140, WORLD_HALF - 140),
              y: clamp(this.player.y + Math.sin(ang) * dist, -WORLD_HALF + 140, WORLD_HALF - 140),
              r: 92,
              maxR: 92,
              timer: 9.0,
              maxTimer: 9.0,
            };
            this.audio.playRuleBell(false);
            this.pushAlert('雾中有人唤你姓名……切勿步入白圈！', 'warning', 2.4);
          }
        } else {
          const nc = this.hazards.nameCall;
          nc.timer -= dt;
          if (isPointInCircle(this.player.x, this.player.y, { x: nc.x, y: nc.y, r: nc.r })) {
            this.nameCallGrace += dt;
            rule.progress = Math.min(1, this.nameCallGrace / (0.55 * graceMult));
            if (rule.progress >= 1) {
              this.nameCallGrace = 0;
              rule.progress = 0;
              nc.active = false;
              this.triggerRuleViolation(rule, stats);
            }
          } else {
            this.nameCallGrace = Math.max(0, this.nameCallGrace - dt * 2);
            rule.progress = Math.max(0, rule.progress - dt * 2);
          }
          if (nc.timer <= 0) {
            nc.active = false;
            rule.progress = 0;
          }
        }
      }

      if (rule.id === 'avoid_white_stranger') {
        if (!this.hazards.whiteStranger || !this.hazards.whiteStranger.active) {
          this.whiteStrangerCycleTimer -= dt;
          if (this.whiteStrangerCycleTimer <= 0) {
            this.whiteStrangerCycleTimer = 34;
            const ang = Math.random() * Math.PI * 2;
            const sx = clamp(this.player.x + Math.cos(ang) * 320, -WORLD_HALF + 120, WORLD_HALF - 120);
            const sy = clamp(this.player.y + Math.sin(ang) * 320, -WORLD_HALF + 120, WORLD_HALF - 120);
            this.hazards.whiteStranger = {
              active: true,
              x: sx,
              y: sy,
              vx: Math.cos(ang + Math.PI * 0.65) * 36,
              vy: Math.sin(ang + Math.PI * 0.65) * 36,
              r: 84,
              timer: 13.0,
            };
            this.pushAlert('白衣人于雾中问路，切勿靠近！', 'warning', 2.4);
          }
        } else {
          const ws = this.hazards.whiteStranger;
          ws.timer -= dt;
          ws.x += ws.vx * dt;
          ws.y += ws.vy * dt;
          if (isPointInCircle(this.player.x, this.player.y, { x: ws.x, y: ws.y, r: ws.r })) {
            this.strangerGrace += dt;
            rule.progress = Math.min(1, this.strangerGrace / (0.55 * graceMult));
            if (rule.progress >= 1) {
              this.strangerGrace = 0;
              rule.progress = 0;
              ws.active = false;
              this.triggerRuleViolation(rule, stats);
            }
          } else {
            this.strangerGrace = Math.max(0, this.strangerGrace - dt * 2);
            rule.progress = Math.max(0, rule.progress - dt * 2);
          }
          if (ws.timer <= 0) {
            ws.active = false;
            rule.progress = 0;
          }
        }
      }

      if (rule.id === 'avoid_wall_shadow') {
        const inside = isPointInRect(this.player.x, this.player.y, this.world.brokenWall.shadowRect);
        if (inside) {
          this.wallViolationGrace += dt;
          rule.progress = Math.min(1, this.wallViolationGrace / (0.7 * graceMult));
          if (rule.progress >= 1) {
            this.wallViolationGrace = 0;
            rule.progress = 0;
            this.triggerRuleViolation(rule, stats);
          }
        } else {
          this.wallViolationGrace = Math.max(0, this.wallViolationGrace - dt * 2);
          rule.progress = Math.max(0, rule.progress - dt * 2);
        }
      }
    }
  }

  private syncHazardFlagsFromRules(): void {
    this.hazards.steleRuleActive = this.rules.some((r) => r.id === 'no_stele_linger');
    this.hazards.wallShadowActive = this.rules.some(
      (r) => r.id === 'avoid_wall_shadow' && !r.suspended
    );
    if (this.rules.some((r) => r.id === 'avoid_ink_shadow') && this.hazards.inkShadows.length === 0) {
      this.hazards.inkShadows.push({
        x: this.player.x + 240,
        y: this.player.y - 160,
        vx: -30,
        vy: 24,
        r: 54,
        phase: 0.9,
      });
    }
  }

  private triggerRuleViolation(
    rule: ActiveRuleState,
    stats: ReturnType<typeof computePlayerStats>
  ): void {
    rule.broken = true;
    this.audio.playRuleBell(true);
    this.trauma = Math.min(1, this.trauma + 0.6);

    // Spawn or refresh Punisher
    const existingPunisher = this.enemies.find((e) => e.kind === 'punisher' && !e.dying);
    if (existingPunisher) {
      existingPunisher.lifeTimer = stats.punisherDuration;
    } else {
      const pun = this.spawnEnemy('punisher', 1);
      pun.lifeTimer = stats.punisherDuration;
    }

    this.pushAlert(`破戒「${rule.shortTitle}」！惩罚者降临追猎`, 'violation', 3.4);
    this.emitHud(true);
  }

  private finishRun(victory: boolean): void {
    const stats = computePlayerStats(this.saveData.metaLevels, this.upgradeLevels);
    const rulesBrokenCount = this.rules.filter((r) => r.broken).length;
    const flawlessVigil = rulesBrokenCount === 0 && (victory || this.timeSec >= 60);
    const coinsEarned = calculateRunCoins({
      kills: this.kills,
      pickedCoins: this.pickedCoins,
      flawlessVigil,
      bossDefeated: this.bossDefeated,
      coinBonusMult: stats.coinBonusMult,
    });

    const summary: RunSummary = {
      victory,
      timeSec: this.timeSec,
      kills: this.kills,
      level: this.level,
      rulesKept: this.rules.length - rulesBrokenCount,
      rulesTotal: this.rules.length,
      flawlessVigil,
      coinsEarned,
      bossDefeated: this.bossDefeated,
      bestTime: Math.max(this.saveData.bestTime, this.timeSec),
    };

    this.endSummary = summary;
    this.phase = 'gameover';
    this.heldKeys.clear();
    this.callbacks.onRunFinished(summary);
    this.emitHud(true);
  }

  private dropOrMergeGem(x: number, y: number, kind: 'xp' | 'coin', value: number): void {
    // Merge nearby gems of the same kind to keep field crisp and lag-free
    for (let i = 0; i < this.gems.length; i++) {
      const g = this.gems[i];
      if (g.kind === kind && !g.magnetized) {
        const dx = g.x - x;
        const dy = g.y - y;
        if (dx * dx + dy * dy < 32 * 32) {
          g.value += value;
          return;
        }
      }
    }
    this.gems.push({
      id: this.nextEntityId++,
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      kind,
      value,
      bobPhase: Math.random() * 6.28,
      magnetized: false,
    });
  }

  private findNearestEnemy(maxRange: number): EnemyActor | null {
    let best: EnemyActor | null = null;
    let bestD2 = maxRange * maxRange;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dying) continue;
      const dx = e.x - this.player.x;
      const dy = e.y - this.player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }

  private spawnProjectile(cfg: Omit<ProjectileActor, 'active' | 'maxLife'>): void {
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.active) {
        p.active = true;
        p.fromEnemy = cfg.fromEnemy;
        p.kind = cfg.kind;
        p.x = cfg.x;
        p.y = cfg.y;
        p.vx = cfg.vx;
        p.vy = cfg.vy;
        p.radius = cfg.radius;
        p.damage = cfg.damage;
        p.life = cfg.life;
        p.maxLife = cfg.life;
        p.targetId = cfg.targetId;
        return;
      }
    }
  }

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    life: number,
    color: string,
    alpha: number,
    kind: ParticleSlot['kind']
  ): void {
    const slot = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.vx = vx;
    slot.vy = vy;
    slot.size = size;
    slot.life = life;
    slot.maxLife = life;
    slot.color = color;
    slot.alpha = alpha;
    slot.kind = kind;
  }

  private spawnFloatingNumber(
    x: number,
    y: number,
    text: string,
    color: string,
    scale: number
  ): void {
    const slot = this.floatingNumbers[this.floatNumCursor];
    this.floatNumCursor = (this.floatNumCursor + 1) % FLOAT_NUM_POOL_SIZE;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.vy = -38;
    slot.text = text;
    slot.color = color;
    slot.scale = scale;
    slot.life = 0.62;
    slot.maxLife = 0.62;
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-2.8 * dt);
      p.vy *= Math.exp(-2.8 * dt);
    }
  }

  private updateSlashes(dt: number): void {
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      this.slashes[i].life -= dt;
      if (this.slashes[i].life <= 0) {
        this.slashes.splice(i, 1);
      }
    }
  }

  private updateFloatingNumbers(dt: number): void {
    for (let i = 0; i < this.floatingNumbers.length; i++) {
      const fn = this.floatingNumbers[i];
      if (!fn.active) continue;
      fn.life -= dt;
      if (fn.life <= 0) {
        fn.active = false;
        continue;
      }
      fn.y += fn.vy * dt;
      fn.vy *= Math.exp(-3 * dt);
    }
  }

  private pushAlert(text: string, tone: HudSnapshot['alertTone'], duration: number): void {
    this.alertText = text;
    this.alertTone = tone;
    this.alertKey += 1;
    this.alertTimer = duration;
  }

  private renderFrame(): void {
    const stats = computePlayerStats(this.saveData.metaLevels, this.upgradeLevels);
    const shakeMag = this.trauma * this.trauma * 14;
    const shakeX = shakeMag > 0.1 ? (Math.random() * 2 - 1) * shakeMag : 0;
    const shakeY = shakeMag > 0.1 ? (Math.random() * 2 - 1) * shakeMag : 0;

    const baseLanternR =
      this.realm === 'mortal'
        ? REALM_LIGHTING.mortal.lanternRadius
        : REALM_LIGHTING.spectral.lanternRadius;

    const hpPct = this.player.hp / Math.max(1, this.player.maxHp);
    const lowHpVignette = hpPct < 0.32 ? (0.32 - hpPct) / 0.32 : 0;

    const frameState: RenderFrameState = {
      timeSec: this.timeSec,
      visualTime: this.visualTime,
      isTitle: this.phase === 'title',
      realm: this.realm,
      face: this.face,
      cameraX: this.cameraX,
      cameraY: this.cameraY,
      shakeX,
      shakeY,
      lanternRadius: baseLanternR + stats.lanternRadiusBonus,
      flipCooldown: this.flipCooldown,
      flipCooldownMax: stats.flipCooldown,
      realmTransitionFlash: this.realmTransitionFlash,
      lowHpVignette,
      player: this.player,
      enemies: this.phase === 'title' ? this.titleGhosts : this.enemies,
      projectiles: this.projectiles,
      slashes: this.slashes,
      gems: this.gems,
      particles: this.particles,
      floatingNumbers: this.floatingNumbers,
      hazards: this.hazards,
    };

    this.renderer.render(this.ctx, this.viewWidth, this.viewHeight, this.world, frameState);
  }

  private emitHud(immediate: boolean): void {
    if (!immediate && !this.running) return;
    const stats = computePlayerStats(this.saveData.metaLevels, this.upgradeLevels);
    const punisher = this.enemies.find((e) => e.kind === 'punisher' && !e.dying);
    const boss = this.enemies.find((e) => e.kind === 'boss_magistrate' && !e.dying);

    const snapshot: HudSnapshot = {
      phase: this.phase,
      realm: this.realm,
      face: this.face,
      hp: Math.round(this.player.hp),
      maxHp: Math.round(this.player.maxHp),
      lanternFuel: Math.round(this.player.lanternFuel),
      maxLanternFuel: Math.round(this.player.maxLanternFuel),
      level: this.level,
      xp: Math.round(this.xp),
      xpToNext: this.xpToNext,
      timeSec: this.timeSec,
      bossTargetTime: BOSS_SPAWN_TIME_SEC,
      kills: this.kills,
      runCoins: this.pickedCoins,
      flipCooldown: Number(this.flipCooldown.toFixed(1)),
      flipCooldownMax: Number(stats.flipCooldown.toFixed(1)),
      rules: this.rules.map((r) => ({ ...r })),
      rulesBrokenCount: this.rules.filter((r) => r.broken).length,
      blackoutRemaining: Number(Math.max(0, this.hazards.blackoutRemaining).toFixed(1)),
      punisherActive: Boolean(punisher),
      punisherRemaining: punisher ? Math.ceil(punisher.lifeTimer) : 0,
      bossActive: Boolean(boss),
      bossName: '纸扎判官',
      bossHp: boss ? Math.max(0, Math.round(boss.hp)) : 0,
      bossMaxHp: boss ? boss.maxHp : ENEMY_TABLE.boss_magistrate.hp,
      bossPhase2: Boolean(boss?.phase2Triggered),
      encoreAvailable: (this.upgradeLevels.encore ?? 0) > 0 && !this.encoreUsed,
      alertText: this.alertText,
      alertTone: this.alertTone,
      alertKey: this.alertKey,
      upgradeChoices: this.upgradeChoices,
      upgradeLevels: { ...this.upgradeLevels },
      endSummary: this.endSummary,
      muted: this.audio.isMuted(),
    };

    this.callbacks.onHudUpdate(snapshot);
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function normalizeAngle(a: number): number {
  let res = a;
  while (res > Math.PI) res -= Math.PI * 2;
  while (res < -Math.PI) res += Math.PI * 2;
  return res;
}
