#!/usr/bin/env node
/**
 * Ink Night: Strict 45-Degree High-Angle Top-Down Pixel-Art Sprite Extractor & Assembler
 *
 * Extracts authentic studio-grade 45° overhead top-down dark Chinese folklore pixel-art
 * sprites from all 6 unified 45° top-down source sheets (via ImageMagick `convert`),
 * removes the flat neutral mid-grey background with enclosed-hole cleanup & 1px anti-halo
 * defringing, enforces strict hero zero-vermilion rules, locks footline anchors, and outputs:
 *   1. All 7 Cel-Ink multi-action spritesheets + Aseprite JSON-Array metadata:
 *        - player_mortal_cel (96x96, 29f, 6 tags, 0 vermilion)
 *        - player_sheng_cel  (96x96, 29f, 6 tags, 0 vermilion)
 *        - player_dan_cel    (96x96, 29f, 6 tags, 0 vermilion)
 *        - enemy_wolf_cel    (64x64, 19f, 5 tags, 0 vermilion)
 *        - enemy_boar_cel    (64x64, 19f, 5 tags, 0 vermilion)
 *        - enemy_treant_cel  (64x64, 19f, 5 tags, 0 vermilion)
 *        - enemy_shanxiao_cel(96x96, 19f, 5 tags, crimson eyes allowed)
 *   2. All 11 legacy 8-frame horizontal strip spritesheets (manifest.json) strictly adhering
 *      to Godot's `walk(0..3) + hit(4) + death(5..7)` protocol, quantized cleanly to <= 16
 *      colors each + verified `palette-report.json`.
 *   3. Synced individual frames in `art_pipeline/frames_96/` and updated 45° reference sheets.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const GODOT_DIR = path.join(ROOT, 'godot-prototype');
const SPRITES_DIR = path.join(GODOT_DIR, 'assets/sprites');
const REF_DIR = path.join(SPRITES_DIR, 'reference');
const FRAMES_96_DIR = path.join(GODOT_DIR, 'art_pipeline/frames_96');
const IMG_DIR = path.join(ROOT, 'src/assets/images');

fs.mkdirSync(SPRITES_DIR, { recursive: true });
fs.mkdirSync(REF_DIR, { recursive: true });
fs.mkdirSync(FRAMES_96_DIR, { recursive: true });

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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
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

/**
 * Removes uniform flat neutral-grey background via border flood-fill,
 * enclosed-cavity cleanup (gaps between limbs/weapons/sleeves), and 1px anti-halo defringe.
 */
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

  // Punch out enclosed neutral-grey background holes (between limbs, sleeves, plumes, weapon handles)
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
      let darkBorder = 0;
      let totalBorder = 0;
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

  // 1px anti-halo defringe against the neutral-grey background
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
          if (d <= 82 && sat <= 26 && lum >= 74) {
            toDrop.push(i);
          }
        }
      }
    }
    for (const i of toDrop) isBg[i] = 1;
  }

  return { isBg, bgR, bgG, bgB };
}

/**
 * Extracts all sprites in a Y-band by X-column projection segments.
 * Preserves detached pixel particles (e.g., flame sparks, boss paper embers) inside each sprite column!
 */
function extractRowSegments(sheet, isBg, y0, y1, { minWidth = 28, minPixels = 12 } = {}) {
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
        const doff = ((y - minY) * cw + (x - minX)) * 4;
        const soff = idx * 4;
        buf[doff] = rgba[soff];
        buf[doff + 1] = rgba[soff + 1];
        buf[doff + 2] = rgba[soff + 2];
        buf[doff + 3] = 255;
      }
    }
    return { minX, minY, maxX, maxY, w: cw, h: ch, rgba: buf, pixels: cnt };
  }).filter((s) => s.pixels >= minPixels);
}

/**
 * Extracts 2D connected components inside a Y-band (used when adjacent sleeves overhang in X without touching in 2D).
 */
function extractRowCCs(sheet, isBg, y0, y1, { minPixels = 450 } = {}) {
  const { w, h, rgba } = sheet;
  const vis = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  const comps = [];
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (isBg[idx] || vis[idx]) continue;
      let qh = 0, qt = 0;
      q[qt++] = idx;
      vis[idx] = 1;
      let minX = x, maxX = x, minY = y, maxY = y;
      while (qh < qt) {
        const ci = q[qh++];
        const cx = ci % w, cy = (ci / w) | 0;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && nx < w && ny >= y0 && ny < y1) {
              const ni = ny * w + nx;
              if (!isBg[ni] && !vis[ni]) {
                vis[ni] = 1;
                q[qt++] = ni;
              }
            }
          }
        }
      }
      if (qt < minPixels) continue;
      const cw = maxX - minX + 1;
      const ch = maxY - minY + 1;
      const buf = Buffer.alloc(cw * ch * 4);
      for (let k = 0; k < qt; k++) {
        const ci = q[k];
        const cx = ci % w, cy = (ci / w) | 0;
        const doff = ((cy - minY) * cw + (cx - minX)) * 4;
        const soff = ci * 4;
        buf[doff] = rgba[soff];
        buf[doff + 1] = rgba[soff + 1];
        buf[doff + 2] = rgba[soff + 2];
        buf[doff + 3] = 255;
      }
      comps.push({ minX, minY, maxX, maxY, w: cw, h: ch, rgba: buf, pixels: qt });
    }
  }
  comps.sort((a, b) => a.minX - b.minX);
  return comps;
}

// ---------------- Sprite Transforms & Crisp Downsampling ----------------
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

function sanitizeVermilion(buf, allowVermilion = false, warmToAmber = false) {
  if (allowVermilion) return;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue;
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    if (r >= 130 && g <= 105 && b <= 95 && (r - g) >= 50 && (r - b) >= 58) {
      if (warmToAmber) {
        buf[i] = Math.min(232, r);
        buf[i + 1] = Math.min(200, Math.round(r * 0.78));
        buf[i + 2] = Math.min(110, Math.round(r * 0.36));
      } else {
        const lum = Math.round(r * 0.25 + g * 0.55 + b * 0.2);
        buf[i] = Math.max(18, Math.min(72, lum - 8));
        buf[i + 1] = Math.max(22, Math.min(82, lum));
        buf[i + 2] = Math.max(28, Math.min(92, lum + 8));
      }
    }
  }
}

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
} = {}) {
  const maxW = frameSize - 6;
  const maxH = footY - 4;
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
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      if (scaled[(y * dstW + x) * 4 + 3] > 0) {
        if (x < sMinX) sMinX = x;
        if (x > sMaxX) sMaxX = x;
        if (y > sMaxY) sMaxY = y;
      }
    }
  }
  const centerX = Math.round((sMinX + sMaxX) / 2);
  const offX = Math.floor(frameSize / 2) + dx - centerX;
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

// ---------------- Crisp Pixel-Art VFX Accents ----------------
function setPx(buf, size, x, y, r, g, b, a = 255) {
  const ix = Math.round(x), iy = Math.round(y);
  if (ix < 0 || ix >= size || iy < 0 || iy >= size) return;
  const o = (iy * size + ix) * 4;
  buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = a;
}

function drawArcSmear(buf, size, cx, cy, rx, ry, a0, a1, thickness, colCore, colEdge) {
  const steps = 42;
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

function applyHitFlash(frame, size, stage) {
  const out = Buffer.from(frame);
  if (stage === 0) {
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      out[i] = Math.min(248, Math.round(out[i] * 0.35 + 238 * 0.65));
      out[i + 1] = Math.min(248, Math.round(out[i + 1] * 0.35 + 240 * 0.65));
      out[i + 2] = Math.min(242, Math.round(out[i + 2] * 0.35 + 228 * 0.65));
    }
    const cx = Math.round(size * 0.62), cy = Math.round(size * 0.42);
    for (let d = -4; d <= 4; d++) {
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
    for (let k = 0; k < 5; k++) {
      setPx(out, size, Math.round(size * 0.32) + k * 5, fy - 1 - (k % 2), 188, 198, 202);
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
  const cy = Math.round(size * 0.60);
  const phase = stepIdx * 1.05;
  const rx = Math.round(size * (0.30 + 0.07 * Math.sin(stepIdx * 0.9)));
  const ry = Math.round(size * 0.17);
  drawArcSmear(out, size, cx, cy, rx, ry, phase, phase + Math.PI * 1.2, 2, [238, 224, 176], [88, 128, 134]);
  setPx(out, size, cx, footY, 14, 20, 26);
  return out;
}

function applySubtleAuraOrDust(frame, size, variant, accentColor = [235, 190, 102]) {
  const out = Buffer.from(frame);
  const footY = size === 96 ? 90 : 60;
  const cx = Math.floor(size / 2);
  if (variant === 'dust1') {
    setPx(out, size, cx - 12, footY - 1, 164, 174, 178);
    setPx(out, size, cx - 14, footY - 2, 126, 138, 144);
    setPx(out, size, cx - 9, footY, 18, 24, 30);
  } else if (variant === 'dust2') {
    setPx(out, size, cx - 15, footY - 2, 178, 188, 190);
    setPx(out, size, cx - 10, footY - 1, 140, 152, 158);
    setPx(out, size, cx - 18, footY - 3, 110, 122, 128);
  } else if (variant === 'shimmer1' || variant === 'shimmer2') {
    const off = variant === 'shimmer1' ? 0 : 1;
    setPx(out, size, cx + 14 + off * 2, Math.round(size * 0.34) - off * 2, accentColor[0], accentColor[1], accentColor[2]);
    setPx(out, size, cx - 14 - off, Math.round(size * 0.48) - off * 3, 190, 204, 206);
  }
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

// ---------------- Palette Quantizer (<= 16 colors per legacy 8-frame sheet) ----------------
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
        bestScore = score;
        bestIdx = i;
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
        palette[j] = [
          Math.round(sums[j][0] / sums[j][3]),
          Math.round(sums[j][1] / sums[j][3]),
          Math.round(sums[j][2] / sums[j][3]),
        ];
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

// ---------------- Aseprite JSON-Array Metadata Builder ----------------
function buildAsepriteJson(baseName, frameSize, tagDefs, totalFrames) {
  const frames = [];
  const frameTags = [];
  let idx = 0;
  for (const t of tagDefs) {
    const from = idx;
    for (let k = 0; k < t.count; k++) {
      frames.push({
        filename: `${t.name}_${String(k + 1).padStart(2, '0')}.png`,
        frame: { x: idx * frameSize, y: 0, w: frameSize, h: frameSize },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: frameSize, h: frameSize },
        sourceSize: { w: frameSize, h: frameSize },
        duration: t.durations[k] ?? t.durations[0] ?? 100,
      });
      idx++;
    }
    frameTags.push({ name: t.name, from, to: idx - 1, direction: 'forward', color: t.color });
  }
  if (idx !== totalFrames) throw new Error(`${baseName}: tag sum ${idx} !== ${totalFrames}`);
  return {
    frames,
    meta: {
      app: 'InkNight 45-Deg Top-Down Pixel Extractor + Aseprite Pipeline',
      version: '3.0',
      perspective: '45deg_top_down',
      image: `${baseName}.png`,
      format: 'RGBA8888',
      size: { w: totalFrames * frameSize, h: frameSize },
      scale: '1',
      anchor: { x: Math.floor(frameSize / 2), y: frameSize === 96 ? 90 : 60 },
      frameTags,
    },
  };
}

// ---------------- Load All 6 Strict 45-Degree Top-Down Source Sheets ----------------
console.log('[Extract45Deg] Loading 6 strict 45-degree overhead top-down sprite sheets...');
const mortalSheet = loadJpgRgba(path.join(IMG_DIR, 'hero_mortal_45deg_1795737076592.jpg'));
const shengSheet = loadJpgRgba(path.join(IMG_DIR, 'hero_sheng_45deg_1795737080278.jpg'));
const danSheet = loadJpgRgba(path.join(IMG_DIR, 'hero_dan_45deg_1795737084179.jpg'));
const daySheet = loadJpgRgba(path.join(IMG_DIR, 'daytime_enemies_45deg_1795737088239.jpg'));
const nightSheet = loadJpgRgba(path.join(IMG_DIR, 'night_enemies_45deg_1795737091722.jpg'));
const bossSheet = loadJpgRgba(path.join(IMG_DIR, 'boss_special_45deg_1795737091473.jpg'));

const mortalBg = buildBgMask(mortalSheet, { tol: 38 });
const shengBg = buildBgMask(shengSheet, { tol: 38 });
const danBg = buildBgMask(danSheet, { tol: 38 });
const dayBg = buildBgMask(daySheet, { tol: 38 });
const nightBg = buildBgMask(nightSheet, { tol: 38 });
const bossBg = buildBgMask(bossSheet, { tol: 38 });

// Extract per-row poses
const mortalR0 = extractRowSegments(mortalSheet, mortalBg.isBg, 0, 260); // 7: [0..4 idle, 5..6 hurt kneel]
const mortalR1 = extractRowSegments(mortalSheet, mortalBg.isBg, 255, 515); // 7: diagonal run cycle
const mortalR2 = extractRowSegments(mortalSheet, mortalBg.isBg, 510, 768); // 6: 45° ground-plane flame sweep

const shengR0 = extractRowSegments(shengSheet, shengBg.isBg, 0, 260); // 6: [0..3 idle, 4..5 recoil]
const shengR1 = extractRowSegments(shengSheet, shengBg.isBg, 255, 515); // 6: diagonal martial run
const shengR2 = extractRowSegments(shengSheet, shengBg.isBg, 510, 768); // 6: thrust & crescent silver slash

const danR0 = extractRowSegments(danSheet, danBg.isBg, 0, 260); // 6: [0..3 idle, 4..5 recoil]
const danR1 = extractRowCCs(danSheet, danBg.isBg, 255, 515); // 6: diagonal glide & back-view run
const danR2 = extractRowSegments(danSheet, danBg.isBg, 510, 768); // 6: 220° overhead water-sleeve sweep

const wolfPoses = extractRowSegments(daySheet, dayBg.isBg, 0, 200); // 5 (all facing down-right)
const boarPosesRaw = extractRowSegments(daySheet, dayBg.isBg, 200, 365); // 5 (0..1 down-left, 2..4 down-right)
const boarPoses = [flipHorizontal(boarPosesRaw[0]), flipHorizontal(boarPosesRaw[1]), boarPosesRaw[2], boarPosesRaw[3], boarPosesRaw[4]];
const treantPoses = extractRowSegments(daySheet, dayBg.isBg, 365, 570); // 5
const shanxiaoPoses = extractRowSegments(daySheet, dayBg.isBg, 570, 768); // 5

const ghostPoses = extractRowSegments(nightSheet, nightBg.isBg, 0, 185); // 8
const jiangshiPoses = extractRowSegments(nightSheet, nightBg.isBg, 185, 375); // 8
const nightR2 = extractRowSegments(nightSheet, nightBg.isBg, 375, 565); // 8: [0..3 wisp, 4..7 elite_ghost]
const nightR3 = extractRowSegments(nightSheet, nightBg.isBg, 565, 768); // 8: [0,1,4,5,6,7 elite_jiangshi]
const wispPoses = nightR2.slice(0, 4);
const eliteGhostPoses = [...nightR2.slice(4, 8), nightR3[2], nightR3[3]];
const eliteJiangshiPoses = [nightR3[0], nightR3[1], nightR3[4], nightR3[5], nightR3[6], nightR3[7]];

const bossPoses = extractRowSegments(bossSheet, bossBg.isBg, 0, 260); // 7: [0..4 walk/attack, 5 hit, 6 dissolve]
const punisherPoses = extractRowSegments(bossSheet, bossBg.isBg, 260, 520); // 8: [0..5 walk/lunge, 6 hit, 7 paper pile]
const strangerPoses = extractRowSegments(bossSheet, bossBg.isBg, 520, 768); // 8: [0..5 glide/beckon, 6 hit, 7 smoke swirl]

console.log(
  `[Extract45Deg] Extracted poses -> mortal:${mortalR0.length}/${mortalR1.length}/${mortalR2.length}, ` +
  `sheng:${shengR0.length}/${shengR1.length}/${shengR2.length}, dan:${danR0.length}/${danR1.length}/${danR2.length}, ` +
  `day:${wolfPoses.length}/${boarPoses.length}/${treantPoses.length}/${shanxiaoPoses.length}, ` +
  `night:${ghostPoses.length}/${jiangshiPoses.length}/${wispPoses.length}/${eliteGhostPoses.length}/${eliteJiangshiPoses.length}, ` +
  `boss:${bossPoses.length}/${punisherPoses.length}/${strangerPoses.length}`
);

// ---------------- 1. Assemble 3 Hero Cel-Ink 29-Frame Sheets (96x96, Strict 45° Top-Down) ----------------
const HERO_TAGS = [
  { name: 'idle', count: 4, durations: [180, 180, 180, 180], color: '#588296ff' },
  { name: 'move', count: 8, durations: [90, 90, 90, 90, 90, 90, 90, 90], color: '#7ea890ff' },
  { name: 'attack', count: 6, durations: [70, 75, 85, 85, 95, 100], color: '#e6b25aff' },
  { name: 'flip', count: 6, durations: [70, 70, 70, 70, 80, 90], color: '#c4d2d6ff' },
  { name: 'hit', count: 2, durations: [110, 130], color: '#b48a5aff' },
  { name: 'death', count: 3, durations: [140, 160, 220], color: '#6b7880ff' },
];

function buildHeroMortal() {
  const refH = mortalR0[0].h;
  const opt = { refHeight: refH, targetFill: 0.85, footY: 90, allowVermilion: false, warmToAmber: true };

  // Idle (4f): 4 genuine distinct 45° idle poses!
  const fIdle0 = renderSpriteToFrame(mortalR0[0], 96, opt);
  const fIdle1 = renderSpriteToFrame(mortalR0[1], 96, { ...opt, scaleY: 0.985 });
  const fIdle2 = renderSpriteToFrame(mortalR0[2], 96, opt);
  const fIdle3 = applySubtleAuraOrDust(renderSpriteToFrame(mortalR0[3], 96, { ...opt, scaleY: 0.985 }), 96, 'shimmer1');

  // Move (8f): 7 genuine 45° diagonal run poses + crisp transition stride!
  const fMove0 = renderSpriteToFrame(mortalR1[0], 96, { ...opt, dy: 0 });
  const fMove1 = renderSpriteToFrame(mortalR1[1], 96, { ...opt, dy: -1 });
  const fMove2 = applySubtleAuraOrDust(renderSpriteToFrame(mortalR1[2], 96, { ...opt, dy: 0 }), 96, 'dust1');
  const fMove3 = renderSpriteToFrame(mortalR1[3], 96, { ...opt, dy: -1 });
  const fMove4 = renderSpriteToFrame(mortalR1[4], 96, { ...opt, dy: 0 });
  const fMove5 = applySubtleAuraOrDust(renderSpriteToFrame(mortalR1[5], 96, { ...opt, dy: -1 }), 96, 'dust2');
  const fMove6 = renderSpriteToFrame(mortalR1[6], 96, { ...opt, dy: 0 });
  const fMove7 = renderSpriteToFrame(mortalR1[2], 96, { ...opt, dx: 2, dy: -1 });

  // Attack (6f): All 6 genuine 45° overhead ground-plane lantern flame-sweep poses!
  const fAtk0 = renderSpriteToFrame(mortalR2[0], 96, { ...opt, refHeight: mortalR2[0].h, targetFill: 0.86 });
  const fAtk1 = renderSpriteToFrame(mortalR2[1], 96, { ...opt, refHeight: mortalR2[1].h, targetFill: 0.86 });
  const fAtk2 = renderSpriteToFrame(mortalR2[2], 96, { ...opt, refHeight: mortalR2[2].h, targetFill: 0.89 });
  const fAtk3 = renderSpriteToFrame(mortalR2[3], 96, { ...opt, refHeight: mortalR2[3].h, targetFill: 0.89 });
  const fAtk4 = renderSpriteToFrame(mortalR2[4], 96, { ...opt, refHeight: mortalR2[4].h, targetFill: 0.89 });
  const fAtk5 = renderSpriteToFrame(mortalR2[5], 96, { ...opt, refHeight: mortalR2[5].h, targetFill: 0.88 });

  // Flip (6f): Overhead 360° spin with spirit ring!
  const fFlip0 = applyFlipSpiritRing(renderSpriteToFrame(mortalR0[0], 96, opt), 96, 0);
  const fFlip1 = applyFlipSpiritRing(renderSpriteToFrame(mortalR1[4], 96, opt), 96, 1);
  const fFlip2 = applyFlipSpiritRing(renderSpriteToFrame(mortalR2[1], 96, { ...opt, refHeight: mortalR2[1].h }), 96, 2);
  const fFlip3 = applyFlipSpiritRing(renderSpriteToFrame(flipHorizontal(mortalR1[4]), 96, opt), 96, 3);
  const fFlip4 = applyFlipSpiritRing(renderSpriteToFrame(mortalR2[0], 96, { ...opt, refHeight: mortalR2[0].h }), 96, 4);
  const fFlip5 = applyFlipSpiritRing(renderSpriteToFrame(mortalR0[4], 96, opt), 96, 5);

  // Hit (2f): Genuine 45° kneeling recoil poses!
  const fHit0 = applyHitFlash(renderSpriteToFrame(mortalR0[5], 96, { ...opt, refHeight: refH, dx: -2 }), 96, 0);
  const fHit1 = applyHitFlash(renderSpriteToFrame(mortalR0[6], 96, { ...opt, refHeight: refH, dx: -3 }), 96, 1);

  // Death (3f): Kneeling pose dissolving into ink-wash ash!
  const deathBase = renderSpriteToFrame(mortalR0[6], 96, { ...opt, refHeight: refH });
  const fDeath0 = applyInkDissolve(deathBase, 96, 0);
  const fDeath1 = applyInkDissolve(deathBase, 96, 1);
  const fDeath2 = applyInkDissolve(deathBase, 96, 2);

  const frames = [
    fIdle0, fIdle1, fIdle2, fIdle3,
    fMove0, fMove1, fMove2, fMove3, fMove4, fMove5, fMove6, fMove7,
    fAtk0, fAtk1, fAtk2, fAtk3, fAtk4, fAtk5,
    fFlip0, fFlip1, fFlip2, fFlip3, fFlip4, fFlip5,
    fHit0, fHit1,
    fDeath0, fDeath1, fDeath2,
  ];
  const legacy8 = [fMove0, fMove2, fMove4, fMove6, fHit0, fDeath0, fDeath1, fDeath2];
  return { frames, legacy8 };
}

function buildHeroSheng() {
  const refH = shengR0[0].h;
  const opt = { refHeight: refH, targetFill: 0.87, footY: 90, allowVermilion: false };

  const fIdle0 = renderSpriteToFrame(shengR0[0], 96, opt);
  const fIdle1 = applySubtleAuraOrDust(renderSpriteToFrame(shengR0[1], 96, { ...opt, scaleY: 0.985 }), 96, 'shimmer1', [214, 224, 228]);
  const fIdle2 = renderSpriteToFrame(shengR0[2], 96, opt);
  const fIdle3 = applySubtleAuraOrDust(renderSpriteToFrame(shengR0[3], 96, { ...opt, scaleY: 0.985 }), 96, 'shimmer2', [214, 224, 228]);

  const fMove0 = renderSpriteToFrame(shengR1[0], 96, { ...opt, dy: 0 });
  const fMove1 = renderSpriteToFrame(shengR1[1], 96, { ...opt, dy: -1 });
  const fMove2 = applySubtleAuraOrDust(renderSpriteToFrame(shengR1[2], 96, { ...opt, dy: 0 }), 96, 'dust1');
  const fMove3 = renderSpriteToFrame(shengR1[3], 96, { ...opt, dy: -1 });
  const fMove4 = renderSpriteToFrame(shengR1[4], 96, { ...opt, dy: 0 });
  const fMove5 = applySubtleAuraOrDust(renderSpriteToFrame(shengR1[5], 96, { ...opt, dy: -1 }), 96, 'dust2');
  const fMove6 = renderSpriteToFrame(shengR1[1], 96, { ...opt, dx: 2, dy: 0 });
  const fMove7 = renderSpriteToFrame(shengR1[4], 96, { ...opt, dx: 1, dy: -1 });

  // All 6 genuine 45° top-down sword thrust & crescent ground-plane slash poses!
  const fAtk0 = renderSpriteToFrame(shengR2[0], 96, { ...opt, refHeight: shengR2[0].h, targetFill: 0.88 });
  const fAtk1 = renderSpriteToFrame(shengR2[1], 96, { ...opt, refHeight: shengR2[1].h, targetFill: 0.88 });
  const fAtk2 = renderSpriteToFrame(shengR2[2], 96, { ...opt, refHeight: shengR2[2].h, targetFill: 0.88 });
  const fAtk3 = renderSpriteToFrame(shengR2[3], 96, { ...opt, refHeight: shengR2[3].h, targetFill: 0.89 });
  const fAtk4 = renderSpriteToFrame(shengR2[4], 96, { ...opt, refHeight: shengR2[4].h, targetFill: 0.89 });
  const fAtk5 = renderSpriteToFrame(shengR2[5], 96, { ...opt, refHeight: shengR2[5].h, targetFill: 0.89 });

  const fFlip0 = applyFlipSpiritRing(renderSpriteToFrame(shengR0[0], 96, opt), 96, 0);
  const fFlip1 = applyFlipSpiritRing(renderSpriteToFrame(shengR1[2], 96, opt), 96, 1);
  const fFlip2 = applyFlipSpiritRing(renderSpriteToFrame(flipHorizontal(shengR1[4]), 96, opt), 96, 2);
  const fFlip3 = applyFlipSpiritRing(renderSpriteToFrame(flipHorizontal(shengR0[4]), 96, opt), 96, 3);
  const fFlip4 = applyFlipSpiritRing(renderSpriteToFrame(shengR2[3], 96, { ...opt, refHeight: shengR2[3].h }), 96, 4);
  const fFlip5 = applyFlipSpiritRing(renderSpriteToFrame(shengR0[3], 96, opt), 96, 5);

  const fHit0 = applyHitFlash(renderSpriteToFrame(shengR0[4], 96, { ...opt, dx: -2 }), 96, 0);
  const fHit1 = applyHitFlash(renderSpriteToFrame(shengR0[5], 96, { ...opt, dx: -3 }), 96, 1);

  const deathBase = renderSpriteToFrame(shengR0[5], 96, opt);
  const fDeath0 = applyInkDissolve(deathBase, 96, 0);
  const fDeath1 = applyInkDissolve(deathBase, 96, 1);
  const fDeath2 = applyInkDissolve(deathBase, 96, 2);

  const frames = [
    fIdle0, fIdle1, fIdle2, fIdle3,
    fMove0, fMove1, fMove2, fMove3, fMove4, fMove5, fMove6, fMove7,
    fAtk0, fAtk1, fAtk2, fAtk3, fAtk4, fAtk5,
    fFlip0, fFlip1, fFlip2, fFlip3, fFlip4, fFlip5,
    fHit0, fHit1,
    fDeath0, fDeath1, fDeath2,
  ];
  const legacy8 = [fMove0, fMove2, fMove4, fAtk4, fHit0, fDeath0, fDeath1, fDeath2];
  return { frames, legacy8 };
}

function buildHeroDan() {
  const refH = danR0[0].h;
  const opt = { refHeight: refH, targetFill: 0.86, footY: 90, allowVermilion: false };

  const fIdle0 = renderSpriteToFrame(danR0[0], 96, opt);
  const fIdle1 = renderSpriteToFrame(danR0[1], 96, { ...opt, scaleY: 0.985 });
  const fIdle2 = renderSpriteToFrame(danR0[2], 96, opt);
  const fIdle3 = applySubtleAuraOrDust(renderSpriteToFrame(danR0[3], 96, { ...opt, scaleY: 0.985 }), 96, 'shimmer1', [168, 206, 194]);

  // Flip down-left glide poses to face down-right consistently with Mortal & Sheng, and use back-view poses in Flip!
  const glide0 = flipHorizontal(danR1[0]);
  const glide1 = flipHorizontal(danR1[2]);
  const back0 = danR1[1];
  const back1 = danR1[3];
  const back2 = danR1[4];
  const back3 = danR1[5];

  const fMove0 = renderSpriteToFrame(glide0, 96, { ...opt, dy: 0 });
  const fMove1 = renderSpriteToFrame(glide1, 96, { ...opt, dy: -1 });
  const fMove2 = applySubtleAuraOrDust(renderSpriteToFrame(glide0, 96, { ...opt, dx: 2, dy: 0, scaleY: 0.98 }), 96, 'dust1');
  const fMove3 = renderSpriteToFrame(glide1, 96, { ...opt, dx: 2, dy: -1, scaleX: 1.03 });
  const fMove4 = renderSpriteToFrame(danR0[2], 96, { ...opt, dx: 1, dy: 0 });
  const fMove5 = applySubtleAuraOrDust(renderSpriteToFrame(glide0, 96, { ...opt, dx: -1, dy: -1 }), 96, 'dust2');
  const fMove6 = renderSpriteToFrame(glide1, 96, { ...opt, dx: 1, dy: 0 });
  const fMove7 = renderSpriteToFrame(danR0[3], 96, { ...opt, dx: 0, dy: -1 });

  // All 6 genuine 45° overhead sweeping 220° water-sleeve dance poses!
  const fAtk0 = renderSpriteToFrame(danR2[0], 96, { ...opt, refHeight: danR2[0].h, targetFill: 0.88 });
  const fAtk1 = renderSpriteToFrame(danR2[1], 96, { ...opt, refHeight: danR2[1].h, targetFill: 0.88 });
  const fAtk2 = renderSpriteToFrame(danR2[2], 96, { ...opt, refHeight: danR2[2].h, targetFill: 0.89 });
  const fAtk3 = renderSpriteToFrame(danR2[3], 96, { ...opt, refHeight: danR2[3].h, targetFill: 0.89 });
  const fAtk4 = renderSpriteToFrame(danR2[4], 96, { ...opt, refHeight: danR2[4].h, targetFill: 0.89 });
  const fAtk5 = renderSpriteToFrame(danR2[5], 96, { ...opt, refHeight: danR2[5].h, targetFill: 0.89 });

  // Authentic 360° overhead turn using genuine 45° back-view sprites!
  const fFlip0 = applyFlipSpiritRing(renderSpriteToFrame(danR0[0], 96, opt), 96, 0);
  const fFlip1 = applyFlipSpiritRing(renderSpriteToFrame(glide1, 96, opt), 96, 1);
  const fFlip2 = applyFlipSpiritRing(renderSpriteToFrame(back0, 96, opt), 96, 2);
  const fFlip3 = applyFlipSpiritRing(renderSpriteToFrame(back2, 96, opt), 96, 3);
  const fFlip4 = applyFlipSpiritRing(renderSpriteToFrame(back3, 96, opt), 96, 4);
  const fFlip5 = applyFlipSpiritRing(renderSpriteToFrame(danR2[3], 96, { ...opt, refHeight: danR2[3].h }), 96, 5);

  const fHit0 = applyHitFlash(renderSpriteToFrame(danR0[4], 96, { ...opt, dx: -2 }), 96, 0);
  const fHit1 = applyHitFlash(renderSpriteToFrame(danR0[5], 96, { ...opt, dx: -3 }), 96, 1);

  const deathBase = renderSpriteToFrame(danR0[5], 96, opt);
  const fDeath0 = applyInkDissolve(deathBase, 96, 0);
  const fDeath1 = applyInkDissolve(deathBase, 96, 1);
  const fDeath2 = applyInkDissolve(deathBase, 96, 2);

  const frames = [
    fIdle0, fIdle1, fIdle2, fIdle3,
    fMove0, fMove1, fMove2, fMove3, fMove4, fMove5, fMove6, fMove7,
    fAtk0, fAtk1, fAtk2, fAtk3, fAtk4, fAtk5,
    fFlip0, fFlip1, fFlip2, fFlip3, fFlip4, fFlip5,
    fHit0, fHit1,
    fDeath0, fDeath1, fDeath2,
  ];
  const legacy8 = [fMove0, fMove1, fAtk2, fAtk3, fHit0, fDeath0, fDeath1, fDeath2];
  return { frames, legacy8 };
}

// ---------------- 2. Assemble 4 Daytime Enemy Cel-Ink 19-Frame Sheets (Strict 45° Top-Down) ----------------
const ENEMY_TAGS = [
  { name: 'idle', count: 4, durations: [170, 170, 170, 170], color: '#588296ff' },
  { name: 'move', count: 6, durations: [95, 95, 95, 95, 95, 95], color: '#7ea890ff' },
  { name: 'attack', count: 4, durations: [90, 80, 95, 110], color: '#d87a58ff' },
  { name: 'hit', count: 2, durations: [110, 130], color: '#b48a5aff' },
  { name: 'death', count: 3, durations: [140, 160, 220], color: '#6b7880ff' },
];

function buildDaytimeEnemy(poses, size, { allowVermilion = false, targetFill = 0.80, slashColor = [226, 232, 234], warmToAmber = true } = {}) {
  const refH = Math.max(poses[0].h, poses[1].h);
  const footY = size === 96 ? 90 : 60;
  const opt = { refHeight: refH, targetFill, footY, allowVermilion, warmToAmber };

  const fIdle0 = renderSpriteToFrame(poses[0], size, { ...opt, dy: 0 });
  const fIdle1 = renderSpriteToFrame(poses[1], size, { ...opt, dy: 0 });
  const fIdle2 = applySubtleAuraOrDust(renderSpriteToFrame(poses[0], size, { ...opt, scaleY: 0.975 }), size, 'shimmer1');
  const fIdle3 = applySubtleAuraOrDust(renderSpriteToFrame(poses[1], size, { ...opt, scaleY: 0.98 }), size, 'shimmer2');

  const fMove0 = renderSpriteToFrame(poses[0], size, { ...opt, dx: -1, dy: 0 });
  const fMove1 = renderSpriteToFrame(poses[2], size, { ...opt, dx: 0, dy: -1 });
  const fMove2 = applySubtleAuraOrDust(renderSpriteToFrame(poses[3], size, { ...opt, dx: 1, dy: -1 }), size, 'dust1');
  const fMove3 = renderSpriteToFrame(poses[1], size, { ...opt, dx: 1, dy: 0 });
  const fMove4 = applySubtleAuraOrDust(renderSpriteToFrame(poses[2], size, { ...opt, dx: 2, dy: -1 }), size, 'dust2');
  const fMove5 = renderSpriteToFrame(poses[3], size, { ...opt, dx: 0, dy: 0 });

  const fAtk0 = renderSpriteToFrame(poses[1], size, { ...opt, dx: -2, scaleX: 0.96, scaleY: 1.03 });
  const fAtk1 = renderSpriteToFrame(poses[3], size, { ...opt, dx: 1, scaleX: 1.03 });
  const fAtk2 = renderSpriteToFrame(poses[4], size, { ...opt, refHeight: poses[4].h, targetFill: Math.min(0.88, targetFill + 0.06), dx: 2 });
  const fAtk3 = Buffer.from(fAtk2);
  drawArcSmear(
    fAtk3, size,
    Math.round(size * 0.64), Math.round(size * 0.56),
    Math.round(size * 0.25), Math.round(size * 0.20),
    -0.8, 0.9, size === 96 ? 2 : 1,
    slashColor, [24, 34, 42]
  );

  const fHit0 = applyHitFlash(renderSpriteToFrame(poses[1], size, { ...opt, dx: -2 }), size, 0);
  const fHit1 = applyHitFlash(renderSpriteToFrame(poses[0], size, { ...opt, dx: -3 }), size, 1);

  const deathBase = renderSpriteToFrame(poses[0], size, opt);
  const fDeath0 = applyInkDissolve(deathBase, size, 0);
  const fDeath1 = applyInkDissolve(deathBase, size, 1);
  const fDeath2 = applyInkDissolve(deathBase, size, 2);

  return [
    fIdle0, fIdle1, fIdle2, fIdle3,
    fMove0, fMove1, fMove2, fMove3, fMove4, fMove5,
    fAtk0, fAtk1, fAtk2, fAtk3,
    fHit0, fHit1,
    fDeath0, fDeath1, fDeath2,
  ];
}

const mortalBuilt = buildHeroMortal();
const shengBuilt = buildHeroSheng();
const danBuilt = buildHeroDan();

const celActors = [
  { base: 'player_mortal_cel', size: 96, frames: mortalBuilt.frames, tags: HERO_TAGS, framesDir: FRAMES_96_DIR },
  { base: 'player_sheng_cel', size: 96, frames: shengBuilt.frames, tags: HERO_TAGS, framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_player_sheng_cel') },
  { base: 'player_dan_cel', size: 96, frames: danBuilt.frames, tags: HERO_TAGS, framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_player_dan_cel') },
  { base: 'enemy_wolf_cel', size: 64, frames: buildDaytimeEnemy(wolfPoses, 64, { targetFill: 0.72 }), tags: ENEMY_TAGS, framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_enemy_wolf_cel') },
  { base: 'enemy_boar_cel', size: 64, frames: buildDaytimeEnemy(boarPoses, 64, { targetFill: 0.72 }), tags: ENEMY_TAGS, framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_enemy_boar_cel') },
  { base: 'enemy_treant_cel', size: 64, frames: buildDaytimeEnemy(treantPoses, 64, { targetFill: 0.85, slashColor: [148, 186, 152] }), tags: ENEMY_TAGS, framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_enemy_treant_cel') },
  { base: 'enemy_shanxiao_cel', size: 96, frames: buildDaytimeEnemy(shanxiaoPoses, 96, { allowVermilion: true, targetFill: 0.86, slashColor: [212, 74, 68] }), tags: ENEMY_TAGS, framesDir: path.join(GODOT_DIR, 'art_pipeline/frames_enemy_shanxiao_cel') },
];

for (const actor of celActors) {
  const stitched = stitchFramesHorizontal(actor.frames, actor.size);
  fs.writeFileSync(path.join(SPRITES_DIR, `${actor.base}.png`), encodePngRgba(stitched.w, stitched.h, stitched.rgba));
  const jsonDoc = buildAsepriteJson(actor.base, actor.size, actor.tags, actor.frames.length);
  fs.writeFileSync(path.join(SPRITES_DIR, `${actor.base}.json`), JSON.stringify(jsonDoc, null, 2) + '\n');

  if (actor.framesDir) {
    fs.rmSync(actor.framesDir, { recursive: true, force: true });
    fs.mkdirSync(actor.framesDir, { recursive: true });
    for (let i = 0; i < actor.frames.length; i++) {
      fs.writeFileSync(path.join(actor.framesDir, jsonDoc.frames[i].filename), encodePngRgba(actor.size, actor.size, actor.frames[i]));
    }
  }
  console.log(`[Extract45Deg] Wrote ${actor.base}.png (${stitched.w}x${stitched.h}, ${actor.frames.length}f) + ${actor.frames.length} source frames`);
}

// ---------------- 3. Assemble ALL 11 Legacy 8-Frame Strips (Strict 45° Top-Down, <= 16 colors) ----------------
function buildProtocol8(walkSprites, size, {
  allowVermilion = true,
  targetFill = 0.84,
  floatAmp = 1,
  accent = [180, 210, 210],
  normalizeEach = false,
  hitSprite = null,
  deathSprites = null,
} = {}) {
  const allSrc = [...walkSprites, ...(hitSprite ? [hitSprite] : []), ...(deathSprites || [])];
  const refH = Math.max(...allSrc.map((s) => s.h));
  const footY = size === 96 ? 90 : 60;
  const renderOne = (src, dx = 0, dy = 0, scaleY = 1.0) =>
    renderSpriteToFrame(src, size, { refHeight: normalizeEach ? src.h : refH, targetFill, footY, dx, dy, scaleY, allowVermilion });

  const walkFrames = [0, 1, 2, 3].map((i) => {
    const src = walkSprites[i % walkSprites.length];
    const dy = Math.round(Math.sin((i / 4) * Math.PI * 2) * floatAmp);
    const dx = i === 1 ? 1 : i === 3 ? -1 : 0;
    const scaleY = i % 2 === 0 ? 1.0 : 0.98;
    let f = renderOne(src, dx, dy, scaleY);
    if (i % 2 === 1) f = applySubtleAuraOrDust(f, size, i === 1 ? 'shimmer1' : 'shimmer2', accent);
    return f;
  });

  const hitFrame = applyHitFlash(renderOne(hitSprite || walkSprites[walkSprites.length - 1], -2, 0), size, 0);

  let deathFrames;
  if (deathSprites && deathSprites.length >= 2) {
    const d0 = renderOne(deathSprites[0], 0, 0);
    const d1 = renderOne(deathSprites[1], 0, 0);
    deathFrames = [d0, d1, applyInkDissolve(d1, size, 1)];
  } else if (deathSprites && deathSprites.length === 1) {
    const d0 = renderOne(deathSprites[0], 0, 0);
    deathFrames = [d0, applyInkDissolve(d0, size, 1), applyInkDissolve(d0, size, 2)];
  } else {
    const base = renderOne(walkSprites[0], 0, 0);
    deathFrames = [applyInkDissolve(base, size, 0), applyInkDissolve(base, size, 1), applyInkDissolve(base, size, 2)];
  }
  return [...walkFrames, hitFrame, ...deathFrames];
}

const legacySpecs = [
  { key: 'player_mortal', label: '提灯少年（人间·45°俯视）', size: 96, fps: 8, frames: mortalBuilt.legacy8 },
  { key: 'player_sheng', label: '武生快剑（诡界生·45°俯视）', size: 96, fps: 10, frames: shengBuilt.legacy8 },
  { key: 'player_dan', label: '青衣水袖（诡界旦·45°俯视）', size: 96, fps: 9, frames: danBuilt.legacy8 },
  {
    key: 'boss_magistrate', label: '纸扎判官（Boss·45°俯视）', size: 96, fps: 7,
    frames: buildProtocol8(
      [bossPoses[0], bossPoses[2], bossPoses[3], bossPoses[4]],
      96, { allowVermilion: true, targetFill: 0.88, floatAmp: 1, accent: [215, 72, 66], hitSprite: bossPoses[5], deathSprites: [bossPoses[6]] }
    ),
  },
  {
    key: 'ghost', label: '游魂（45°俯视）', size: 64, fps: 8,
    frames: buildProtocol8([ghostPoses[0], ghostPoses[1], ghostPoses[2], ghostPoses[3]], 64, { allowVermilion: false, targetFill: 0.82, floatAmp: 2, accent: [172, 214, 218], normalizeEach: true }),
  },
  {
    key: 'jiangshi', label: '行尸（45°俯视）', size: 64, fps: 7,
    frames: buildProtocol8([jiangshiPoses[2], jiangshiPoses[3], jiangshiPoses[6], jiangshiPoses[7]], 64, { allowVermilion: true, targetFill: 0.84, floatAmp: 2, accent: [198, 190, 148] }),
  },
  {
    key: 'wisp_caster', label: '鬼火灵（45°俯视）', size: 64, fps: 9,
    frames: buildProtocol8([wispPoses[0], wispPoses[1], wispPoses[2], wispPoses[3]], 64, { allowVermilion: false, targetFill: 0.84, floatAmp: 2, accent: [148, 224, 198] }),
  },
  {
    key: 'elite_ghost', label: '红眼大幽魂（精英·45°俯视）', size: 64, fps: 8,
    frames: buildProtocol8([eliteGhostPoses[0], eliteGhostPoses[1], eliteGhostPoses[2], eliteGhostPoses[3]], 64, { allowVermilion: true, targetFill: 0.86, floatAmp: 2, accent: [216, 70, 68], normalizeEach: true }),
  },
  {
    key: 'elite_jiangshi', label: '红眼印章尸（精英·45°俯视）', size: 64, fps: 7,
    frames: buildProtocol8([eliteJiangshiPoses[0], eliteJiangshiPoses[1], eliteJiangshiPoses[4], eliteJiangshiPoses[5]], 64, { allowVermilion: true, targetFill: 0.86, floatAmp: 1, accent: [216, 70, 68] }),
  },
  {
    key: 'punisher', label: '白纸差役（破戒追猎·45°俯视）', size: 64, fps: 9,
    frames: buildProtocol8([punisherPoses[1], punisherPoses[2], punisherPoses[4], punisherPoses[5]], 64, { allowVermilion: true, targetFill: 0.86, floatAmp: 1, accent: [224, 228, 226], hitSprite: punisherPoses[6], deathSprites: [punisherPoses[7]] }),
  },
  {
    key: 'white_stranger', label: '白衣问路人（禁忌七·45°俯视）', size: 64, fps: 6,
    frames: buildProtocol8([strangerPoses[0], strangerPoses[1], strangerPoses[2], strangerPoses[4]], 64, { allowVermilion: true, targetFill: 0.86, floatAmp: 1, accent: [228, 232, 230], hitSprite: strangerPoses[6], deathSprites: [strangerPoses[7]] }),
  },
];

const paletteReport = {
  version: '3.0.0',
  protocol: 'horizontal_strip_v1_45deg_top_down',
  palette_gate: 'ink_night_18_colors',
  sprites: {},
};

for (const spec of legacySpecs) {
  const stitched = stitchFramesHorizontal(spec.frames, spec.size);
  const { rgba: quantized, colorsUsed } = quantizeToMaxColors(stitched.rgba, 16);
  fs.writeFileSync(path.join(SPRITES_DIR, `${spec.key}.png`), encodePngRgba(stitched.w, stitched.h, quantized));
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
  console.log(`[Extract45Deg] Wrote legacy ${spec.key}.png (${stitched.w}x${stitched.h}, ${colorsUsed} colors <= 18)`);
}

fs.writeFileSync(path.join(SPRITES_DIR, 'palette-report.json'), JSON.stringify(paletteReport, null, 2) + '\n');

// Update reference sheets in godot-prototype/assets/sprites/reference/ with the strict 45° sheets
const refCopies = [
  ['hero_mortal_45deg_1795737076592.jpg', 'hero_mortal_sheet.jpg'],
  ['hero_sheng_45deg_1795737080278.jpg', 'hero_sheng_sheet.jpg'],
  ['hero_dan_45deg_1795737084179.jpg', 'hero_dan_sheet.jpg'],
  ['daytime_enemies_45deg_1795737088239.jpg', 'daytime_enemies_sheet.jpg'],
  ['night_enemies_45deg_1795737091722.jpg', 'enemies_pixel_sheet.jpg'],
  ['boss_special_45deg_1795737091473.jpg', 'boss_judge_sheet.jpg'],
];
for (const [src, dst] of refCopies) {
  fs.copyFileSync(path.join(IMG_DIR, src), path.join(REF_DIR, dst));
}

console.log('[Extract45Deg] All 18 strict 45-degree top-down spritesheets generated successfully!');
