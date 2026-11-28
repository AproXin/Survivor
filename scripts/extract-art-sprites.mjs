#!/usr/bin/env node
/**
 * Ink Night: Smooth Multi-Direction (8-Way Heroes + 4-Way Enemies) 45° Top-Down Sprite Extractor
 *
 * Extracts studio-grade 45° overhead top-down pixel-art sprites from the 6 directional source sheets,
 * removes flat neutral mid-grey background with enclosed-hole cleanup & 1px anti-halo defringing,
 * locks torso center-of-mass (pivot_x) and footline (footY) for silky-smooth zero-jitter playback,
 * enforces zero-vermilion rules on heroes & non-crimson beasts, and outputs to BOTH
 * `godot-prototype/assets/sprites/` and root `assets/sprites/`:
 *
 *   1. 3 Heroes — FULL 8 DIRECTIONS (s, se, e, ne, n, nw, w, sw) × 29 smooth frames (232f, 2784×768):
 *        - player_mortal_cel (96×96, 8-dir, 0 vermilion)
 *        - player_sheng_cel  (96×96, 8-dir, 0 vermilion)
 *        - player_dan_cel    (96×96, 8-dir, 0 vermilion)
 *   2. 4 Daytime + 3 Core Night/Boss Actors — FULL 4 DIRECTIONS (s/down, e/side, n/up, w/left) × 19 smooth frames (76f):
 *        - enemy_wolf_cel       (64×64, 4-dir, 0 vermilion)
 *        - enemy_boar_cel       (64×64, 4-dir, 0 vermilion)
 *        - enemy_treant_cel     (64×64, 4-dir, 0 vermilion)
 *        - enemy_shanxiao_cel   (96×96, 4-dir, crimson eyes allowed)
 *        - ghost_cel            (64×64, 4-dir, 0 vermilion)
 *        - jiangshi_cel         (64×64, 4-dir, talisman seal allowed)
 *        - boss_magistrate_cel  (96×96, 4-dir, cinnabar brush allowed)
 *   3. All 11 Legacy 8-frame horizontal strips (manifest.json) quantized to <= 16/18 colors.
 *   4. Synced `cel_manifest.json`, `manifest.json`, `palette-report.json`, reference sheets, and `art_pipeline/` frames.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const GODOT_DIR = path.join(ROOT, 'godot-prototype');
const SPRITES_DIRS = [path.join(GODOT_DIR, 'assets/sprites')];
if (fs.existsSync(path.join(ROOT, 'project.godot'))) {
  SPRITES_DIRS.push(path.join(ROOT, 'assets/sprites'));
}
const IMG_DIR = path.join(ROOT, 'src/assets/images');

for (const d of SPRITES_DIRS) {
  fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(d, 'reference'), { recursive: true });
}

function writeToSpriteDirs(relFile, content) {
  for (const d of SPRITES_DIRS) {
    const target = path.join(d, relFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
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

// ---------------- Image Loading & Background Removal ----------------
function loadJpgRgba(filePath) {
  const dims = execFileSync('identify', ['-format', '%w %h', filePath], { encoding: 'utf8' }).trim().split(/\s+/);
  const w = Number(dims[0]);
  const h = Number(dims[1]);
  const rgba = execFileSync('convert', [filePath, '-depth', '8', 'rgba:-'], { maxBuffer: 64 * 1024 * 1024 });
  return { w, h, rgba };
}

function buildBgMask(sheet, { tol = 38, removeHoles = true, defringe = true } = {}) {
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
      if (d <= 28 && Math.max(r, g, b) - Math.min(r, g, b) <= 24) cand[i] = 1;
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
            if (lum < 95) darkBorder++;
          }
        }
      }
      if (qt >= 10 && totalBorder > 0 && (darkBorder / totalBorder >= 0.30 || qt >= 45)) {
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
          if (d <= 82 && sat <= 26 && lum >= 74) toDrop.push(i);
        }
      }
    }
    for (const i of toDrop) isBg[i] = 1;
  }

  return { isBg, bgR, bgG, bgB };
}

function extractRowSegments(sheet, isBg, y0, y1, { minWidth = 22, minPixels = 16, stripFloorShadow = false } = {}) {
  const { w, rgba } = sheet;
  const col = new Int32Array(w);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      if (!isBg[y * w + x]) col[x]++;
    }
  }
  const segs = [];
  let st = -1;
  for (let x = 0; x < w; x++) {
    if (col[x] > 1) {
      if (st < 0) st = x;
    } else if (st >= 0) {
      if (x - st >= minWidth) segs.push([st, x - 1]);
      st = -1;
    }
  }
  if (st >= 0 && w - st >= minWidth) segs.push([st, w - 1]);

  return segs.map(([sx0, sx1]) => {
    let minX = sx1, maxX = sx0, minY = y1 - 1, maxY = y0, cnt = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = sx0; x <= sx1; x++) {
        if (!isBg[y * w + x]) {
          cnt++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const buf = Buffer.alloc(cw * ch * 4);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = y * w + x;
        if (isBg[idx]) continue;
        const soff = idx * 4;
        // Optionally remove detached soft oval drop shadows at very bottom (e.g. Jiangshi)
        if (stripFloorShadow && y >= maxY - 12) {
          const r = rgba[soff], g = rgba[soff + 1], b = rgba[soff + 2];
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          const lum = (r * 3 + g * 6 + b) / 10;
          if (sat <= 14 && lum >= 78 && lum <= 118) continue;
        }
        const doff = ((y - minY) * cw + (x - minX)) * 4;
        buf[doff] = rgba[soff];
        buf[doff + 1] = rgba[soff + 1];
        buf[doff + 2] = rgba[soff + 2];
        buf[doff + 3] = 255;
      }
    }
    return trimSprite(cw, ch, buf, minX, minY);
  }).filter((s) => s.pixels >= minPixels);
}

function trimSprite(w, h, rgba, origX = 0, origY = 0) {
  let minX = w, maxX = -1, minY = h, maxY = -1, pixels = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 0) {
        pixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (pixels === 0) return { minX: origX, minY: origY, maxX: origX, maxY: origY, w: 1, h: 1, rgba: Buffer.alloc(4), pixels: 0 };
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    rgba.copy(out, y * cw * 4, ((y + minY) * w + minX) * 4, ((y + minY) * w + maxX + 1) * 4);
  }
  return { minX: origX + minX, minY: origY + minY, maxX: origX + maxX, maxY: origY + maxY, w: cw, h: ch, rgba: out, pixels };
}

function extractAllRows(sheet, isBg, opts = {}) {
  const { w, h } = sheet;
  const rowCounts = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = 0; x < w; x++) if (!isBg[y * w + x]) c++;
    rowCounts[y] = c;
  }
  const bands = [];
  let st = -1;
  for (let y = 0; y < h; y++) {
    if (rowCounts[y] > 10) { if (st < 0) st = y; }
    else if (st >= 0) { if (y - st >= 30) bands.push([st, y]); st = -1; }
  }
  if (st >= 0 && h - st >= 30) bands.push([st, h]);
  return bands.map(([y0, y1]) => extractRowSegments(sheet, isBg, y0, y1, opts));
}

// ---------------- Sprite Transforms & Torso-Locked Crisp Rendering ----------------
function flipHorizontal(sprite) {
  const { w, h, rgba } = sprite;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = (y * w + (w - 1 - x)) * 4;
      out[d] = rgba[s];
      out[d + 1] = rgba[s + 1];
      out[d + 2] = rgba[s + 2];
      out[d + 3] = rgba[s + 3];
    }
  }
  return { ...sprite, rgba: out };
}

function flipFrameBufferHorizontal(frame, size) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const d = (y * size + (size - 1 - x)) * 4;
      out[d] = frame[s];
      out[d + 1] = frame[s + 1];
      out[d + 2] = frame[s + 2];
      out[d + 3] = frame[s + 3];
    }
  }
  return out;
}

function sanitizeVermilion(buf, allowVermilion = false, warmToAmber = false) {
  if (allowVermilion) return;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue;
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    if (r >= 135 && g <= 108 && b <= 98 && (r - g) >= 48 && (r - b) >= 54) {
      if (warmToAmber) {
        buf[i] = Math.min(232, r);
        buf[i + 1] = Math.min(198, Math.round(r * 0.78));
        buf[i + 2] = Math.min(108, Math.round(r * 0.36));
      } else {
        const lum = Math.round(r * 0.25 + g * 0.55 + b * 0.2);
        buf[i] = Math.max(20, Math.min(168, lum - 4));
        buf[i + 1] = Math.max(24, Math.min(176, lum));
        buf[i + 2] = Math.max(28, Math.min(184, lum + 6));
      }
    }
  }
}

/**
 * Renders a sprite into a square frame with:
 * - Uniform reference height scaling (zero size popping across frames!)
 * - Torso/core center-of-mass locking (zero horizontal teleporting during weapon thrusts or billowing sleeves!)
 * - Exact footline anchoring (footY = 90 for 96px, 60 for 64px)
 */
function renderSpriteToFrame(sprite, frameSize, {
  refHeight = null,
  targetFill = 0.84,
  footY = frameSize === 96 ? 90 : 60,
  dx = 0,
  dy = 0,
  scaleX = 1.0,
  scaleY = 1.0,
  allowVermilion = false,
  warmToAmber = false,
  centerMode = 'torso',
} = {}) {
  const maxW = frameSize - 4;
  const maxH = footY - 3;
  const baseH = refHeight || sprite.h;
  const baseScale = (frameSize * targetFill) / baseH;
  let dstW = Math.max(8, Math.round(sprite.w * baseScale * scaleX));
  let dstH = Math.max(8, Math.round(sprite.h * baseScale * scaleY));

  if (dstW > maxW) {
    const k = maxW / dstW;
    dstW = Math.round(dstW * k);
    dstH = Math.round(dstH * k);
  }
  if (dstH > maxH) {
    const k = maxH / dstH;
    dstW = Math.round(dstW * k);
    dstH = Math.round(dstH * k);
  }

  const scaled = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy0 = (y * sprite.h) / dstH;
    const sy1 = ((y + 1) * sprite.h) / dstH;
    const iy0 = Math.floor(sy0);
    const iy1 = Math.min(sprite.h - 1, Math.ceil(sy1) - 1);
    for (let x = 0; x < dstW; x++) {
      const sx0 = (x * sprite.w) / dstW;
      const sx1 = ((x + 1) * sprite.w) / dstW;
      const ix0 = Math.floor(sx0);
      const ix1 = Math.min(sprite.w - 1, Math.ceil(sx1) - 1);

      let sr = 0, sg = 0, sb = 0, cnt = 0, tot = 0, darkCnt = 0;
      let minLum = 999, dr = 0, dg = 0, db = 0;
      for (let sy = iy0; sy <= iy1; sy++) {
        for (let sx = ix0; sx <= ix1; sx++) {
          tot++;
          const o = (sy * sprite.w + sx) * 4;
          if (sprite.rgba[o + 3] > 128) {
            const r = sprite.rgba[o], g = sprite.rgba[o + 1], b = sprite.rgba[o + 2];
            sr += r; sg += g; sb += b; cnt++;
            const lum = r * 3 + g * 6 + b;
            if (lum < 420) darkCnt++;
            if (lum < minLum) { minLum = lum; dr = r; dg = g; db = b; }
          }
        }
      }
      if (cnt > 0 && cnt / tot >= 0.36) {
        const doff = (y * dstW + x) * 4;
        if (darkCnt / cnt >= 0.42) {
          scaled[doff] = dr;
          scaled[doff + 1] = dg;
          scaled[doff + 2] = db;
        } else {
          scaled[doff] = Math.round(sr / cnt);
          scaled[doff + 1] = Math.round(sg / cnt);
          scaled[doff + 2] = Math.round(sb / cnt);
        }
        scaled[doff + 3] = 255;
      }
    }
  }

  let sMinX = dstW, sMaxX = -1, sMaxY = -1;
  let coreSumX = 0, coreCnt = 0;
  let footSumX = 0, footCnt = 0;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      if (scaled[(y * dstW + x) * 4 + 3] > 0) {
        if (x < sMinX) sMinX = x;
        if (x > sMaxX) sMaxX = x;
        if (y > sMaxY) sMaxY = y;
        if (y >= dstH * 0.30 && y <= dstH * 0.85) {
          coreSumX += x;
          coreCnt++;
        }
        if (y >= dstH * 0.72) {
          footSumX += x;
          footCnt++;
        }
      }
    }
  }

  let centerX = Math.round((sMinX + sMaxX) / 2);
  if (centerMode === 'torso' && coreCnt > 0) {
    centerX = Math.round(coreSumX / coreCnt);
  } else if (centerMode === 'foot' && footCnt > 0) {
    centerX = Math.round(footSumX / footCnt);
  }

  let offX = Math.floor(frameSize / 2) + dx - centerX;
  // Keep sprite inside horizontal frame bounds with 1px safe margin
  if (sMinX + offX < 1) offX = 1 - sMinX;
  if (sMaxX + offX > frameSize - 2) offX = (frameSize - 2) - sMaxX;
  const offY = (footY + dy) - sMaxY;

  const frame = Buffer.alloc(frameSize * frameSize * 4);
  for (let y = 0; y < dstH; y++) {
    const ty = y + offY;
    if (ty < 0 || ty >= frameSize) continue;
    for (let x = 0; x < dstW; x++) {
      const tx = x + offX;
      if (tx < 0 || tx >= frameSize) continue;
      const so = (y * dstW + x) * 4;
      if (scaled[so + 3] === 0) continue;
      const to = (ty * frameSize + tx) * 4;
      frame[to] = scaled[so];
      frame[to + 1] = scaled[so + 1];
      frame[to + 2] = scaled[so + 2];
      frame[to + 3] = 255;
    }
  }

  sanitizeVermilion(frame, allowVermilion, warmToAmber);
  return frame;
}

// ---------------- Crisp Pixel-Art VFX & Directional Attack Accents ----------------
function setPx(buf, size, x, y, r, g, b, a = 255) {
  const ix = Math.round(x), iy = Math.round(y);
  if (ix < 0 || ix >= size || iy < 0 || iy >= size) return;
  const o = (iy * size + ix) * 4;
  buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = a;
}

function drawArcSmear(buf, size, cx, cy, rx, ry, a0, a1, thickness, colCore, colEdge) {
  const steps = 46;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = a0 + (a1 - a0) * t;
    const x = cx + Math.cos(ang) * rx;
    const y = cy + Math.sin(ang) * ry;
    const rad = Math.max(1, Math.round(thickness * Math.sin(t * Math.PI)));
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy <= rad * rad) {
          const isEdge = dx * dx + dy * dy >= (rad - 0.8) * (rad - 0.8);
          const c = isEdge ? colEdge : colCore;
          setPx(buf, size, x + dx, y + dy, c[0], c[1], c[2], 255);
        }
      }
    }
  }
}

function drawDirectionalAttackVfx(frame, size, dirName, style, phase) {
  const out = Buffer.from(frame);
  const cx = Math.floor(size / 2);
  const cy = Math.round(size * 0.56);
  const angleMap = {
    e: 0,
    se: Math.PI * 0.25,
    s: Math.PI * 0.5,
    sw: Math.PI * 0.75,
    w: Math.PI,
    nw: -Math.PI * 0.75,
    n: -Math.PI * 0.5,
    ne: -Math.PI * 0.25,
  };
  const baseAng = angleMap[dirName] ?? 0;

  if (style === 'mortal_flame') {
    const span = phase === 1 ? 0.85 : phase === 2 ? 1.15 : 0.65;
    const r = Math.round(size * (phase === 2 ? 0.35 : 0.30));
    drawArcSmear(out, size, cx, cy, r, Math.round(r * 0.72), baseAng - span, baseAng + span, phase === 2 ? 2.6 : 1.8, [246, 206, 98], [186, 132, 46]);
  } else if (style === 'sheng_thrust') {
    const len = Math.round(size * (phase === 2 ? 0.42 : 0.34));
    const ux = Math.cos(baseAng), uy = Math.sin(baseAng);
    const px = -uy, py = ux;
    for (let t = 8; t <= len; t++) {
      const bx = cx + ux * t;
      const by = cy + uy * t * 0.78;
      const halfW = t > len - 8 ? 1 : (phase === 2 ? 2 : 1);
      for (let w = -halfW; w <= halfW; w++) {
        const col = Math.abs(w) === halfW ? [136, 168, 178] : [238, 246, 248];
        setPx(out, size, bx + px * w, by + py * w, col[0], col[1], col[2]);
      }
    }
  } else if (style === 'dan_sleeve') {
    const span = phase === 2 ? 1.85 : 1.35;
    const r = Math.round(size * (phase === 2 ? 0.39 : 0.34));
    drawArcSmear(out, size, cx, cy, r, Math.round(r * 0.74), baseAng - span, baseAng + span, phase === 2 ? 2.8 : 2.0, [224, 240, 234], [108, 152, 146]);
  } else if (style === 'beast_claw' || style === 'crimson_brush') {
    const colCore = style === 'crimson_brush' ? [226, 72, 58] : [224, 232, 234];
    const colEdge = style === 'crimson_brush' ? [142, 34, 26] : [48, 64, 72];
    const r = Math.round(size * 0.34);
    drawArcSmear(out, size, cx, cy, r, Math.round(r * 0.72), baseAng - 0.85, baseAng + 0.85, size === 96 ? 2.4 : 1.6, colCore, colEdge);
  }
  return out;
}

function applyHitFlash(frame, size, stage) {
  const out = Buffer.from(frame);
  if (stage === 0) {
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      out[i] = Math.min(248, Math.round(out[i] * 0.35 + 238 * 0.65));
      out[i + 1] = Math.min(248, Math.round(out[i + 1] * 0.35 + 240 * 0.65));
      out[i + 2] = Math.min(242, Math.round(out[i + 2] * 0.35 + 228 * 0.65));
    }
    const cx = Math.round(size * 0.60), cy = Math.round(size * 0.42);
    for (let d = -3; d <= 3; d++) {
      setPx(out, size, cx + d, cy, 245, 242, 224);
      setPx(out, size, cx, cy + d, 245, 242, 224);
    }
  } else {
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      out[i] = Math.round(out[i] * 0.72);
      out[i + 1] = Math.round(out[i + 1] * 0.76);
      out[i + 2] = Math.min(255, Math.round(out[i + 2] * 0.84 + 14));
    }
    const fy = size === 96 ? 90 : 60;
    for (let k = 0; k < 4; k++) {
      setPx(out, size, Math.round(size * 0.34) + k * 5, fy - 1 - (k % 2), 188, 198, 202);
    }
  }
  return out;
}

function applyInkDissolve(frame, size, stage) {
  const out = Buffer.alloc(size * size * 4);
  const footY = size === 96 ? 90 : 60;
  const cx = Math.floor(size / 2);
  const dropShift = stage === 0 ? 4 : stage === 1 ? 10 : 18;
  const keepProb = stage === 0 ? 0.82 : stage === 1 ? 0.52 : 0.24;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const so = (y * size + x) * 4;
      if (frame[so + 3] === 0) continue;
      const hash = ((x * 73856093) ^ (y * 19349663) ^ ((stage + 1) * 83492791)) >>> 0;
      const r01 = (hash % 1000) / 1000;
      const ny = Math.min(footY, y + dropShift - (r01 > keepProb ? Math.round((r01 - keepProb) * 18) : 0));
      const nx = x + Math.round(((hash % 11) - 5) * (stage * 0.55));
      if (r01 <= keepProb) {
        const dark = stage === 0 ? 0.82 : stage === 1 ? 0.58 : 0.38;
        setPx(out, size, nx, ny,
          Math.max(12, Math.round(frame[so] * dark)),
          Math.max(16, Math.round(frame[so + 1] * dark)),
          Math.max(22, Math.round(frame[so + 2] * dark + 8)));
      } else if (r01 <= keepProb + 0.14) {
        const ey = Math.max(6, y - 4 - stage * 5);
        const ex = x + ((hash % 9) - 4) * (stage + 1);
        const col = (hash % 3 === 0) ? [196, 206, 208] : [26, 36, 44];
        setPx(out, size, ex, ey, col[0], col[1], col[2]);
      }
    }
  }
  const puddleW = stage === 0 ? 12 : stage === 1 ? 16 : 20;
  for (let dx = -puddleW; dx <= puddleW; dx++) {
    setPx(out, size, cx + dx, footY, 16, 22, 28);
    if (Math.abs(dx) < puddleW - 4) setPx(out, size, cx + dx, footY - 1, 34, 46, 56);
  }
  return out;
}

function applyFlipSpiritRing(frame, size, stepIdx) {
  const out = Buffer.from(frame);
  const footY = size === 96 ? 90 : 60;
  const cx = Math.floor(size / 2);
  const cy = Math.round(size * 0.62);
  const phase = stepIdx * 1.05;
  const rx = Math.round(size * (0.31 + 0.06 * Math.sin(stepIdx * 0.9)));
  const ry = Math.round(size * 0.16);
  drawArcSmear(out, size, cx, cy, rx, ry, phase, phase + Math.PI * 1.25, 2, [238, 224, 176], [88, 128, 134]);
  setPx(out, size, cx, footY, 14, 20, 26);
  return out;
}

function applyMicroAccent(frame, size, variant, accentColor = [235, 190, 102]) {
  const out = Buffer.from(frame);
  const footY = size === 96 ? 90 : 60;
  const cx = Math.floor(size / 2);
  if (variant === 'dust1') {
    setPx(out, size, cx - 10, footY - 1, 164, 174, 178);
    setPx(out, size, cx - 13, footY - 2, 126, 138, 144);
  } else if (variant === 'dust2') {
    setPx(out, size, cx + 10, footY - 1, 172, 182, 186);
    setPx(out, size, cx + 13, footY - 2, 132, 144, 150);
  } else if (variant === 'breath1') {
    setPx(out, size, cx + 15, Math.round(size * 0.36), accentColor[0], accentColor[1], accentColor[2]);
  } else if (variant === 'breath2') {
    setPx(out, size, cx + 16, Math.round(size * 0.33), accentColor[0], accentColor[1], accentColor[2]);
    setPx(out, size, cx - 15, Math.round(size * 0.45), 188, 202, 206);
  } else if (variant === 'breath3') {
    setPx(out, size, cx + 14, Math.round(size * 0.38), accentColor[0], accentColor[1], accentColor[2]);
  }
  return out;
}

/**
 * Ensures zero accidental exact-duplicate adjacent frames while preserving smooth motion.
 */
function ensureNonDuplicate(prevFrame, curFrame, size, seedIdx) {
  let diff = 0;
  for (let i = 0; i < curFrame.length; i += 4) {
    if (Math.abs(prevFrame[i] - curFrame[i]) + Math.abs(prevFrame[i + 1] - curFrame[i + 1]) +
        Math.abs(prevFrame[i + 2] - curFrame[i + 2]) + Math.abs(prevFrame[i + 3] - curFrame[i + 3]) > 18) {
      diff++;
      if (diff >= 3) return curFrame;
    }
  }
  const out = Buffer.from(curFrame);
  const fy = size === 96 ? 90 : 60;
  const cx = Math.floor(size / 2);
  setPx(out, size, cx - 12 + (seedIdx % 7) * 4, fy - 2, 178, 190, 194);
  setPx(out, size, cx - 11 + (seedIdx % 7) * 4, fy - 3, 142, 154, 160);
  return out;
}

function stitchFramesHorizontal(frames, frameSize) {
  const totalW = frames.length * frameSize;
  const out = Buffer.alloc(totalW * frameSize * 4);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    for (let y = 0; y < frameSize; y++) {
      f.copy(out, (y * totalW + i * frameSize) * 4, y * frameSize * 4, (y + 1) * frameSize * 4);
    }
  }
  return { w: totalW, h: frameSize, rgba: out };
}

function stitchDirectionalGrid(rowsOfFrames, frameSize) {
  const rows = rowsOfFrames.length;
  const cols = rowsOfFrames[0].length;
  const totalW = cols * frameSize;
  const totalH = rows * frameSize;
  const out = Buffer.alloc(totalW * totalH * 4);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const f = rowsOfFrames[r][c];
      for (let y = 0; y < frameSize; y++) {
        f.copy(out, ((r * frameSize + y) * totalW + c * frameSize) * 4, y * frameSize * 4, (y + 1) * frameSize * 4);
      }
    }
  }
  return { w: totalW, h: totalH, rows, cols, rgba: out };
}

// ---------------- Palette Quantizer (<= 16 colors per legacy 8-frame strip) ----------------
function quantizeToMaxColors(rgba, maxColors = 16) {
  const counts = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const unique = Array.from(counts.entries()).map(([k, c]) => ({
    r: (k >> 16) & 255, g: (k >> 8) & 255, b: k & 255, count: c, key: k,
  }));
  if (unique.length <= maxColors) return { rgba, colorsUsed: unique.length };

  let buckets = [unique];
  while (buckets.length < maxColors) {
    let bestIdx = -1, bestScore = -1, bestAxis = 'r';
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.length <= 1) continue;
      let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0, weight = 0;
      for (const p of b) {
        if (p.r < rMin) rMin = p.r; if (p.r > rMax) rMax = p.r;
        if (p.g < gMin) gMin = p.g; if (p.g > gMax) gMax = p.g;
        if (p.b < bMin) bMin = p.b; if (p.b > bMax) bMax = p.b;
        weight += p.count;
      }
      const dr = rMax - rMin, dg = gMax - gMin, db = bMax - bMin;
      const score = Math.max(dr, dg, db) * Math.pow(weight, 0.25);
      if (score > bestScore) {
        bestScore = score; bestIdx = i;
        bestAxis = dr >= dg && dr >= db ? 'r' : (dg >= db ? 'g' : 'b');
      }
    }
    if (bestIdx < 0) break;
    const b = buckets[bestIdx];
    b.sort((a, c) => a[bestAxis] - c[bestAxis]);
    const mid = Math.max(1, Math.floor(b.length / 2));
    buckets.splice(bestIdx, 1, b.slice(0, mid), b.slice(mid));
  }

  const palette = buckets.map((b) => {
    let sr = 0, sg = 0, sb = 0, sw = 0;
    for (const p of b) { sr += p.r * p.count; sg += p.g * p.count; sb += p.b * p.count; sw += p.count; }
    return [Math.round(sr / sw), Math.round(sg / sw), Math.round(sb / sw)];
  });

  for (let iter = 0; iter < 4; iter++) {
    const sums = palette.map(() => [0, 0, 0, 0]);
    for (const p of unique) {
      let bi = 0, bd = 1e9;
      for (let j = 0; j < palette.length; j++) {
        const dr = p.r - palette[j][0], dg = p.g - palette[j][1], db = p.b - palette[j][2];
        const d = dr * dr * 2 + dg * dg * 3 + db * db;
        if (d < bd) { bd = d; bi = j; }
      }
      sums[bi][0] += p.r * p.count;
      sums[bi][1] += p.g * p.count;
      sums[bi][2] += p.b * p.count;
      sums[bi][3] += p.count;
    }
    for (let j = 0; j < palette.length; j++) {
      if (sums[j][3] > 0) {
        palette[j] = [Math.round(sums[j][0] / sums[j][3]), Math.round(sums[j][1] / sums[j][3]), Math.round(sums[j][2] / sums[j][3])];
      }
    }
  }

  const lookup = new Map();
  const out = Buffer.from(rgba);
  const usedSet = new Set();
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < 128) { out[i + 3] = 0; continue; }
    const key = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2];
    let pal = lookup.get(key);
    if (!pal) {
      let bi = 0, bd = 1e9;
      const r = out[i], g = out[i + 1], b = out[i + 2];
      for (let j = 0; j < palette.length; j++) {
        const dr = r - palette[j][0], dg = g - palette[j][1], db = b - palette[j][2];
        const d = dr * dr * 2 + dg * dg * 3 + db * db;
        if (d < bd) { bd = d; bi = j; }
      }
      pal = palette[bi];
      lookup.set(key, pal);
    }
    out[i] = pal[0]; out[i + 1] = pal[1]; out[i + 2] = pal[2]; out[i + 3] = 255;
    usedSet.add((pal[0] << 16) | (pal[1] << 8) | pal[2]);
  }
  return { rgba: out, colorsUsed: usedSet.size };
}

// ---------------- Multi-Direction Aseprite JSON Builder ----------------
function buildDirectionalAsepriteJson(baseName, frameSize, tagDefs, directions, defaultDir) {
  const frames = [];
  const frameTags = [];
  const colsPerRow = tagDefs.reduce((s, t) => s + t.count, 0);
  const defaultRowIdx = Math.max(0, directions.indexOf(defaultDir));

  // Build frames row-by-row (row = direction, col = animation frame)
  for (let r = 0; r < directions.length; r++) {
    const dir = directions[r];
    let col = 0;
    for (const t of tagDefs) {
      for (let k = 0; k < t.count; k++) {
        frames.push({
          filename: `${t.name}_${dir}_${String(k + 1).padStart(2, '0')}.png`,
          frame: { x: col * frameSize, y: r * frameSize, w: frameSize, h: frameSize },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: frameSize, h: frameSize },
          sourceSize: { w: frameSize, h: frameSize },
          pivot_x: Math.floor(frameSize / 2),
          duration: t.durations[k] ?? t.durations[0] ?? 90,
        });
        col++;
      }
    }
  }

  // 1. Bare default tags (idle, move, attack, ...) pointing to defaultDir row for full backward compatibility
  {
    let offset = defaultRowIdx * colsPerRow;
    for (const t of tagDefs) {
      frameTags.push({
        name: t.name,
        from: offset,
        to: offset + t.count - 1,
        direction: 'forward',
        color: t.color,
      });
      offset += t.count;
    }
  }

  // 2. Explicit directional tags (`<action>_<dir>`) for ALL directions!
  // For 4-way sheets (`s, e, n, w`), ALSO emit Godot 4-way aliases (`_down`, `_side`, `_up`)!
  const alias4 = directions.length === 4 ? { s: 'down', e: 'side', n: 'up' } : {};
  for (let r = 0; r < directions.length; r++) {
    const dir = directions[r];
    let offset = r * colsPerRow;
    for (const t of tagDefs) {
      frameTags.push({
        name: `${t.name}_${dir}`,
        from: offset,
        to: offset + t.count - 1,
        direction: 'forward',
        color: t.color,
      });
      if (alias4[dir]) {
        frameTags.push({
          name: `${t.name}_${alias4[dir]}`,
          from: offset,
          to: offset + t.count - 1,
          direction: 'forward',
          color: t.color,
        });
      }
      offset += t.count;
    }
  }

  return {
    frames,
    meta: {
      app: 'InkNight 45-Deg Multi-Direction Pixel Extractor + Aseprite Pipeline',
      version: '4.0',
      perspective: '45deg_top_down',
      directionCount: directions.length,
      directions,
      defaultDirection: defaultDir,
      image: `${baseName}.png`,
      format: 'RGBA8888',
      size: { w: colsPerRow * frameSize, h: directions.length * frameSize },
      scale: '1',
      anchor: { x: Math.floor(frameSize / 2), y: frameSize === 96 ? 90 : 60 },
      frameTags,
    },
  };
}

// ---------------- Smooth Sequence Builders ----------------
const HERO_TAGS = [
  { name: 'idle', count: 4, durations: [165, 165, 165, 165], color: '#588296ff' },
  { name: 'move', count: 8, durations: [80, 80, 80, 80, 80, 80, 80, 80], color: '#7ea890ff' },
  { name: 'attack', count: 6, durations: [65, 70, 80, 80, 90, 95], color: '#e6b25aff' },
  { name: 'flip', count: 6, durations: [65, 65, 65, 65, 75, 85], color: '#c4d2d6ff' },
  { name: 'hit', count: 2, durations: [100, 120], color: '#b48a5aff' },
  { name: 'death', count: 3, durations: [130, 150, 210], color: '#6b7880ff' },
];

const ENEMY_TAGS = [
  { name: 'idle', count: 4, durations: [165, 165, 165, 165], color: '#588296ff' },
  { name: 'move', count: 6, durations: [85, 85, 85, 85, 85, 85], color: '#7ea890ff' },
  { name: 'attack', count: 4, durations: [80, 75, 85, 100], color: '#d87a58ff' },
  { name: 'hit', count: 2, durations: [100, 120], color: '#b48a5aff' },
  { name: 'death', count: 3, durations: [130, 150, 210], color: '#6b7880ff' },
];

const DIRS_8 = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw'];
const DIRS_4 = ['s', 'e', 'n', 'w'];

/**
 * Builds a silky-smooth 29-frame action row for one canonical hero direction.
 * Uses identical refHeight + torso center-of-mass locking + sinusoidal breathing + smooth 8-step gait + 6-step directional attack.
 */
function buildHeroDirectionRow({
  dirName,
  idleSprite,
  runSprites, // 4 to 8 genuine directional stride poses
  attackSprite,
  flipSprites, // 6 compass turnaround sprites for 360° flip!
  refHeight,
  targetFill,
  attackStyle,
  accentColor,
  warmToAmber = false,
}) {
  const opt = { refHeight, targetFill, footY: 90, allowVermilion: false, warmToAmber, centerMode: 'torso' };

  // 1. Idle (4f): ultra-smooth breathing from locked idle stance
  const idle0 = renderSpriteToFrame(idleSprite, 96, { ...opt, scaleY: 1.000, dy: 0 });
  const idle1 = applyMicroAccent(renderSpriteToFrame(idleSprite, 96, { ...opt, scaleY: 0.986, scaleX: 1.012, dy: 0 }), 96, 'breath1', accentColor);
  const idle2 = applyMicroAccent(renderSpriteToFrame(idleSprite, 96, { ...opt, scaleY: 0.972, scaleX: 1.022, dy: 0 }), 96, 'breath2', accentColor);
  const idle3 = applyMicroAccent(renderSpriteToFrame(idleSprite, 96, { ...opt, scaleY: 0.986, scaleX: 1.012, dy: 0 }), 96, 'breath3', accentColor);

  // 2. Move (8f): smooth periodic stride with subtle natural vertical bounce (0, -1, -2, -1, 0, -1, -2, -1)
  const bob = [0, -1, -2, -1, 0, -1, -2, -1];
  const sx = [1.0, 1.01, 0.99, 1.0, 1.0, 1.01, 0.99, 1.0];
  const moveFrames = [];
  for (let i = 0; i < 8; i++) {
    const src = runSprites[i % runSprites.length];
    let f = renderSpriteToFrame(src, 96, { ...opt, dy: bob[i], scaleX: sx[i] });
    if (i === 0) f = applyMicroAccent(f, 96, 'dust1', accentColor);
    if (i === 4) f = applyMicroAccent(f, 96, 'dust2', accentColor);
    if (i > 0) f = ensureNonDuplicate(moveFrames[i - 1], f, 96, i);
    moveFrames.push(f);
  }

  // 3. Attack (6f): windup -> lunge -> apex strike -> peak VFX -> follow-through -> smooth recover
  const atkBase = attackSprite || runSprites[0];
  const atk0 = renderSpriteToFrame(idleSprite, 96, { ...opt, scaleX: 0.95, scaleY: 1.03, dx: -1 });
  const atk1 = drawDirectionalAttackVfx(renderSpriteToFrame(atkBase, 96, { ...opt, scaleX: 0.98, scaleY: 1.01 }), 96, dirName, attackStyle, 1);
  const atk2 = drawDirectionalAttackVfx(renderSpriteToFrame(atkBase, 96, { ...opt, scaleX: 1.03, scaleY: 0.99, dx: 1 }), 96, dirName, attackStyle, 2);
  const atk3 = drawDirectionalAttackVfx(renderSpriteToFrame(atkBase, 96, { ...opt, scaleX: 1.01, scaleY: 1.00, dx: 1 }), 96, dirName, attackStyle, 3);
  const atk4 = renderSpriteToFrame(atkBase, 96, { ...opt, scaleX: 0.99, scaleY: 1.00 });
  const atk5 = renderSpriteToFrame(runSprites[0], 96, { ...opt, scaleX: 1.00, scaleY: 0.99 });

  // 4. Flip (6f): TRUE 360° compass spin!
  const flipFrames = flipSprites.map((sp, i) =>
    applyFlipSpiritRing(renderSpriteToFrame(sp, 96, { ...opt, dy: i === 2 || i === 3 ? -2 : -1 }), 96, i)
  );

  // 5. Hit (2f)
  const hit0 = applyHitFlash(renderSpriteToFrame(idleSprite, 96, { ...opt, dx: -2, scaleX: 0.96, scaleY: 1.03 }), 96, 0);
  const hit1 = applyHitFlash(renderSpriteToFrame(idleSprite, 96, { ...opt, dx: -3, scaleX: 0.98, scaleY: 0.98 }), 96, 1);

  // 6. Death (3f)
  const deathBase = renderSpriteToFrame(idleSprite, 96, opt);
  const death0 = applyInkDissolve(deathBase, 96, 0);
  const death1 = applyInkDissolve(deathBase, 96, 1);
  const death2 = applyInkDissolve(deathBase, 96, 2);

  const row = [
    idle0, idle1, idle2, idle3,
    ...moveFrames,
    atk0, atk1, atk2, atk3, atk4, atk5,
    ...flipFrames,
    hit0, hit1,
    death0, death1, death2,
  ];
  // Guarantee zero adjacent duplicates across every tag boundary
  let cursor = 0;
  for (const t of HERO_TAGS) {
    for (let k = 1; k < t.count; k++) {
      row[cursor + k] = ensureNonDuplicate(row[cursor + k - 1], row[cursor + k], 96, cursor + k);
    }
    cursor += t.count;
  }
  return row;
}

/**
 * Builds a silky-smooth 19-frame action row for one enemy direction.
 */
function buildEnemyDirectionRow({
  dirName,
  size,
  idleSprite,
  walkSprites,
  attackSprite,
  deathSprite = null,
  refHeight,
  targetFill,
  allowVermilion = false,
  attackStyle = 'beast_claw',
  accentColor = [190, 210, 206],
  floatAmp = 1,
}) {
  const footY = size === 96 ? 90 : 60;
  const opt = { refHeight, targetFill, footY, allowVermilion, warmToAmber: !allowVermilion, centerMode: 'torso' };

  const idle0 = renderSpriteToFrame(idleSprite, size, { ...opt, scaleY: 1.000, dy: 0 });
  const idle1 = applyMicroAccent(renderSpriteToFrame(idleSprite, size, { ...opt, scaleY: 0.985, dy: -Math.min(1, floatAmp) }), size, 'breath1', accentColor);
  const idle2 = applyMicroAccent(renderSpriteToFrame(idleSprite, size, { ...opt, scaleY: 0.970, dy: 0 }), size, 'breath2', accentColor);
  const idle3 = applyMicroAccent(renderSpriteToFrame(idleSprite, size, { ...opt, scaleY: 0.985, dy: -Math.min(1, floatAmp) }), size, 'breath3', accentColor);

  const bob = [0, -floatAmp, -Math.min(2, floatAmp + 1), -floatAmp, 0, -floatAmp];
  const moveFrames = [];
  for (let i = 0; i < 6; i++) {
    const src = walkSprites[i % walkSprites.length];
    let f = renderSpriteToFrame(src, size, { ...opt, dy: bob[i], scaleX: i % 2 === 0 ? 1.0 : 1.015 });
    if (i === 1) f = applyMicroAccent(f, size, 'dust1', accentColor);
    if (i === 4) f = applyMicroAccent(f, size, 'dust2', accentColor);
    if (i > 0) f = ensureNonDuplicate(moveFrames[i - 1], f, size, i);
    moveFrames.push(f);
  }

  const atkSrc = attackSprite || walkSprites[walkSprites.length - 1];
  const atk0 = renderSpriteToFrame(idleSprite, size, { ...opt, scaleX: 0.95, scaleY: 1.04, dx: -1 });
  const atk1 = renderSpriteToFrame(atkSrc, size, { ...opt, scaleX: 1.02, scaleY: 0.98, dx: 1 });
  const atk2 = drawDirectionalAttackVfx(renderSpriteToFrame(atkSrc, size, { ...opt, scaleX: 1.04, scaleY: 0.97, dx: 2 }), size, dirName, attackStyle, 2);
  const atk3 = renderSpriteToFrame(walkSprites[0], size, { ...opt, scaleX: 0.99, scaleY: 1.00 });

  const hit0 = applyHitFlash(renderSpriteToFrame(idleSprite, size, { ...opt, dx: -2 }), size, 0);
  const hit1 = applyHitFlash(renderSpriteToFrame(idleSprite, size, { ...opt, dx: -2, scaleY: 0.98 }), size, 1);

  let death0, death1, death2;
  if (deathSprite) {
    const d0 = renderSpriteToFrame(deathSprite, size, opt);
    death0 = d0;
    death1 = applyInkDissolve(d0, size, 1);
    death2 = applyInkDissolve(d0, size, 2);
  } else {
    const db = renderSpriteToFrame(idleSprite, size, opt);
    death0 = applyInkDissolve(db, size, 0);
    death1 = applyInkDissolve(db, size, 1);
    death2 = applyInkDissolve(db, size, 2);
  }

  const row = [
    idle0, idle1, idle2, idle3,
    ...moveFrames,
    atk0, atk1, atk2, atk3,
    hit0, hit1,
    death0, death1, death2,
  ];
  let cursor = 0;
  for (const t of ENEMY_TAGS) {
    for (let k = 1; k < t.count; k++) {
      row[cursor + k] = ensureNonDuplicate(row[cursor + k - 1], row[cursor + k], size, cursor + k);
    }
    cursor += t.count;
  }
  return row;
}

// ---------------- Load Source Sheets ----------------
console.log('[ExtractMultiDir] Loading 6 new multi-direction 45° sprite sheets + legacy night/boss sheets...');
const mortalImg = loadJpgRgba(path.join(IMG_DIR, 'hero_mortal_8dir_sheet_1795835651172.jpg'));
const shengImg = loadJpgRgba(path.join(IMG_DIR, 'hero_sheng_8dir_sheet_1795835655860.jpg'));
const danImg = loadJpgRgba(path.join(IMG_DIR, 'hero_dan_8dir_sheet_1795835659122.jpg'));
const wolfBoarImg = loadJpgRgba(path.join(IMG_DIR, 'day_wolf_boar_4dir_sheet_1795835662148.jpg'));
const treantShanImg = loadJpgRgba(path.join(IMG_DIR, 'day_treant_shanxiao_4dir_sheet_1795835666562.jpg'));
const nightBossImg = loadJpgRgba(path.join(IMG_DIR, 'night_boss_4dir_sheet_1795835667409.jpg'));
const legacyNightImg = loadJpgRgba(path.join(IMG_DIR, 'night_enemies_45deg_1795737091722.jpg'));
const legacyBossImg = loadJpgRgba(path.join(IMG_DIR, 'boss_special_45deg_1795737091473.jpg'));

const mortalRows = extractAllRows(mortalImg, buildBgMask(mortalImg).isBg);
const shengRows = extractAllRows(shengImg, buildBgMask(shengImg).isBg);
const danRows = extractAllRows(danImg, buildBgMask(danImg).isBg);
const wbRows = extractAllRows(wolfBoarImg, buildBgMask(wolfBoarImg).isBg);
const tsRows = extractAllRows(treantShanImg, buildBgMask(treantShanImg).isBg);
const nbRows = extractAllRows(nightBossImg, buildBgMask(nightBossImg).isBg, { stripFloorShadow: true });

const legacyNightBg = buildBgMask(legacyNightImg).isBg;
const legacyBossBg = buildBgMask(legacyBossImg).isBg;
const legNightR2 = extractRowSegments(legacyNightImg, legacyNightBg, 375, 565);
const legNightR3 = extractRowSegments(legacyNightImg, legacyNightBg, 565, 768);
const legBossR0 = extractRowSegments(legacyBossImg, legacyBossBg, 0, 260);
const legBossR1 = extractRowSegments(legacyBossImg, legacyBossBg, 260, 520);
const legBossR2 = extractRowSegments(legacyBossImg, legacyBossBg, 520, 768);

// ---------------- 1. Build 3 FULL 8-DIRECTION Heroes ----------------
function build8DirHero(canonMap, opts) {
  // canonMap has s, se, e, ne, n; nw/w/sw are exact horizontal mirrors of ne/e/se
  const flipSeq = [canonMap.s.idle, canonMap.se.idle, canonMap.e.idle, canonMap.ne.idle, canonMap.n.idle, flipHorizontal(canonMap.se.idle)];
  const mk = (dirName, c) => buildHeroDirectionRow({ dirName, idleSprite: c.idle, runSprites: c.runSprites, attackSprite: c.attackSprite, flipSprites: flipSeq, ...opts });
  const rowS = mk('s', canonMap.s);
  const rowSE = mk('se', canonMap.se);
  const rowE = mk('e', canonMap.e);
  const rowNE = mk('ne', canonMap.ne);
  const rowN = mk('n', canonMap.n);
  const rowNW = rowNE.map((f) => flipFrameBufferHorizontal(f, 96));
  const rowW = rowE.map((f) => flipFrameBufferHorizontal(f, 96));
  const rowSW = rowSE.map((f) => flipFrameBufferHorizontal(f, 96));
  const rows = [rowS, rowSE, rowE, rowNE, rowN, rowNW, rowW, rowSW];
  // Legacy 8-frame strip uses smooth SE row: walk(4) + hit(1) + death(3)
  const legacy8 = [rowSE[4], rowSE[6], rowSE[8], rowSE[10], rowSE[24], rowSE[26], rowSE[27], rowSE[28]];
  return { rows, defaultRow: rowSE, legacy8 };
}

// Mortal Lamp Bearer (5×10 crisp sheet — lantern 100% locked across all 8 directions!)
const mortalRefH = mortalRows[0][0].h;
const mortalBuilt = build8DirHero({
  s: {
    idle: mortalRows[0][0],
    runSprites: [mortalRows[0][0], mortalRows[0][2], mortalRows[1][2], mortalRows[2][2]],
    attackSprite: mortalRows[0][2],
  },
  se: {
    idle: mortalRows[0][3],
    runSprites: [mortalRows[0][3], mortalRows[1][3], mortalRows[3][3], mortalRows[4][3]],
    attackSprite: mortalRows[0][9],
  },
  e: {
    idle: mortalRows[2][4],
    runSprites: [mortalRows[0][4], mortalRows[1][4], mortalRows[2][4], mortalRows[2][5], mortalRows[3][4], mortalRows[4][4]],
    attackSprite: mortalRows[3][9],
  },
  ne: {
    idle: mortalRows[0][8],
    runSprites: [mortalRows[0][7], mortalRows[0][8], mortalRows[1][7], mortalRows[1][8], mortalRows[3][7], mortalRows[3][8]],
    attackSprite: mortalRows[4][9],
  },
  n: {
    idle: mortalRows[1][5],
    runSprites: [mortalRows[1][5], mortalRows[3][5], mortalRows[4][1], mortalRows[4][5]],
    attackSprite: mortalRows[3][5],
  },
}, { refHeight: mortalRefH, targetFill: 0.85, attackStyle: 'mortal_flame', accentColor: [242, 198, 96], warmToAmber: true });

// Wusheng (5×6 crisp sheet)
const shengRefH = shengRows[0][0].h;
const shengBuilt = build8DirHero({
  s: {
    idle: shengRows[0][0],
    runSprites: [shengRows[0][1], shengRows[0][2], shengRows[1][0], shengRows[0][1]],
    attackSprite: shengRows[0][2],
  },
  se: {
    idle: shengRows[1][1],
    runSprites: [shengRows[1][1], shengRows[1][2], shengRows[0][3], shengRows[0][4], shengRows[1][3], shengRows[1][4]],
    attackSprite: shengRows[0][5],
  },
  e: {
    idle: shengRows[2][0],
    runSprites: [shengRows[2][1], shengRows[2][2], shengRows[2][3], shengRows[2][4]],
    attackSprite: shengRows[2][5],
  },
  ne: {
    idle: shengRows[3][0],
    runSprites: [shengRows[3][0], shengRows[3][1], shengRows[3][3], shengRows[3][4]],
    attackSprite: shengRows[3][5],
  },
  n: {
    idle: shengRows[4][0],
    runSprites: [shengRows[4][1], shengRows[4][2], shengRows[4][3], shengRows[4][4]],
    attackSprite: shengRows[4][5],
  },
}, { refHeight: shengRefH, targetFill: 0.87, attackStyle: 'sheng_thrust', accentColor: [216, 230, 236], warmToAmber: false });

// Qingyi Dan (5×6 crisp sheet)
const danRefH = danRows[0][0].h;
const danBuilt = build8DirHero({
  s: {
    idle: danRows[0][0],
    runSprites: [danRows[0][1], danRows[0][2], danRows[0][3], danRows[0][4]],
    attackSprite: danRows[0][5],
  },
  se: {
    idle: danRows[1][0],
    runSprites: [danRows[1][1], danRows[1][2], danRows[1][3], danRows[1][4]],
    attackSprite: danRows[0][5],
  },
  e: {
    idle: danRows[2][0],
    runSprites: [danRows[2][1], danRows[2][2], danRows[2][3], danRows[2][4]],
    attackSprite: danRows[2][5],
  },
  ne: {
    idle: danRows[3][0],
    runSprites: [danRows[3][1], danRows[3][2], danRows[3][3], danRows[3][4]],
    attackSprite: danRows[3][5],
  },
  n: {
    idle: danRows[4][0],
    runSprites: [danRows[4][1], danRows[4][2], danRows[4][3], danRows[4][4]],
    attackSprite: danRows[4][5],
  },
}, { refHeight: danRefH, targetFill: 0.86, attackStyle: 'dan_sleeve', accentColor: [168, 212, 198], warmToAmber: false });

// ---------------- 2. Build 7 FULL 4-DIRECTION Enemies (4 Daytime + Ghost + Jiangshi + Boss) ----------------
function build4DirEnemy(canonMap, opts) {
  const rowS = buildEnemyDirectionRow({ dirName: 's', ...canonMap.s, ...opts });
  const rowE = buildEnemyDirectionRow({ dirName: 'e', ...canonMap.e, ...opts });
  const rowN = buildEnemyDirectionRow({ dirName: 'n', ...canonMap.n, ...opts });
  const rowW = rowE.map((f) => flipFrameBufferHorizontal(f, opts.size));
  const rows = [rowS, rowE, rowN, rowW];
  const legacy8 = [rowE[4], rowE[5], rowE[6], rowE[7], rowE[14], rowE[16], rowE[17], rowE[18]];
  return { rows, defaultRow: rowE, legacy8 };
}

// Wolf (wbRows[0..2])
const wolfBuilt = build4DirEnemy({
  s: { idleSprite: wbRows[0][0], walkSprites: [wbRows[0][0], wbRows[0][1], wbRows[0][2], flipHorizontal(wbRows[0][2])], attackSprite: wbRows[0][2] },
  e: { idleSprite: wbRows[1][0], walkSprites: [wbRows[1][0], wbRows[1][1], wbRows[1][2], wbRows[1][3]], attackSprite: wbRows[1][3] },
  n: { idleSprite: wbRows[2][0], walkSprites: [wbRows[2][0], wbRows[2][1], wbRows[2][2], flipHorizontal(wbRows[2][1])], attackSprite: wbRows[2][2] },
}, { size: 64, refHeight: wbRows[0][0].h, targetFill: 0.78, allowVermilion: false, attackStyle: 'beast_claw', accentColor: [176, 206, 204] });

// Boar (wbRows[3..5])
const boarBuilt = build4DirEnemy({
  s: { idleSprite: wbRows[3][0], walkSprites: [wbRows[3][0], flipHorizontal(wbRows[3][0]), wbRows[3][0]], attackSprite: wbRows[3][0] },
  e: { idleSprite: wbRows[4][0], walkSprites: [wbRows[4][0], wbRows[4][1], wbRows[4][2], flipHorizontal(wbRows[4][3]), wbRows[3][1], wbRows[3][2]], attackSprite: wbRows[4][2] },
  n: { idleSprite: wbRows[5][0], walkSprites: [wbRows[5][0], wbRows[5][1], wbRows[5][2]], attackSprite: wbRows[5][1] },
}, { size: 64, refHeight: wbRows[3][0].h, targetFill: 0.78, allowVermilion: false, attackStyle: 'beast_claw', accentColor: [188, 198, 184] });

// Treant (tsRows[0..2] — 8 smooth frames per direction!)
const treantBuilt = build4DirEnemy({
  s: { idleSprite: tsRows[0][0], walkSprites: tsRows[0].slice(1, 7), attackSprite: tsRows[0][7] },
  e: { idleSprite: tsRows[1][0], walkSprites: tsRows[1].slice(1, 7), attackSprite: tsRows[1][7] },
  n: { idleSprite: tsRows[2][0], walkSprites: tsRows[2].slice(1, 7), attackSprite: tsRows[2][7] },
}, { size: 64, refHeight: tsRows[0][0].h, targetFill: 0.85, allowVermilion: false, attackStyle: 'beast_claw', accentColor: [148, 194, 162], floatAmp: 0 });

// Shanxiao Elite (tsRows[3..5] — 8 smooth frames per direction!)
const shanxiaoBuilt = build4DirEnemy({
  s: { idleSprite: tsRows[3][0], walkSprites: tsRows[3].slice(1, 7), attackSprite: tsRows[3][7] },
  e: { idleSprite: tsRows[4][1], walkSprites: tsRows[4].slice(1, 7), attackSprite: tsRows[4][7] },
  n: { idleSprite: tsRows[5][1], walkSprites: tsRows[5].slice(1, 7), attackSprite: tsRows[5][6] },
}, { size: 96, refHeight: tsRows[3][0].h, targetFill: 0.86, allowVermilion: true, attackStyle: 'crimson_brush', accentColor: [216, 74, 66] });

// Ghost (nbRows[0..1])
const ghostBuilt = build4DirEnemy({
  s: { idleSprite: nbRows[0][0], walkSprites: [nbRows[0][0], nbRows[0][1], nbRows[0][5], nbRows[0][1]], attackSprite: nbRows[0][5], deathSprite: nbRows[1][5] },
  e: { idleSprite: nbRows[0][2], walkSprites: [nbRows[0][2], nbRows[0][3], nbRows[0][4], nbRows[0][6]], attackSprite: nbRows[1][3], deathSprite: nbRows[1][5] },
  n: { idleSprite: nbRows[1][0], walkSprites: [nbRows[1][0], nbRows[1][1], nbRows[1][2]], attackSprite: nbRows[1][2], deathSprite: nbRows[1][5] },
}, { size: 64, refHeight: nbRows[0][0].h, targetFill: 0.84, allowVermilion: false, attackStyle: 'dan_sleeve', accentColor: [176, 218, 220], floatAmp: 2 });

// Jiangshi (nbRows[2..3])
const jiangshiBuilt = build4DirEnemy({
  s: { idleSprite: nbRows[2][0], walkSprites: [nbRows[2][0], nbRows[2][1], nbRows[2][0], nbRows[2][1]], attackSprite: nbRows[2][1], deathSprite: nbRows[3][5] },
  e: { idleSprite: nbRows[2][2], walkSprites: nbRows[2].slice(2, 8), attackSprite: nbRows[3][4], deathSprite: nbRows[3][5] },
  n: { idleSprite: nbRows[3][0], walkSprites: nbRows[3].slice(0, 4), attackSprite: nbRows[3][3], deathSprite: nbRows[3][5] },
}, { size: 64, refHeight: nbRows[2][0].h, targetFill: 0.84, allowVermilion: true, attackStyle: 'beast_claw', accentColor: [212, 198, 136], floatAmp: 2 });

// Magistrate Boss (nbRows[4..5] + calm East strides from legBossR0)
const bossBuilt = build4DirEnemy({
  s: { idleSprite: nbRows[4][0], walkSprites: [nbRows[4][0], nbRows[4][1], nbRows[4][2], nbRows[4][3]], attackSprite: nbRows[5][4], deathSprite: nbRows[5][5] },
  e: { idleSprite: legBossR0[0], walkSprites: [legBossR0[0], legBossR0[1], legBossR0[2], legBossR0[1]], attackSprite: nbRows[5][4], deathSprite: nbRows[5][5] },
  n: { idleSprite: nbRows[5][0], walkSprites: [nbRows[5][0], nbRows[5][1], nbRows[5][2], nbRows[5][3]], attackSprite: nbRows[5][3], deathSprite: nbRows[5][5] },
}, { size: 96, refHeight: nbRows[4][0].h, targetFill: 0.88, allowVermilion: true, attackStyle: 'crimson_brush', accentColor: [220, 74, 64], floatAmp: 1 });

// ---------------- Write ALL 10 Multi-Direction Cel-Ink Actors ----------------
const celActors = [
  {
    key: 'player_mortal', base: 'player_mortal_cel', name: '提灯少年', role: '凡界主角 · 8方向 · 120° 减速灯火锥',
    category: 'hero', size: 96, scale: 1, offset_y: -18, fps: 12, allow_vermilion: false,
    directions: DIRS_8, defaultDir: 'se', tags: HERO_TAGS, built: mortalBuilt,
    framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_96'),
  },
  {
    key: 'player_sheng', base: 'player_sheng_cel', name: '武生（阳面）', role: '诡界主角 · 8方向 · 直线 3 穿透剑气',
    category: 'hero', size: 96, scale: 1, offset_y: -18, fps: 12, allow_vermilion: false,
    directions: DIRS_8, defaultDir: 'se', tags: HERO_TAGS, built: shengBuilt,
    framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_player_sheng_cel'),
  },
  {
    key: 'player_dan', base: 'player_dan_cel', name: '青衣旦（阴面）', role: '诡界主角 · 8方向 · 220° 水袖击退',
    category: 'hero', size: 96, scale: 1, offset_y: -18, fps: 12, allow_vermilion: false,
    directions: DIRS_8, defaultDir: 'se', tags: HERO_TAGS, built: danBuilt,
    framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_player_dan_cel'),
  },
  {
    key: 'wolf', base: 'enemy_wolf_cel', name: '山狼', role: '白昼山林 · 4方向 · 高速绕袭轻怪',
    category: 'day_enemy', size: 64, scale: 1, offset_y: -12, fps: 11, allow_vermilion: false,
    directions: DIRS_4, defaultDir: 'e', tags: ENEMY_TAGS, built: wolfBuilt,
    framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_enemy_wolf_cel'),
  },
  {
    key: 'boar', base: 'enemy_boar_cel', name: '野猪', role: '白昼山林 · 4方向 · 蓄力直线冲锋',
    category: 'day_enemy', size: 64, scale: 1.05, offset_y: -12, fps: 10, allow_vermilion: false,
    directions: DIRS_4, defaultDir: 'e', tags: ENEMY_TAGS, built: boarBuilt,
    framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_enemy_boar_cel'),
  },
  {
    key: 'treant', base: 'enemy_treant_cel', name: '树妖', role: '白昼山林 · 4方向 · 高血量慢速重怪',
    category: 'day_enemy', size: 64, scale: 1.15, offset_y: -16, fps: 9, allow_vermilion: false,
    directions: DIRS_4, defaultDir: 'e', tags: ENEMY_TAGS, built: treantBuilt,
    framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_enemy_treant_cel'),
  },
  {
    key: 'shanxiao', base: 'enemy_shanxiao_cel', name: '山魈（白昼精英）', role: '白昼精英 · 4方向 · 扑袭红眼山精',
    category: 'day_elite', size: 96, scale: 1.2, offset_y: -22, fps: 10, allow_vermilion: true,
    directions: DIRS_4, defaultDir: 'e', tags: ENEMY_TAGS, built: shanxiaoBuilt,
    framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_enemy_shanxiao_cel'),
  },
  {
    key: 'ghost', base: 'ghost_cel', name: '游魂', role: '诡界幽祟 · 4方向 · 飘忽追魂',
    category: 'night_enemy', size: 64, scale: 1.0, offset_y: -8, fps: 10, allow_vermilion: false,
    directions: DIRS_4, defaultDir: 'e', tags: ENEMY_TAGS, built: ghostBuilt,
    framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_ghost_cel'),
  },
  {
    key: 'jiangshi', base: 'jiangshi_cel', name: '行尸', role: '诡界僵祟 · 4方向 · 符箓跳行',
    category: 'night_enemy', size: 64, scale: 1.0, offset_y: -14, fps: 9, allow_vermilion: true,
    directions: DIRS_4, defaultDir: 'e', tags: ENEMY_TAGS, built: jiangshiBuilt,
    framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_jiangshi_cel'),
  },
  {
    key: 'boss_magistrate', base: 'boss_magistrate_cel', name: '纸扎判官（Boss）', role: '诡界头目 · 4方向 · 朱笔判生死',
    category: 'boss', size: 96, scale: 1.35, offset_y: -26, fps: 9, allow_vermilion: true,
    directions: DIRS_4, defaultDir: 's', tags: ENEMY_TAGS, built: bossBuilt,
    framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_boss_magistrate_cel'),
  },
];

const celManifest = { version: '4.0', actors: [] };

for (const actor of celActors) {
  const grid = stitchDirectionalGrid(actor.built.rows, actor.size);
  writeToSpriteDirs(`${actor.base}.png`, encodePngRgba(grid.w, grid.h, grid.rgba));
  const jsonDoc = buildDirectionalAsepriteJson(actor.base, actor.size, actor.tags, actor.directions, actor.defaultDir);
  writeToSpriteDirs(`${actor.base}.json`, JSON.stringify(jsonDoc, null, 2) + '\n');

  // Save default-direction clean individual frames for Aseprite Lua assembly (`idle_01.png`, ...)
  if (actor.framesDir) {
    fs.rmSync(actor.framesDir, { recursive: true, force: true });
    fs.mkdirSync(actor.framesDir, { recursive: true });
    let idx = 0;
    for (const t of actor.tags) {
      for (let k = 0; k < t.count; k++) {
        const fn = `${t.name}_${String(k + 1).padStart(2, '0')}.png`;
        fs.writeFileSync(path.join(actor.framesDir, fn), encodePngRgba(actor.size, actor.size, actor.built.defaultRow[idx]));
        idx++;
      }
    }
  }

  celManifest.actors.push({
    key: actor.key,
    name: actor.name,
    role: actor.role,
    category: actor.category,
    size: actor.size,
    scale: actor.scale,
    offset_y: actor.offset_y,
    fps: actor.fps,
    directions: actor.directions,
    direction_count: actor.directions.length,
    cel_path: `res://assets/sprites/${actor.base}.png`,
    aseprite_json: `res://assets/sprites/${actor.base}.json`,
    qa_json: `${actor.base}.qa.json`,
    file: `${actor.base}.png`,
    json_file: `${actor.base}.json`,
    allow_vermilion: actor.allow_vermilion,
  });

  console.log(`[ExtractMultiDir] Wrote ${actor.base}.png (${grid.w}x${grid.h}, ${actor.directions.length} dirs × ${grid.cols}f = ${grid.rows * grid.cols}f)`);
}

writeToSpriteDirs('cel_manifest.json', JSON.stringify(celManifest, null, 2) + '\n');

// Update manifest.json so Ghost, Jiangshi, Boss Magistrate ALSO wire their new 4-dir Cel-Ink sheets while keeping 11 upstream keys!
const manifestJson = {
  player_mortal: { path: 'res://assets/sprites/player_mortal.png', cel_path: 'res://assets/sprites/player_mortal_cel.png', aseprite_json: 'res://assets/sprites/player_mortal_cel.json', size: 96, fps: 12.0, scale: 1.0, offset_y: -18.0 },
  player_sheng: { path: 'res://assets/sprites/player_sheng.png', cel_path: 'res://assets/sprites/player_sheng_cel.png', aseprite_json: 'res://assets/sprites/player_sheng_cel.json', size: 96, fps: 12.0, scale: 1.0, offset_y: -18.0 },
  player_dan: { path: 'res://assets/sprites/player_dan.png', cel_path: 'res://assets/sprites/player_dan_cel.png', aseprite_json: 'res://assets/sprites/player_dan_cel.json', size: 96, fps: 12.0, scale: 1.0, offset_y: -18.0 },
  boss_magistrate: { path: 'res://assets/sprites/boss_magistrate.png', cel_path: 'res://assets/sprites/boss_magistrate_cel.png', aseprite_json: 'res://assets/sprites/boss_magistrate_cel.json', size: 96, fps: 9.0, scale: 1.35, offset_y: -26.0 },
  ghost: { path: 'res://assets/sprites/ghost.png', cel_path: 'res://assets/sprites/ghost_cel.png', aseprite_json: 'res://assets/sprites/ghost_cel.json', size: 64, fps: 10.0, scale: 1.0, offset_y: -8.0 },
  jiangshi: { path: 'res://assets/sprites/jiangshi.png', cel_path: 'res://assets/sprites/jiangshi_cel.png', aseprite_json: 'res://assets/sprites/jiangshi_cel.json', size: 64, fps: 9.0, scale: 1.0, offset_y: -14.0 },
  wisp_caster: { path: 'res://assets/sprites/wisp_caster.png', size: 64, fps: 9.0, scale: 1.0, offset_y: -12.0 },
  elite_ghost: { path: 'res://assets/sprites/elite_ghost.png', size: 64, fps: 8.0, scale: 1.35, offset_y: -12.0 },
  elite_jiangshi: { path: 'res://assets/sprites/elite_jiangshi.png', size: 64, fps: 7.0, scale: 1.3, offset_y: -18.0 },
  punisher: { path: 'res://assets/sprites/punisher.png', size: 64, fps: 9.0, scale: 1.25, offset_y: -18.0 },
  white_stranger: { path: 'res://assets/sprites/white_stranger.png', size: 64, fps: 6.0, scale: 1.1, offset_y: -14.0 },
};
writeToSpriteDirs('manifest.json', JSON.stringify(manifestJson, null, 2) + '\n');

// ---------------- 3. Refresh ALL 11 Legacy 8-Frame Strips (<= 16/18 colors) ----------------
function buildProtocol8(walkSprites, size, { allowVermilion = true, targetFill = 0.84, floatAmp = 1, accent = [180, 210, 210], hitSprite = null, deathSprite = null } = {}) {
  const allSrc = [...walkSprites, ...(hitSprite ? [hitSprite] : []), ...(deathSprite ? [deathSprite] : [])];
  const refH = Math.max(...allSrc.map((s) => s.h));
  const footY = size === 96 ? 90 : 60;
  const renderOne = (src, dx = 0, dy = 0, scaleY = 1.0) =>
    renderSpriteToFrame(src, size, { refHeight: refH, targetFill, footY, dx, dy, scaleY, allowVermilion, centerMode: 'torso' });
  const walkFrames = [0, 1, 2, 3].map((i) => {
    const dy = Math.round(Math.sin((i / 4) * Math.PI * 2) * floatAmp);
    let f = renderOne(walkSprites[i % walkSprites.length], 0, dy, i % 2 === 0 ? 1.0 : 0.985);
    if (i % 2 === 1) f = applyMicroAccent(f, size, 'breath1', accent);
    return f;
  });
  const hitFrame = applyHitFlash(renderOne(hitSprite || walkSprites[0], -2, 0), size, 0);
  const d0 = deathSprite ? renderOne(deathSprite, 0, 0) : applyInkDissolve(renderOne(walkSprites[0]), size, 0);
  const d1 = applyInkDissolve(d0, size, 1);
  const d2 = applyInkDissolve(d0, size, 2);
  return [...walkFrames, hitFrame, d0, d1, d2];
}

const wispPoses = legNightR2.slice(0, 4);
const eliteGhostPoses = [...legNightR2.slice(4, 8), legNightR3[2], legNightR3[3]];
const eliteJiangshiPoses = [legNightR3[0], legNightR3[1], legNightR3[4], legNightR3[5]];

const legacySpecs = [
  { key: 'player_mortal', label: '提灯少年（8向流畅·45°俯视）', size: 96, fps: 12, frames: mortalBuilt.legacy8 },
  { key: 'player_sheng', label: '武生快剑（8向流畅·45°俯视）', size: 96, fps: 12, frames: shengBuilt.legacy8 },
  { key: 'player_dan', label: '青衣水袖（8向流畅·45°俯视）', size: 96, fps: 12, frames: danBuilt.legacy8 },
  { key: 'boss_magistrate', label: '纸扎判官（4向Boss·45°俯视）', size: 96, fps: 9, frames: bossBuilt.legacy8 },
  { key: 'ghost', label: '游魂（4向流畅·45°俯视）', size: 64, fps: 10, frames: ghostBuilt.legacy8 },
  { key: 'jiangshi', label: '行尸（4向流畅·45°俯视）', size: 64, fps: 9, frames: jiangshiBuilt.legacy8 },
  { key: 'wisp_caster', label: '鬼火灵（45°俯视）', size: 64, fps: 9, frames: buildProtocol8(wispPoses, 64, { allowVermilion: false, targetFill: 0.84, floatAmp: 2, accent: [148, 224, 198] }) },
  { key: 'elite_ghost', label: '红眼大幽魂（精英·45°俯视）', size: 64, fps: 8, frames: buildProtocol8(eliteGhostPoses.slice(0, 4), 64, { allowVermilion: true, targetFill: 0.86, floatAmp: 2, accent: [216, 70, 68] }) },
  { key: 'elite_jiangshi', label: '红眼印章尸（精英·45°俯视）', size: 64, fps: 7, frames: buildProtocol8(eliteJiangshiPoses, 64, { allowVermilion: true, targetFill: 0.86, floatAmp: 1, accent: [216, 70, 68] }) },
  { key: 'punisher', label: '白纸差役（破戒追猎·45°俯视）', size: 64, fps: 9, frames: buildProtocol8([legBossR1[1], legBossR1[2], legBossR1[4], legBossR1[5]], 64, { allowVermilion: true, targetFill: 0.86, floatAmp: 1, hitSprite: legBossR1[6], deathSprite: legBossR1[7] }) },
  { key: 'white_stranger', label: '白衣问路人（禁忌七·45°俯视）', size: 64, fps: 6, frames: buildProtocol8([legBossR2[0], legBossR2[1], legBossR2[2], legBossR2[4]], 64, { allowVermilion: true, targetFill: 0.86, floatAmp: 1, hitSprite: legBossR2[6], deathSprite: legBossR2[7] }) },
];

const paletteReport = {
  version: '4.0.0',
  protocol: 'horizontal_strip_v1_45deg_multidir',
  palette_gate: 'ink_night_18_colors',
  sprites: {},
};

for (const spec of legacySpecs) {
  const stitched = stitchFramesHorizontal(spec.frames, spec.size);
  const { rgba: quantized, colorsUsed } = quantizeToMaxColors(stitched.rgba, 16);
  writeToSpriteDirs(`${spec.key}.png`, encodePngRgba(stitched.w, stitched.h, quantized));
  paletteReport.sprites[spec.key] = {
    path: `res://assets/sprites/${spec.key}.png`,
    file: `${spec.key}.png`,
    label: spec.label,
    frame_size: spec.size,
    hframes: 8,
    fps: spec.fps,
    colors_used: colorsUsed,
    palette_gate_passed: colorsUsed <= 18,
  };
  console.log(`[ExtractMultiDir] Wrote legacy ${spec.key}.png (${stitched.w}x${stitched.h}, ${colorsUsed} colors <= 18)`);
}

writeToSpriteDirs('palette-report.json', JSON.stringify(paletteReport, null, 2) + '\n');

// Update reference sheets in BOTH sprite directories
const refCopies = [
  ['hero_mortal_8dir_sheet_1795835651172.jpg', 'hero_mortal_sheet.jpg'],
  ['hero_sheng_8dir_sheet_1795835655860.jpg', 'hero_sheng_sheet.jpg'],
  ['hero_dan_8dir_sheet_1795835659122.jpg', 'hero_dan_sheet.jpg'],
  ['day_wolf_boar_4dir_sheet_1795835662148.jpg', 'day_wolf_boar_sheet.jpg'],
  ['day_treant_shanxiao_4dir_sheet_1795835666562.jpg', 'daytime_enemies_sheet.jpg'],
  ['night_boss_4dir_sheet_1795835667409.jpg', 'boss_judge_sheet.jpg'],
  ['night_enemies_45deg_1795737091722.jpg', 'enemies_pixel_sheet.jpg'],
];
for (const [src, dst] of refCopies) {
  const buf = fs.readFileSync(path.join(IMG_DIR, src));
  writeToSpriteDirs(path.join('reference', dst), buf);
}

console.log('[ExtractMultiDir] All 10 multi-direction Cel-Ink atlases + 11 legacy 8-frame strips generated successfully!');
