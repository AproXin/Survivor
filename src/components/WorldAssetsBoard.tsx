import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Download, Eye, EyeOff, MapPin, Search } from 'lucide-react';

type MapMode = 'town' | 'mortal' | 'spectral';
type AssetCategory =
  | 'all'
  | 'tiles'
  | 'buildings'
  | 'props'
  | 'landmarks'
  | 'upgrades'
  | 'pickups';

interface AssetEntry {
  id: string;
  name: string;
  en: string;
  size: number;
  file: string;
  res_path: string;
  desc: string;
  category: Exclude<AssetCategory, 'all'>;
  subTag?: string;
}

interface WorldManifestDoc {
  version: string;
  safe_zone_bounds: { x: number; y: number; w: number; h: number };
  tiles: Array<Omit<AssetEntry, 'category'> & { zone?: string }>;
  buildings: Array<Omit<AssetEntry, 'category'> & { spot?: string }>;
  props: Array<Omit<AssetEntry, 'category'>>;
  landmarks: Array<Omit<AssetEntry, 'category'> & { realm?: string }>;
}

interface ItemsManifestDoc {
  version: string;
  upgrades: Array<Omit<AssetEntry, 'category'> & { category?: string }>;
  pickups: Array<Omit<AssetEntry, 'category'> & { kind?: string }>;
}

interface HotspotInfo {
  id: string;
  assetKey: string;
  assetKind: 'building' | 'prop' | 'landmark';
  name: string;
  en: string;
  x: number;
  y: number;
  action: string;
  lore: string;
}

const TOWN_HOTSPOTS: HotspotInfo[] = [
  {
    id: 'furnace',
    assetKey: 'ancestral_furnace',
    assetKind: 'building',
    name: '辟邪祖火青铜鼎坛',
    en: 'Ancestral Bronze Furnace',
    x: 0,
    y: 20,
    action: '[E] 参拜祖火 · 永久修习熬身 / 行步 / 芯火 / 聚灵',
    lore: '镇心长明祖火以松脂与香火资供奉，火光所及之处阴邪退避三舍。',
  },
  {
    id: 'north_gate',
    assetKey: 'north_gate',
    assetKind: 'building',
    name: '镇北铁门牌坊',
    en: 'North Iron Gate',
    x: 0,
    y: -210,
    action: '[E] / 向北跨门 · 领签出城步入乱葬岗守夜',
    lore: '铁门之外便是中元夜荒坟乱葬岗，出城后需恪守当夜三条阴戒。',
  },
  {
    id: 'oil_shop',
    assetKey: 'oil_shop',
    assetKind: 'building',
    name: '老油坊',
    en: 'Old Oil Press Shop',
    x: -265,
    y: 10,
    action: '[E] 调配当夜灯油（松脂清油 / 桐油烈芯 / 冥蜡冷芯）',
    lore: '西街百年油坊，出城前免费择一秘油灌入提灯，决定今夜行路流派。',
  },
  {
    id: 'paper_shop',
    assetKey: 'paper_shop',
    assetKind: 'building',
    name: '扎彩故铺',
    en: 'Paper-Craft Shop',
    x: 265,
    y: 10,
    action: '[E] 查阅九大阴戒录 / 购置纸扎替身符与安神符',
    lore: '东街老扎彩铺，门前悬满纸灯，专做替身草人与护身符箓。',
  },
  {
    id: 'tea_pavilion',
    assetKey: 'tea_pavilion',
    assetKind: 'building',
    name: '月下茶亭戏台（新扩）',
    en: 'Moonlit Tea Pavilion & Stage',
    x: -535,
    y: 20,
    action: '[E] 饮茶回满气血灯油 · 听云韶戏班守夜旧闻',
    lore: '西厢新扩建的飞檐茶亭与小戏台，旁列戏班长枪靠旗架与青瓷茶桌。',
  },
  {
    id: 'apothecary',
    assetKey: 'apothecary',
    assetKind: 'building',
    name: '济世药铺（新扩）',
    en: 'Apothecary Medicine Hall',
    x: 535,
    y: 20,
    action: '[E] 问诊补气 · 领取青艾糕与安神香解惑',
    lore: '东厢新扩建的老药铺，檐下悬葫芦招牌，门前青石香炉药香袅袅。',
  },
  {
    id: 'ancient_well',
    assetKey: 'ancient_well',
    assetKind: 'prop',
    name: '青苔古井（新扩南院）',
    en: 'Mossy Stone Well',
    x: -330,
    y: 290,
    action: '[E] 俯身照影静心 · 触发守夜前微语',
    lore: '南院苔藓庭院中的深井，井水清冽澄澈，映出六角提灯不摇的暖光。',
  },
  {
    id: 'notice_board',
    assetKey: 'notice_board',
    assetKind: 'prop',
    name: '镇南悬榜告示（新扩南院）',
    en: 'Night Watch Notice Board',
    x: 310,
    y: 270,
    action: '[E] 查阅乱葬岗守夜禁令与九忌提要',
    lore: '张贴渡墨镇守夜告示：闻锣莫窥暗潭，听三声叩门切莫轻启。',
  },
];

const WILD_HOTSPOTS_MORTAL: HotspotInfo[] = [
  {
    id: 'bridge',
    assetKey: 'stone_bridge',
    assetKind: 'landmark',
    name: '古镇石桥 · 东南暗潭',
    en: 'Old Stone Bridge',
    x: 380,
    y: 165,
    action: '人间形态：青石拱桥跨于幽潭之上',
    lore: '人间夜色下的古老石桥；一旦翻界入诡，将同址异化为纸扎冥河桥。',
  },
  {
    id: 'market',
    assetKey: 'ghost_market_stall',
    assetKind: 'landmark',
    name: '镇口荒市 · 西南坊口',
    en: 'Town Market Lane',
    x: -380,
    y: 155,
    action: '人间形态：收摊空棚；诡界异化为鬼市纸铺（掉落加成）',
    lore: '中元夜荒郊旧坊，翻界后鬼火灯笼骤亮，击杀敌怪额外掉落香火资与墨魄。',
  },
  {
    id: 'shrine',
    assetKey: 'gravestone_stele',
    assetKind: 'landmark',
    name: '老祠无字残碑 · 北境',
    en: 'Blank Gravestone Stele',
    x: 0,
    y: -170,
    action: '禁忌地标：莫在残碑前驻足（超过 3 秒破戒）',
    lore: '碑面空无一字，青苔漫生；入诡界后原地化作阴祠灵位祭坛。',
  },
  {
    id: 'spirit_gate',
    assetKey: 'spirit_gate',
    assetKind: 'landmark',
    name: '荒郊石阴门',
    en: 'Ancient Spirit Gate',
    x: -440,
    y: -145,
    action: '禁忌地标：三声叩门响起时切莫靠近启门',
    lore: '倾颓石牌坊半掩荒草，夜深时常传来空洞的三记叩门声。',
  },
  {
    id: 'ruined_wall',
    assetKey: 'ruined_wall',
    assetKind: 'landmark',
    name: '断垣残壁',
    en: 'Ruined Brick Wall',
    x: 420,
    y: -145,
    action: '禁忌地标：破晓前切莫越过断垣阴影',
    lore: '残破土砖断墙，墙后浓墨如渊，比墙这边更暗。',
  },
];

const WILD_HOTSPOTS_SPECTRAL: HotspotInfo[] = [
  {
    id: 'bridge',
    assetKey: 'styx_paper_bridge',
    assetKind: 'landmark',
    name: '冥河纸桥（同址异化）',
    en: 'Styx Paper Bridge',
    x: 380,
    y: 165,
    action: '诡界形态：惨白冥河纸桥 · 锣响切莫窥澜',
    lore: '古镇石桥在诡界中褪去石质，化为悬着幽绿纸灯的冥河白桥。',
  },
  {
    id: 'market',
    assetKey: 'ghost_market_stall',
    assetKind: 'landmark',
    name: '鬼市纸铺（同址异化）',
    en: 'Ghost Paper Market',
    x: -380,
    y: 155,
    action: '诡界增益：半径内击杀敌怪 +1 香火资与额外墨魄',
    lore: '幽绿纸灯映照纸灰石板，在鬼市收割执念可获丰厚香火回报。',
  },
  {
    id: 'shrine',
    assetKey: 'nether_altar',
    assetKind: 'landmark',
    name: '阴祠灵位（同址异化）',
    en: 'Nether Spirit Altar',
    x: 0,
    y: -170,
    action: '诡界形态：灵牌香烛并列，驻足积煞速度倍增',
    lore: '老祠无字残碑化作供奉排位的阴祠灵坛，煞气凝而不散。',
  },
  {
    id: 'spirit_gate',
    assetKey: 'spirit_gate',
    assetKind: 'landmark',
    name: '幽冥阴门',
    en: 'Spectral Spirit Gate',
    x: -440,
    y: -145,
    action: '诡界异象：送葬纸人鬼队过境通道',
    lore: '诡界中阴门大开，白纸差役与送葬鬼队常自此穿行。',
  },
  {
    id: 'ruined_wall',
    assetKey: 'ruined_wall',
    assetKind: 'landmark',
    name: '煞阵断垣',
    en: 'Crimson-Veined Wall',
    x: 420,
    y: -145,
    action: '纸扎判官点卯前不可逾越之界墙',
    lore: '墙基浮现朱纹玄石，判官降临后煞阵封锁方才松动。',
  },
];

const TOWN_LAYOUT_PROPS: Array<{ id: string; x: number; y: number; scale: number; glow?: boolean }> = [
  { id: 'ancient_locust_tree', x: -650, y: -145, scale: 1.35 },
  { id: 'ancient_locust_tree', x: 650, y: -145, scale: 1.35 },
  { id: 'ancient_locust_tree', x: -650, y: 355, scale: 1.42 },
  { id: 'ancient_locust_tree', x: 650, y: 355, scale: 1.42 },
  { id: 'courtyard_lantern', x: -112, y: -110, scale: 0.92, glow: true },
  { id: 'courtyard_lantern', x: 112, y: -110, scale: 0.92, glow: true },
  { id: 'courtyard_lantern', x: -112, y: 145, scale: 0.92, glow: true },
  { id: 'courtyard_lantern', x: 112, y: 145, scale: 0.92, glow: true },
  { id: 'courtyard_lantern', x: -112, y: 330, scale: 0.92, glow: true },
  { id: 'courtyard_lantern', x: 112, y: 330, scale: 0.92, glow: true },
  { id: 'street_lamp_post', x: -400, y: -115, scale: 1.0, glow: true },
  { id: 'street_lamp_post', x: 400, y: -115, scale: 1.0, glow: true },
  { id: 'street_lamp_post', x: -430, y: 210, scale: 1.0, glow: true },
  { id: 'street_lamp_post', x: 430, y: 210, scale: 1.0, glow: true },
  { id: 'oil_barrels', x: -362, y: 58, scale: 0.96 },
  { id: 'oil_barrels', x: -180, y: 68, scale: 0.85 },
  { id: 'tea_table', x: -565, y: 128, scale: 0.96 },
  { id: 'tea_table', x: -455, y: 128, scale: 0.96 },
  { id: 'opera_rack', x: -645, y: 35, scale: 0.98 },
  { id: 'incense_burner', x: 0, y: 118, scale: 0.9 },
  { id: 'incense_burner', x: 438, y: 96, scale: 0.86 },
  { id: 'bamboo_planter', x: 178, y: 62, scale: 0.86 },
  { id: 'bamboo_planter', x: 358, y: 62, scale: 0.86 },
  { id: 'bamboo_planter', x: -620, y: 118, scale: 0.86 },
  { id: 'bamboo_planter', x: 620, y: 118, scale: 0.86 },
  { id: 'ancient_well', x: -330, y: 290, scale: 1.12 },
  { id: 'notice_board', x: 310, y: 270, scale: 1.08 },
  { id: 'stone_bench', x: -215, y: 325, scale: 0.96 },
  { id: 'stone_bench', x: 215, y: 325, scale: 0.96 },
  { id: 'spirit_screen', x: 0, y: 415, scale: 1.24 },
];

const TOWN_BUILDINGS_LAYOUT = [
  { id: 'north_gate', spot: 'north_gate', label: '镇北铁门', x: 0, y: -210, w: 220, h: 220, yBias: -16 },
  { id: 'oil_shop', spot: 'oil_shop', label: '老油坊', x: -265, y: 10, w: 204, h: 204, yBias: 24 },
  { id: 'paper_shop', spot: 'paper_shop', label: '扎彩故铺', x: 265, y: 10, w: 204, h: 204, yBias: 24 },
  { id: 'tea_pavilion', spot: 'tea_pavilion', label: '月下茶亭戏台', x: -535, y: 20, w: 216, h: 216, yBias: 28 },
  { id: 'apothecary', spot: 'apothecary', label: '济世药铺', x: 535, y: 20, w: 204, h: 204, yBias: 24 },
  { id: 'ancestral_furnace', spot: 'furnace', label: '辟邪祖火', x: 0, y: 20, w: 176, h: 176, yBias: 16 },
];

export function WorldAssetsBoard({
  onInspectScript,
}: {
  onInspectScript: (relPath: string) => void;
}) {
  const [worldManifest, setWorldManifest] = useState<WorldManifestDoc | null>(null);
  const [itemsManifest, setItemsManifest] = useState<ItemsManifestDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mapMode, setMapMode] = useState<MapMode>('town');
  const [showHotspots, setShowHotspots] = useState<boolean>(true);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string>('furnace');

  const [activeCategory, setActiveCategory] = useState<AssetCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const [imagesReadyCount, setImagesReadyCount] = useState<number>(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/godot-prototype/assets/world/world_manifest.json').then((r) => {
        if (!r.ok) throw new Error(`world_manifest HTTP ${r.status}`);
        return r.json() as Promise<WorldManifestDoc>;
      }),
      fetch('/godot-prototype/assets/items/items_manifest.json').then((r) => {
        if (!r.ok) throw new Error(`items_manifest HTTP ${r.status}`);
        return r.json() as Promise<ItemsManifestDoc>;
      }),
    ])
      .then(([wm, im]) => {
        if (!active) return;
        setWorldManifest(wm);
        setItemsManifest(im);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : '加载地图与道具清单失败');
      });

    return () => {
      active = false;
    };
  }, []);

  const allAssets = useMemo<AssetEntry[]>(() => {
    if (!worldManifest || !itemsManifest) return [];
    const list: AssetEntry[] = [];
    for (const t of worldManifest.tiles) {
      list.push({ ...t, category: 'tiles', subTag: t.zone === 'town' ? '安全区地表' : t.zone === 'spectral' ? '诡界地表' : '荒野地表' });
    }
    for (const b of worldManifest.buildings) {
      list.push({ ...b, category: 'buildings', subTag: b.spot ? `热区:${b.spot}` : '安全区建筑' });
    }
    for (const p of worldManifest.props) {
      list.push({ ...p, category: 'props', subTag: '安全区庭院' });
    }
    for (const l of worldManifest.landmarks) {
      list.push({ ...l, category: 'landmarks', subTag: l.realm === 'spectral' ? '诡界地标' : l.realm === 'both' ? '双界通用' : '人间地标' });
    }
    for (const u of itemsManifest.upgrades) {
      list.push({ ...u, category: 'upgrades', subTag: u.category ?? '局内名物' });
    }
    for (const pk of itemsManifest.pickups) {
      list.push({ ...pk, category: 'pickups', subTag: pk.kind ?? '掉落消耗' });
    }
    return list;
  }, [worldManifest, itemsManifest]);

  // Preload all world & key pickup PNGs for live interactive canvas rendering
  useEffect(() => {
    if (allAssets.length === 0) return;
    let active = true;
    let loadedCount = 0;
    for (const asset of allAssets) {
      if (imagesRef.current[asset.id]) {
        loadedCount++;
        continue;
      }
      const img = new Image();
      img.onload = () => {
        if (!active) return;
        imagesRef.current[asset.id] = img;
        loadedCount++;
        setImagesReadyCount(loadedCount);
      };
      img.src = `/godot-prototype/assets/${asset.file}`;
    }
    if (loadedCount > 0) setImagesReadyCount(loadedCount);
    return () => {
      active = false;
    };
  }, [allAssets]);

  const currentHotspots = useMemo(() => {
    if (mapMode === 'town') return TOWN_HOTSPOTS;
    return mapMode === 'spectral' ? WILD_HOTSPOTS_SPECTRAL : WILD_HOTSPOTS_MORTAL;
  }, [mapMode]);

  useEffect(() => {
    if (!currentHotspots.some((h) => h.id === selectedHotspotId)) {
      setSelectedHotspotId(currentHotspots[0]?.id ?? 'furnace');
    }
  }, [currentHotspots, selectedHotspotId]);

  const selectedHotspot = useMemo(
    () => currentHotspots.find((h) => h.id === selectedHotspotId) ?? currentHotspots[0],
    [currentHotspots, selectedHotspotId],
  );

  // Coordinate transform helpers matching Godot's world coordinates -> 920x500 canvas
  const worldToCanvas = (wx: number, wy: number, mode: MapMode) => {
    if (mode === 'town') {
      // Town world: x in [-810, 810] (1620w), y in [-310, 520] (830h)
      const scale = 0.545;
      return {
        cx: 460 + wx * scale,
        cy: 192 + wy * scale,
        scale,
      };
    }
    const scale = 0.78;
    return {
      cx: 460 + wx * scale,
      cy: 252 + wy * scale,
      scale,
    };
  };

  // Interactive live canvas rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const imgs = imagesRef.current;

    const drawTiled = (
      img: HTMLImageElement | undefined,
      x: number,
      y: number,
      w: number,
      h: number,
      tileSz: number,
      alpha = 1,
    ) => {
      if (!img) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = false;
      const startX = Math.floor(x / tileSz) * tileSz;
      const startY = Math.floor(y / tileSz) * tileSz;
      for (let ty = startY; ty < y + h; ty += tileSz) {
        for (let tx = startX; tx < x + w; tx += tileSz) {
          ctx.drawImage(img, tx, ty, tileSz, tileSz);
        }
      }
      ctx.restore();
    };

    const drawGlow = (x: number, y: number, r: number, rgbaInner: string, rgbaOuter: string) => {
      const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, rgbaInner);
      grad.addColorStop(1, rgbaOuter);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const render = (now: number) => {
      const t = now * 0.001;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#070B0D';
      ctx.fillRect(0, 0, W, H);

      if (mapMode === 'town') {
        const { scale } = worldToCanvas(0, 0, 'town');
        const tl = worldToCanvas(-760, -240, 'town');
        const br = worldToCanvas(760, 480, 'town');
        const tw = br.cx - tl.cx;
        const th = br.cy - tl.cy;
        const tilePx = 64 * scale;

        // 1. Base wet bluestone floor
        drawTiled(imgs['town_bluestone'], tl.cx - 12, tl.cy - 12, tw + 24, th + 24, tilePx, 0.94);

        // 2. South garden mossy cobbles
        const sgTop = worldToCanvas(-736, 210, 'town');
        drawTiled(
          imgs['town_moss_cobble'],
          sgTop.cx,
          sgTop.cy,
          (1472) * scale,
          (270) * scale,
          tilePx,
          0.92,
        );

        // 3. Weathered timber decks under the 4 flanking buildings
        const verandas = [
          [-640, -96, 210, 160],
          [-370, -96, 210, 160],
          [160, -96, 210, 160],
          [430, -96, 210, 160],
        ];
        for (const [vx, vy, vw, vh] of verandas) {
          const vp = worldToCanvas(vx, vy, 'town');
          drawTiled(imgs['town_timber_deck'], vp.cx, vp.cy, vw * scale, vh * scale, tilePx, 0.96);
          ctx.strokeStyle = 'rgba(6, 9, 11, 0.65)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(vp.cx, vp.cy, vw * scale, vh * scale);
        }

        // 4. Central ceremonial avenue
        const avTop = worldToCanvas(-84, -260, 'town');
        drawTiled(
          imgs['town_avenue'],
          avTop.cx,
          avTop.cy,
          168 * scale,
          760 * scale,
          tilePx,
          0.78,
        );
        ctx.strokeStyle = 'rgba(12, 18, 22, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(avTop.cx, avTop.cy, 168 * scale, 760 * scale);

        // 5. Perimeter bluestone walls (open at North Gate)
        ctx.fillStyle = '#334040';
        const wallH = 14;
        const gateL = worldToCanvas(-95, -240, 'town').cx;
        const gateR = worldToCanvas(95, -240, 'town').cx;
        ctx.fillRect(tl.cx - 14, tl.cy - wallH, gateL - (tl.cx - 14), wallH);
        ctx.fillRect(gateR, tl.cy - wallH, br.cx + 14 - gateR, wallH);
        ctx.fillRect(tl.cx - 14, br.cy, tw + 28, wallH);
        ctx.fillRect(tl.cx - 14, tl.cy - wallH, 14, th + wallH * 2);
        ctx.fillRect(br.cx, tl.cy - wallH, 14, th + wallH * 2);

        // 6. Warm pulsing lantern glow pools
        const flicker = 1 + Math.sin(t * 4.5) * 0.06;
        for (const p of TOWN_LAYOUT_PROPS) {
          if (p.glow) {
            const pt = worldToCanvas(p.x, p.y - 26, 'town');
            drawGlow(pt.cx, pt.cy, 54 * flicker, 'rgba(232, 179, 74, 0.28)', 'rgba(232, 179, 74, 0)');
          }
        }
        const furnPt = worldToCanvas(0, -10, 'town');
        drawGlow(furnPt.cx, furnPt.cy, 108 * flicker, 'rgba(245, 217, 138, 0.34)', 'rgba(232, 179, 74, 0)');

        // 7. Y-sorted Buildings + 30 Props
        type DrawCmd = { y: number; draw: () => void };
        const queue: DrawCmd[] = [];

        for (const b of TOWN_BUILDINGS_LAYOUT) {
          const pt = worldToCanvas(b.x, b.y, 'town');
          const img = imgs[b.id];
          const dw = b.w * scale;
          const dh = b.h * scale;
          const isSel = selectedHotspotId === b.spot;
          queue.push({
            y: b.y + b.yBias,
            draw: () => {
              if (showHotspots) {
                ctx.beginPath();
                ctx.arc(pt.cx, pt.cy + 6, isSel ? 46 : 36, 0, Math.PI * 2);
                ctx.fillStyle = isSel ? 'rgba(232, 179, 74, 0.16)' : 'rgba(156, 224, 194, 0.07)';
                ctx.fill();
                ctx.strokeStyle = isSel ? '#F5D98A' : 'rgba(232, 179, 74, 0.42)';
                ctx.lineWidth = isSel ? 2 : 1;
                ctx.stroke();
              }
              ctx.fillStyle = 'rgba(6, 9, 11, 0.38)';
              ctx.beginPath();
              ctx.ellipse(pt.cx, pt.cy + 10, dw * 0.36, dh * 0.14, 0, 0, Math.PI * 2);
              ctx.fill();
              if (img) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, pt.cx - dw * 0.5, pt.cy - dh + 18, dw, dh);
              }
              // Building label
              ctx.font = '600 11px "Noto Serif SC", serif';
              const twLbl = ctx.measureText(b.label).width;
              const ly = b.id === 'ancestral_furnace' ? pt.cy + 28 : pt.cy - dh + 20;
              ctx.fillStyle = isSel ? 'rgba(232, 179, 74, 0.94)' : 'rgba(11, 16, 19, 0.84)';
              ctx.fillRect(pt.cx - twLbl * 0.5 - 6, ly - 11, twLbl + 12, 16);
              ctx.strokeStyle = isSel ? '#FAF6EA' : 'rgba(138, 154, 148, 0.45)';
              ctx.lineWidth = 1;
              ctx.strokeRect(pt.cx - twLbl * 0.5 - 6, ly - 11, twLbl + 12, 16);
              ctx.fillStyle = isSel ? '#0E1418' : '#EDE6D6';
              ctx.textAlign = 'center';
              ctx.fillText(b.label, pt.cx, ly + 1);
            },
          });
        }

        for (const p of TOWN_LAYOUT_PROPS) {
          const pt = worldToCanvas(p.x, p.y, 'town');
          const img = imgs[p.id];
          const baseSz = p.id === 'ancient_locust_tree' || p.id === 'spirit_screen' ? 128 : 92;
          const dsz = baseSz * p.scale * scale;
          const isHot = p.id === 'ancient_well' || p.id === 'notice_board';
          const isSel = selectedHotspotId === p.id;
          queue.push({
            y: p.y,
            draw: () => {
              if (showHotspots && isHot) {
                ctx.beginPath();
                ctx.arc(pt.cx, pt.cy + 4, isSel ? 34 : 26, 0, Math.PI * 2);
                ctx.fillStyle = isSel ? 'rgba(232, 179, 74, 0.18)' : 'rgba(156, 224, 194, 0.08)';
                ctx.fill();
                ctx.strokeStyle = isSel ? '#F5D98A' : 'rgba(232, 179, 74, 0.45)';
                ctx.lineWidth = isSel ? 2 : 1;
                ctx.stroke();
              }
              ctx.fillStyle = 'rgba(6, 9, 11, 0.34)';
              ctx.beginPath();
              ctx.ellipse(pt.cx, pt.cy + 4, dsz * 0.28, dsz * 0.11, 0, 0, Math.PI * 2);
              ctx.fill();
              if (img) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, pt.cx - dsz * 0.5, pt.cy - dsz + 10, dsz, dsz);
              }
              if (isHot) {
                const lbl = p.id === 'ancient_well' ? '青苔古井' : '悬榜告示';
                ctx.font = '600 10px "Noto Serif SC", serif';
                const twLbl = ctx.measureText(lbl).width;
                ctx.fillStyle = isSel ? 'rgba(232, 179, 74, 0.94)' : 'rgba(11, 16, 19, 0.82)';
                ctx.fillRect(pt.cx - twLbl * 0.5 - 5, pt.cy + 8, twLbl + 10, 15);
                ctx.fillStyle = isSel ? '#0E1418' : '#EDE6D6';
                ctx.textAlign = 'center';
                ctx.fillText(lbl, pt.cx, pt.cy + 19);
              }
            },
          });
        }

        queue.sort((a, b) => a.y - b.y);
        for (const cmd of queue) cmd.draw();

        // 8. Animated rising golden embers above the Ancestral Furnace
        for (let i = 0; i < 10; i++) {
          const ph = (t * 0.42 + i * 0.13) % 1;
          const ex = furnPt.cx + Math.sin(t * 2.4 + i * 1.9) * (10 + ph * 16);
          const ey = furnPt.cy - 12 - ph * 58;
          ctx.fillStyle = `rgba(245, 217, 138, ${(1 - ph) * 0.8})`;
          ctx.beginPath();
          ctx.arc(ex, ey, (1 - ph) * 2.2 + 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Mortal Wilderness vs Spectral Dual-Realm live diorama
        const isSpec = mapMode === 'spectral';
        const baseTile = isSpec ? imgs['spectral_cracked_stone'] : imgs['wild_grave_earth'];
        const grassTile = isSpec ? imgs['spectral_paper_ash'] : imgs['wild_mountain_grass'];
        const roadTile = isSpec ? imgs['spectral_blood_slate'] : imgs['wild_dirt_road'];
        const pondTile = isSpec ? imgs['spectral_styx_water'] : imgs['wild_dark_pond'];

        drawTiled(baseTile, 0, 0, W, H, 64, 0.9);
        // Southwest market patch
        drawTiled(grassTile, 30, 270, 320, 210, 64, isSpec ? 0.65 : 0.72);
        // Central winding road
        drawTiled(roadTile, 405, 0, 110, H, 64, isSpec ? 0.62 : 0.78);
        // Southeast pond / Styx water
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(756, 390, 148, 84, 0, 0, Math.PI * 2);
        ctx.clip();
        drawTiled(pondTile, 600, 300, 320, 180, 64, 0.92);
        ctx.restore();
        ctx.strokeStyle = isSpec ? 'rgba(200, 64, 42, 0.52)' : 'rgba(110, 127, 116, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(756, 390, 148, 84, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Scatter bamboo groves & xp gems for environmental atmosphere
        const decoBamboos = [
          [-510, 12],
          [-230, -195],
          [245, -185],
          [510, 45],
          [-165, 225],
          [170, 240],
        ];
        for (const [bx, by] of decoBamboos) {
          const bp = worldToCanvas(bx, by, mapMode);
          const bImg = imgs['bamboo_grove'];
          if (bImg) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(bImg, bp.cx - 44, bp.cy - 82, 88, 88);
          }
        }

        // Floating jade XP gems & incense coins
        const drops = [
          { key: 'xp_gem_small', x: -120, y: 40 },
          { key: 'xp_gem_large', x: 140, y: -30 },
          { key: 'incense_coin', x: -240, y: 120 },
          { key: 'magistrate_chest', x: 185, y: 115 },
        ];
        for (const d of drops) {
          const dp = worldToCanvas(d.x, d.y, mapMode);
          const bob = Math.sin(t * 3.5 + d.x * 0.05) * 3;
          drawGlow(
            dp.cx,
            dp.cy + bob,
            24,
            d.key.includes('xp') ? 'rgba(87, 185, 106, 0.35)' : 'rgba(232, 179, 74, 0.32)',
            'rgba(0,0,0,0)',
          );
          const dImg = imgs[d.key];
          if (dImg) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(dImg, dp.cx - 15, dp.cy - 15 + bob, 30, 30);
          }
        }

        // Dual-Realm interactive landmarks
        const spots = isSpec ? WILD_HOTSPOTS_SPECTRAL : WILD_HOTSPOTS_MORTAL;
        for (const sp of spots) {
          const pt = worldToCanvas(sp.x, sp.y, mapMode);
          const isSel = selectedHotspotId === sp.id;
          if (showHotspots) {
            ctx.beginPath();
            ctx.arc(pt.cx, pt.cy, isSel ? 66 : 54, 0, Math.PI * 2);
            ctx.fillStyle = isSel
              ? isSpec
                ? 'rgba(200, 64, 42, 0.20)'
                : 'rgba(232, 179, 74, 0.16)'
              : 'rgba(138, 154, 148, 0.08)';
            ctx.fill();
            ctx.strokeStyle = isSel
              ? isSpec
                ? '#E4654A'
                : '#F5D98A'
              : isSpec
                ? 'rgba(200, 64, 42, 0.45)'
                : 'rgba(147, 168, 148, 0.42)';
            ctx.lineWidth = isSel ? 2 : 1.2;
            ctx.stroke();
          }
          const img = imgs[sp.assetKey];
          if (img) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, pt.cx - 62, pt.cy - 86, 124, 124);
          }
          ctx.font = '600 11px "Noto Serif SC", serif';
          const shortLbl = sp.name.split(' · ')[0];
          const twLbl = ctx.measureText(shortLbl).width;
          ctx.fillStyle = isSel ? (isSpec ? '#C8402A' : '#E8B34A') : 'rgba(11, 16, 19, 0.86)';
          ctx.fillRect(pt.cx - twLbl * 0.5 - 6, pt.cy + 26, twLbl + 12, 17);
          ctx.fillStyle = isSel ? (isSpec ? '#FAF6EA' : '#0E1418') : '#EDE6D6';
          ctx.textAlign = 'center';
          ctx.fillText(shortLbl, pt.cx, pt.cy + 39);
        }

        // Subtle atmospheric moon vignette for spectral vs mortal
        if (isSpec) {
          ctx.fillStyle = 'rgba(22, 12, 18, 0.16)';
          ctx.fillRect(0, 0, W, H);
        }
      }

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(rafId);
  }, [mapMode, showHotspots, selectedHotspotId, imagesReadyCount]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    let bestId = selectedHotspotId;
    let bestDist = 72;
    for (const h of currentHotspots) {
      const pt = worldToCanvas(h.x, h.y, mapMode);
      const d = Math.hypot(x - pt.cx, y - pt.cy);
      if (d < bestDist) {
        bestDist = d;
        bestId = h.id;
      }
    }
    setSelectedHotspotId(bestId);
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<AssetCategory, number> = {
      all: allAssets.length,
      tiles: 0,
      buildings: 0,
      props: 0,
      landmarks: 0,
      upgrades: 0,
      pickups: 0,
    };
    for (const a of allAssets) counts[a.category]++;
    return counts;
  }, [allAssets]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allAssets.filter((a) => {
      if (activeCategory !== 'all' && a.category !== activeCategory) return false;
      if (!q) return true;
      return (
        a.id.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.en.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q)
      );
    });
  }, [allAssets, activeCategory, searchQuery]);

  const selectedAssetObj = useMemo(
    () => allAssets.find((a) => a.id === selectedHotspot?.assetKey) ?? null,
    [allAssets, selectedHotspot],
  );

  return (
    <div className="space-y-8">
      {loadError && (
        <div className="p-4 bg-[#261412] border border-[#7C1E10] text-sm text-[#FAF6EA]">
          地图与道具清单加载失败：{loadError}
        </div>
      )}

      {/* TOP PANEL: INTERACTIVE EXPANDED SAFE ZONE & DUAL-REALM LIVE MAP */}
      <section className="bg-[#10171B] border border-[#243239]">
        <div className="px-5 py-4 border-b border-[#243239] flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#FAF6EA]">
              扩建美化安全区实景与双界地图预览（1520×720 渡墨镇）
            </h2>
            <p className="mt-1 text-xs text-[#8A9A94]">
              画布直接加载 Godot 实机切出的 64×64  seamless 地表瓦片、6 座建筑与 30 处庭院物件，点击画布地标可查看交互配置。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center border border-[#243239] bg-[#0B1013]">
              {(
                [
                  { id: 'town', label: '渡墨镇安全区' },
                  { id: 'mortal', label: '人间荒野' },
                  { id: 'spectral', label: '诡界异化' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  data-map-mode={m.id}
                  onClick={() => setMapMode(m.id)}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                    mapMode === m.id
                      ? m.id === 'spectral'
                        ? 'bg-[#C8402A] text-[#FAF6EA] font-bold'
                        : 'bg-[#E8B34A] text-[#0E1418] font-bold'
                      : 'text-[#B9B09A] hover:text-[#FAF6EA]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowHotspots((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors whitespace-nowrap ${
                showHotspots
                  ? 'bg-[#162C25] border-[#9CE0C2] text-[#9CE0C2]'
                  : 'bg-[#0B1013] border-[#243239] text-[#B9B09A] hover:text-[#FAF6EA]'
              }`}
            >
              {showHotspots ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{showHotspots ? '交互热区：开' : '交互热区：关'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Interactive Map Canvas */}
          <div className="lg:col-span-8 bg-[#070B0D] border-b lg:border-b-0 lg:border-r border-[#243239] p-3 flex flex-col justify-center">
            <canvas
              ref={canvasRef}
              width={920}
              height={500}
              onClick={handleCanvasClick}
              data-world-map-canvas="true"
              className="w-full h-auto block cursor-pointer border border-[#1E2A30]"
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8A9A94] px-1">
              <span>
                {mapMode === 'town'
                  ? '安全区范围从 880×480 扩建至 1520×720（+259% 面积），保留镇北铁门 y≤-185 自动化测试契约'
                  : mapMode === 'mortal'
                    ? '人间荒野：荒坟黑土、碎石古道、山林荒草与东南暗潭，含古镇石桥 / 残碑 / 阴门 / 断垣'
                    : '诡界同址异化：石桥→冥河纸桥、集市→鬼市纸铺（掉落加成）、无字残碑→阴祠灵位'}
              </span>
              <span className="font-num text-[#B9B09A]">
                已加载实机纹理：{imagesReadyCount} / {allAssets.length || 66}
              </span>
            </div>
          </div>

          {/* Right Hotspot Inspector */}
          <div className="lg:col-span-4 flex flex-col justify-between bg-[#10171B]">
            {selectedHotspot && (
              <div className="p-5 space-y-4 border-b border-[#243239]">
                <div className="flex items-start gap-3.5">
                  <div
                    className="w-20 h-20 shrink-0 border border-[#2A3A42] flex items-center justify-center p-1.5"
                    style={{
                      backgroundImage:
                        'repeating-conic-gradient(#131C21 0% 25%, #1A262D 0% 50%)',
                      backgroundSize: '12px 12px',
                    }}
                  >
                    {selectedAssetObj && (
                      <img
                        src={`/godot-prototype/assets/${selectedAssetObj.file}`}
                        alt={selectedHotspot.name}
                        referrerPolicy="no-referrer"
                        className="max-w-full max-h-full object-contain"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-[#FAF6EA]">{selectedHotspot.name}</div>
                    <div className="text-[11px] text-[#8A9A94] font-mono mt-0.5">
                      {selectedHotspot.en}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-num text-[#E8B34A]">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>
                        Godot 坐标 ({selectedHotspot.x}, {selectedHotspot.y})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-[#0B1013] border border-[#1E2A30] space-y-1.5">
                  <div className="text-[11px] text-[#9CE0C2] font-medium">
                    {selectedHotspot.action}
                  </div>
                  <p className="text-xs text-[#B9B09A] leading-relaxed">{selectedHotspot.lore}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onInspectScript('scripts/world_asset_bank.gd')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs text-[#FAF6EA] cursor-pointer whitespace-nowrap"
                  >
                    <Code2 className="w-3.5 h-3.5 text-[#E8B34A]" />
                    <span>world_asset_bank.gd</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onInspectScript('scripts/renderer.gd')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#19242A] hover:bg-[#223139] border border-[#344750] text-xs text-[#B9B09A] hover:text-[#FAF6EA] cursor-pointer whitespace-nowrap"
                  >
                    <span>renderer.gd</span>
                  </button>
                </div>
              </div>
            )}

            {/* Quick Hotspot List */}
            <div className="p-4 flex-1 overflow-y-auto max-h-64">
              <div className="text-[11px] text-[#8A9A94] mb-2">
                {mapMode === 'town' ? '渡墨镇 8 处交互地标' : '荒野 5 处双界地标'}（点击定位）
              </div>
              <div className="space-y-1">
                {currentHotspots.map((h) => {
                  const active = h.id === selectedHotspotId;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setSelectedHotspotId(h.id)}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#19242A] text-[#FAF6EA] border-l-2 border-l-[#E8B34A]'
                          : 'text-[#B9B09A] hover:bg-[#141E23] hover:text-[#FAF6EA]'
                      }`}
                    >
                      <span className="truncate font-medium">{h.name}</span>
                      <span className="font-num text-[11px] text-[#8A9A94] shrink-0">
                        {h.x},{h.y}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BOTTOM PANEL: 66-ASSET FILTERABLE MAP, SAFE ZONE & ITEM ATLAS */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-[#FAF6EA]">
              全量地图瓦片、安全区物件与局内道具图集（共 {allAssets.length} 项）
            </h3>
            <p className="mt-1 text-xs text-[#8A9A94]">
              全部 PNG 已同步写入 <span className="font-mono text-[#B9B09A]">assets/world/</span>、
              <span className="font-mono text-[#B9B09A]">assets/items/</span> 与 Godot 工程包，由{' '}
              <span className="font-mono text-[#B9B09A]">InkWorldAssetBank</span> 自动加载。
            </p>
          </div>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-[#8A9A94] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索瓦片 / 建筑 / 道具名称..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#10171B] border border-[#243239] text-xs text-[#FAF6EA] placeholder-[#6E7D78] focus:outline-none focus:border-[#E8B34A]"
            />
          </div>
        </div>

        {/* Segmented Category Filter */}
        <div className="flex flex-wrap items-center border border-[#243239] bg-[#10171B] divide-x divide-[#243239]">
          {(
            [
              { id: 'all', label: '全部资源' },
              { id: 'tiles', label: '地表瓦片' },
              { id: 'buildings', label: '安全区建筑' },
              { id: 'props', label: '庭院物件' },
              { id: 'landmarks', label: '荒野双界地标' },
              { id: 'upgrades', label: '升级名物' },
              { id: 'pickups', label: '掉落与消耗品' },
            ] as const
          ).map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                data-asset-filter={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-2 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#E8B34A] text-[#0E1418] font-bold'
                    : 'text-[#B9B09A] hover:text-[#FAF6EA] hover:bg-[#141E23]'
                }`}
              >
                {cat.label} <span className="font-num opacity-80">({categoryCounts[cat.id]})</span>
              </button>
            );
          })}
        </div>

        {/* Asset Cards Grid */}
        <div
          data-world-asset-grid="true"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5"
        >
          {filteredAssets.map((asset) => {
            const imgUrl = `/godot-prototype/assets/${asset.file}`;
            const isTile = asset.category === 'tiles';
            return (
              <article
                key={`${asset.category}:${asset.id}`}
                className="bg-[#10171B] border border-[#243239] flex flex-col justify-between"
              >
                <div className="p-3.5 flex items-start gap-3">
                  <div
                    className="w-16 h-16 shrink-0 border border-[#26343B] flex items-center justify-center overflow-hidden"
                    style={
                      isTile
                        ? { backgroundColor: '#0B1013' }
                        : {
                            backgroundImage:
                              'repeating-conic-gradient(#121B20 0% 25%, #1A262D 0% 50%)',
                            backgroundSize: '10px 10px',
                          }
                    }
                  >
                    <img
                      src={imgUrl}
                      alt={asset.name}
                      referrerPolicy="no-referrer"
                      className={isTile ? 'w-full h-full object-cover' : 'max-w-[58px] max-h-[58px] object-contain'}
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-[#FAF6EA] truncate">{asset.name}</div>
                    <div className="text-[11px] font-mono text-[#E8B34A] truncate mt-0.5">
                      {asset.id}
                    </div>
                    <div className="mt-1 font-num text-[11px] text-[#8A9A94]">
                      {asset.size}×{asset.size} · {asset.subTag}
                    </div>
                  </div>
                </div>

                <div className="px-3.5 pb-3 text-[11px] text-[#B9B09A] leading-relaxed">
                  {asset.desc}
                </div>

                <div className="px-3.5 py-2 border-t border-[#1C272D] bg-[#0C1215] flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-[#8A9A94] truncate">
                    {asset.res_path}
                  </span>
                  <a
                    href={imgUrl}
                    download={`${asset.id}.png`}
                    className="inline-flex items-center gap-1 text-[11px] text-[#E8B34A] hover:text-[#F5D98A] shrink-0"
                  >
                    <Download className="w-3 h-3" />
                    <span>PNG</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
