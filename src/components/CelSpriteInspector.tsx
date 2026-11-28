import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Crosshair, Download, Pause, Play, RotateCw } from 'lucide-react';

interface CelActorMeta {
  key: string;
  name: string;
  role: string;
  category: 'hero' | 'day_enemy' | 'day_elite' | 'night_enemy' | 'boss';
  size: number;
  directions?: string[];
  direction_count?: number;
  frames_per_dir?: number;
  file: string;
  json_file: string;
  qa_json: string;
  allow_vermilion: boolean;
}

interface CelManifestDoc {
  version: string;
  actors: CelActorMeta[];
}

interface AsepriteFrame {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  duration: number;
}

interface AsepriteTag {
  name: string;
  from: number;
  to: number;
  direction: string;
}

interface AsepriteSheetData {
  frames: AsepriteFrame[];
  meta: {
    image: string;
    size: { w: number; h: number };
    anchor?: { x: number; y: number };
    frameTags: AsepriteTag[];
  };
}

interface QaTagReport {
  name: string;
  from: number;
  to: number;
  frameCount: number;
  footYMin: number;
  footYMax: number;
  footDriftPx: number;
  avgMotionDelta: number;
  minMotionDelta: number;
}

interface CelQaReport {
  sheet: string;
  dimensions: {
    width: number;
    height: number;
    frameSize: number;
    frameCount: number;
  };
  passed: boolean;
  vermilionPixels: number;
  allowVermilion?: boolean;
  duplicatePairs: number;
  anchorSpec: {
    centerX: number;
    footY: number;
    safeMarginPx: number;
  };
  errors: string[];
  tags: QaTagReport[];
}

const FALLBACK_ACTORS: CelActorMeta[] = [
  {
    key: 'player_mortal',
    name: '提灯少年',
    role: '凡界主角 · 8向 120° 减速灯火锥',
    category: 'hero',
    size: 96,
    directions: ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw'],
    direction_count: 8,
    frames_per_dir: 29,
    file: 'player_mortal_cel.png',
    json_file: 'player_mortal_cel.json',
    qa_json: 'player_mortal_cel.qa.json',
    allow_vermilion: false,
  },
];

const TAG_NAMES_ZH: Record<string, string> = {
  idle: '待机',
  move: '跑动',
  attack: '攻击',
  flip: '翻界',
  hit: '受击',
  death: '倒地',
};

const DIR_LABELS_ZH: Record<string, string> = {
  n: '正北 (N)',
  ne: '东北 (NE)',
  e: '正东 (E)',
  se: '东南 (SE)',
  s: '正南 (S)',
  sw: '西南 (SW)',
  w: '正西 (W)',
  nw: '西北 (NW)',
};

const COMPASS_GRID: Array<Array<string | 'CENTER'>> = [
  ['nw', 'n', 'ne'],
  ['w', 'CENTER', 'e'],
  ['sw', 's', 'se'],
];

const CLOCKWISE_8 = ['s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se'];
const CLOCKWISE_4 = ['s', 'w', 'n', 'e'];

export function CelSpriteInspector({
  onInspectScript,
}: {
  onInspectScript: (relPath: string) => void;
}) {
  const [actors, setActors] = useState<CelActorMeta[]>(FALLBACK_ACTORS);
  const [selectedActorKey, setSelectedActorKey] = useState<string>('player_mortal');

  const [sheet, setSheet] = useState<AsepriteSheetData | null>(null);
  const [qa, setQa] = useState<CelQaReport | null>(null);
  const [baseTag, setBaseTag] = useState<string>('move');
  const [activeDir, setActiveDir] = useState<string>('s');
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [playing, setPlaying] = useState<boolean>(true);
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [currentFrameIdx, setCurrentFrameIdx] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgVersion, setImgVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/godot-prototype/assets/sprites/cel_manifest.json')
      .then((res) => (res.ok ? (res.json() as Promise<CelManifestDoc>) : null))
      .then((doc) => {
        if (active && doc && doc.actors.length > 0) {
          setActors(doc.actors);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const currentActor = useMemo(
    () => actors.find((a) => a.key === selectedActorKey) ?? actors[0],
    [actors, selectedActorKey],
  );

  const availableDirs = useMemo(() => {
    if (currentActor?.directions && currentActor.directions.length > 0) {
      return currentActor.directions;
    }
    if (sheet) {
      const detected = CLOCKWISE_8.filter((d) =>
        sheet.meta.frameTags.some((t) => t.name === `move_${d}` || t.name === `idle_${d}`),
      );
      if (detected.length > 0) return detected;
    }
    return ['s'];
  }, [currentActor, sheet]);

  const rotationOrder = useMemo(() => {
    const base = availableDirs.length >= 8 ? CLOCKWISE_8 : CLOCKWISE_4;
    const filtered = base.filter((d) => availableDirs.includes(d));
    return filtered.length > 0 ? filtered : availableDirs;
  }, [availableDirs]);

  useEffect(() => {
    if (!availableDirs.includes(activeDir)) {
      setActiveDir(availableDirs[0] ?? 's');
    }
  }, [availableDirs, activeDir]);

  useEffect(() => {
    if (!currentActor) return;
    let active = true;
    setSheet(null);
    setQa(null);

    fetch(`/godot-prototype/assets/sprites/${currentActor.json_file}`)
      .then((res) => (res.ok ? (res.json() as Promise<AsepriteSheetData>) : null))
      .then((data) => {
        if (!active || !data) return;
        setSheet(data);
        const baseTags = data.meta.frameTags.filter((t) => !t.name.includes('_'));
        const preferredBase = baseTags.find((t) => t.name === baseTag)
          ? baseTag
          : (baseTags.find((t) => t.name === 'move')?.name ?? baseTags[0]?.name ?? 'idle');
        setBaseTag(preferredBase);
      })
      .catch(() => {});

    fetch(`/godot-prototype/assets/sprites/${currentActor.qa_json}`)
      .then((res) => (res.ok ? (res.json() as Promise<CelQaReport>) : null))
      .then((data) => {
        if (active && data) setQa(data);
      })
      .catch(() => {});

    const img = new Image();
    img.onload = () => {
      if (!active) return;
      imgRef.current = img;
      setImgVersion((v) => v + 1);
    };
    img.src = `/godot-prototype/assets/sprites/${currentActor.file}`;

    return () => {
      active = false;
    };
  }, [currentActor]);

  const baseTagList = useMemo(() => {
    if (!sheet) return [];
    const bare = sheet.meta.frameTags.filter((t) => !t.name.includes('_'));
    return bare.length > 0 ? bare : sheet.meta.frameTags.slice(0, 6);
  }, [sheet]);

  const resolvedTagName = useMemo(() => {
    if (!sheet) return baseTag;
    const dirCandidate = `${baseTag}_${activeDir}`;
    if (sheet.meta.frameTags.some((t) => t.name === dirCandidate)) {
      return dirCandidate;
    }
    return baseTag;
  }, [sheet, baseTag, activeDir]);

  const tagObj = useMemo(() => {
    if (!sheet) return null;
    return (
      sheet.meta.frameTags.find((t) => t.name === resolvedTagName) ??
      sheet.meta.frameTags.find((t) => t.name === baseTag) ??
      sheet.meta.frameTags[0] ??
      null
    );
  }, [sheet, resolvedTagName, baseTag]);

  useEffect(() => {
    if (!tagObj) return;
    setCurrentFrameIdx(tagObj.from);
  }, [tagObj]);

  useEffect(() => {
    if (!sheet || !tagObj || !playing) return;
    const frame = sheet.frames[currentFrameIdx] ?? sheet.frames[tagObj.from];
    const baseMs = Math.max(40, frame?.duration ?? 95);
    const delayMs = Math.max(30, Math.round(baseMs / speed));
    const timer = window.setTimeout(() => {
      if (currentFrameIdx >= tagObj.to) {
        if (autoRotate && rotationOrder.length > 1) {
          setActiveDir((prev) => {
            const idx = rotationOrder.indexOf(prev);
            return rotationOrder[(idx + 1) % rotationOrder.length];
          });
        } else {
          setCurrentFrameIdx(tagObj.from);
        }
      } else {
        setCurrentFrameIdx((prev) => prev + 1);
      }
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [sheet, tagObj, playing, currentFrameIdx, speed, autoRotate, rotationOrder]);

  useEffect(() => {
    if (!imgRef.current || !canvasRef.current || !sheet) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frame = sheet.frames[currentFrameIdx] ?? sheet.frames[0];
    if (!frame) return;

    const fSize = frame.frame.h;
    const scale = fSize <= 64 ? 3 : 2;
    const drawSize = fSize * scale;
    const ox = Math.floor((canvas.width - drawSize) / 2);
    const oy = Math.floor((canvas.height - drawSize) / 2);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#080C0E';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(42, 58, 66, 0.35)';
    ctx.lineWidth = 1;
    for (let x = 32; x < canvas.width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 32; y < canvas.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(canvas.width, y + 0.5);
      ctx.stroke();
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      imgRef.current,
      frame.frame.x,
      frame.frame.y,
      frame.frame.w,
      frame.frame.h,
      ox,
      oy,
      drawSize,
      drawSize,
    );

    if (showGuides) {
      const anchorX = sheet.meta.anchor?.x ?? Math.floor(fSize / 2);
      const anchorY = sheet.meta.anchor?.y ?? (fSize === 96 ? 90 : 60);
      const cx = ox + anchorX * scale;
      const fy = oy + anchorY * scale;

      ctx.strokeStyle = 'rgba(232, 179, 74, 0.72)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(ox, fy + 0.5);
      ctx.lineTo(ox + drawSize, fy + 0.5);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(156, 224, 194, 0.55)';
      ctx.beginPath();
      ctx.moveTo(cx + 0.5, oy);
      ctx.lineTo(cx + 0.5, oy + drawSize);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#E8B34A';
      ctx.fillRect(cx - 2, fy - 2, 5, 5);
    }
  }, [imgVersion, sheet, currentFrameIdx, showGuides]);

  const activeFrame = sheet?.frames[currentFrameIdx] ?? null;

  const displayedQaTags = useMemo(() => {
    if (!qa) return [];
    const suffix = `_${activeDir}`;
    const matched = qa.tags.filter((t) => t.name.endsWith(suffix));
    if (matched.length > 0) return matched;
    return qa.tags.filter((t) => !t.name.includes('_'));
  }, [qa, activeDir]);

  const activeTagQa =
    qa?.tags.find((t) => t.name === resolvedTagName) ??
    qa?.tags.find((t) => t.name === baseTag) ??
    null;

  const maxFootDriftPx = qa
    ? qa.tags.reduce((acc, t) => Math.max(acc, t.footDriftPx), 0)
    : 0;
  const anchorX = qa?.anchorSpec.centerX ?? (currentActor.size === 96 ? 48 : 32);
  const anchorY = qa?.anchorSpec.footY ?? (currentActor.size === 96 ? 90 : 60);
  const dirCount = currentActor.direction_count ?? availableDirs.length;

  return (
    <section
      data-cel-inspector="true"
      className="bg-[#10171B] border border-[#243239]"
    >
      <div className="px-5 py-4 border-b border-[#243239] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-[#FAF6EA]">
            45° 俯视角多向流畅精灵检视器（主角 8 向 + 昼夜敌怪/Boss 4 向 · 共 {actors.length} 套）
          </h3>
          <p className="text-xs text-[#8A9A94] mt-1">
            躯干质心锁点 + 周期步态相位 + 2D 多行图集直连 <span className="font-mono text-[#EDE6D6]">InkSpriteBank</span> · 支持 8/4 向罗盘实测与 360° 自动转向
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onInspectScript('tools/aseprite/build_pipeline.sh')}
            className="px-3 py-1.5 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs font-semibold text-[#FAF6EA] cursor-pointer whitespace-nowrap"
          >
            查看管线脚本
          </button>
          <a
            href={`/godot-prototype/assets/sprites/${currentActor.file}`}
            download={currentActor.file}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E8B34A] hover:bg-[#F5D98A] text-[#0E1418] text-xs font-bold whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>下载当前图集</span>
          </a>
        </div>
      </div>

      {/* Actor Roster Switcher Strip */}
      <div className="px-5 py-3 bg-[#0C1215] border-b border-[#243239] flex flex-wrap items-center gap-2">
        {actors.map((actor) => {
          const active = actor.key === currentActor.key;
          const dirs = actor.direction_count ?? actor.directions?.length ?? 4;
          return (
            <button
              key={actor.key}
              type="button"
              data-cel-actor={actor.key}
              onClick={() => setSelectedActorKey(actor.key)}
              className={`px-3 py-1.5 text-xs font-semibold border cursor-pointer whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[#E8B34A] text-[#0E1418] border-[#E8B34A]'
                  : 'bg-[#10171B] text-[#B9B09A] border-[#26343B] hover:text-[#FAF6EA] hover:border-[#3A4D56]'
              }`}
            >
              {actor.name}
              <span
                className={`ml-1.5 font-num text-[11px] ${
                  active ? 'text-[#0E1418]/80' : 'text-[#9CE0C2]'
                }`}
              >
                {dirs}向
              </span>
              <span
                className={`ml-1 font-num text-[11px] ${
                  active ? 'text-[#0E1418]/70' : 'text-[#7F8E8A]'
                }`}
              >
                · {actor.size}px
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Canvas Player + 8/4-Way Compass */}
        <div className="lg:col-span-6 space-y-4 min-w-0">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <canvas
              ref={canvasRef}
              width={224}
              height={224}
              data-cel-canvas="true"
              className="w-56 h-56 border border-[#2C3C44] bg-[#080C0E] shrink-0"
              style={{ imageRendering: 'pixelated' }}
            />

            <div className="flex-1 min-w-0 space-y-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[#E8B34A] truncate">
                  {currentActor.name} · {dirCount} 方向 ({qa ? `${qa.dimensions.frameCount} 帧` : `${currentActor.size}px`})
                </div>
                <div className="font-mono text-sm text-[#FAF6EA] font-num">
                  {resolvedTagName} · 帧 #{currentFrameIdx}
                  {activeFrame ? ` (${activeFrame.duration} ms)` : ''}
                </div>
                <div className="text-xs text-[#8A9A94] font-num">
                  朝向 {DIR_LABELS_ZH[activeDir] ?? activeDir.toUpperCase()} · 锚点 ({anchorX}, {anchorY})
                </div>
              </div>

              {/* 3x3 Compass Direction Pad + Action Controls */}
              <div className="flex flex-wrap items-start gap-3">
                <div
                  data-compass-pad="true"
                  className="grid grid-cols-3 gap-1 bg-[#080C0E] p-1.5 border border-[#243239] shrink-0"
                >
                  {COMPASS_GRID.flat().map((cell) => {
                    if (cell === 'CENTER') {
                      return (
                        <button
                          key="center"
                          type="button"
                          data-auto-rotate="true"
                          title={autoRotate ? '停止 360° 自动转向' : '开启 360° 自动转向'}
                          onClick={() => setAutoRotate((v) => !v)}
                          className={`w-8 h-7 flex items-center justify-center border text-[11px] font-bold cursor-pointer transition-colors ${
                            autoRotate
                              ? 'bg-[#9CE0C2] text-[#0E1418] border-[#9CE0C2]'
                              : 'bg-[#141E23] text-[#B9B09A] border-[#2C3C44] hover:text-[#FAF6EA]'
                          }`}
                        >
                          <RotateCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
                        </button>
                      );
                    }
                    const enabled = availableDirs.includes(cell);
                    const selected = activeDir === cell;
                    return (
                      <button
                        key={cell}
                        type="button"
                        disabled={!enabled}
                        data-dir-btn={cell}
                        title={DIR_LABELS_ZH[cell] ?? cell.toUpperCase()}
                        onClick={() => {
                          setAutoRotate(false);
                          setActiveDir(cell);
                        }}
                        className={`w-8 h-7 font-mono text-[10px] font-bold border transition-colors ${
                          !enabled
                            ? 'bg-[#0A0F12] text-[#35444A] border-[#172025] cursor-not-allowed'
                            : selected
                              ? 'bg-[#E8B34A] text-[#0E1418] border-[#E8B34A] cursor-pointer'
                              : 'bg-[#10171B] text-[#B9B09A] border-[#26343B] hover:text-[#FAF6EA] hover:border-[#3E535D] cursor-pointer'
                        }`}
                      >
                        {cell.toUpperCase()}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2 min-w-[132px] flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPlaying((p) => !p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs font-semibold text-[#FAF6EA] cursor-pointer whitespace-nowrap"
                    >
                      {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      <span>{playing ? '暂停' : '播放'}</span>
                    </button>

                    <button
                      type="button"
                      data-toggle-guides="true"
                      onClick={() => setShowGuides((g) => !g)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                        showGuides
                          ? 'bg-[#223139] border-[#E8B34A] text-[#FAF6EA]'
                          : 'bg-[#10171B] border-[#344750] text-[#B9B09A]'
                      }`}
                    >
                      <Crosshair className="w-3 h-3 text-[#E8B34A]" />
                      <span>{showGuides ? '锚点开' : '锚点关'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAutoRotate((v) => !v)}
                    className={`w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 border text-[11px] font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                      autoRotate
                        ? 'bg-[#162C25] border-[#9CE0C2] text-[#9CE0C2]'
                        : 'bg-[#0C1215] border-[#26343B] text-[#B9B09A] hover:text-[#FAF6EA]'
                    }`}
                  >
                    <Compass className="w-3 h-3 shrink-0" />
                    <span>{autoRotate ? '360° 转向播放中' : '360° 自动转向'}</span>
                  </button>

                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[11px] text-[#8A9A94] whitespace-nowrap mr-0.5">倍速</span>
                    {[0.5, 1, 1.5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpeed(s)}
                        className={`px-2 py-0.5 text-[11px] font-num font-semibold border cursor-pointer whitespace-nowrap ${
                          speed === s
                            ? 'bg-[#E8B34A] text-[#0E1418] border-[#E8B34A]'
                            : 'bg-[#10171B] text-[#B9B09A] border-[#26343B] hover:text-[#FAF6EA]'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {activeTagQa && (
                <div className="pt-2 border-t border-[#1E2A30] text-xs text-[#B9B09A] font-num space-y-1">
                  <div className="whitespace-nowrap">
                    当前脚底漂移：
                    <span className="text-[#9CE0C2] font-semibold">
                      {activeTagQa.footDriftPx} px
                    </span>{' '}
                    (y=
                    {activeTagQa.footYMin === activeTagQa.footYMax
                      ? activeTagQa.footYMin
                      : `${activeTagQa.footYMin}–${activeTagQa.footYMax}`}
                    )
                  </div>
                  <div className="whitespace-nowrap">
                    帧间平滑幅值：{(activeTagQa.avgMotionDelta * 100).toFixed(1)}% · 最小{' '}
                    {(activeTagQa.minMotionDelta * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Base Action Tag Switcher Bar */}
          <div className="flex flex-wrap gap-1.5">
            {baseTagList.map((tag) => {
              const active = baseTag === tag.name;
              const fCount = tag.to - tag.from + 1;
              return (
                <button
                  key={tag.name}
                  type="button"
                  data-cel-tag={tag.name}
                  onClick={() => setBaseTag(tag.name)}
                  className={`px-3 py-1.5 text-xs font-semibold border cursor-pointer whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#E8B34A] text-[#0E1418] border-[#E8B34A]'
                      : 'bg-[#0C1215] text-[#B9B09A] border-[#26343B] hover:text-[#FAF6EA] hover:border-[#3A4D56]'
                  }`}
                >
                  {TAG_NAMES_ZH[tag.name] ?? tag.name} {tag.name} ({fCount}f)
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: QA Gate Summary + Active Direction Tag Metrics Table */}
        <div className="lg:col-span-6 space-y-4 min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 border border-[#243239] bg-[#0B1013] divide-y sm:divide-y-0 sm:divide-x divide-[#243239]">
            <div className="p-3.5">
              <div className="text-[11px] text-[#8A9A94]">QA 闸门状态</div>
              <div className="mt-1 font-num text-sm font-bold text-[#9CE0C2]">
                {qa ? (qa.passed ? '全部通过' : `${qa.errors.length} 项失败`) : '读取中'}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] text-[#8A9A94]">多向图集规模</div>
              <div className="mt-1 font-num text-sm font-bold text-[#FAF6EA]">
                {qa
                  ? `${dirCount}向 · ${qa.dimensions.frameCount} 帧`
                  : `${dirCount}向`}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] text-[#8A9A94]">
                {currentActor.allow_vermilion ? '朱红特征像素' : '朱红像素检测'}
              </div>
              <div className="mt-1 font-num text-sm font-bold text-[#FAF6EA]">
                {qa ? `${qa.vermilionPixels} px · ${qa.duplicatePairs} 重帧` : '—'}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] text-[#8A9A94]">最大脚底漂移</div>
              <div className="mt-1 font-num text-sm font-bold text-[#FAF6EA]">
                {qa ? `${maxFootDriftPx} px` : '—'}
              </div>
            </div>
          </div>

          <div className="border border-[#243239] overflow-x-auto">
            <div className="px-3.5 py-2 bg-[#0B1013] border-b border-[#243239] flex items-center justify-between text-[11px] text-[#8A9A94]">
              <span>
                当前朝向：<strong className="text-[#E8B34A]">{DIR_LABELS_ZH[activeDir] ?? activeDir.toUpperCase()}</strong>
              </span>
              <span className="font-num">
                图集 {qa ? `${qa.dimensions.width}×${qa.dimensions.height}` : '—'} · 共 {qa?.tags.length ?? 0} 组定向 Tag
              </span>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0C1215] border-b border-[#243239] text-[#8A9A94] whitespace-nowrap">
                  <th className="px-3.5 py-2 font-semibold">Aseprite Tag</th>
                  <th className="px-3.5 py-2 font-semibold">帧区间</th>
                  <th className="px-3.5 py-2 font-semibold text-right">帧数</th>
                  <th className="px-3.5 py-2 font-semibold text-right">脚底 Y 漂移</th>
                  <th className="px-3.5 py-2 font-semibold text-right">帧间动作幅值</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1B262C] font-num">
                {displayedQaTags.map((info) => {
                  const selected = info.name === resolvedTagName || info.name === baseTag;
                  const rowBase = info.name.includes('_') ? info.name.split('_')[0] : info.name;
                  return (
                    <tr
                      key={info.name}
                      onClick={() => setBaseTag(rowBase)}
                      className={`cursor-pointer transition-colors ${
                        selected
                          ? 'bg-[#19242A] text-[#FAF6EA]'
                          : 'bg-[#10171B] text-[#B9B09A] hover:bg-[#141E23]'
                      }`}
                    >
                      <td className="px-3.5 py-2 font-mono text-[#E8B34A]">{info.name}</td>
                      <td className="px-3.5 py-2">
                        {info.from} – {info.to}
                      </td>
                      <td className="px-3.5 py-2 text-right">{info.frameCount}</td>
                      <td className="px-3.5 py-2 text-right text-[#9CE0C2]">
                        {info.footDriftPx} px
                      </td>
                      <td className="px-3.5 py-2 text-right">
                        {(info.avgMotionDelta * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
