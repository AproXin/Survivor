import React, { useState } from 'react';
import { META_UPGRADES } from '../game/data';
import type { MetaUpgradeId, SaveData } from '../game/types';
import { CoinIcon, InkNightTitleEmblem, VolumeIcon } from './Icons';

interface TitleOverlayProps {
  saveData: SaveData;
  onStart: () => void;
  onPurchaseMeta: (id: MetaUpgradeId) => void;
  onToggleMute: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TitleOverlay({
  saveData,
  onStart,
  onPurchaseMeta,
  onToggleMute,
}: TitleOverlayProps) {
  const [bagOpen, setBagOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 sm:p-10">
      {/* Top-right quiet utility button & record readout */}
      <div className="flex items-start justify-end gap-3">
        <div className="parchment-plaque pointer-events-auto px-3.5 py-2 flex items-center gap-3 text-xs font-semibold">
          <span className="flex items-center gap-1.5 font-num text-sm font-bold text-[#141A1E]">
            <CoinIcon className="w-4 h-4 shrink-0" />
            {saveData.coins}
          </span>
          {saveData.bestTime > 0 && (
            <>
              <span className="text-[#5C6B6B]" aria-hidden="true">·</span>
              <span className="font-num text-[#3D4A48]">最佳 {formatDuration(saveData.bestTime)}</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          aria-label={saveData.muted ? '开启声音' : '静音'}
          title={saveData.muted ? '开启声音 (M)' : '静音 (M)'}
          className="parchment-plaque pointer-events-auto w-9 h-9 flex items-center justify-center text-[#141A1E] hover:brightness-105 cursor-pointer"
        >
          <VolumeIcon muted={saveData.muted} className="w-4 h-4" />
        </button>
      </div>

      {/* Left-third negative space composition: Title emblem + Start CTA + Secondary Bag CTA */}
      <div className="my-auto max-w-md pointer-events-auto pl-2 sm:pl-6">
        <InkNightTitleEmblem />

        <p className="mt-3 text-sm sm:text-base text-[#EDE6D6]/90 leading-relaxed max-w-sm">
          提一盏暖灯入夜墓，翻界变脸化生旦，谨守三道夜游禁忌，熬至纸扎判官伏诛。
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3.5">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="ink-button-primary px-7 py-3 text-base font-bold tracking-wider whitespace-nowrap shrink-0 cursor-pointer"
          >
            执灯入夜
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              setBagOpen(true);
            }}
            className="ink-button-secondary px-5 py-3 text-sm font-semibold tracking-wide whitespace-nowrap shrink-0 cursor-pointer"
          >
            守夜行囊
          </button>
        </div>
      </div>

      {/* Bottom safe margin: Single flat, borderless control-hint line */}
      <div className="flex items-center justify-center sm:justify-start pl-2 sm:pl-6">
        <p className="text-xs sm:text-sm text-[#B9B09A]/85 tracking-wide">
          WASD / 方向键 移动 · Space 翻界变脸 · Q 切换生/旦 · Esc 暂停 · Enter 开始
        </p>
      </div>

      {/* Meta-Upgrades Bag Modal (局外成长) */}
      {bagOpen && (
        <div
          className="fixed inset-0 z-30 pointer-events-auto bg-[#06090B]/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="守夜行囊"
        >
          <div className="ink-scroll-card w-full max-w-xl p-6 sm:p-7">
            <div className="flex items-center justify-between border-b border-[#1C2A30]/25 pb-3">
              <div>
                <h2 className="font-brush text-3xl text-[#141A1E] tracking-wide">守夜行囊</h2>
                <p className="text-xs text-[#3D4A48] mt-0.5">以铜钱修整随身灯具与步履，永久生效</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0E1418] text-[#FAF6EA] font-num text-sm font-bold">
                <CoinIcon className="w-4 h-4" />
                <span>{saveData.coins}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {META_UPGRADES.map((m) => {
                const lvl = saveData.metaLevels[m.id] ?? 0;
                const isMax = lvl >= m.maxLevel;
                const cost = isMax ? 0 : m.costs[lvl];
                const canAfford = !isMax && saveData.coins >= cost;
                return (
                  <div
                    key={m.id}
                    className="p-3.5 bg-[#FAF6EA]/60 border border-[#3D4A48]/40 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-base font-bold text-[#141A1E]">{m.name}</h3>
                        <span className="font-num text-xs font-semibold text-[#3D4A48]">
                          Lv {lvl}/{m.maxLevel}
                        </span>
                      </div>
                      <p className="text-xs text-[#3D4A48] mt-1">{m.description}</p>
                      <p className="text-xs font-semibold text-[#7C1E10] mt-1.5">
                        当前：{lvl > 0 ? m.bonusLabel(lvl) : '未修习'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canAfford}
                      onClick={() => onPurchaseMeta(m.id)}
                      className={`w-full py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                        isMax
                          ? 'bg-[#8A9A94]/40 text-[#3D4A48] cursor-default'
                          : canAfford
                            ? 'parchment-button cursor-pointer'
                            : 'bg-[#5C6B6B]/30 text-[#3D4A48] cursor-not-allowed'
                      }`}
                    >
                      {isMax ? (
                        '已满级'
                      ) : (
                        <>
                          <span>修习</span>
                          <CoinIcon className="w-3.5 h-3.5" />
                          <span className="font-num">{cost}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setBagOpen(false)}
                className="parchment-button px-5 py-2 text-sm font-semibold cursor-pointer"
              >
                合上行囊
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
