import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FolderTree,
  Grid2x2,
  Image as ImageIcon,
  Map,
  Search,
  Swords,
  Terminal,
} from 'lucide-react';
import dayTreantShanxiao4DirImg from './assets/images/day_treant_shanxiao_4dir_sheet_1795835666562.jpg';
import dayWolfBoar4DirImg from './assets/images/day_wolf_boar_4dir_sheet_1795835662148.jpg';
import heroDan8DirImg from './assets/images/hero_dan_8dir_sheet_1795835659122.jpg';
import heroMortal8DirImg from './assets/images/hero_mortal_8dir_sheet_1795835651172.jpg';
import heroSheng8DirImg from './assets/images/hero_sheng_8dir_sheet_1795835655860.jpg';
import itemsPickupsSheetImg from './assets/images/items_pickups_consumables_sheet_1795855181883.jpg';
import itemsUpgradesSheetImg from './assets/images/items_upgrades_sheet_1795855176835.jpg';
import mapGroundTilesSheetImg from './assets/images/map_ground_tiles_sheet_1795855170664.jpg';
import nightBoss4DirImg from './assets/images/night_boss_4dir_sheet_1795835667409.jpg';
import townBuildingsSheetImg from './assets/images/town_buildings_sheet_1795855171234.jpg';
import townPropsSheetImg from './assets/images/town_props_sheet_1795855174512.jpg';
import wildernessLandmarksSheetImg from './assets/images/wilderness_landmarks_sheet_1795855179840.jpg';
import { CelSpriteInspector } from './components/CelSpriteInspector';
import { CombatWorldBoard } from './components/CombatWorldBoard';
import { WorldAssetsBoard } from './components/WorldAssetsBoard';

type NavSection = 'overview' | 'world' | 'design' | 'sprites' | 'source' | 'concept';
type AnimMode = 'walk' | 'hit' | 'death' | 'all';

interface ProjectFileEntry {
  path: string;
  url: string;
  category: string;
  ext: string;
  isText: boolean;
  bytes: number;
  lines: number;
}

interface ProjectIndex {
  projectName: string;
  englishName: string;
  engineVersion: string;
  upstreamCommit: string;
  webVersionStatus: string;
  zipUrl: string;
  zipBytes: number;
  totalFiles: number;
  gdscriptFiles: number;
  testFiles: number;
  spriteSheets: number;
  referenceSheets: number;
  files: ProjectFileEntry[];
}

interface SpriteEntry {
  path: string;
  file: string;
  label: string;
  frame_size: number;
  hframes: number;
  fps: number;
  colors_used: number;
  palette_gate_passed: boolean;
}

interface SpriteManifest {
  version: string;
  protocol: string;
  palette_gate: string;
  sprites: Record<string, SpriteEntry>;
}

const KEY_MODULES: Array<{ path: string; role: string }> = [
  { path: 'scripts/main.gd', role: '主控状态机：扩建 1520×720 渡墨镇安全区、三形态战斗与昼夜双界异化' },
  { path: 'scripts/world_asset_bank.gd', role: '全量地图与道具资源银行：加载 66 项瓦片、安全区建筑、庭院物件与道具图标' },
  { path: 'scripts/data.gd', role: '21 色锁定色板、30 处安全区庭院布局、白昼 4 敌怪与同址双界地标配置' },
  { path: 'scripts/sprite_bank.gd', role: '扩展支持 Aseprite JSON Tag（8向/4向多行图集）并完全兼容旧 8 帧 PNG 表' },
  { path: 'scripts/renderer.gd', role: '实机瓦片铺装、Y 排序安全区 6 建筑+30 物件、双界地标切换与碧玉经验宝石' },
  { path: 'shaders/night_light.gdshader', role: '水墨夜光着色器（新增 daylight_blend 白昼→暮色→长夜平滑过渡）' },
  { path: 'tools/aseprite/assemble_frames.lua', role: '本地 Aseprite Lua 批处理脚本（29 帧 + 6 组 frameTags 装配与导出）' },
  { path: 'tools/aseprite/qa_check.py', role: '独立 Python 精灵 QA 闸门（防朱红、防重复帧、脚底漂移 <= 2px）' },
  { path: 'tools/aseprite/build_pipeline.sh', role: '自动探测 $ASEPRITE 并带无 Aseprite 自动回退的一键美术管线脚本' },
  { path: 'tests/combat_and_ecology.gd', role: '新增无头测试：Aseprite Tag、三形态基准、昼夜四怪与双界地标校验' },
  { path: 'scripts/ambient_soundscape.gd', role: '三层程序化民俗环境音场（夜风 / 远更鼓梆 / 判官竹篾）' },
  { path: 'scripts/gamepad_focus.gd', role: '手柄 InputMap 映射与弹窗环形 / 网格焦点导航' },
];

const CLI_COMMANDS: Array<{ id: string; title: string; cmd: string }> = [
  {
    id: 'open',
    title: '通过 GitHub Sync 拉取仓库（或解压 ZIP）并在 Godot 4.7.2 中打开',
    cmd: 'git pull\nGODOT=/Users/yuanxxx/Applications/Godot.app/Contents/MacOS/Godot\n$GODOT --editor --path ./godot-prototype',
  },
  {
    id: 'aseprite',
    title: '运行本地 Aseprite CLI + Lua 精灵管线与 QA 闸门（自动回退）',
    cmd: 'cd godot-prototype\nASEPRITE=/Applications/Aseprite.app/Contents/MacOS/aseprite bash tools/aseprite/build_pipeline.sh',
  },
  {
    id: 'tests',
    title: '运行全量 6 套无头测试（含新增三形态战斗与昼夜双界测试）',
    cmd: 'for s in tests/smoke.gd tests/full_run.gd tests/full_features.gd tests/town_and_sprites.gd tests/sound_and_gamepad.gd tests/combat_and_ecology.gd; do\n  $GODOT --headless --path ./godot-prototype --script "$s"\ndone',
  },
  {
    id: 'export',
    title: '字体子集裁剪与导出 macOS / Windows 发行版',
    cmd: 'bash godot-prototype/tools/subset_fonts.sh godot-prototype/assets/fonts godot-prototype/assets/fonts\n$GODOT --headless --path ./godot-prototype --export-release "macOS" dist/InkNight-macOS-Universal.dmg',
  },
];

const CONCEPT_SHEETS = [
  {
    id: 'hero_mortal_8dir',
    title: '提灯少年 · 8 方向 45° 俯拍流畅序列源图（5 基准向 × 10 姿态）',
    meta: 'S / SE / E / NE / N 五基准向 + 水平镜像合成全 8 向 232 帧 · 零朱红约束',
    src: heroMortal8DirImg,
    downloadName: 'ink_night_hero_mortal_8dir_45deg.jpg',
  },
  {
    id: 'hero_sheng_8dir',
    title: '武生（阳面）· 8 方向 45° 俯拍流畅序列源图（5 基准向 × 6 姿态）',
    meta: '双翎靠甲 + 银月长枪 8 向平滑步态/斩击/翻界（232 帧）· 零朱红净墨白脸',
    src: heroSheng8DirImg,
    downloadName: 'ink_night_hero_sheng_8dir_45deg.jpg',
  },
  {
    id: 'hero_dan_8dir',
    title: '青衣旦（阴面）· 8 方向 45° 俯拍流畅序列源图（5 基准向 × 6 姿态）',
    meta: '青缎广袖 8 向平滑滑步/220° 绕身水袖（232 帧）· 零朱红约束',
    src: heroDan8DirImg,
    downloadName: 'ink_night_hero_dan_8dir_45deg.jpg',
  },
  {
    id: 'day_wolf_boar_4dir',
    title: '山狼 & 墨鬃野猪 · 4 方向 45° 俯拍源图（S / E / N 基准向）',
    meta: '四足平滑奔跑/扑咬/倒地循环 · 4 方向各 76 帧 · 零朱红白昼兽类',
    src: dayWolfBoar4DirImg,
    downloadName: 'ink_night_wolf_boar_4dir_45deg.jpg',
  },
  {
    id: 'day_treant_shanxiao_4dir',
    title: '枯木树妖 & 精英山魈 · 4 方向 45° 俯拍源图（S / E / N 基准向）',
    meta: '树妖 4 向平滑迈步挥枝 + 精英山魈（朱红妖瞳）4 向扑击循环',
    src: dayTreantShanxiao4DirImg,
    downloadName: 'ink_night_treant_shanxiao_4dir_45deg.jpg',
  },
  {
    id: 'night_boss_4dir',
    title: '游魂 / 行尸 / 纸扎判官 Boss · 4 方向 45° 俯拍源图',
    meta: '诡界核心敌怪与纸扎判官 Boss 四向平滑漂浮/跳行/朱笔挥扫与消亡姿态',
    src: nightBoss4DirImg,
    downloadName: 'ink_night_night_boss_4dir_45deg.jpg',
  },
  {
    id: 'map_ground_tiles',
    title: '全场景 45° 无缝地表瓦片源图（渡墨镇 / 荒野 / 诡界 · 12 块 64×64）',
    meta: '青石砖、雕纹御道、廊下松木、苔藓石阶、荒坟土路与诡界冥河/血纹玄石',
    src: mapGroundTilesSheetImg,
    downloadName: 'ink_night_map_ground_tiles_sheet.jpg',
  },
  {
    id: 'town_buildings',
    title: '渡墨镇安全区 6 大建筑源图（含新扩月下茶亭戏台与济世药铺）',
    meta: '镇北铁门牌坊、老油坊、扎彩故铺、月下茶亭戏台、济世药铺、辟邪祖火鼎坛',
    src: townBuildingsSheetImg,
    downloadName: 'ink_night_town_buildings_sheet.jpg',
  },
  {
    id: 'town_props',
    title: '渡墨镇安全区 12 种庭院美化物件源图（30 处实景布设）',
    meta: '百年古槐、青苔古井、暖光石灯、悬榜木牌、茶桌油瓮、挑灯柱、香炉、戏班兵器架与影壁',
    src: townPropsSheetImg,
    downloadName: 'ink_night_town_props_sheet.jpg',
  },
  {
    id: 'wilderness_landmarks',
    title: '乱葬岗荒野与诡界同址异化 8 大地标源图',
    meta: '古镇石桥 / 冥河纸桥、鬼市纸铺、无字残碑 / 阴祠灵位、石阴门、竹林与断垣',
    src: wildernessLandmarksSheetImg,
    downloadName: 'ink_night_wilderness_landmarks_sheet.jpg',
  },
  {
    id: 'items_upgrades',
    title: '局内 16 项戏班与民俗升级名物 64×64 图标源图',
    meta: '1:1 完整覆盖 InkData.FULL_UPGRADE_POOL 全部 16 项升级遗物图标',
    src: itemsUpgradesSheetImg,
    downloadName: 'ink_night_items_upgrades_sheet.jpg',
  },
  {
    id: 'items_pickups',
    title: '局内掉落物、三款灯油、纸扎护符与判官宝箱 12 项 64×64 图标源图',
    meta: '大小墨魄碧玉、香火铜钱、灯油瓶、艾糕、松脂/桐油/冥蜡、替身/安神符与判官朱印箱',
    src: itemsPickupsSheetImg,
    downloadName: 'ink_night_items_pickups_sheet.jpg',
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function SpritePreviewCanvas({
  src,
  frameSize,
  hframes,
  fps,
  mode,
  smoothLerp = true,
  label,
  sourceFile,
  sourcePath,
  nativeFps,
  colorsUsed,
}: {
  src: string;
  frameSize: number;
  hframes: number;
  fps: number;
  mode: AnimMode;
  smoothLerp?: boolean;
  label?: string;
  sourceFile?: string;
  sourcePath?: string;
  nativeFps?: number;
  colorsUsed?: number;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const frameBuffersRef = useRef<Uint8ClampedArray[] | null>(null);
  const fpsRef = useRef(fps);
  const smoothLerpRef = useRef(smoothLerp);
  const [loaded, setLoaded] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{
    left: number;
    top: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  fpsRef.current = fps;
  smoothLerpRef.current = smoothLerp;

  const activeFrameCount =
    mode === 'walk' ? 4 : mode === 'hit' ? 1 : mode === 'death' ? 3 : hframes;
  const modeLabel =
    mode === 'walk'
      ? 'Walk (0..3)'
      : mode === 'hit'
        ? 'Hit (4)'
        : mode === 'death'
          ? 'Death (5..7)'
          : `全 ${hframes} 帧`;
  const safeFps = Math.max(1, fps);
  const frameDurationMs = (1000 / safeFps).toFixed(1);
  const loopDurationMs = Math.round((1000 / safeFps) * activeFrameCount);
  const resolvedSourceFile = sourceFile || src.split('/').pop() || src;
  const tooltipId = `sprite-meta-${resolvedSourceFile.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  const openTooltip = () => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tooltipWidth = 288;
    const estimatedHeight = 196;
    const margin = 12;
    const placement: 'top' | 'bottom' =
      rect.top >= estimatedHeight + margin ? 'top' : 'bottom';
    const rawLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
    const clampedLeft = Math.max(
      margin,
      Math.min(rawLeft, window.innerWidth - tooltipWidth - margin),
    );
    const top = placement === 'top' ? rect.top - 10 : rect.bottom + 10;
    setTooltipPos({ left: clampedLeft, top, placement });
  };

  const closeTooltip = () => {
    setTooltipPos(null);
  };

  useEffect(() => {
    if (!tooltipPos) return;
    window.addEventListener('scroll', closeTooltip, true);
    return () => window.removeEventListener('scroll', closeTooltip, true);
  }, [tooltipPos]);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    frameBuffersRef.current = null;
    const img = new Image();
    img.onload = () => {
      if (!active) return;
      imgRef.current = img;
      // Pre-extract raw RGBA frame buffers once so rAF linear interpolation is zero-GC per frame
      try {
        const scratch = document.createElement('canvas');
        scratch.width = frameSize;
        scratch.height = frameSize;
        const sctx = scratch.getContext('2d', { willReadFrequently: true });
        if (sctx) {
          const buffers: Uint8ClampedArray[] = [];
          for (let i = 0; i < hframes; i++) {
            sctx.clearRect(0, 0, frameSize, frameSize);
            sctx.imageSmoothingEnabled = false;
            sctx.drawImage(img, i * frameSize, 0, frameSize, frameSize, 0, 0, frameSize, frameSize);
            buffers.push(sctx.getImageData(0, 0, frameSize, frameSize).data);
          }
          frameBuffersRef.current = buffers;
        }
      } catch {
        frameBuffersRef.current = null;
      }
      setLoaded(true);
    };
    img.src = src;
    return () => {
      active = false;
    };
  }, [src, frameSize, hframes]);

  useEffect(() => {
    if (!loaded || !imgRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frames =
      mode === 'walk'
        ? [0, 1, 2, 3]
        : mode === 'hit'
          ? [4]
          : mode === 'death'
            ? [5, 6, 7]
            : Array.from({ length: hframes }, (_, i) => i);

    const drawDiscrete = (frameIdx: number) => {
      const img = imgRef.current;
      if (!img) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        frameIdx * frameSize,
        0,
        frameSize,
        frameSize,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    };

    if (frames.length <= 1) {
      drawDiscrete(frames[0] ?? 0);
      return;
    }

    // Reusable offscreen buffer for premultiplied-safe per-pixel linear interpolation
    const blendCanvas = document.createElement('canvas');
    blendCanvas.width = frameSize;
    blendCanvas.height = frameSize;
    const blendCtx = blendCanvas.getContext('2d');
    const blendImgData = blendCtx ? blendCtx.createImageData(frameSize, frameSize) : null;

    const drawInterpolated = (idxA: number, idxB: number, t: number) => {
      const img = imgRef.current;
      if (!img) return;

      if (!smoothLerpRef.current || t <= 0.002 || idxA === idxB) {
        drawDiscrete(idxA);
        return;
      }
      if (t >= 0.998) {
        drawDiscrete(idxB);
        return;
      }

      const buffers = frameBuffersRef.current;
      if (buffers && blendCtx && blendImgData && buffers[idxA] && buffers[idxB]) {
        const bufA = buffers[idxA];
        const bufB = buffers[idxB];
        const out = blendImgData.data;
        const invT = 1 - t;
        const len = out.length;

        for (let i = 0; i < len; i += 4) {
          const aA = bufA[i + 3];
          const aB = bufB[i + 3];
          if (aA === 0 && aB === 0) {
            out[i] = 0;
            out[i + 1] = 0;
            out[i + 2] = 0;
            out[i + 3] = 0;
            continue;
          }
          const wA = aA * invT;
          const wB = aB * t;
          const outA = wA + wB;
          if (outA <= 0.5) {
            out[i] = 0;
            out[i + 1] = 0;
            out[i + 2] = 0;
            out[i + 3] = 0;
          } else {
            const invOutA = 1 / outA;
            out[i] = (bufA[i] * wA + bufB[i] * wB) * invOutA;
            out[i + 1] = (bufA[i + 1] * wA + bufB[i + 1] * wB) * invOutA;
            out[i + 2] = (bufA[i + 2] * wA + bufB[i + 2] * wB) * invOutA;
            out[i + 3] = outA;
          }
        }

        blendCtx.putImageData(blendImgData, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(blendCanvas, 0, 0, canvas.width, canvas.height);
        return;
      }

      // Fallback alpha cross-fade if raw pixel extraction is unavailable
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1 - t;
      ctx.drawImage(img, idxA * frameSize, 0, frameSize, frameSize, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = t;
      ctx.drawImage(img, idxB * frameSize, 0, frameSize, frameSize, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    };

    let rafId = 0;
    let lastTime: number | null = null;
    let phase = 0;
    const total = frames.length;

    const tick = (now: number) => {
      if (lastTime === null) {
        lastTime = now;
      } else {
        // Clamp dt to 50ms to prevent frame-skipping bursts after tab switches or GC pauses
        const dt = Math.min(Math.max(0, (now - lastTime) / 1000), 0.05);
        lastTime = now;
        const safeFps = Math.max(1, fpsRef.current);
        phase = (phase + dt * safeFps) % total;
      }

      const curStep = Math.floor(phase) % total;
      const nextStep = (curStep + 1) % total;
      const alpha = phase - Math.floor(phase);

      drawInterpolated(frames[curStep], frames[nextStep], alpha);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [loaded, frameSize, hframes, mode]);

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      aria-label={`${label ?? resolvedSourceFile} 精灵预览`}
      aria-describedby={tooltipPos ? tooltipId : undefined}
      onMouseEnter={openTooltip}
      onMouseLeave={closeTooltip}
      onFocus={openTooltip}
      onBlur={closeTooltip}
      data-sprite-preview-trigger="true"
      className="relative shrink-0 cursor-help outline-none group"
    >
      <canvas
        ref={canvasRef}
        width={96}
        height={96}
        data-sprite-preview-canvas="true"
        className="w-20 h-20 block bg-[#080C0E] border border-[#26343B] group-hover:border-[#E8B34A] group-focus-visible:border-[#E8B34A] transition-colors"
        style={{ imageRendering: 'pixelated' }}
      />

      {tooltipPos && (
        <div
          id={tooltipId}
          role="tooltip"
          data-sprite-metadata-tooltip="true"
          style={{
            left: `${tooltipPos.left}px`,
            top: `${tooltipPos.top}px`,
            transform:
              tooltipPos.placement === 'top' ? 'translateY(-100%)' : 'translateY(0)',
          }}
          className="fixed z-50 w-72 pointer-events-none bg-[#0D1418] border border-[#344750] shadow-2xl p-3.5 text-left"
        >
          <div className="flex items-baseline justify-between gap-2 pb-2 border-b border-[#202D34]">
            <span className="text-xs font-bold text-[#FAF6EA] truncate">
              {label ?? resolvedSourceFile}
            </span>
            <span className="font-num text-[11px] text-[#E8B34A] shrink-0">
              {modeLabel}
            </span>
          </div>

          <dl className="mt-2.5 space-y-1.5 text-[11px]">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-[#8A9A94] shrink-0">原始源文件</dt>
              <dd className="font-mono text-[#E8B34A] text-right break-all">
                {resolvedSourceFile}
              </dd>
            </div>
            {sourcePath && (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#8A9A94] shrink-0">Godot 路径</dt>
                <dd className="font-mono text-[10px] text-[#B9B09A] text-right break-all">
                  {sourcePath}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#8A9A94]">总帧数</dt>
              <dd className="font-num text-[#FAF6EA]">
                {hframes} 帧（当前段 {activeFrameCount} 帧）
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#8A9A94]">单帧时长</dt>
              <dd className="font-num text-[#FAF6EA]">
                {frameDurationMs} ms/帧 · {safeFps} FPS
                {nativeFps !== undefined && nativeFps !== safeFps
                  ? ` (原 ${nativeFps})`
                  : ''}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#8A9A94]">单周期时长</dt>
              <dd className="font-num text-[#EDE6D6]">{loopDurationMs} ms</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#8A9A94]">画幅 / 图集</dt>
              <dd className="font-num text-[#EDE6D6]">
                {frameSize}×{frameSize} · {frameSize * hframes}×{frameSize} px
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#8A9A94]">播放插值</dt>
              <dd className="text-[#9CE0C2]">
                {smoothLerp ? 'rAF 线性插值' : '原始逐帧步进'}
              </dd>
            </div>
            {colorsUsed !== undefined && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#8A9A94]">色盘统计</dt>
                <dd className="font-num text-[#9CE0C2]">{colorsUsed} / 18 色</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [section, setSection] = useState<NavSection>('overview');
  const [projectIndex, setProjectIndex] = useState<ProjectIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);

  const [manifest, setManifest] = useState<SpriteManifest | null>(null);
  const [animMode, setAnimMode] = useState<AnimMode>('walk');
  const [previewFpsOverride, setPreviewFpsOverride] = useState<number | null>(null);
  const [smoothLerp, setSmoothLerp] = useState<boolean>(true);

  const [fileFilter, setFileFilter] = useState('');
  const [selectedPath, setSelectedPath] = useState<string>('scripts/main.gd');
  const [sourceCache, setSourceCache] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/godot-prototype/project-index.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ProjectIndex>;
      })
      .then((data) => {
        if (active) setProjectIndex(data);
      })
      .catch((err: unknown) => {
        if (active) setIndexError(err instanceof Error ? err.message : '加载工程索引失败');
      });

    fetch('/godot-prototype/assets/sprites/palette-report.json')
      .then((res) => (res.ok ? (res.json() as Promise<SpriteManifest>) : null))
      .then((data) => {
        if (active && data) setManifest(data);
      })
      .catch(() => {
        // Handled cleanly in sprites view
      });

    return () => {
      active = false;
    };
  }, []);

  const textFiles = useMemo(
    () => (projectIndex?.files ?? []).filter((f) => f.isText),
    [projectIndex],
  );

  const filteredTextFiles = useMemo(() => {
    const q = fileFilter.trim().toLowerCase();
    if (!q) return textFiles;
    return textFiles.filter(
      (f) => f.path.toLowerCase().includes(q) || f.category.toLowerCase().includes(q),
    );
  }, [textFiles, fileFilter]);

  const selectedFile = useMemo(
    () => textFiles.find((f) => f.path === selectedPath) ?? textFiles[0] ?? null,
    [textFiles, selectedPath],
  );

  useEffect(() => {
    if (!selectedFile) return;
    if (sourceCache[selectedFile.path] !== undefined) return;
    let active = true;
    fetch(selectedFile.url)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((text) => {
        if (active) {
          setSourceCache((prev) => ({ ...prev, [selectedFile.path]: text }));
        }
      })
      .catch(() => {
        if (active) {
          setSourceCache((prev) => ({ ...prev, [selectedFile.path]: '# 无法读取该文件内容' }));
        }
      });
    return () => {
      active = false;
    };
  }, [selectedFile, sourceCache]);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((cur) => (cur === key ? null : cur));
      }, 1600);
    } catch {
      // Fallback: user can still download files directly
    }
  };

  const openFileInViewer = (relPath: string) => {
    setSelectedPath(relPath);
    setSection('source');
  };

  const sectionLabel: Record<NavSection, string> = {
    overview: '工程总览',
    world: '地图与道具资源',
    design: '战斗与双界',
    sprites: '精灵与动画管线',
    source: '源码浏览器',
    concept: '美术参考基准',
  };

  const spriteEntries = manifest ? Object.entries(manifest.sprites) : [];
  const zipUrl = projectIndex?.zipUrl ?? '/downloads/ink-night-godot-4.7.2-complete.zip';

  const handleDownloadZip = async () => {
    if (downloadingZip) return;
    setDownloadingZip(true);
    setDownloadNotice(null);
    try {
      const res = await fetch(zipUrl, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 4));
      const isZip =
        head.length === 4 &&
        head[0] === 0x50 &&
        head[1] === 0x4b &&
        head[2] === 0x03 &&
        head[3] === 0x04;
      if (!isZip || buf.byteLength < 1024) {
        throw new Error('预览代理返回了非 ZIP 内容，建议直接使用 GitHub Sync 同步完整 godot-prototype/ 目录');
      }
      const blob = new Blob([buf], { type: 'application/zip' });
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = 'ink-night-godot-4.7.2-complete.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ZIP 下载失败';
      setDownloadNotice(`${msg}（完整 Godot 4.7.2 工程已保存在仓库根目录 godot-prototype/，可直接通过 GitHub Sync 同步）。`);
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#0B1013] text-[#EDE6D6] flex overflow-hidden">
      {/* Left Workspace Sidebar */}
      <aside className="w-64 shrink-0 bg-[#10171B] border-r border-[#243239] flex flex-col justify-between">
        <div>
          <div className="px-6 py-5 border-b border-[#243239]">
            <h1 className="font-brush text-3xl text-[#FAF6EA] tracking-wide leading-none">
              墨夜点灯人
            </h1>
            <p className="mt-2 text-xs text-[#8A9A94] leading-relaxed">
              Godot 4.7.2 · GL Compatibility
            </p>
          </div>

          <nav className="p-3 space-y-1" aria-label="工程导航">
            {(
              [
                { id: 'overview', label: '工程总览', icon: FolderTree },
                { id: 'world', label: '地图与道具资源', icon: Map },
                { id: 'design', label: '战斗与双界', icon: Swords },
                { id: 'sprites', label: '精灵与动画管线', icon: Grid2x2 },
                { id: 'source', label: '源码浏览器', icon: Code2 },
                { id: 'concept', label: '美术参考基准', icon: ImageIcon },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-nav={item.id}
                  onClick={() => setSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium text-left cursor-pointer transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#19242A] text-[#FAF6EA] border border-[#344750]'
                      : 'text-[#B9B09A] border border-transparent hover:bg-[#141E23] hover:text-[#FAF6EA]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-[#E8B34A]" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-[#243239] space-y-2.5 text-xs text-[#8A9A94]">
          <p className="text-[#B9B09A] font-medium">同步 ac9f3c6 · 地图道具与安全区就绪</p>
          <p className="leading-relaxed">
            含 10 套多向精灵（1,228 帧）+ 66 项地图/建筑/庭院/道具 PNG 与扩建美化 1520×720 渡墨镇，根目录与 <span className="font-mono text-[#B9B09A]">godot-prototype/</span> 双向同步。
          </p>
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={downloadingZip}
            className="mt-1 inline-flex items-center gap-1.5 text-[#E8B34A] hover:text-[#F5D98A] font-semibold cursor-pointer disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloadingZip ? '正在校验并打包...' : '下载完整工程包 (.zip)'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left + Single primary action on right */}
        <header className="h-14 shrink-0 px-6 bg-[#10171B] border-b border-[#243239] flex items-center justify-between gap-8">
          <div className="flex items-center gap-2 text-sm text-[#8A9A94] min-w-0">
            <span className="text-[#FAF6EA] font-semibold whitespace-nowrap shrink-0">
              墨夜点灯人
            </span>
            <span aria-hidden="true">/</span>
            <span className="font-mono text-xs text-[#B9B09A] whitespace-nowrap shrink-0">
              godot-prototype (ac9f3c6+)
            </span>
            <span aria-hidden="true">/</span>
            <span className="text-[#EDE6D6] truncate">{sectionLabel[section]}</span>
          </div>

          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={downloadingZip}
            data-download-zip="true"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#E8B34A] hover:bg-[#F5D98A] text-[#0E1418] text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloadingZip ? '校验 ZIP 中...' : '下载完整 Godot 4.7.2 工程 (.zip)'}</span>
          </button>
        </header>

        {/* Scrollable Workspace Viewport */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {indexError && (
            <div className="mb-6 p-4 bg-[#261412] border border-[#7C1E10] text-sm text-[#FAF6EA]">
              工程索引读取失败：{indexError}
            </div>
          )}
          {downloadNotice && (
            <div className="mb-6 p-4 bg-[#261412] border border-[#7C1E10] text-sm text-[#FAF6EA] flex items-center justify-between gap-4">
              <span>{downloadNotice}</span>
              <button
                type="button"
                onClick={() => setDownloadNotice(null)}
                className="text-xs text-[#E8B34A] hover:underline shrink-0 cursor-pointer"
              >
                关闭
              </button>
            </div>
          )}

          {/* SECTION 1: OVERVIEW */}
          {section === 'overview' && (
            <div className="max-w-6xl space-y-8">
              <section className="p-6 bg-[#11191D] border border-[#243239]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl space-y-2">
                    <h2 className="text-xl font-bold text-[#FAF6EA] tracking-tight">
                      《墨夜点灯人》Godot 4.7.2 全量工程：扩建美化安全区、66 项地图道具与 8向/4向精灵
                    </h2>
                    <p className="text-sm text-[#B9B09A] leading-relaxed">
                      在完整保留 <span className="font-mono text-[#FAF6EA]">ac9f3c6</span> 主工程与全部测试契约基础上，已完成全场景 66 项 45° 水墨像素地图/建筑/庭院/道具资产，并将渡墨镇安全区扩建至 <span className="font-mono text-[#FAF6EA]">1520×720</span>（新增月下茶亭戏台、济世药铺、青苔古井、悬榜木牌与 30 处庭院物件），直连 <span className="font-mono text-[#FAF6EA]">InkWorldAssetBank</span> 实机渲染。
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSection('world')}
                      className="px-4 py-2 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs font-semibold text-[#E8B34A] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      地图与安全区预览
                    </button>
                    <button
                      type="button"
                      onClick={() => setSection('sprites')}
                      className="px-4 py-2 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs font-semibold text-[#FAF6EA] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      检验 10 套多向精灵
                    </button>
                  </div>
                </div>
              </section>

              {/* 4-column flat metric strip */}
              <section className="grid grid-cols-2 lg:grid-cols-4 border border-[#243239] bg-[#10171B] divide-y lg:divide-y-0 lg:divide-x divide-[#243239]">
                <div className="p-5">
                  <p className="text-xs text-[#8A9A94]">地图、安全区与道具资产</p>
                  <p className="mt-1.5 font-num text-2xl font-bold text-[#FAF6EA]">66 项 PNG</p>
                  <p className="mt-1 text-xs text-[#8A9A94]">12 瓦片 + 6 建筑 + 12 物件 + 8 地标 + 28 道具</p>
                </div>
                <div className="p-5">
                  <p className="text-xs text-[#8A9A94]">渡墨镇安全区规模</p>
                  <p className="mt-1.5 font-num text-2xl font-bold text-[#FAF6EA]">1520×720</p>
                  <p className="mt-1 text-xs text-[#8A9A94]">较原版扩建 +259% · 8 处可交互地标</p>
                </div>
                <div className="p-5">
                  <p className="text-xs text-[#8A9A94]">多向流畅 Cel-Ink 图集</p>
                  <p className="mt-1.5 font-num text-2xl font-bold text-[#FAF6EA]">10 套 / 1,228 帧</p>
                  <p className="mt-1 text-xs text-[#8A9A94]">3 主角 8向(232f) + 7 敌怪/Boss 4向(76f)</p>
                </div>
                <div className="p-5">
                  <p className="text-xs text-[#8A9A94]">完整工程包体积</p>
                  <p className="mt-1.5 font-num text-2xl font-bold text-[#FAF6EA]">
                    {projectIndex ? formatBytes(projectIndex.zipBytes) : '—'}
                  </p>
                  <p className="mt-1 text-xs text-[#8A9A94]">
                    {projectIndex ? `${projectIndex.totalFiles} 文件 · ${projectIndex.gdscriptFiles} GDScript` : '含全量地图、精灵与字体'}
                  </p>
                </div>
              </section>

              {/* Two-column split: Module Architecture Table + Local CLI Commands */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div className="lg:col-span-7 bg-[#10171B] border border-[#243239] flex flex-col">
                  <div className="px-5 py-3.5 border-b border-[#243239] flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#FAF6EA]">完整工程核心模块（ac9f3c6 + 新增升级）</h3>
                    <span className="text-xs text-[#8A9A94]">点击任意文件直接查看源码</span>
                  </div>
                  <div className="divide-y divide-[#1D282E]">
                    {KEY_MODULES.map((mod) => {
                      const info = projectIndex?.files.find((f) => f.path === mod.path);
                      return (
                        <button
                          key={mod.path}
                          type="button"
                          onClick={() => openFileInViewer(mod.path)}
                          className="w-full px-5 py-3 text-left hover:bg-[#162026] transition-colors flex items-center justify-between gap-4 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-xs text-[#E8B34A] truncate">
                              {mod.path}
                            </div>
                            <div className="text-xs text-[#B9B09A] mt-0.5 truncate">{mod.role}</div>
                          </div>
                          <div className="font-num text-xs text-[#8A9A94] shrink-0 text-right">
                            {info ? `${info.lines} 行` : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-[#10171B] border border-[#243239] flex flex-col">
                  <div className="px-5 py-3.5 border-b border-[#243239] flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#E8B34A]" />
                    <h3 className="text-sm font-bold text-[#FAF6EA]">本地 Godot 4.7.2 常用命令</h3>
                  </div>
                  <div className="p-5 space-y-5 flex-1">
                    {CLI_COMMANDS.map((item) => (
                      <div key={item.id} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#EDE6D6]">{item.title}</span>
                          <button
                            type="button"
                            onClick={() => copyText(item.id, item.cmd)}
                            className="inline-flex items-center gap-1 text-xs text-[#B9B09A] hover:text-[#FAF6EA] cursor-pointer whitespace-nowrap"
                          >
                            {copiedKey === item.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#9CE0C2]" />
                                <span className="text-[#9CE0C2]">已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>复制</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-3 bg-[#090D10] border border-[#1E2A30] text-[11px] font-mono text-[#CBD4D0] overflow-x-auto leading-relaxed">
                          <code>{item.cmd}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* SECTION 1.5: WORLD MAP, EXPANDED SAFE ZONE & ITEM ASSETS */}
          {section === 'world' && (
            <div className="max-w-6xl">
              <WorldAssetsBoard onInspectScript={openFileInViewer} />
            </div>
          )}

          {/* SECTION 2: THREE-FORM COMBAT & DUAL-REALM ECOLOGY */}
          {section === 'design' && (
            <div className="max-w-6xl">
              <CombatWorldBoard onOpenFile={openFileInViewer} />
            </div>
          )}

          {/* SECTION 3: SPRITE SHEETS & ASEPRITE PIPELINE */}
          {section === 'sprites' && (
            <div className="max-w-6xl space-y-8">
              <CelSpriteInspector onInspectScript={openFileInViewer} />

              <section className="space-y-4 pt-4 border-t border-[#243239]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-[#FAF6EA]">
                      兼容旧协议：11 张严格 45° 俯视 18 色锁盘 8 帧表（manifest.json）
                    </h3>
                    <p className="mt-1 text-xs text-[#8A9A94]">
                      InkSpriteBank 优先解析 Aseprite JSON Tag，并无缝兼容以下 11 张经典 8 帧水平表（walk 0..3 / hit 4 / death 5..7）。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center border border-[#243239] bg-[#10171B]">
                      {(
                        [
                          { id: 'walk', label: 'Walk (0..3)' },
                          { id: 'hit', label: 'Hit (4)' },
                          { id: 'death', label: 'Death (5..7)' },
                          { id: 'all', label: '全 8 帧' },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setAnimMode(m.id)}
                          className={`px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                            animMode === m.id
                              ? 'bg-[#E8B34A] text-[#0E1418] font-bold'
                              : 'text-[#B9B09A] hover:text-[#FAF6EA]'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div
                      data-preview-fps-controls="true"
                      className="flex items-center border border-[#243239] bg-[#10171B]"
                    >
                      {(
                        [
                          { value: null, label: '原始 FPS' },
                          { value: 24, label: '24 FPS' },
                          { value: 48, label: '48 FPS' },
                          { value: 60, label: '60 FPS' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={String(opt.value)}
                          type="button"
                          data-fps-preset={opt.value ?? 'native'}
                          onClick={() => setPreviewFpsOverride(opt.value)}
                          className={`px-2.5 py-1.5 text-xs font-num cursor-pointer transition-colors whitespace-nowrap ${
                            previewFpsOverride === opt.value
                              ? 'bg-[#E8B34A] text-[#0E1418] font-bold'
                              : 'text-[#B9B09A] hover:text-[#FAF6EA]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      data-toggle-lerp="true"
                      onClick={() => setSmoothLerp((v) => !v)}
                      className={`px-3 py-1.5 text-xs font-semibold border cursor-pointer transition-colors whitespace-nowrap ${
                        smoothLerp
                          ? 'bg-[#162C25] border-[#9CE0C2] text-[#9CE0C2]'
                          : 'bg-[#10171B] border-[#243239] text-[#B9B09A] hover:text-[#FAF6EA]'
                      }`}
                    >
                      {smoothLerp ? 'rAF 线性插值：开' : 'rAF 线性插值：关'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {spriteEntries.map(([key, spec]) => {
                    const sheetUrl = `/godot-prototype/assets/sprites/${spec.file}`;
                    const effectiveFps = previewFpsOverride ?? spec.fps;
                    return (
                      <div
                        key={key}
                        className="p-4 bg-[#10171B] border border-[#243239] flex items-center gap-4"
                      >
                        <SpritePreviewCanvas
                          src={sheetUrl}
                          frameSize={spec.frame_size}
                          hframes={spec.hframes}
                          fps={effectiveFps}
                          mode={animMode}
                          smoothLerp={smoothLerp}
                          label={spec.label}
                          sourceFile={spec.file}
                          sourcePath={spec.path}
                          nativeFps={spec.fps}
                          colorsUsed={spec.colors_used}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-sm font-semibold text-[#FAF6EA] truncate">
                            {spec.label}
                          </div>
                          <div className="font-mono text-[11px] text-[#E8B34A] truncate">
                            {spec.file}
                          </div>
                          <div className="font-num text-xs text-[#8A9A94]">
                            {spec.frame_size}×{spec.frame_size} × {spec.hframes}f · {effectiveFps} FPS
                          </div>
                          <div className="font-num text-xs text-[#9CE0C2]">
                            色盘门禁：{spec.colors_used} / 18 色通过
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* SECTION 4: SOURCE CODE BROWSER */}
          {section === 'source' && (
            <div className="max-w-6xl h-[calc(100vh-8.5rem)] grid grid-cols-1 lg:grid-cols-12 border border-[#243239] bg-[#10171B] overflow-hidden">
              <div className="lg:col-span-4 border-r border-[#243239] flex flex-col min-h-0">
                <div className="p-3 border-b border-[#243239]">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#8A9A94] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={fileFilter}
                      onChange={(e) => setFileFilter(e.target.value)}
                      placeholder="筛选 GDScript / Shader / Aseprite 脚本..."
                      className="w-full pl-8 pr-3 py-1.5 bg-[#090D10] border border-[#243239] text-xs text-[#FAF6EA] placeholder-[#6E7D78] focus:outline-none focus:border-[#E8B34A]"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-[#1A2429]">
                  {filteredTextFiles.map((file) => {
                    const active = selectedFile?.path === file.path;
                    return (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => setSelectedPath(file.path)}
                        className={`w-full px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#19242A] border-l-2 border-l-[#E8B34A]'
                            : 'hover:bg-[#141E23]'
                        }`}
                      >
                        <div className="font-mono text-xs text-[#FAF6EA] truncate">
                          {file.path}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[11px] text-[#8A9A94]">
                          <span className="truncate">{file.category}</span>
                          <span className="font-num shrink-0">{file.lines} 行</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-8 flex flex-col min-h-0 bg-[#090D10]">
                {selectedFile ? (
                  <>
                    <div className="px-4 py-3 bg-[#10171B] border-b border-[#243239] flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-[#E8B34A] truncate">
                          godot-prototype/{selectedFile.path}
                        </div>
                        <div className="font-num text-[11px] text-[#8A9A94] mt-0.5">
                          {selectedFile.lines} 行 · {formatBytes(selectedFile.bytes)} ·{' '}
                          {selectedFile.category}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          copyText(
                            `src:${selectedFile.path}`,
                            sourceCache[selectedFile.path] ?? '',
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs text-[#FAF6EA] cursor-pointer shrink-0"
                      >
                        {copiedKey === `src:${selectedFile.path}` ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#9CE0C2]" />
                            <span className="text-[#9CE0C2]">已复制源码</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>复制源码</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-[#D5DDD9] leading-relaxed">
                      <code>{sourceCache[selectedFile.path] ?? '正在读取源码...'}</code>
                    </pre>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-sm text-[#8A9A94]">
                    请选择左侧文件查看完整源码
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 5: CONCEPT SHEETS */}
          {section === 'concept' && (
            <div className="max-w-6xl space-y-6">
              <div>
                <h2 className="text-lg font-bold text-[#FAF6EA]">
                  严格 45° 高机位俯视像素原图（全套 12 张角色、地图、安全区与道具基准图集）
                </h2>
                <p className="mt-1 text-xs text-[#8A9A94]">
                  所有 18 张角色精灵帧表与 66 项地图/安全区/道具 PNG 均由以下 12 张 45° 俯拍原图精准切图、去背并同步写入 <span className="font-mono text-[#B9B09A]">godot-prototype/assets/</span>。
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {CONCEPT_SHEETS.map((sheet) => (
                  <article
                    key={sheet.id}
                    className="bg-[#10171B] border border-[#243239] overflow-hidden flex flex-col"
                  >
                    <div className="px-4 py-3 border-b border-[#243239] flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[#FAF6EA] truncate">{sheet.title}</h3>
                        <p className="text-[11px] text-[#8A9A94] mt-0.5 truncate">{sheet.meta}</p>
                      </div>
                      <a
                        href={sheet.src}
                        download={sheet.downloadName}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-[11px] text-[#E8B34A] shrink-0"
                      >
                        <Download className="w-3 h-3" />
                        <span>下载原图</span>
                      </a>
                    </div>
                    <div className="bg-[#090D10] p-3">
                      <img
                        src={sheet.src}
                        alt={sheet.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-auto block border border-[#1E2A30]"
                      />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
