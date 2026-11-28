import React, { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  type CombatFormId,
  type CombatPreviewParams,
  DEFAULT_PREVIEW_PARAMS,
  simulateCombatCurve,
} from '../lib/combatSimulation';

interface FormRow {
  id: CombatFormId;
  name: string;
  realm: string;
  shape: string;
  damage: number;
  intervalSec: string;
  range: string;
  dps: string;
  mechanic: string;
}

interface DayEnemyRow {
  key: string;
  name: string;
  role: string;
  hp: number;
  speed: number;
  behavior: string;
}

interface DualLandmarkRow {
  key: string;
  coords: string;
  mortalName: string;
  spectralName: string;
  effect: string;
}

const THREE_FORM_BASELINE: FormRow[] = [
  {
    id: 'mortal',
    name: '提灯少年',
    realm: '凡界（人间）',
    shape: '120° 扇形灯火锥',
    damage: 24,
    intervalSec: '0.95 s',
    range: '105 px',
    dps: '25.3',
    mechanic: '命中施加 15% 减速（0.85× 移速，持续 0.60 s），偏重中距控场与稳健拉扯',
  },
  {
    id: 'sheng',
    name: '武生（阳面）',
    realm: '诡界（阴世）',
    shape: '直线穿透剑气（宽 50 px）',
    damage: 13,
    intervalSec: '0.50 s',
    range: '135 px',
    dps: '26.0',
    mechanic: '高频直线穿透至多 3 名敌怪，专精纵深穿刺与精英压血',
  },
  {
    id: 'dan',
    name: '青衣旦（阴面）',
    realm: '诡界（阴世）',
    shape: '220° 大弧度水袖横扫',
    damage: 28,
    intervalSec: '1.10 s',
    range: '125 px',
    dps: '25.5',
    mechanic: '大范围弧面清场并附带 24 px 向外击退，专精解围与群怪控距',
  },
];

const DAYTIME_ECOLOGY: DayEnemyRow[] = [
  {
    key: 'wolf',
    name: '山狼',
    role: '白昼轻型高速单位',
    hp: 32,
    speed: 96,
    behavior: '侧翼绕袭与高速追击，考验提灯少年 120° 减速灯锥控距',
  },
  {
    key: 'boar',
    name: '野猪',
    role: '白昼蓄力冲锋单位',
    hp: 58,
    speed: 62,
    behavior: '220 px 内蓄力 0.55 s 后直线冲锋（220 px/s），需横向走位闪避',
  },
  {
    key: 'treant',
    name: '树妖',
    role: '白昼高血量慢速单位',
    hp: 94,
    speed: 38,
    behavior: '高血量阻挡路线，翻界后适合以武生直线穿透压低血线',
  },
  {
    key: 'shanxiao',
    name: '山魈',
    role: '白昼精英（20 s 刷新）',
    hp: 215,
    speed: 78,
    behavior: '周期性 0.45 s 扑袭突进，击杀必掉双份经验与纸钱并触发精英震屏',
  },
];

const DUAL_REALM_LANDMARKS: DualLandmarkRow[] = [
  {
    key: 'bridge',
    coords: '(360, -140)',
    mortalName: '古镇石桥',
    spectralName: '冥河纸桥',
    effect: '诡界下冥河水雾化作 0.78× 移速缓流区，桥头飘浮寒青幽火',
  },
  {
    key: 'market',
    coords: '(-380, -200)',
    mortalName: '镇口集市',
    spectralName: '鬼市纸铺',
    effect: '诡界下灯棚异化为纸扎灯摊；在此区击杀邪祟额外掉落纸钱与 25% 魂火经验',
  },
  {
    key: 'shrine',
    coords: '(40, -420)',
    mortalName: '老祠残碑',
    spectralName: '阴祠灵位',
    effect: '诡界下石碑转朱红灵牌，阴气聚集并强化祠堂周边仪式压迫感',
  },
  {
    key: 'funeral_procession',
    coords: '东 ↔ 西巡游',
    mortalName: '（人间不可见）',
    spectralName: '送葬纸人鬼队',
    effect: '仅诡界显现的移动灵异事件，纸人抬棺横穿古镇，触碰造成 14 点阴伤并击退',
  },
];

const FORM_COLORS: Record<CombatFormId, { stroke: string; fill: string; label: string }> = {
  mortal: { stroke: '#E8B34A', fill: 'rgba(232, 179, 74, 0.14)', label: '提灯少年' },
  sheng: { stroke: '#9CE0C2', fill: 'rgba(156, 224, 194, 0.14)', label: '武生（阳面）' },
  dan: { stroke: '#93B8E8', fill: 'rgba(147, 184, 232, 0.14)', label: '青衣旦（阴面）' },
};

const SLOW_PRESETS = [0, 15, 25, 35];
const PIERCE_PRESETS = [1, 2, 3, 4, 5];
const KNOCKBACK_PRESETS = [0, 12, 24, 36, 48];
const CLUSTER_PRESETS = [1, 2, 3, 4, 5];

export function CombatWorldBoard({
  onOpenFile,
}: {
  onOpenFile: (relPath: string) => void;
}) {
  const [params, setParams] = useState<CombatPreviewParams>(DEFAULT_PREVIEW_PARAMS);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const sim = useMemo(() => simulateCombatCurve(params), [params]);

  const chartW = 680;
  const chartH = 248;
  const padL = 44;
  const padR = 18;
  const padT = 16;
  const padB = 30;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const xFor = (t: number) => padL + (t / 12) * plotW;
  const yFor = (dps: number) => padT + plotH - (Math.min(dps, sim.maxChartDps) / sim.maxChartDps) * plotH;

  const buildPath = (accessor: (pt: (typeof sim.points)[number]) => number) =>
    sim.points
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${xFor(pt.t).toFixed(1)} ${yFor(accessor(pt)).toFixed(1)}`)
      .join(' ');

  const mortalPath = buildPath((p) => p.mortalDps);
  const shengPath = buildPath((p) => p.shengDps);
  const danPath = buildPath((p) => p.danDps);
  const baselinePath = buildPath((p) => p.baselineTargetDps);

  const activeAccessor = (pt: (typeof sim.points)[number]) =>
    params.activeForm === 'mortal'
      ? pt.mortalDps
      : params.activeForm === 'sheng'
        ? pt.shengDps
        : pt.danDps;

  const activeAreaPath = `${buildPath(activeAccessor)} L ${xFor(12).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((frac) => Math.round(sim.maxChartDps * frac));
  const xTicks = [0, 2, 4, 6, 8, 10, 12];

  const inspectedPoint =
    hoverIdx !== null ? (sim.points[hoverIdx] ?? null) : (sim.points[sim.points.length - 1] ?? null);

  return (
    <div data-combat-world-board="true" className="max-w-6xl space-y-8">
      {/* NEW SECTION 0: Interactive Form Combat Preview & Live DPS Curve */}
      <section
        data-combat-preview="true"
        className="bg-[#10171B] border border-[#243239]"
      >
        <div className="px-5 py-4 border-b border-[#243239] flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#FAF6EA]">
              形态战斗预览 · 动态调参 &amp; 预估 DPS 输出曲线
            </h2>
            <p className="text-xs text-[#8A9A94] mt-1">
              实时切换主视角形态并动态调节减速、穿透、击退与群怪密度，验证 0–12 s 战斗输出与 0.60 s 切形态窗口表现。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-toggle-switch-window="true"
              onClick={() =>
                setParams((p) => ({ ...p, simulateSwitchWindow: !p.simulateSwitchWindow }))
              }
              className={`px-3 py-1.5 border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                params.simulateSwitchWindow
                  ? 'bg-[#223139] border-[#E8B34A] text-[#FAF6EA]'
                  : 'bg-[#10171B] border-[#344750] text-[#B9B09A]'
              }`}
            >
              {params.simulateSwitchWindow ? '已含 0.6s 切形态窗口' : '关闭切形态窗口'}
            </button>
            <button
              type="button"
              data-reset-preview="true"
              onClick={() => setParams(DEFAULT_PREVIEW_PARAMS)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs font-semibold text-[#FAF6EA] cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#E8B34A]" />
              <span>恢复基准值</span>
            </button>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 5 cols: Interactive Form & Mechanic Controls */}
          <div className="lg:col-span-5 space-y-4">
            {/* Active Form Focus Switcher */}
            <div className="space-y-1.5">
              <div className="text-xs text-[#8A9A94]">高亮检视形态</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['mortal', 'sheng', 'dan'] as const).map((fid) => {
                  const active = params.activeForm === fid;
                  return (
                    <button
                      key={fid}
                      type="button"
                      data-preview-form={fid}
                      onClick={() => setParams((p) => ({ ...p, activeForm: fid }))}
                      className={`px-2.5 py-2 text-xs font-semibold border cursor-pointer whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-[#E8B34A] text-[#0E1418] border-[#E8B34A]'
                          : 'bg-[#0B1013] text-[#B9B09A] border-[#26343B] hover:text-[#FAF6EA]'
                      }`}
                    >
                      {FORM_COLORS[fid].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Slow % Control (Mortal) */}
            <div className="p-3.5 bg-[#0B1013] border border-[#1F2C33] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#EDE6D6] font-semibold">提灯少年 · 减速幅度</span>
                <span data-val-slow="true" className="font-num font-bold text-[#E8B34A]">
                  {params.slowPct}% （移速 {(1 - params.slowPct / 100).toFixed(2)}×）
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SLOW_PRESETS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    data-slow-btn={val}
                    onClick={() => setParams((p) => ({ ...p, slowPct: val, activeForm: 'mortal' }))}
                    className={`px-2.5 py-1 text-xs font-num font-semibold border cursor-pointer whitespace-nowrap ${
                      params.slowPct === val
                        ? 'bg-[#E8B34A] text-[#0E1418] border-[#E8B34A]'
                        : 'bg-[#10171B] text-[#B9B09A] border-[#26343B] hover:text-[#FAF6EA]'
                    }`}
                  >
                    {val}%{val === 15 ? ' 基准' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Pierce Count Control (Sheng) */}
            <div className="p-3.5 bg-[#0B1013] border border-[#1F2C33] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#EDE6D6] font-semibold">武生 · 剑气穿透上限</span>
                <span data-val-pierce="true" className="font-num font-bold text-[#9CE0C2]">
                  {params.pierceCount} 目标
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PIERCE_PRESETS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    data-pierce-btn={val}
                    onClick={() => setParams((p) => ({ ...p, pierceCount: val, activeForm: 'sheng' }))}
                    className={`px-2.5 py-1 text-xs font-num font-semibold border cursor-pointer whitespace-nowrap ${
                      params.pierceCount === val
                        ? 'bg-[#9CE0C2] text-[#0E1418] border-[#9CE0C2]'
                        : 'bg-[#10171B] text-[#B9B09A] border-[#26343B] hover:text-[#FAF6EA]'
                    }`}
                  >
                    {val} 穿透{val === 3 ? ' 基准' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Knockback px Control (Dan) */}
            <div className="p-3.5 bg-[#0B1013] border border-[#1F2C33] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#EDE6D6] font-semibold">青衣旦 · 水袖击退距离</span>
                <span data-val-knockback="true" className="font-num font-bold text-[#93B8E8]">
                  {params.knockbackPx} px
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {KNOCKBACK_PRESETS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    data-knockback-btn={val}
                    onClick={() => setParams((p) => ({ ...p, knockbackPx: val, activeForm: 'dan' }))}
                    className={`px-2.5 py-1 text-xs font-num font-semibold border cursor-pointer whitespace-nowrap ${
                      params.knockbackPx === val
                        ? 'bg-[#93B8E8] text-[#0E1418] border-[#93B8E8]'
                        : 'bg-[#10171B] text-[#B9B09A] border-[#26343B] hover:text-[#FAF6EA]'
                    }`}
                  >
                    {val}px{val === 24 ? ' 基准' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Enemy Cluster Density Control */}
            <div className="p-3.5 bg-[#0B1013] border border-[#1F2C33] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#EDE6D6] font-semibold">测试波次密度（射程内敌怪数）</span>
                <span data-val-cluster="true" className="font-num font-bold text-[#FAF6EA]">
                  {params.enemyCluster} 名敌怪
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CLUSTER_PRESETS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    data-cluster-btn={val}
                    onClick={() => setParams((p) => ({ ...p, enemyCluster: val }))}
                    className={`px-2.5 py-1 text-xs font-num font-semibold border cursor-pointer whitespace-nowrap ${
                      params.enemyCluster === val
                        ? 'bg-[#FAF6EA] text-[#0E1418] border-[#FAF6EA]'
                        : 'bg-[#10171B] text-[#B9B09A] border-[#26343B] hover:text-[#FAF6EA]'
                    }`}
                  >
                    {val === 1 ? '1 单体基准' : `${val} 群怪`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right 7 cols: Real-time SVG DPS Output Curve Chart + Live KPI Strip */}
          <div className="lg:col-span-7 space-y-4">
            {/* 3-form live calculated KPI summary */}
            <div className="grid grid-cols-3 border border-[#243239] bg-[#0B1013] divide-x divide-[#243239] font-num">
              {(['mortal', 'sheng', 'dan'] as const).map((fid) => {
                const s = sim.summaries[fid];
                const isFocus = params.activeForm === fid;
                return (
                  <button
                    key={fid}
                    type="button"
                    onClick={() => setParams((p) => ({ ...p, activeForm: fid }))}
                    className={`p-3.5 text-left cursor-pointer transition-colors ${
                      isFocus ? 'bg-[#162127]' : 'hover:bg-[#11191D]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-[#B9B09A] font-semibold whitespace-nowrap">{s.name}</span>
                      <span
                        className="w-2.5 h-0.5 shrink-0"
                        style={{ backgroundColor: FORM_COLORS[fid].stroke }}
                      />
                    </div>
                    <div
                      data-summary-dps={fid}
                      className="mt-1 text-xl font-bold"
                      style={{ color: FORM_COLORS[fid].stroke }}
                    >
                      {s.effectiveDps.toFixed(1)}{' '}
                      <span className="text-[11px] font-normal text-[#8A9A94]">DPS</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#8A9A94] whitespace-nowrap">
                      单体 {s.singleTargetDps.toFixed(1)} · 控场 {s.controlScore}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Interactive SVG DPS Output Curve */}
            <div className="bg-[#080C0E] border border-[#243239] p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-[#FAF6EA]">
                  0–12 s 预估有效 DPS 输出曲线（可移动鼠标检验时间节点）
                </span>
                {inspectedPoint && (
                  <div className="flex flex-wrap items-center gap-3 font-num text-[11px]">
                    <span className="text-[#8A9A94]">t={inspectedPoint.t.toFixed(2)}s</span>
                    <span className="text-[#E8B34A]">少年 {inspectedPoint.mortalDps.toFixed(1)}</span>
                    <span className="text-[#9CE0C2]">武生 {inspectedPoint.shengDps.toFixed(1)}</span>
                    <span className="text-[#93B8E8]">青衣旦 {inspectedPoint.danDps.toFixed(1)}</span>
                  </div>
                )}
              </div>

              <svg
                data-dps-chart="true"
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="w-full h-auto block select-none"
                onMouseLeave={() => setHoverIdx(null)}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * chartW;
                  const ratio = Math.max(0, Math.min(1, (relX - padL) / plotW));
                  setHoverIdx(Math.round(ratio * (sim.points.length - 1)));
                }}
              >
                {/* Horizontal gridlines */}
                {yTicks.map((val) => {
                  const y = yFor(val);
                  return (
                    <g key={val}>
                      <line
                        x1={padL}
                        x2={chartW - padR}
                        y1={y}
                        y2={y}
                        stroke="#1B262C"
                        strokeWidth="1"
                      />
                      <text
                        x={padL - 8}
                        y={y + 3.5}
                        textAnchor="end"
                        fill="#7F8E8A"
                        fontSize="10"
                        fontFamily="ui-monospace, monospace"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* X-axis ticks */}
                {xTicks.map((sec) => {
                  const x = xFor(sec);
                  return (
                    <g key={sec}>
                      <line
                        x1={x}
                        x2={x}
                        y1={padT + plotH}
                        y2={padT + plotH + 4}
                        stroke="#33434C"
                        strokeWidth="1"
                      />
                      <text
                        x={x}
                        y={chartH - 8}
                        textAnchor="middle"
                        fill="#7F8E8A"
                        fontSize="10"
                        fontFamily="ui-monospace, monospace"
                      >
                        {sec}s
                      </text>
                    </g>
                  );
                })}

                {/* 0.6s non-blocking switch window highlight */}
                {params.simulateSwitchWindow && (
                  <g>
                    <rect
                      x={xFor(5.0)}
                      y={padT}
                      width={xFor(5.6) - xFor(5.0)}
                      height={plotH}
                      fill="rgba(232, 179, 74, 0.11)"
                    />
                    <text
                      x={xFor(5.3)}
                      y={padT + 12}
                      textAnchor="middle"
                      fill="#E8B34A"
                      fontSize="9"
                      fontFamily="ui-monospace, monospace"
                    >
                      0.6s 切形态
                    </text>
                  </g>
                )}

                {/* Reference baseline parity dashed line */}
                <path
                  d={baselinePath}
                  fill="none"
                  stroke="#5C6B6B"
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                />

                {/* Active form subtle fill area */}
                <path d={activeAreaPath} fill={FORM_COLORS[params.activeForm].fill} />

                {/* 3 form curves */}
                <path
                  d={mortalPath}
                  fill="none"
                  stroke={FORM_COLORS.mortal.stroke}
                  strokeWidth={params.activeForm === 'mortal' ? 2.6 : 1.4}
                  strokeOpacity={params.activeForm === 'mortal' ? 1 : 0.55}
                />
                <path
                  d={shengPath}
                  fill="none"
                  stroke={FORM_COLORS.sheng.stroke}
                  strokeWidth={params.activeForm === 'sheng' ? 2.6 : 1.4}
                  strokeOpacity={params.activeForm === 'sheng' ? 1 : 0.55}
                />
                <path
                  d={danPath}
                  fill="none"
                  stroke={FORM_COLORS.dan.stroke}
                  strokeWidth={params.activeForm === 'dan' ? 2.6 : 1.4}
                  strokeOpacity={params.activeForm === 'dan' ? 1 : 0.55}
                />

                {/* Hover vertical hairline & focus dots */}
                {hoverIdx !== null && inspectedPoint && (
                  <g>
                    <line
                      x1={xFor(inspectedPoint.t)}
                      x2={xFor(inspectedPoint.t)}
                      y1={padT}
                      y2={padT + plotH}
                      stroke="#4E626C"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={xFor(inspectedPoint.t)}
                      cy={yFor(inspectedPoint.mortalDps)}
                      r="3.5"
                      fill={FORM_COLORS.mortal.stroke}
                    />
                    <circle
                      cx={xFor(inspectedPoint.t)}
                      cy={yFor(inspectedPoint.shengDps)}
                      r="3.5"
                      fill={FORM_COLORS.sheng.stroke}
                    />
                    <circle
                      cx={xFor(inspectedPoint.t)}
                      cy={yFor(inspectedPoint.danDps)}
                      r="3.5"
                      fill={FORM_COLORS.dan.stroke}
                    />
                  </g>
                )}
              </svg>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#182228] text-[11px] text-[#8A9A94]">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#E8B34A]" /> 提灯少年（减速留存增益）
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#9CE0C2]" /> 武生（直线穿透倍增）
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#93B8E8]" /> 青衣旦（220° 弧面击退）
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 border-t border-dashed border-[#5C6B6B]" /> 齐平参考基准线
                  </span>
                </div>
                <span className="font-num">单点精度 0.25s · 移速全程不锁定</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 1: Three-Form Combat Baseline */}
      <section className="bg-[#10171B] border border-[#243239]">
        <div className="px-5 py-4 border-b border-[#243239] flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#FAF6EA]">
              三形态战斗数值基准（0.60 s 不锁移速丝滑切换 · DPS 严格齐平）
            </h2>
            <p className="text-xs text-[#8A9A94] mt-1">
              凡界/诡界翻界及武生/青衣旦切面均触发 0.60 s 变身演绎而不打断移动；核心基准收敛在 25.3–26.0 DPS 区间。
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenFile('scripts/data.gd')}
              className="px-3 py-1.5 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs font-semibold text-[#FAF6EA] cursor-pointer whitespace-nowrap"
            >
              查看 data.gd
            </button>
            <button
              type="button"
              onClick={() => onOpenFile('tests/combat_and_ecology.gd')}
              className="px-3 py-1.5 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs font-semibold text-[#E8B34A] cursor-pointer whitespace-nowrap"
            >
              查看测试套件
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#0C1215] border-b border-[#243239] text-[#8A9A94] whitespace-nowrap">
                <th className="px-5 py-2.5 font-semibold">形态</th>
                <th className="px-4 py-2.5 font-semibold">所属界域</th>
                <th className="px-4 py-2.5 font-semibold">攻击几何形态</th>
                <th className="px-4 py-2.5 font-semibold text-right">单次伤害</th>
                <th className="px-4 py-2.5 font-semibold text-right">攻击间隔</th>
                <th className="px-4 py-2.5 font-semibold text-right">有效范围</th>
                <th className="px-4 py-2.5 font-semibold text-right">基准 DPS</th>
                <th className="px-5 py-2.5 font-semibold">核心战斗职责与特效</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1B262C] font-num">
              {THREE_FORM_BASELINE.map((row) => (
                <tr key={row.id} className="hover:bg-[#141E23] transition-colors">
                  <td className="px-5 py-3 font-semibold text-[#FAF6EA] whitespace-nowrap">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 text-[#B9B09A] whitespace-nowrap">{row.realm}</td>
                  <td className="px-4 py-3 text-[#EDE6D6] whitespace-nowrap">{row.shape}</td>
                  <td className="px-4 py-3 text-right text-[#E8B34A] font-semibold">
                    {row.damage}
                  </td>
                  <td className="px-4 py-3 text-right text-[#EDE6D6]">{row.intervalSec}</td>
                  <td className="px-4 py-3 text-right text-[#EDE6D6]">{row.range}</td>
                  <td className="px-4 py-3 text-right text-[#9CE0C2] font-bold">{row.dps}</td>
                  <td className="px-5 py-3 text-[#B9B09A] leading-relaxed">{row.mechanic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Day / Dusk / Night Ecology */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-4 bg-[#10171B] border border-[#243239] p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#FAF6EA]">昼夜三段节律（完整守夜局）</h3>
            <p className="text-xs text-[#8A9A94] leading-relaxed">
              60 秒原型试玩局（<span className="font-mono text-[#EDE6D6]">RUN_DURATION = 60.0</span>）保持纯夜战兼容全部既有测试；完整五更局引入白昼过渡与着色器 <span className="font-mono text-[#EDE6D6]">daylight_blend</span>。
            </p>
          </div>

          <div className="divide-y divide-[#1D282E] border-t border-b border-[#1D282E] text-xs font-num">
            <div className="py-3 flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold text-[#FAF6EA]">白昼 · 山林清冷（day）</div>
                <div className="text-[#8A9A94] mt-0.5">山狼 / 野猪 / 树妖与白昼精英山魈</div>
              </div>
              <span className="text-[#E8B34A] shrink-0">0–24 s</span>
            </div>
            <div className="py-3 flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold text-[#FAF6EA]">暮色 · 阴阳交界（dusk）</div>
                <div className="text-[#8A9A94] mt-0.5">冷灰日照退散，残灯点亮，山精与邪祟混生</div>
              </div>
              <span className="text-[#E8B34A] shrink-0">24–36 s</span>
            </div>
            <div className="py-3 flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold text-[#FAF6EA]">长夜 · 阴世五更（night）</div>
                <div className="text-[#8A9A94] mt-0.5">全禁忌生效、诡界异化地标与纸扎判官决战</div>
              </div>
              <span className="text-[#E8B34A] shrink-0">36 s+</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenFile('shaders/night_light.gdshader')}
            className="w-full py-2 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs font-semibold text-[#FAF6EA] cursor-pointer"
          >
            查看 night_light.gdshader 昼夜混合
          </button>
        </div>

        <div className="lg:col-span-8 bg-[#10171B] border border-[#243239] flex flex-col">
          <div className="px-5 py-3.5 border-b border-[#243239] flex items-center justify-between gap-4">
            <h3 className="text-sm font-bold text-[#FAF6EA]">白昼山林怪生态（4 类实装敌怪 · 已配齐 Cel-Ink 精灵）</h3>
            <span className="font-mono text-xs text-[#8A9A94]">
              wolf · boar · treant · shanxiao
            </span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0C1215] border-b border-[#243239] text-[#8A9A94] whitespace-nowrap">
                  <th className="px-4 py-2.5 font-semibold">名称 / Key</th>
                  <th className="px-4 py-2.5 font-semibold">定位</th>
                  <th className="px-4 py-2.5 font-semibold text-right">生命</th>
                  <th className="px-4 py-2.5 font-semibold text-right">移速</th>
                  <th className="px-4 py-2.5 font-semibold">AI 行为特征</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1B262C] font-num">
                {DAYTIME_ECOLOGY.map((e) => (
                  <tr key={e.key} className="hover:bg-[#141E23] transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-[#FAF6EA]">{e.name}</span>{' '}
                      <span className="font-mono text-[#8A9A94]">({e.key})</span>
                    </td>
                    <td className="px-4 py-3 text-[#B9B09A] whitespace-nowrap">{e.role}</td>
                    <td className="px-4 py-3 text-right text-[#EDE6D6]">{e.hp}</td>
                    <td className="px-4 py-3 text-right text-[#EDE6D6]">{e.speed}</td>
                    <td className="px-4 py-3 text-[#B9B09A] leading-relaxed">{e.behavior}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Section 3: Same-Site Dual-Realm Landmarks & Spectral Taboo Variations */}
      <section className="bg-[#10171B] border border-[#243239]">
        <div className="px-5 py-4 border-b border-[#243239] flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-[#FAF6EA]">
              同址异化双界地标、送葬纸人鬼队与诡界禁忌异变
            </h3>
            <p className="text-xs text-[#8A9A94] mt-1">
              同一坐标在人间与诡界呈现截然不同的地貌、交互规则与压迫感；翻界后「闻名切莫回头」改从身后直袭，「白衣问路人」缓慢逼近。
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenFile('scripts/renderer.gd')}
            className="px-3 py-1.5 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs font-semibold text-[#FAF6EA] cursor-pointer whitespace-nowrap"
          >
            查看 renderer.gd 渲染
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#0C1215] border-b border-[#243239] text-[#8A9A94] whitespace-nowrap">
                <th className="px-5 py-2.5 font-semibold">坐标 / 轨迹</th>
                <th className="px-4 py-2.5 font-semibold">人间形态（mortal）</th>
                <th className="px-4 py-2.5 font-semibold">诡界同址异化（spectral）</th>
                <th className="px-5 py-2.5 font-semibold">玩法交互与规则效应</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1B262C] font-num">
              {DUAL_REALM_LANDMARKS.map((lm) => (
                <tr key={lm.key} className="hover:bg-[#141E23] transition-colors">
                  <td className="px-5 py-3 font-mono text-[#8A9A94] whitespace-nowrap">
                    {lm.coords}
                  </td>
                  <td className="px-4 py-3 text-[#EDE6D6] whitespace-nowrap">{lm.mortalName}</td>
                  <td className="px-4 py-3 font-semibold text-[#E8B34A] whitespace-nowrap">
                    {lm.spectralName}
                  </td>
                  <td className="px-5 py-3 text-[#B9B09A] leading-relaxed">{lm.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
