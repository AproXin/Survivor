import React from 'react';
import type { RunSummary, UpgradeChoiceView, UpgradeId } from '../game/types';
import { CoinIcon } from './Icons';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function LevelUpModal({
  level,
  choices,
  onSelect,
}: {
  level: number;
  choices: UpgradeChoiceView[];
  onSelect: (id: UpgradeId) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 bg-[#06090B]/78 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="升级三选一"
    >
      <div className="ink-scroll-card w-full max-w-3xl p-6 sm:p-7">
        <div className="text-center border-b border-[#1C2A30]/25 pb-3.5">
          <h2 className="font-brush text-3xl sm:text-4xl text-[#141A1E] tracking-wider">
            灵息渐盛 · 第 {level} 境
          </h2>
          <p className="text-xs text-[#3D4A48] mt-1">择一术法续行墨夜（按 1 / 2 / 3 快捷择取）</p>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {choices.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className="text-left p-4 bg-[#FAF6EA]/75 hover:bg-[#FAF6EA] border-2 border-[#232A2C] hover:border-[#7C1E10] flex flex-col justify-between gap-3 transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-[#3D4A48]">
                  <span>{c.category}</span>
                  <span className="font-num text-[#7C1E10]">[{idx + 1}]</span>
                </div>
                <h3 className="mt-1.5 text-lg font-bold text-[#141A1E]">{c.name}</h3>
                <p className="mt-1 text-xs text-[#3D4A48] leading-relaxed">{c.summary}</p>
              </div>
              <div className="pt-2.5 border-t border-[#1C2A30]/20">
                <p className="text-xs font-bold text-[#141A1E]">{c.effectPerLevel}</p>
                <p className="font-num text-[11px] text-[#5C6B6B] mt-0.5">
                  当前等级 {c.currentLevel} → {c.currentLevel + 1} / {c.maxLevel}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PauseModal({
  onResume,
  onRestart,
  onTitle,
}: {
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 bg-[#06090B]/74 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="暂歇"
    >
      <div className="ink-scroll-card w-full max-w-sm p-6 text-center">
        <h2 className="font-brush text-4xl text-[#141A1E] tracking-widest">灯火暂歇</h2>
        <p className="text-xs text-[#3D4A48] mt-1">夜雾静止，随时可续行守夜</p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="ink-button-primary w-full py-2.5 text-sm font-bold cursor-pointer"
          >
            继续守夜
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="parchment-button w-full py-2.5 text-sm font-semibold cursor-pointer"
          >
            重新入夜
          </button>
          <button
            type="button"
            onClick={onTitle}
            className="w-full py-2.5 text-sm font-semibold border border-[#3D4A48]/50 text-[#141A1E] hover:bg-[#141A1E]/10 cursor-pointer"
          >
            返回标题
          </button>
        </div>
      </div>
    </div>
  );
}

export function GameOverModal({
  summary,
  onRestart,
  onTitle,
}: {
  summary: RunSummary;
  onRestart: () => void;
  onTitle: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 bg-[#06090B]/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={summary.victory ? '破晓凯旋' : '灯尽夜沉'}
    >
      <div className="ink-scroll-card w-full max-w-md p-6 sm:p-7 text-center">
        <h2 className="font-brush text-4xl text-[#141A1E] tracking-widest">
          {summary.victory ? '判官伏诛 · 破晓归来' : '灯尽夜沉'}
        </h2>
        <p className="text-xs text-[#3D4A48] mt-1.5">
          {summary.victory
            ? '纸扎判官化墨而散，墓园迎来微明。'
            : '墨夜犹深，携此行铜钱修整行囊再入墓园。'}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 text-left">
          <div className="p-3 bg-[#FAF6EA]/65 border border-[#3D4A48]/35">
            <div className="text-[11px] font-bold text-[#5C6B6B]">守夜时长</div>
            <div className="font-num text-xl font-bold text-[#141A1E] mt-0.5">
              {formatTime(summary.timeSec)}
            </div>
          </div>
          <div className="p-3 bg-[#FAF6EA]/65 border border-[#3D4A48]/35">
            <div className="text-[11px] font-bold text-[#5C6B6B]">斩除邪祟</div>
            <div className="font-num text-xl font-bold text-[#141A1E] mt-0.5">{summary.kills}</div>
          </div>
          <div className="p-3 bg-[#FAF6EA]/65 border border-[#3D4A48]/35">
            <div className="text-[11px] font-bold text-[#5C6B6B]">守规结果</div>
            <div className="font-num text-lg font-bold text-[#141A1E] mt-0.5">
              {summary.rulesKept}/{summary.rulesTotal}
              {summary.flawlessVigil && (
                <span className="ml-1.5 text-xs text-[#7C1E10]">无瑕</span>
              )}
            </div>
          </div>
          <div className="p-3 bg-[#FAF6EA]/65 border border-[#3D4A48]/35">
            <div className="text-[11px] font-bold text-[#5C6B6B]">收获铜钱</div>
            <div className="font-num text-xl font-bold text-[#141A1E] mt-0.5 flex items-center gap-1.5">
              <CoinIcon className="w-4 h-4" />+{summary.coinsEarned}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onRestart}
            className="ink-button-primary flex-1 py-2.5 text-sm font-bold cursor-pointer"
          >
            再入墨夜
          </button>
          <button
            type="button"
            onClick={onTitle}
            className="parchment-button flex-1 py-2.5 text-sm font-semibold cursor-pointer"
          >
            返回标题
          </button>
        </div>
      </div>
    </div>
  );
}
