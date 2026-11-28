import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Download, Pause, Play } from 'lucide-react';

interface CelActorMeta {
  key: string;
  name: string;
  role: string;
  category: 'hero' | 'day_enemy' | 'day_elite';
  size: number;
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
    role: '凡界主角 · 120° 减速灯火锥',
    category: 'hero',
    size: 96,
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

export function CelSpriteInspector({
  onInspectScript,
}: {
  onInspectScript: (relPath: string) => void;
}) {
  const [actors, setActors] = useState<CelActorMeta[]>(FALLBACK_ACTORS);
  const [selectedActorKey, setSelectedActorKey] = useState<string>('player_mortal');

  const [sheet, setSheet] = useState<AsepriteSheetData | null>(null);
  const [qa, setQa] = useState<CelQaReport | null>(null);
  const [activeTag, setActiveTag] = useState<string>('move');
  const [speed, setSpeed] = useState<number>(1);
  const [playing, setPlaying] = useState<boolean>(true);
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [currentFrameIdx, setCurrentFrameIdx] = useState<number>(4);

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
        const preferred = data.meta.frameTags.find((t) => t.name === activeTag)
          ? activeTag
          : (data.meta.frameTags.find((t) => t.name === 'move')?.name ??
            data.meta.frameTags[0]?.name ??
            'idle');
        setActiveTag(preferred);
        const tag = data.meta.frameTags.find((t) => t.name === preferred) ?? data.meta.frameTags[0];
        if (tag) setCurrentFrameIdx(tag.from);
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

  const tagObj = useMemo(() => {
    if (!sheet) return null;
    return (
      sheet.meta.frameTags.find((t) => t.name === activeTag) ??
      sheet.meta.frameTags[0] ??
      null
    );
  }, [sheet, activeTag]);

  useEffect(() => {
    if (!tagObj) return;
    setCurrentFrameIdx(tagObj.from);
  }, [tagObj]);

  useEffect(() => {
    if (!sheet || !tagObj || !playing) return;
    const frame = sheet.frames[currentFrameIdx] ?? sheet.frames[tagObj.from];
    const baseMs = Math.max(40, frame?.duration ?? 100);
    const delayMs = Math.max(30, Math.round(baseMs / speed));
    const timer = window.setTimeout(() => {
      setCurrentFrameIdx((prev) =>
        prev >= tagObj.to ? tagObj.from : prev + 1,
      );
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [sheet, tagObj, playing, currentFrameIdx, speed]);

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
  const activeTagQa = qa?.tags.find((t) => t.name === activeTag) ?? null;
  const maxFootDriftPx = qa
    ? qa.tags.reduce((acc, t) => Math.max(acc, t.footDriftPx), 0)
    : 0;
  const anchorX = qa?.anchorSpec.centerX ?? (currentActor.size === 96 ? 48 : 32);
  const anchorY = qa?.anchorSpec.footY ?? (currentActor.size === 96 ? 90 : 60);

  return (
    <section
      data-cel-inspector="true"
      className="bg-[#10171B] border border-[#243239]"
    >
      <div className="px-5 py-4 border-b border-[#243239] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-[#FAF6EA]">
            45° 俯视角 Cel-Ink 多动作精灵检视器（三形态主角 + 白昼 4 怪 · 共 {actors.length} 套）
          </h3>
          <p className="text-xs text-[#8A9A94] mt-1">
            4× 超采样合成 + Aseprite JSON Tag 直连 <span className="font-mono text-[#EDE6D6]">InkSpriteBank</span> · 支持本地 <span className="font-mono text-[#EDE6D6]">$ASEPRITE</span> Lua/CLI 与 Python QA 自动验收
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
              <span className={`ml-1.5 font-num text-[11px] ${active ? 'text-[#0E1418]/75' : 'text-[#7F8E8A]'}`}>
                {actor.size}px
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Canvas Player */}
        <div className="lg:col-span-5 space-y-4">
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
                  {currentActor.name} · {currentActor.role}
                </div>
                <div className="font-mono text-sm text-[#FAF6EA] font-num">
                  {activeTag} · 帧 #{currentFrameIdx}
                  {activeFrame ? ` (${activeFrame.duration} ms)` : ''}
                </div>
                <div className="text-xs text-[#8A9A94] font-num whitespace-nowrap">
                  锚点 x={anchorX} · 脚底线 y={anchorY}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs font-semibold text-[#FAF6EA] cursor-pointer whitespace-nowrap"
                >
                  {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{playing ? '暂停' : '播放'}</span>
                </button>

                <button
                  type="button"
                  data-toggle-guides="true"
                  onClick={() => setShowGuides((g) => !g)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    showGuides
                      ? 'bg-[#223139] border-[#E8B34A] text-[#FAF6EA]'
                      : 'bg-[#10171B] border-[#344750] text-[#B9B09A]'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5 text-[#E8B34A]" />
                  <span>{showGuides ? '隐藏锚点标线' : '显示锚点标线'}</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#8A9A94] mr-1">倍速</span>
                {[0.5, 1, 1.5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    className={`px-2.5 py-1 text-xs font-num font-semibold border cursor-pointer whitespace-nowrap ${
                      speed === s
                        ? 'bg-[#E8B34A] text-[#0E1418] border-[#E8B34A]'
                        : 'bg-[#10171B] text-[#B9B09A] border-[#26343B] hover:text-[#FAF6EA]'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              {activeTagQa && (
                <div className="pt-2 border-t border-[#1E2A30] text-xs text-[#B9B09A] font-num space-y-1">
                  <div className="whitespace-nowrap">
                    当前脚底漂移：
                    <span className="text-[#9CE0C2] font-semibold">
                      {activeTagQa.footDriftPx} px
                    </span>{' '}
                    (y={activeTagQa.footYMin === activeTagQa.footYMax ? activeTagQa.footYMin : `${activeTagQa.footYMin}–${activeTagQa.footYMax}`})
                  </div>
                  <div className="whitespace-nowrap">
                    帧间动作：{(activeTagQa.avgMotionDelta * 100).toFixed(1)}% · 最小{' '}
                    {(activeTagQa.minMotionDelta * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tag Switcher Bar */}
          <div className="flex flex-wrap gap-1.5">
            {(sheet?.meta.frameTags ?? []).map((tag) => {
              const active = activeTag === tag.name;
              const fCount = tag.to - tag.from + 1;
              return (
                <button
                  key={tag.name}
                  type="button"
                  data-cel-tag={tag.name}
                  onClick={() => setActiveTag(tag.name)}
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

        {/* Right: QA Gate Summary + Tag Metrics Table */}
        <div className="lg:col-span-7 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 border border-[#243239] bg-[#0B1013] divide-y sm:divide-y-0 sm:divide-x divide-[#243239]">
            <div className="p-3.5">
              <div className="text-[11px] text-[#8A9A94]">QA 闸门状态</div>
              <div className="mt-1 font-num text-sm font-bold text-[#9CE0C2]">
                {qa ? (qa.passed ? '全部通过' : `${qa.errors.length} 项失败`) : '读取中'}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] text-[#8A9A94]">
                {currentActor.allow_vermilion ? '精英红眼像素' : '朱红像素检测'}
              </div>
              <div className="mt-1 font-num text-sm font-bold text-[#FAF6EA]">
                {qa ? `${qa.vermilionPixels} 像素` : '—'}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] text-[#8A9A94]">连续重复帧</div>
              <div className="mt-1 font-num text-sm font-bold text-[#FAF6EA]">
                {qa ? `${qa.duplicatePairs} 重复帧` : '—'}
              </div>
            </div>
            <div className="p-3.5">
              <div className="text-[11px] text-[#8A9A94]">最大脚底漂移</div>
              <div className="mt-1 font-num text-sm font-bold text-[#FAF6EA]">
                {qa ? `脚底漂移 ${maxFootDriftPx}px` : '—'}
              </div>
            </div>
          </div>

          <div className="border border-[#243239] overflow-x-auto">
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
                {qa &&
                  qa.tags.map((info) => {
                    const selected = info.name === activeTag;
                    return (
                      <tr
                        key={info.name}
                        onClick={() => setActiveTag(info.name)}
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
