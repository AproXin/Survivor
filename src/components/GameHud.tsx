import React, { useEffect, useRef, useState } from 'react';
import type { HudSnapshot } from '../game/types';
import {
  CoinIcon,
  JadeGemIcon,
  LanternIcon,
  OperaMaskIcon,
  PauseIcon,
  VolumeIcon,
} from './Icons';

interface GameHudProps {
  hud: HudSnapshot;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onTriggerFlip: () => void;
  onTriggerFaceToggle: () => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function GameHud({
  hud,
  onTogglePause,
  onToggleMute,
  onTriggerFlip,
  onTriggerFaceToggle,
}: GameHudProps) {
  // Delayed trailing damage ghost bar for HP
  const [ghostHp, setGhostHp] = useState(hud.hp);
  const prevHpRef = useRef(hud.hp);

  useEffect(() => {
    if (hud.hp < prevHpRef.current) {
      const id = window.setTimeout(() => setGhostHp(hud.hp), 280);
      prevHpRef.current = hud.hp;
      return () => window.clearTimeout(id);
    }
    setGhostHp(hud.hp);
    prevHpRef.current = hud.hp;
  }, [hud.hp]);

  const hpPct = Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100));
  const ghostPct = Math.max(hpPct, Math.min(100, (ghostHp / Math.max(1, hud.maxHp)) * 100));
  const fuelPct = Math.max(
    0,
    Math.min(100, (hud.lanternFuel / Math.max(1, hud.maxLanternFuel)) * 100)
  );
  const xpPct = Math.max(0, Math.min(100, (hud.xp / Math.max(1, hud.xpToNext)) * 100));

  const realmLabel =
    hud.realm === 'mortal'
      ? '人间 · 提灯'
      : hud.face === 'sheng'
        ? '诡界 · 生剑'
        : '诡界 · 旦袖';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3.5 sm:p-5">
      {/* Top Perimeter Row: Left Parchment Plaque | Center Taboo Strip & Boss Bar | Right Parchment Plaque */}
      <div className="flex items-start justify-between gap-3">
        {/* TOP-LEFT AGED PARCHMENT PLAQUE (Matched 1-to-1 to Style Bible Demo) */}
        <div className="parchment-plaque px-3.5 py-2.5 min-w-[186px] sm:min-w-[208px]">
          {/* HP Readout + Trailing Ghost Bar */}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-bold tracking-wider text-[#3D4A48]">HP</span>
            <span className="font-num text-base font-bold text-[#141A1E]" data-testid="hud-hp">
              {hud.hp}/{hud.maxHp}
            </span>
          </div>
          <div className="mt-1 h-2 w-full bg-[#232A2C]/25 border border-[#141A1E]/60 relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[#E8B34A] transition-transform duration-300 origin-left"
              style={{ transform: `scaleX(${ghostPct / 100})`, width: '100%' }}
            />
            <div
              className={`absolute inset-y-0 left-0 origin-left ${
                hpPct < 30 ? 'bg-[#C8402A]' : 'bg-[#3D4A48]'
              }`}
              style={{ transform: `scaleX(${hpPct / 100})`, width: '100%' }}
            />
          </div>

          {/* Lantern Fuel Readout (灯油) */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[11px] font-bold text-[#3D4A48]">
              <LanternIcon className="w-3.5 h-3.5" />
              灯油
            </span>
            <span className="font-num text-xs font-bold text-[#141A1E]" data-testid="hud-fuel">
              {hud.lanternFuel}%
            </span>
          </div>
          <div className="mt-0.5 h-1.5 w-full bg-[#232A2C]/20 border border-[#141A1E]/45 overflow-hidden">
            <div
              className="h-full bg-[#E8B34A] origin-left"
              style={{ transform: `scaleX(${fuelPct / 100})`, width: '100%' }}
            />
          </div>

          {/* LV & TIME */}
          <div className="mt-2 pt-1.5 border-t border-[#141A1E]/20 flex items-center justify-between text-xs font-bold text-[#141A1E]">
            <span className="font-num" data-testid="hud-level">LV {hud.level}</span>
            <span className="font-num" data-testid="hud-time">TIME {formatTime(hud.timeSec)}</span>
          </div>

          {/* Current World Phase & Identity */}
          <div className="mt-1 flex items-center justify-between text-[11px] font-semibold">
            <span
              className={hud.realm === 'spectral' ? 'text-[#7C1E10] font-bold' : 'text-[#3D4A48]'}
              data-testid="hud-realm"
            >
              {realmLabel}
            </span>
            {hud.encoreAvailable && (
              <span className="text-[10px] font-bold text-[#7C1E10]">返场待命</span>
            )}
          </div>
        </div>

        {/* TOP-CENTER: Compact Folk Rules Talisman Strip + Boss Bar */}
        <div className="hidden md:flex flex-col items-center gap-2 max-w-lg flex-1">
          {hud.rules.length > 0 && (
            <div
              className="bg-[#0E1418]/88 border border-[#5C6B6B]/65 px-3.5 py-1.5 flex items-center gap-3 text-xs text-[#EDE6D6]"
              data-testid="hud-rules"
            >
              <span className="text-[#B9B09A] font-semibold shrink-0">禁忌</span>
              <div className="flex items-center gap-3">
                {hud.rules.map((r) => (
                  <div key={r.id} className="flex items-center gap-1.5" title={r.description}>
                    <span
                      className={
                        r.suspended
                          ? 'text-[#8A9A94] line-through'
                          : r.broken
                            ? 'text-[#E4654A] line-through font-bold'
                            : r.progress > 0.1
                              ? 'text-[#F5D98A] font-bold'
                              : 'text-[#EDE6D6]'
                      }
                    >
                      {r.shortTitle}
                    </span>
                    {r.broken && (
                      <span className="text-[10px] text-[#E4654A] font-bold">破</span>
                    )}
                  </div>
                ))}
              </div>
              {hud.blackoutRemaining > 0 && (
                <span className="font-num text-[#F5D98A] font-bold ml-1">
                  熄灯 {hud.blackoutRemaining.toFixed(1)}s
                </span>
              )}
              {hud.punisherActive && (
                <span className="font-num text-[#E4654A] font-bold ml-1">
                  罚 {hud.punisherRemaining}s
                </span>
              )}
            </div>
          )}

          {/* Boss HP Bar (only while Boss Magistrate is active) */}
          {hud.bossActive && (
            <div className="w-full max-w-md bg-[#0E1418]/92 border-2 border-[#C8402A] px-3.5 py-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#FAF6EA] tracking-wider">
                  {hud.bossName} {hud.bossPhase2 ? '· 改律狂怒' : ''}
                </span>
                <span className="font-num text-[#E4654A]">
                  {hud.bossHp}/{hud.bossMaxHp}
                </span>
              </div>
              <div className="mt-1 h-2.5 w-full bg-[#1C2A30] overflow-hidden">
                <div
                  className="h-full bg-[#C8402A] origin-left"
                  style={{
                    transform: `scaleX(${Math.max(0, Math.min(1, hud.bossHp / Math.max(1, hud.bossMaxHp)))})`,
                    width: '100%',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* TOP-RIGHT AGED PARCHMENT PLAQUE + UTILITY ICON BUTTONS */}
        <div className="flex items-start gap-2">
          <div className="parchment-plaque px-3.5 py-2.5 min-w-[164px] sm:min-w-[184px]">
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#141A1E]">
              <span className="text-[#3D4A48]">COINS</span>
              <span className="flex items-center gap-1.5 font-num text-sm" data-testid="hud-coins">
                x{hud.runCoins}
                <CoinIcon className="w-4 h-4" />
              </span>
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs font-bold text-[#141A1E]">
              <span className="text-[#3D4A48]">EXP</span>
              <span className="flex items-center gap-1.5 font-num text-xs" data-testid="hud-xp">
                {hud.xp}/{hud.xpToNext}
                <JadeGemIcon className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full bg-[#232A2C]/22 border border-[#141A1E]/50 overflow-hidden">
              <div
                className="h-full bg-[#57B96A] origin-left"
                style={{ transform: `scaleX(${xpPct / 100})`, width: '100%' }}
              />
            </div>

            <div className="mt-1.5 pt-1 border-t border-[#141A1E]/18 flex items-center justify-between text-[11px] font-semibold text-[#3D4A48]">
              <span>斩祟</span>
              <span className="font-num font-bold text-[#141A1E]" data-testid="hud-kills">
                {hud.kills}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onTogglePause();
              }}
              aria-label="暂停游戏"
              title="暂停 (Esc / P)"
              className="parchment-plaque w-9 h-9 flex items-center justify-center text-[#141A1E] hover:brightness-105 cursor-pointer"
            >
              <PauseIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              aria-label={hud.muted ? '开启声音' : '静音'}
              title={hud.muted ? '开启声音 (M)' : '静音 (M)'}
              className="parchment-plaque w-9 h-9 flex items-center justify-center text-[#141A1E] hover:brightness-105 cursor-pointer"
            >
              <VolumeIcon muted={hud.muted} className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Transient Non-Blocking Event / Rule Warning Banner (top-middle, never occludes hero) */}
      {hud.alertText && (
        <div className="mx-auto mt-1 mb-auto pt-2" key={hud.alertKey}>
          <div
            className={`px-4 py-1.5 border text-xs sm:text-sm font-bold tracking-wider ${
              hud.alertTone === 'violation' || hud.alertTone === 'boss'
                ? 'bg-[#7C1E10]/92 border-[#E4654A] text-[#FAF6EA]'
                : hud.alertTone === 'warning'
                  ? 'bg-[#0E1418]/92 border-[#E8B34A] text-[#F5D98A]'
                  : 'bg-[#0E1418]/90 border-[#B9B09A]/70 text-[#EDE6D6]'
            }`}
          >
            {hud.alertText}
          </div>
        </div>
      )}

      {/* Bottom-Center Compact Diegetic Ability Bar (Realm Flip & Face Switch) */}
      <div className="mt-auto flex items-end justify-center gap-2.5 pointer-events-auto">
        <button
          type="button"
          tabIndex={-1}
          disabled={hud.flipCooldown > 0}
          onClick={(e) => {
            e.currentTarget.blur();
            onTriggerFlip();
          }}
          className={`px-3.5 py-2 border text-xs font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            hud.flipCooldown > 0
              ? 'bg-[#0E1418]/80 border-[#3D4A48] text-[#8A9A94] cursor-not-allowed'
              : hud.realm === 'mortal'
                ? 'bg-[#0E1418]/92 border-[#E8B34A] text-[#FAF6EA] hover:bg-[#1C2A30]'
                : 'bg-[#1C2A30]/95 border-[#EDE6D6] text-[#FAF6EA] hover:bg-[#2A3B42]'
          }`}
        >
          <OperaMaskIcon className="w-4 h-4 shrink-0" />
          <span>{hud.realm === 'mortal' ? '翻入诡界' : '重返人间'}</span>
          <span className="font-num text-[11px] text-[#E8B34A]">
            {hud.flipCooldown > 0 ? `${hud.flipCooldown.toFixed(1)}s` : '[Space]'}
          </span>
        </button>

        {hud.realm === 'spectral' && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onTriggerFaceToggle();
            }}
            className="px-3.5 py-2 bg-[#0E1418]/92 border border-[#B9B09A] text-[#FAF6EA] hover:bg-[#1C2A30] text-xs font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <span>切换{hud.face === 'sheng' ? '旦 · 水袖' : '生 · 快剑'}</span>
            <span className="font-num text-[11px] text-[#B9B09A]">[Q]</span>
          </button>
        )}
      </div>
    </div>
  );
}
