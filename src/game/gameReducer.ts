import { BOSS_SPAWN_TIME_SEC, PLAYER_BASE } from './data';
import type { GamePhase, HudSnapshot, OperaFace, Realm } from './types';

export type WorldPhase = 'human' | 'spirit';

export interface AppGameState {
  phase: GamePhase;
  worldPhase: WorldPhase;
  realm: Realm;
  face: OperaFace;
  playerHealth: number;
  maxHealth: number;
  lanternFuel: number;
  maxLanternFuel: number;
  hud: HudSnapshot;
}

export type AppGameAction =
  | { type: 'SYNC_SNAPSHOT'; snapshot: HudSnapshot }
  | { type: 'DECREMENT_FUEL'; amount: number }
  | { type: 'REFILL_FUEL'; amount: number }
  | { type: 'SET_HEALTH'; hp: number; maxHp?: number }
  | { type: 'SET_WORLD_PHASE'; worldPhase: WorldPhase }
  | { type: 'SET_MUTED'; muted: boolean }
  | { type: 'RESET_STATE' };

export function createInitialHudSnapshot(muted = false): HudSnapshot {
  return {
    phase: 'title',
    realm: 'mortal',
    face: 'sheng',
    hp: PLAYER_BASE.maxHp,
    maxHp: PLAYER_BASE.maxHp,
    lanternFuel: 100,
    maxLanternFuel: 100,
    level: 1,
    xp: 0,
    xpToNext: 12,
    timeSec: 0,
    bossTargetTime: BOSS_SPAWN_TIME_SEC,
    kills: 0,
    runCoins: 0,
    flipCooldown: 0,
    flipCooldownMax: PLAYER_BASE.flipCooldownSec,
    rules: [],
    rulesBrokenCount: 0,
    activeObsessionCue: '',
    blackoutRemaining: 0,
    gongWaterRemaining: 0,
    punisherActive: false,
    punisherRemaining: 0,
    bossActive: false,
    bossName: '纸扎判官',
    bossHp: 0,
    bossMaxHp: 1350,
    bossPhase2: false,
    bossSpeech: '',
    encoreAvailable: false,
    alertText: '',
    alertTone: 'warning',
    alertKey: 0,
    subtitle: null,
    upgradeChoices: [],
    upgradeLevels: {},
    endSummary: null,
    muted,
  };
}

export function createInitialAppGameState(muted = false): AppGameState {
  const hud = createInitialHudSnapshot(muted);
  return {
    phase: 'title',
    worldPhase: 'human',
    realm: 'mortal',
    face: 'sheng',
    playerHealth: hud.hp,
    maxHealth: hud.maxHp,
    lanternFuel: hud.lanternFuel,
    maxLanternFuel: hud.maxLanternFuel,
    hud,
  };
}

export function appGameReducer(state: AppGameState, action: AppGameAction): AppGameState {
  switch (action.type) {
    case 'SYNC_SNAPSHOT': {
      const s = action.snapshot;
      return {
        ...state,
        phase: s.phase,
        realm: s.realm,
        worldPhase: s.realm === 'spectral' ? 'spirit' : 'human',
        face: s.face,
        playerHealth: s.hp,
        maxHealth: s.maxHp,
        lanternFuel: s.lanternFuel,
        maxLanternFuel: s.maxLanternFuel,
        hud: s,
      };
    }
    case 'DECREMENT_FUEL': {
      const nextFuel = Math.max(0, state.lanternFuel - Math.max(0, action.amount));
      if (nextFuel === state.lanternFuel) return state;
      return {
        ...state,
        lanternFuel: nextFuel,
        hud: { ...state.hud, lanternFuel: nextFuel },
      };
    }
    case 'REFILL_FUEL': {
      const nextFuel = Math.min(state.maxLanternFuel, state.lanternFuel + Math.max(0, action.amount));
      return {
        ...state,
        lanternFuel: nextFuel,
        hud: { ...state.hud, lanternFuel: nextFuel },
      };
    }
    case 'SET_HEALTH': {
      const nextMax = action.maxHp ?? state.maxHealth;
      const nextHp = Math.max(0, Math.min(nextMax, action.hp));
      return {
        ...state,
        playerHealth: nextHp,
        maxHealth: nextMax,
        hud: { ...state.hud, hp: nextHp, maxHp: nextMax },
      };
    }
    case 'SET_WORLD_PHASE': {
      const nextRealm: Realm = action.worldPhase === 'spirit' ? 'spectral' : 'mortal';
      return {
        ...state,
        worldPhase: action.worldPhase,
        realm: nextRealm,
        hud: { ...state.hud, realm: nextRealm },
      };
    }
    case 'SET_MUTED': {
      return {
        ...state,
        hud: { ...state.hud, muted: action.muted },
      };
    }
    case 'RESET_STATE': {
      return createInitialAppGameState(state.hud.muted);
    }
    default:
      return state;
  }
}

export const gameActions = {
  syncSnapshot: (snapshot: HudSnapshot): AppGameAction => ({ type: 'SYNC_SNAPSHOT', snapshot }),
  decrementFuel: (amount: number): AppGameAction => ({ type: 'DECREMENT_FUEL', amount }),
  refillFuel: (amount: number): AppGameAction => ({ type: 'REFILL_FUEL', amount }),
  setHealth: (hp: number, maxHp?: number): AppGameAction => ({ type: 'SET_HEALTH', hp, maxHp }),
  setWorldPhase: (worldPhase: WorldPhase): AppGameAction => ({ type: 'SET_WORLD_PHASE', worldPhase }),
  setMuted: (muted: boolean): AppGameAction => ({ type: 'SET_MUTED', muted }),
  reset: (): AppGameAction => ({ type: 'RESET_STATE' }),
};
