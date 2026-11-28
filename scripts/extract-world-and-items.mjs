#!/usr/bin/env node
/**
 * Ink Night: Map Tiles, Expanded Safe Zone Architecture/Props, Wilderness Landmarks & Item Icon Extractor
 *
 * Extracts all 66 production pixel-art assets from the 6 generated 45° top-down sheets:
 *   - 12 seamless 64×64 ground tiles       -> assets/world/tiles/<id>.png
 *   -  6 Safe Zone 192×192 buildings       -> assets/world/buildings/<id>.png
 *   - 12 Safe Zone 96×96 courtyard props   -> assets/world/props/<id>.png
 *   -  8 Wilderness/Dual-Realm 128×128     -> assets/world/landmarks/<id>.png
 *   - 16 Upgrade Relic 64×64 icons         -> assets/items/<id>.png
 *   - 12 Pickup / Oil / Charm 64×64 icons  -> assets/items/<id>.png
 *
 * Outputs symmetrically to BOTH `godot-prototype/assets/` AND root `assets/` (for GitHub Sync + ZIP).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const GODOT_DIR = path.join(ROOT, 'godot-prototype');
const IMG_DIR = path.join(ROOT, 'src/assets/images');

const TARGET_ASSET_ROOTS = [path.join(GODOT_DIR, 'assets')];
if (fs.existsSync(path.join(ROOT, 'project.godot'))) {
  TARGET_ASSET_ROOTS.push(path.join(ROOT, 'assets'));
}

function writeAsset(relPath, content) {
  for (const base of TARGET_ASSET_ROOTS) {
    const out = path.join(base, relPath);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content);
  }
}

// ---------------- PNG Encoder (8-bit RGBA) ----------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}

function encodePngRgba(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---------------- Image Loading & Alpha Extraction ----------------
function loadJpgRgba(filePath) {
  const dims = execFileSync('identify', ['-format', '%w %h', filePath], { encoding: 'utf8' }).trim().split(/\s+/);
  const w = Number(dims[0]);
  const h = Number(dims[1]);
  const rgba = execFileSync('convert', [filePath, '-depth', '8', 'rgba:-'], { maxBuffer: 64 * 1024 * 1024 });
  return { w, h, rgba };
}

function buildBgMask(sheet, { tol = 42, removeHoles = true, defringe = true } = {}) {
  const { w, h, rgba } = sheet;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
  const bgR = Math.round(corners.reduce((a, o) => a + rgba[o], 0) / 4);
  const bgG = Math.round(corners.reduce((a, o) => a + rgba[o + 1], 0) / 4);
  const bgB = Math.round(corners.reduce((a, o) => a + rgba[o + 2], 0) / 4);

  const isBg = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const tryPush = (x, y) => {
    const idx = y * w + x;
    if (isBg[idx]) return;
    const o = idx * 4;
    if (Math.abs(rgba[o] - bgR) + Math.abs(rgba[o + 1] - bgG) + Math.abs(rgba[o + 2] - bgB) <= tol) {
      isBg[idx] = 1;
      q[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) { tryPush(x, 0); tryPush(x, h - 1); }
  for (let y = 0; y < h; y++) { tryPush(0, y); tryPush(w - 1, y); }

  while (head < tail) {
    const idx = q[head++];
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) tryPush(x - 1, y);
    if (x < w - 1) tryPush(x + 1, y);
    if (y > 0) tryPush(x, y - 1);
    if (y < h - 1) tryPush(x, y + 1);
  }

  if (removeHoles) {
    const cand = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (isBg[i]) continue;
      const o = i * 4;
      const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
      const d = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      if (d <= 26 && Math.max(r, g, b) - Math.min(r, g, b) <= 20) cand[i] = 1;
    }
    const vis = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (!cand[i] || vis[i]) continue;
      let qh = 0, qt = 0;
      q[qt++] = i;
      vis[i] = 1;
      let darkBorder = 0, totalBorder = 0;
      while (qh < qt) {
        const ci = q[qh++];
        const cx = ci % w, cy = (ci / w) | 0;
        const nbs = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
        for (const [nx, ny] of nbs) {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (cand[ni]) {
            if (!vis[ni]) { vis[ni] = 1; q[qt++] = ni; }
          } else if (!isBg[ni]) {
            totalBorder++;
            const no = ni * 4;
            const lum = (rgba[no] * 3 + rgba[no + 1] * 6 + rgba[no + 2]) / 10;
            if (lum < 90) darkBorder++;
          }
        }
      }
      if (qt >= 14 && totalBorder > 0 && (darkBorder / totalBorder >= 0.34 || qt >= 80)) {
        for (let k = 0; k < qt; k++) isBg[q[k]] = 1;
      }
    }
  }

  if (defringe) {
    const toDrop = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (isBg[i]) continue;
        if (isBg[i - 1] || isBg[i + 1] || isBg[i - w] || isBg[i + w]) {
          const o = i * 4;
          const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
          const d = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          const lum = (r * 3 + g * 6 + b) / 10;
          if (d <= 78 && sat <= 24 && lum >= 78) toDrop.push(i);
        }
      }
    }
    for (const i of toDrop) isBg[i] = 1;
  }

  return { isBg, bgR, bgG, bgB };
}

function extractRowBands(sheet, isBg, minRowPx = 24) {
  const { w, h } = sheet;
  const rowCnt = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = 0; x < w; x++) if (!isBg[y * w + x]) c++;
    rowCnt[y] = c;
  }
  const bands = [];
  let st = -1;
  for (let y = 0; y < h; y++) {
    if (rowCnt[y] > 6) {
      if (st < 0) st = y;
    } else if (st >= 0) {
      if (y - st >= minRowPx) bands.push([st, y]);
      st = -1;
    }
  }
  if (st >= 0 && h - st >= minRowPx) bands.push([st, h]);
  return bands;
}

function extractRowSegments(sheet, isBg, y0, y1, minWidth = 28, maxGap = 0) {
  const { w, rgba } = sheet;
  const colCnt = new Int32Array(w);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) if (!isBg[y * w + x]) colCnt[x]++;
  }
  const rawSegs = [];
  let st = -1;
  for (let x = 0; x < w; x++) {
    if (colCnt[x] > 2) {
      if (st < 0) st = x;
    } else if (st >= 0) {
      if (x - st >= (maxGap > 0 ? 8 : minWidth)) rawSegs.push([st, x]);
      st = -1;
    }
  }
  if (st >= 0 && w - st >= (maxGap > 0 ? 8 : minWidth)) rawSegs.push([st, w]);

  const segs = [];
  for (const [x0, x1] of rawSegs) {
    if (maxGap > 0 && segs.length > 0 && x0 - segs[segs.length - 1][1] <= maxGap) {
      segs[segs.length - 1][1] = x1;
    } else {
      segs.push([x0, x1]);
    }
  }
  const filteredSegs = segs.filter(([x0, x1]) => x1 - x0 >= minWidth);

  const sprites = [];
  for (const [x0, x1] of filteredSegs) {
    let minX = x1, maxX = x0, minY = y1, maxY = y0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!isBg[y * w + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) continue;
    const sw = maxX - minX + 1;
    const sh = maxY - minY + 1;
    const buf = Buffer.alloc(sw * sh * 4);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const si = (minY + y) * w + (minX + x);
        if (isBg[si]) continue;
        const so = si * 4;
        const di = (y * sw + x) * 4;
        buf[di] = rgba[so];
        buf[di + 1] = rgba[so + 1];
        buf[di + 2] = rgba[so + 2];
        buf[di + 3] = 255;
      }
    }
    sprites.push({ w: sw, h: sh, rgba: buf });
  }
  return sprites;
}

function extractAllGridRows(sheet, isBg, minRowPx = 24, minWidth = 28, maxGap = 0) {
  const bands = extractRowBands(sheet, isBg, minRowPx);
  return bands.map(([y0, y1]) => extractRowSegments(sheet, isBg, y0, y1, minWidth, maxGap));
}

function extractFixedGridCells(sheet, isBg, cols, rows) {
  const { w, h, rgba } = sheet;
  const cw = w / cols;
  const ch = h / rows;
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const rowArr = [];
    const y0 = Math.round(r * ch);
    const y1 = Math.round((r + 1) * ch);
    for (let c = 0; c < cols; c++) {
      const x0 = Math.round(c * cw);
      const x1 = Math.round((c + 1) * cw);
      let minX = x1, maxX = x0, minY = y1, maxY = y0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (!isBg[y * w + x]) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX <= minX || maxY <= minY) {
        throw new Error(`Empty fixed grid cell (${r},${c})`);
      }
      const sw = maxX - minX + 1;
      const sh = maxY - minY + 1;
      const buf = Buffer.alloc(sw * sh * 4);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const si = (minY + y) * w + (minX + x);
          if (isBg[si]) continue;
          const so = si * 4;
          const di = (y * sw + x) * 4;
          buf[di] = rgba[so];
          buf[di + 1] = rgba[so + 1];
          buf[di + 2] = rgba[so + 2];
          buf[di + 3] = 255;
        }
      }
      rowArr.push({ w: sw, h: sh, rgba: buf });
    }
    grid.push(rowArr);
  }
  return grid;
}

function resampleNearestOrBox(src, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 4);
  const scaleX = src.w / dstW;
  const scaleY = src.h / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy0 = Math.floor(y * scaleY);
    const sy1 = Math.max(sy0 + 1, Math.min(src.h, Math.ceil((y + 1) * scaleY)));
    for (let x = 0; x < dstW; x++) {
      const sx0 = Math.floor(x * scaleX);
      const sx1 = Math.max(sx0 + 1, Math.min(src.w, Math.ceil((x + 1) * scaleX)));
      let r = 0, g = 0, b = 0, aSum = 0, cnt = 0, total = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const o = (sy * src.w + sx) * 4;
          total++;
          const a = src.rgba[o + 3];
          if (a > 0) {
            r += src.rgba[o];
            g += src.rgba[o + 1];
            b += src.rgba[o + 2];
            aSum += a;
            cnt++;
          }
        }
      }
      const di = (y * dstW + x) * 4;
      if (cnt > 0 && cnt / total >= 0.42) {
        out[di] = Math.round(r / cnt);
        out[di + 1] = Math.round(g / cnt);
        out[di + 2] = Math.round(b / cnt);
        out[di + 3] = 255;
      }
    }
  }
  return out;
}

function fitToSquare(sprite, targetSize, { padding = 4, anchor = 'bottom' } = {}) {
  const maxBox = targetSize - padding * 2;
  const ratio = Math.min(maxBox / sprite.w, maxBox / sprite.h);
  const dstW = Math.max(1, Math.round(sprite.w * ratio));
  const dstH = Math.max(1, Math.round(sprite.h * ratio));
  const scaled = resampleNearestOrBox(sprite, dstW, dstH);
  const canvas = Buffer.alloc(targetSize * targetSize * 4);
  const ox = Math.floor((targetSize - dstW) / 2);
  const oy = anchor === 'bottom'
    ? (targetSize - padding - dstH)
    : Math.floor((targetSize - dstH) / 2);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const so = (y * dstW + x) * 4;
      if (scaled[so + 3] === 0) continue;
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dx >= targetSize || dy < 0 || dy >= targetSize) continue;
      const di = (dy * targetSize + dx) * 4;
      canvas[di] = scaled[so];
      canvas[di + 1] = scaled[so + 1];
      canvas[di + 2] = scaled[so + 2];
      canvas[di + 3] = 255;
    }
  }
  return canvas;
}

function extractOpaqueTile(sheet, col, row, cols, rows, tileSize = 64) {
  const cw = sheet.w / cols;
  const ch = sheet.h / rows;
  const inset = 3;
  const x0 = Math.round(col * cw) + inset;
  const y0 = Math.round(row * ch) + inset;
  const x1 = Math.round((col + 1) * cw) - inset;
  const y1 = Math.round((row + 1) * ch) - inset;
  const sw = Math.max(1, x1 - x0);
  const sh = Math.max(1, y1 - y0);
  const crop = Buffer.alloc(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const so = ((y0 + y) * sheet.w + (x0 + x)) * 4;
      const di = (y * sw + x) * 4;
      crop[di] = sheet.rgba[so];
      crop[di + 1] = sheet.rgba[so + 1];
      crop[di + 2] = sheet.rgba[so + 2];
      crop[di + 3] = 255;
    }
  }
  return resampleNearestOrBox({ w: sw, h: sh, rgba: crop }, tileSize, tileSize);
}

// ---------------- 1. Extract 12 Ground Tiles (64x64) ----------------
console.log('[WorldAssets] Loading 6 generated map, safe-zone & item sheets...');
const tilesSheet = loadJpgRgba(path.join(IMG_DIR, 'map_ground_tiles_sheet_1795855170664.jpg'));
const buildingsSheet = loadJpgRgba(path.join(IMG_DIR, 'town_buildings_sheet_1795855171234.jpg'));
const propsSheet = loadJpgRgba(path.join(IMG_DIR, 'town_props_sheet_1795855174512.jpg'));
const landmarksSheet = loadJpgRgba(path.join(IMG_DIR, 'wilderness_landmarks_sheet_1795855179840.jpg'));
const upgradesSheet = loadJpgRgba(path.join(IMG_DIR, 'items_upgrades_sheet_1795855176835.jpg'));
const pickupsSheet = loadJpgRgba(path.join(IMG_DIR, 'items_pickups_consumables_sheet_1795855181883.jpg'));

const TILE_SPECS = [
  { id: 'town_bluestone', col: 0, row: 0, zone: 'town', name: '湿润青石方砖', en: 'Wet Bluestone Flagstones', desc: '渡墨镇中庭与主街铺地，雨夜微润反光。' },
  { id: 'town_avenue', col: 1, row: 0, zone: 'town', name: '雕纹御道石阶', en: 'Carved Ceremonial Avenue', desc: '连通南影壁、祖火坛与镇北铁门的中轴石道。' },
  { id: 'town_timber_deck', col: 2, row: 0, zone: 'town', name: '廊下松木板地', en: 'Weathered Timber Veranda', desc: '茶亭戏台、老油坊与药铺檐下木质地台。' },
  { id: 'town_moss_cobble', col: 3, row: 0, zone: 'town', name: '苔藓庭院石阶', en: 'Mossy Courtyard Cobbles', desc: '安全区南院古井与古槐树下青苔石砖。' },
  { id: 'wild_grave_earth', col: 0, row: 1, zone: 'mortal', name: '荒坟落叶黑土', en: 'Damp Graveyard Earth', desc: '乱葬岗与荒郊主地表，散落干枯落叶。' },
  { id: 'wild_dirt_road', col: 1, row: 1, zone: 'mortal', name: '荒郊碎石土路', en: 'Winding Country Dirt Road', desc: '贯穿乱葬岗南北与东西的荒郊古道。' },
  { id: 'wild_mountain_grass', col: 2, row: 1, zone: 'mortal', name: '山林青黛荒草', en: 'Overgrown Mountain Grass', desc: '白昼山林外围草地，山狼与野猪常出没于此。' },
  { id: 'wild_dark_pond', col: 3, row: 1, zone: 'mortal', name: '暗潭幽水波纹', en: 'Twilight Dark Pond Water', desc: '东南暗潭与古桥下的深幽水面。' },
  { id: 'spectral_cracked_stone', col: 0, row: 2, zone: 'spectral', name: '渗墨裂纹玄石', en: 'Ink-Soaked Cracked Stone', desc: '翻入诡界后的墨蚀地表，深蓝近黑。' },
  { id: 'spectral_styx_water', col: 1, row: 2, zone: 'spectral', name: '冥河惨白阴水', en: 'Spectral Styx River', desc: '诡界冥河纸桥下的惨白雾水，锣响切莫窥澜。' },
  { id: 'spectral_paper_ash', col: 2, row: 2, zone: 'spectral', name: '纸灰鬼市石砖', en: 'Paper-Ash Ghost Market', desc: '诡界镇口集市异化后的纸灰石板路。' },
  { id: 'spectral_blood_slate', col: 3, row: 2, zone: 'spectral', name: '煞阵朱纹祭石', en: 'Crimson-Veined Altar Slate', desc: '纸扎判官降临与阴祠灵位周围的朱纹玄石。' },
];

const worldManifest = {
  version: '2.0-expanded-safe-zone',
  safe_zone_bounds: { x: -760, y: -240, w: 1520, h: 720 },
  tiles: [],
  buildings: [],
  props: [],
  landmarks: [],
};

for (const spec of TILE_SPECS) {
  const rgba = extractOpaqueTile(tilesSheet, spec.col, spec.row, 4, 3, 64);
  const rel = `world/tiles/${spec.id}.png`;
  writeAsset(rel, encodePngRgba(64, 64, rgba));
  worldManifest.tiles.push({
    id: spec.id,
    name: spec.name,
    en: spec.en,
    zone: spec.zone,
    size: 64,
    file: rel,
    res_path: `res://assets/${rel}`,
    desc: spec.desc,
  });
}
console.log(`[WorldAssets] Extracted ${worldManifest.tiles.length} seamless 64x64 ground tiles.`);

// ---------------- 2. Extract 6 Safe Zone Buildings (192x192) ----------------
const bMask = buildBgMask(buildingsSheet, { tol: 42, removeHoles: true, defringe: true }).isBg;
const bRows = extractAllGridRows(buildingsSheet, bMask, 60, 80);
if (bRows.length < 2 || bRows[0].length < 3 || bRows[1].length < 3) {
  throw new Error(`Unexpected building rows: ${bRows.map((r) => r.length).join(',')}`);
}

const BUILDING_SPECS = [
  { id: 'north_gate', r: 0, c: 0, name: '镇北铁门牌坊', en: 'North Iron Gate Archway', spot: 'north_gate', desc: '渡墨镇北向界关，跨过铁门即步入乱葬岗守夜。', size: 224 },
  { id: 'oil_shop', r: 0, c: 1, name: '老油坊', en: 'Old Oil Press Shop', spot: 'oil_shop', desc: '西街老字号，可调配松脂清油、桐油烈芯与冥蜡冷芯。', size: 224 },
  { id: 'paper_shop', r: 0, c: 2, name: '扎彩故铺', en: 'Paper-Craft Shop', spot: 'paper_shop', desc: '东街扎彩老铺，购置纸扎替身符与镇魂安神符。', size: 224 },
  { id: 'tea_pavilion', r: 1, c: 0, name: '月下茶亭戏台', en: 'Moonlit Tea Pavilion & Stage', spot: 'tea_pavilion', desc: '西厢新扩安全区地标：歇脚饮茶、听守夜旧闻并演练生旦身法。', size: 224 },
  { id: 'apothecary', r: 1, c: 1, name: '济世药铺', en: 'Apothecary Medicine Hall', spot: 'apothecary', desc: '东厢新扩安全区地标：温补气血、配制艾糕并查看禁忌解惑。', size: 224 },
  { id: 'ancestral_furnace', r: 1, c: 2, name: '辟邪祖火青铜鼎坛', en: 'Ancestral Bronze Furnace Altar', spot: 'furnace', desc: '镇心长明祖火祭坛，消耗香火资永久强化熬身/行步/芯火/聚灵。', size: 192 },
];

for (const spec of BUILDING_SPECS) {
  const sp = bRows[spec.r][spec.c];
  const rgba = fitToSquare(sp, spec.size, { padding: 6, anchor: 'bottom' });
  const rel = `world/buildings/${spec.id}.png`;
  writeAsset(rel, encodePngRgba(spec.size, spec.size, rgba));
  worldManifest.buildings.push({
    id: spec.id,
    name: spec.name,
    en: spec.en,
    spot: spec.spot,
    size: spec.size,
    file: rel,
    res_path: `res://assets/${rel}`,
    desc: spec.desc,
  });
}
console.log(`[WorldAssets] Extracted ${worldManifest.buildings.length} safe-zone buildings.`);

// ---------------- 3. Extract 12 Safe Zone Courtyard Props (96x96 / 128x128) ----------------
const pMask = buildBgMask(propsSheet, { tol: 42, removeHoles: true, defringe: true }).isBg;
const pRows = extractAllGridRows(propsSheet, pMask, 40, 40, 48);
if (pRows.length < 3 || pRows[0].length !== 4 || pRows[1].length !== 4 || pRows[2].length !== 4) {
  throw new Error(`Unexpected town prop rows: ${pRows.map((r) => r.length).join(',')}`);
}

const PROP_SPECS = [
  { id: 'ancient_locust_tree', r: 0, c: 0, name: '百年古槐树', en: 'Ancient Locust Tree', size: 128, desc: '镇中四角庇荫古槐，夜风吹拂枝叶婆娑。' },
  { id: 'ancient_well', r: 0, c: 1, name: '青苔古井', en: 'Mossy Stone Well', size: 96, desc: '南院深井，井水清冽，可驻足照影静心。' },
  { id: 'courtyard_lantern', r: 0, c: 2, name: '暖光石灯笼', en: 'Warm Courtyard Lantern', size: 96, desc: '中轴石道两侧的长明石灯，散发暖琥珀光晕。' },
  { id: 'notice_board', r: 0, c: 3, name: '悬榜木牌', en: 'Taboo Notice Board', size: 96, desc: '张贴今夜乱葬岗禁忌告示与守夜悬赏。' },
  { id: 'tea_table', r: 1, c: 0, name: '木茶桌圆凳', en: 'Wooden Tea Table', size: 96, desc: '茶亭前清茶小桌，备有青瓷茶壶与木凳。' },
  { id: 'oil_barrels', r: 1, c: 1, name: '松脂油瓮堆', en: 'Pine-Resin Oil Vats', size: 96, desc: '老油坊门外陈放的松脂桶与陶土油坛。' },
  { id: 'street_lamp_post', r: 1, c: 2, name: '挑灯木柱', en: 'Hexagonal Lamp Post', size: 96, desc: '街巷转角挑挂六角宫灯的高木灯柱。' },
  { id: 'incense_burner', r: 1, c: 3, name: '青石香炉', en: 'Stone Incense Burner', size: 96, desc: '药铺与祖火坛前的雕纹石炉，青烟袅袅。' },
  { id: 'bamboo_planter', r: 2, c: 0, name: '青竹石盆景', en: 'Potted Ink Bamboo', size: 96, desc: '装点檐下廊角的石盆墨竹。' },
  { id: 'opera_rack', r: 2, c: 1, name: '戏班兵器架', en: 'Opera Prop Rack', size: 96, desc: '月下戏台旁的云韶班长枪与靠旗木架。' },
  { id: 'stone_bench', r: 2, c: 2, name: '雕花青石凳', en: 'Carved Stone Bench', size: 96, desc: '南院庭园供行人歇息的雕花石长凳。' },
  { id: 'spirit_screen', r: 2, c: 3, name: '辟邪青石影壁', en: 'Carved Spirit Screen', size: 128, desc: '镇南正中影壁，阻挡阴风直贯祖火中庭。' },
];

for (const spec of PROP_SPECS) {
  const sp = pRows[spec.r][spec.c];
  const rgba = fitToSquare(sp, spec.size, { padding: 4, anchor: 'bottom' });
  const rel = `world/props/${spec.id}.png`;
  writeAsset(rel, encodePngRgba(spec.size, spec.size, rgba));
  worldManifest.props.push({
    id: spec.id,
    name: spec.name,
    en: spec.en,
    size: spec.size,
    file: rel,
    res_path: `res://assets/${rel}`,
    desc: spec.desc,
  });
}
console.log(`[WorldAssets] Extracted ${worldManifest.props.length} safe-zone courtyard props.`);

// ---------------- 4. Extract 8 Wilderness & Dual-Realm Landmarks (144x144) ----------------
const lMask = buildBgMask(landmarksSheet, { tol: 42, removeHoles: true, defringe: true }).isBg;
const lRows = extractAllGridRows(landmarksSheet, lMask, 50, 50);
if (lRows.length < 2 || lRows[0].length < 4 || lRows[1].length < 4) {
  throw new Error(`Unexpected landmark rows: ${lRows.map((r) => r.length).join(',')}`);
}

const LANDMARK_SPECS = [
  { id: 'stone_bridge', r: 0, c: 0, realm: 'mortal', name: '古镇石桥', en: 'Old Stone Bridge', size: 160, desc: '人间暗潭上的青石拱桥，入诡界后化作冥河纸桥。' },
  { id: 'styx_paper_bridge', r: 0, c: 1, realm: 'spectral', name: '冥河纸桥', en: 'Styx Paper Bridge', size: 160, desc: '诡界同址异化地标：纸扎白桥悬灯，锣响切莫窥澜。' },
  { id: 'ghost_market_stall', r: 0, c: 2, realm: 'spectral', name: '鬼市纸铺', en: 'Ghost Paper Market', size: 160, desc: '镇口集市翻入诡界后的幽灯鬼市，收割墨魄与香火资加成。' },
  { id: 'gravestone_stele', r: 0, c: 3, realm: 'mortal', name: '老祠无字残碑', en: 'Weathered Gravestone Stele', size: 128, desc: '乱葬岗古碑与无字残碑，切忌在碑前久留。' },
  { id: 'nether_altar', r: 1, c: 0, realm: 'spectral', name: '阴祠灵位祭坛', en: 'Nether Spirit Altar', size: 144, desc: '老祠残碑入诡界后的朱烛灵位台，驻足积煞加速。' },
  { id: 'spirit_gate', r: 1, c: 1, realm: 'spectral', name: '西南阴门牌楼', en: 'Southwest Spirit Gate', size: 144, desc: '荒郊幽冥木石阴门，闻三声叩门切莫靠近。' },
  { id: 'bamboo_grove', r: 1, c: 2, realm: 'mortal', name: '墨竹丛林', en: 'Ink-Wash Bamboo Grove', size: 144, desc: '乱葬岗与山林间随风摇曳的浓墨翠竹群。' },
  { id: 'ruined_wall', r: 1, c: 3, realm: 'mortal', name: '断垣残壁', en: 'Ruined Courtyard Wall', size: 144, desc: '西北荒村青苔断墙，破晓前切莫越垣入影。' },
];

for (const spec of LANDMARK_SPECS) {
  const sp = lRows[spec.r][spec.c];
  const rgba = fitToSquare(sp, spec.size, { padding: 6, anchor: 'bottom' });
  const rel = `world/landmarks/${spec.id}.png`;
  writeAsset(rel, encodePngRgba(spec.size, spec.size, rgba));
  worldManifest.landmarks.push({
    id: spec.id,
    name: spec.name,
    en: spec.en,
    realm: spec.realm,
    size: spec.size,
    file: rel,
    res_path: `res://assets/${rel}`,
    desc: spec.desc,
  });
}
console.log(`[WorldAssets] Extracted ${worldManifest.landmarks.length} wilderness & dual-realm landmarks.`);

// ---------------- 5. Extract 16 Upgrade Relic Icons (64x64) ----------------
const uMask = buildBgMask(upgradesSheet, { tol: 40, removeHoles: true, defringe: true }).isBg;
const uRows = extractAllGridRows(upgradesSheet, uMask, 30, 30);
console.log('[WorldAssets] Upgrade icon row counts:', uRows.map((r) => r.length));
if (uRows.length < 4) {
  throw new Error(`Expected 4 rows in upgrades sheet, got ${uRows.length}`);
}

const UPGRADE_ITEM_SPECS = [
  { id: 'talisman', r: 0, c: 0, category: '规则道具', name: '朱砂辟邪符', en: 'Cinnabar Talisman', desc: '受击无敌时间 +0.15s，行步速度 +8。' },
  { id: 'crane', r: 0, c: 1, category: '世界道具', name: '云韶引魂鹤', en: 'Soul-Guiding Crane', desc: '远距汲取墨魄宝石，立于人间回补气血。' },
  { id: 'sword', r: 0, c: 2, category: '形态 · 生', name: '云韶断妄刃', en: 'Severing Blade', desc: '武生剑气伤害 +4，出剑间隔 -0.03s。' },
  { id: 'sleeve_spin', r: 0, c: 3, category: '形态 · 旦', name: '白绫回风袖', en: 'Wind-Whirl Sleeve', desc: '青衣水袖范围 +18，伤害 +3，转速加快。' },
  { id: 'lantern_fire', r: 1, c: 0, category: '形态 · 少年', name: '照夜长明火', en: 'Everlasting Flame', desc: '少年灯火伤害 +5，照耀半径 +15。' },
  { id: 'mask_freeze', r: 1, c: 1, category: '变脸与破界', name: '破煞油彩', en: 'Warding Greasepaint', desc: '翻界定格伤害 +10，翻界后获 1 秒无敌。' },
  { id: 'troupe_gong', r: 1, c: 2, category: '行当通用', name: '云韶金锣', en: 'Golden Troupe Gong', desc: '三形态普攻伤害全量 +2，声震百鬼。' },
  { id: 'gonglu', r: 1, c: 3, category: '行当通用', name: '戏台催阵鼓', en: 'Urgent Stage Drum', desc: '每 5 秒轰出震波击退近敌，间隔再缩短。' },
  { id: 'encore', r: 2, c: 0, category: '行当通用', name: '还魂替身偶', en: 'Soul-Calling Effigy', desc: '气绝时以半血还魂复起，每局仅一次。' },
  { id: 'soul_shield', r: 2, c: uRows[2].length >= 5 ? 2 : 1, category: '行当通用', name: '扎彩保命甲', en: 'Paper-Armor Ward', desc: '气血上限 +20，强健身魄抵御阴煞。' },
  { id: 'lamp_oil', r: 2, c: uRows[2].length >= 5 ? 3 : 2, category: '规则道具', name: '松脂明心油', en: 'Pine-Resin Lamp Oil', desc: '灯圈范围扩张：人间每级 +30，诡界 +20。' },
  { id: 'night_bell', r: 2, c: uRows[2].length >= 5 ? 4 : 3, category: '规则道具', name: '更夫惊魂铎', en: "Watchman's Chime", desc: '临破规前提前 0.5 秒急促鸣响预警。' },
  { id: 'taboo_book', r: 3, c: 0, category: '规则道具', name: '阴司勾名折', en: "Bailiff's Roster", desc: '白纸差役追猎时长 -4s，触碰伤害 -3。' },
  { id: 'yin_yang_mirror', r: 3, c: 1, category: '世界道具', name: '照妖阴阳鉴', en: 'Yin-Yang Speculum', desc: '翻界轰出阴阳煞震，生旦二相伤害 +2。' },
  { id: 'spirit_brand', r: 3, c: uRows[3].length >= 5 ? 3 : 2, category: '世界道具', name: '冥河引渡印', en: 'Styx Passage Seal', desc: '诡界收割墨魄倍增，诡界灯火圈大幅扩张。' },
  { id: 'shadow_walker', r: 3, c: uRows[3].length >= 5 ? 4 : 3, category: '世界道具', name: '化雾踏影步', en: 'Mist-Shadow Stride', desc: '翻界瞬间身如残雾，2 秒内疾行如风。' },
];

const itemsManifest = {
  version: '2.0-full-items',
  upgrades: [],
  pickups: [],
};

for (const spec of UPGRADE_ITEM_SPECS) {
  const sp = uRows[spec.r][spec.c];
  if (!sp) throw new Error(`Missing upgrade icon ${spec.id} at (${spec.r},${spec.c})`);
  const rgba = fitToSquare(sp, 64, { padding: 4, anchor: 'center' });
  const rel = `items/${spec.id}.png`;
  writeAsset(rel, encodePngRgba(64, 64, rgba));
  itemsManifest.upgrades.push({
    id: spec.id,
    name: spec.name,
    en: spec.en,
    category: spec.category,
    size: 64,
    file: rel,
    res_path: `res://assets/${rel}`,
    desc: spec.desc,
  });
}
console.log(`[WorldAssets] Extracted ${itemsManifest.upgrades.length} upgrade relic 64x64 icons.`);

// ---------------- 6. Extract 12 Pickups, Lamp Oils & Paper Charms (64x64) ----------------
const kMask = buildBgMask(pickupsSheet, { tol: 40, removeHoles: true, defringe: true }).isBg;
const kRows = extractAllGridRows(pickupsSheet, kMask, 40, 40);
if (kRows.length < 3 || kRows[0].length < 4 || kRows[1].length < 4 || kRows[2].length < 4) {
  throw new Error(`Unexpected pickup rows: ${kRows.map((r) => r.length).join(',')}`);
}

const PICKUP_SPECS = [
  { id: 'xp_gem_small', r: 0, c: 0, kind: '掉落物', name: '墨魄碎晶', en: 'Ink-Soul Shard', desc: '击杀邪祟与山怪掉落的基础经验墨魄。' },
  { id: 'xp_gem_large', r: 0, c: 1, kind: '掉落物', name: '凝墨大魄', en: 'Condensed Soul Cluster', desc: '精英与 Boss 掉落的高纯度聚合墨魄晶簇。' },
  { id: 'incense_coin', r: 0, c: 2, kind: '货币', name: '香火铜钱', en: 'Incense Coin', desc: '用于渡墨镇祖火坛永久强化与扎彩故铺采买。' },
  { id: 'oil_drop_vial', r: 0, c: 3, kind: '掉落物', name: '灯油滴瓶', en: 'Lantern Oil Vial', desc: '局内拾取即时补充提灯灯油，延缓熄灯危机。' },
  { id: 'mugwort_cake', r: 1, c: 0, kind: '补给品', name: '温热艾草糕', en: 'Mugwort Rice Cake', desc: '济世药铺与战场补给，回复 25 点阳气气血。' },
  { id: 'pine_oil', r: 1, c: 1, kind: '老油坊灯油', name: '松脂清油', en: 'Pine-Resin Oil', desc: '人间灯圈 +28，灯油燃耗 -15%（稳健守规）。' },
  { id: 'tung_oil', r: 1, c: 2, kind: '老油坊灯油', name: '桐油烈芯', en: 'Fierce Tung Wick', desc: '全形态攻击威力 +15%，灯油燃耗 +10%（高攻速杀）。' },
  { id: 'spirit_wax', r: 1, c: 3, kind: '老油坊灯油', name: '冥蜡冷芯', en: 'Spirit-Wax Core', desc: '翻界冷却 -0.45 秒，行步速度 +12（高频变脸）。' },
  { id: 'paper_ward', r: 2, c: 0, kind: '扎彩符箓', name: '纸扎替身符', en: 'Paper Effigy Charm', desc: '本夜自带一次气绝半血复起并震退周敌（15 香火资）。' },
  { id: 'calm_talisman', r: 2, c: 1, kind: '扎彩符箓', name: '镇魂安神符', en: 'Soul-Calming Ward', desc: '本夜破戒宽限 +0.45 秒，白纸差役触伤 -4（12 香火资）。' },
  { id: 'ancestral_ember', r: 2, c: 2, kind: '祖火素材', name: '祖火余烬', en: 'Ancestral Fire Ember', desc: '渡墨镇青铜鼎坛淬炼出的温阳火种。' },
  { id: 'magistrate_chest', r: 2, c: 3, kind: 'Boss 掉落', name: '判官朱印匣', en: 'Magistrate Seal Chest', desc: '击破纸扎判官后显现的封印宝箱，必含高阶名物与香火资。' },
];

for (const spec of PICKUP_SPECS) {
  const sp = kRows[spec.r][spec.c];
  const rgba = fitToSquare(sp, 64, { padding: 4, anchor: 'center' });
  const rel = `items/${spec.id}.png`;
  writeAsset(rel, encodePngRgba(64, 64, rgba));
  itemsManifest.pickups.push({
    id: spec.id,
    name: spec.name,
    en: spec.en,
    kind: spec.kind,
    size: 64,
    file: rel,
    res_path: `res://assets/${rel}`,
    desc: spec.desc,
  });
}
console.log(`[WorldAssets] Extracted ${itemsManifest.pickups.length} pickup, oil & charm 64x64 icons.`);

// Write manifests + copy reference sheets
writeAsset('world/world_manifest.json', JSON.stringify(worldManifest, null, 2));
writeAsset('items/items_manifest.json', JSON.stringify(itemsManifest, null, 2));

const REF_COPIES = [
  ['map_ground_tiles_sheet_1795855170664.jpg', 'sprites/reference/map_ground_tiles_45deg.jpg'],
  ['town_buildings_sheet_1795855171234.jpg', 'sprites/reference/town_buildings_45deg.jpg'],
  ['town_props_sheet_1795855174512.jpg', 'sprites/reference/town_props_45deg.jpg'],
  ['wilderness_landmarks_sheet_1795855179840.jpg', 'sprites/reference/wilderness_landmarks_45deg.jpg'],
  ['items_upgrades_sheet_1795855176835.jpg', 'sprites/reference/items_upgrades_sheet.jpg'],
  ['items_pickups_consumables_sheet_1795855181883.jpg', 'sprites/reference/items_pickups_sheet.jpg'],
];
for (const [srcName, dstRel] of REF_COPIES) {
  const srcBuf = fs.readFileSync(path.join(IMG_DIR, srcName));
  writeAsset(dstRel, srcBuf);
}

console.log('[WorldAssets] Done! 66 production world/prop/item PNGs + 2 manifests written to root & godot-prototype/.');
