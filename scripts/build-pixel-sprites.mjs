#!/usr/bin/env node
/**
 * Builds all 11 Ink-Night horizontal pixel spritesheets (64x64 / 96x96 x 8 frames)
 * into godot-prototype/assets/sprites/ + manifest.json, then runs a strict 18-color palette gate.
 *
 * Frame layout (matches Godot InkSpriteBank hframes >= 8 protocol):
 *   Frames 0..3: Walk / Idle cycle (4 frames)
 *   Frame  4:    Hit flash / recoil (1 frame)
 *   Frames 5..7: Ink-dissolve / paper-collapse death (3 frames)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT_DIR = path.resolve(process.cwd(), 'godot-prototype/assets/sprites');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Locked 18-color main palette (from InkData.palette() / src/game/palette.ts)
const PALETTE_HEX = {
  inkDeep: '#06090B',
  inkNight: '#0E1418',
  inkSlate: '#1C2A30',
  greyDark: '#3D4A48',
  greyMid: '#5C6B6B',
  greyLight: '#8A9A94',
  sageDark: '#49554F',
  sageMid: '#6E7F74',
  sageLight: '#93A894',
  boneDark: '#B9B09A',
  bone: '#EDE6D6',
  boneBright: '#FAF6EA',
  amberDark: '#B97F22',
  amber: '#E8B34A',
  amberBright: '#F5D98A',
  vermilionDark: '#7C1E10',
  vermilion: '#C8402A',
  vermilionBright: '#E4654A',
};

const VERMILION_KEYS = new Set(['vermilionDark', 'vermilion', 'vermilionBright']);

function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

const C = Object.fromEntries(
  Object.entries(PALETTE_HEX).map(([k, v]) => [k, hexToRgba(v)])
);
const ALLOWED_RGB_SET = new Set(
  Object.values(C).map(([r, g, b]) => `${r},${g},${b}`)
);
const VERMILION_RGB_SET = new Set(
  [...VERMILION_KEYS].map((k) => {
    const [r, g, b] = C[k];
    return `${r},${g},${b}`;
  })
);

// Minimal zero-dependency RGBA PNG encoder
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tag = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tag, data])), 0);
  return Buffer.concat([len, tag, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Crisp logical pixel canvas (renders at 1x pixel grid, then nearest-neighbor upscales by `scale` to target frameSize). */
class PixelFrame {
  constructor(gridSize) {
    this.size = gridSize;
    this.data = new Uint8ClampedArray(gridSize * gridSize * 4);
  }

  px(x, y, col) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.size || iy >= this.size) return;
    const idx = (iy * this.size + ix) * 4;
    if (!col) {
      this.data[idx + 3] = 0;
      return;
    }
    this.data[idx] = col[0];
    this.data[idx + 1] = col[1];
    this.data[idx + 2] = col[2];
    this.data[idx + 3] = 255;
  }

  getAlpha(x, y) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return 0;
    return this.data[(y * this.size + x) * 4 + 3];
  }

  rect(x, y, w, h, col) {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = Math.round(x + w);
    const y1 = Math.round(y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        this.px(xx, yy, col);
      }
    }
  }

  ellipse(cx, cy, rx, ry, col) {
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) this.px(x, y, col);
      }
    }
  }

  line(x0, y0, x1, y1, col, thick = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (thick <= 1) {
        this.px(x, y, col);
      } else {
        this.ellipse(x, y, thick * 0.5, thick * 0.5, col);
      }
    }
  }

  /** Clean 1px ink outline around all opaque pixels. */
  outline(col = C.inkDeep) {
    const out = new Uint8ClampedArray(this.data);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.getAlpha(x, y) > 0) continue;
        if (
          this.getAlpha(x - 1, y) > 0 ||
          this.getAlpha(x + 1, y) > 0 ||
          this.getAlpha(x, y - 1) > 0 ||
          this.getAlpha(x, y + 1) > 0
        ) {
          const idx = (y * this.size + x) * 4;
          out[idx] = col[0];
          out[idx + 1] = col[1];
          out[idx + 2] = col[2];
          out[idx + 3] = 255;
        }
      }
    }
    this.data = out;
  }

  /** Apply crisp hit-flash (frame 4): shift light/mid tones toward boneBright. */
  applyHitFlash() {
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] === 0) continue;
      const isOutline =
        this.data[i] === C.inkDeep[0] &&
        this.data[i + 1] === C.inkDeep[1] &&
        this.data[i + 2] === C.inkDeep[2];
      const target = isOutline ? C.inkSlate : C.boneBright;
      this.data[i] = target[0];
      this.data[i + 1] = target[1];
      this.data[i + 2] = target[2];
    }
  }

  /** Apply deterministic ink-dissolve death frames (stage 1..3). */
  applyDissolve(stage, scatterColor = C.greyLight) {
    const out = new Uint8ClampedArray(this.data.length);
    const keepChance = stage === 1 ? 0.72 : stage === 2 ? 0.42 : 0.16;
    const lift = stage * 2;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const srcIdx = (y * this.size + x) * 4;
        if (this.data[srcIdx + 3] === 0) continue;
        const hash = ((x * 73856093) ^ (y * 19349663) ^ (stage * 83492791)) >>> 0;
        const norm = (hash % 1000) / 1000;
        if (norm > keepChance) continue;
        const spreadX = Math.round(((hash % 7) - 3) * stage * 0.65);
        const ny = Math.max(0, Math.min(this.size - 1, y - Math.round((hash % 3) * (stage * 0.7)) + (stage === 3 ? 2 : 0) - Math.floor(lift * 0.3)));
        const nx = Math.max(0, Math.min(this.size - 1, x + spreadX));
        const dstIdx = (ny * this.size + nx) * 4;
        if (stage >= 2 && norm > keepChance * 0.65) {
          out[dstIdx] = scatterColor[0];
          out[dstIdx + 1] = scatterColor[1];
          out[dstIdx + 2] = scatterColor[2];
          out[dstIdx + 3] = 255;
        } else {
          out[dstIdx] = this.data[srcIdx];
          out[dstIdx + 1] = this.data[srcIdx + 1];
          out[dstIdx + 2] = this.data[srcIdx + 2];
          out[dstIdx + 3] = 255;
        }
      }
    }
    this.data = out;
  }
}

function drawPaperLantern(f, lx, ly, swayY, round = false) {
  // Handle / cord
  f.line(lx, ly - 5, lx, ly - 3, C.inkSlate, 1);
  // Caps
  f.rect(lx - 2, ly - 3, 5, 1, C.inkNight);
  f.rect(lx - 2, ly + 3, 5, 1, C.inkNight);
  // Warm amber body (no vermilion)
  if (round) {
    f.ellipse(lx, ly + swayY, 2.5, 2.8, C.amber);
  } else {
    f.rect(lx - 2, ly - 2 + swayY, 5, 5, C.amber);
  }
  f.rect(lx - 1, ly - 1 + swayY, 3, 3, C.amberBright);
  f.px(lx, ly + swayY, C.boneBright);
  // Tassel
  f.px(lx, ly + 4 + swayY, C.amberDark);
  f.px(lx, ly + 5 + swayY, C.amber);
}

// 1. Player Mortal (提灯少年) — 32x32 grid upscaled 2x -> 64x64
function drawPlayerMortal(f, step) {
  const bob = step % 2 === 1 ? -1 : 0;
  const stride = step === 0 ? -1 : step === 2 ? 1 : 0;
  // Boots
  f.rect(12 + stride, 27, 3, 2, C.inkNight);
  f.rect(17 - stride, 27, 3, 2, C.inkNight);
  // Scholar robe (slate grey & ink)
  f.rect(11, 16 + bob, 10, 11, C.greyDark);
  f.rect(12, 16 + bob, 8, 9, C.greyMid);
  f.rect(11, 21 + bob, 10, 2, C.inkSlate); // sash
  f.line(14, 16 + bob, 17, 20 + bob, C.inkNight, 1); // cross lapel
  // Face (bone)
  f.ellipse(15.5, 11.5 + bob, 4.2, 4.0, C.bone);
  f.px(15, 11 + bob, C.inkDeep);
  f.px(18, 11 + bob, C.inkDeep);
  // Dark scholar cap
  f.rect(10, 7 + bob, 12, 2, C.inkSlate);
  f.rect(12, 4 + bob, 8, 3, C.inkNight);
  f.px(16, 5 + bob, C.greyLight);
  // Extended lantern arm + pole
  f.line(20, 18 + bob, 24, 15 + bob, C.greyDark, 2);
  f.line(23, 15 + bob, 25, 12 + bob, C.inkSlate, 1);
  drawPaperLantern(f, 25, 15 + bob, step === 2 ? 1 : 0, false);
  f.outline();
}

// 2. Player Sheng (武生快剑) — strict ZERO vermilion on face/costume!
function drawPlayerSheng(f, step) {
  const bob = step % 2 === 1 ? -1 : 0;
  const stride = step === 0 ? -2 : step === 2 ? 2 : 0;
  // Boots
  f.rect(11 + stride, 27, 3, 2, C.inkDeep);
  f.rect(17 - stride, 27, 3, 2, C.inkDeep);
  // Martial bone-white robe + dark ink vest
  f.rect(10, 16 + bob, 11, 11, C.bone);
  f.rect(11, 16 + bob, 9, 7, C.inkSlate);
  f.rect(10, 21 + bob, 11, 2, C.inkNight);
  f.rect(13, 22 + bob, 5, 5, C.boneBright);
  // Clean opera face (boneBright + ink brow, NO red)
  f.ellipse(15.5, 11 + bob, 4.2, 4.0, C.boneBright);
  f.line(13, 9 + bob, 15, 10 + bob, C.inkDeep, 1);
  f.line(17, 10 + bob, 19, 9 + bob, C.inkDeep, 1);
  f.px(14, 11 + bob, C.inkDeep);
  f.px(18, 11 + bob, C.inkDeep);
  // Martial topknot cap
  f.rect(11, 6 + bob, 9, 2, C.inkNight);
  f.rect(13, 3 + bob, 5, 3, C.inkSlate);
  // Waist round lantern on left
  drawPaperLantern(f, 7, 19 + bob, 0, true);
  // Gleaming straight opera sword on right
  const swing = step === 1 ? -2 : step === 3 ? 2 : 0;
  f.line(21, 19 + bob, 29, 10 + bob + swing, C.boneBright, 1);
  f.line(21, 20 + bob, 28, 12 + bob + swing, C.greyLight, 1);
  f.rect(19, 19 + bob, 3, 2, C.amber); // hilt guard
  f.outline();
}

// 3. Player Dan (青衣水袖) — strict ZERO vermilion on face/costume!
function drawPlayerDan(f, step) {
  const bob = step % 2 === 1 ? -1 : 0;
  const wave = step === 0 ? -2 : step === 2 ? 2 : 0;
  // Flowing bone-white water sleeves left & right
  f.line(11, 18 + bob, 5, 16 + bob + wave, C.boneBright, 2);
  f.line(5, 16 + bob + wave, 2, 20 + bob - wave, C.bone, 2);
  f.line(20, 18 + bob, 26, 15 + bob - wave, C.boneBright, 2);
  f.line(26, 15 + bob - wave, 29, 19 + bob + wave, C.bone, 2);
  // Long gown
  f.rect(11, 16 + bob, 10, 13, C.bone);
  f.rect(12, 17 + bob, 8, 11, C.boneBright);
  f.rect(11, 20 + bob, 10, 2, C.greyDark);
  // Opera face (pure bone & ink)
  f.ellipse(15.5, 11 + bob, 4.0, 3.8, C.boneBright);
  f.px(14, 11 + bob, C.inkDeep);
  f.px(17, 11 + bob, C.inkDeep);
  // Classic hair buns + bone hairpin
  f.ellipse(15.5, 7 + bob, 4.5, 2.2, C.inkNight);
  f.ellipse(12, 5 + bob, 2, 2, C.inkNight);
  f.ellipse(19, 5 + bob, 2, 2, C.inkNight);
  f.line(10, 6 + bob, 21, 6 + bob, C.bone, 1);
  // Round waist lantern
  drawPaperLantern(f, 8, 22 + bob, 0, true);
  f.outline();
}

// 4. Ghost (游魂) — 32x32 -> 64x64
function drawGhost(f, step) {
  const hover = step % 2 === 1 ? -2 : 0;
  const tail = step === 0 ? -1 : step === 2 ? 1 : 0;
  f.ellipse(16, 12 + hover, 6.5, 6.5, C.bone);
  f.rect(10, 12 + hover, 13, 9, C.bone);
  f.ellipse(15, 11 + hover, 4.5, 4.5, C.boneBright);
  // Multi-tailed wisps
  f.line(11, 20 + hover, 9 + tail, 28 + hover, C.boneDark, 2);
  f.line(16, 20 + hover, 16 + tail, 29 + hover, C.bone, 2);
  f.line(21, 20 + hover, 23 + tail, 27 + hover, C.boneDark, 2);
  // Hollow eyes & mouth
  f.rect(13, 10 + hover, 2, 3, C.inkDeep);
  f.rect(17, 10 + hover, 2, 3, C.inkDeep);
  f.rect(15, 14 + hover, 2, 2, C.inkDeep);
  f.outline();
}

// 5. Jiangshi (行尸) — 32x32 -> 64x64
function drawJiangshi(f, step) {
  const hop = step === 1 ? -4 : step === 2 ? -2 : 0;
  // Boots
  f.rect(12, 27 + hop, 3, 2, C.inkDeep);
  f.rect(17, 27 + hop, 3, 2, C.inkDeep);
  // Qing official robe
  f.rect(10, 15 + hop, 11, 12, C.greyDark);
  f.rect(12, 16 + hop, 7, 10, C.inkSlate);
  // Outstretched arms
  f.rect(19, 17 + hop, 9, 3, C.greyMid);
  f.rect(26, 17 + hop, 2, 3, C.sageLight);
  // Pale grey-green head
  f.ellipse(15.5, 11 + hop, 4.2, 4.0, C.sageMid);
  // Qing cap with brim
  f.rect(10, 7 + hop, 11, 2, C.inkNight);
  f.rect(12, 4 + hop, 7, 3, C.inkSlate);
  // Yellow paper talisman on forehead
  f.rect(15, 8 + hop, 3, 6, C.amberBright);
  f.px(16, 10 + hop, C.amberDark);
  f.px(16, 12 + hop, C.amberDark);
  f.outline();
}

// 6. Wisp Caster (鬼火灵) — 32x32 -> 64x64
function drawWispCaster(f, step) {
  const hover = step % 2 === 1 ? -2 : 0;
  const orbPulse = step === 2 ? 1 : 0;
  f.ellipse(14, 13 + hover, 6, 6, C.sageDark);
  f.rect(9, 14 + hover, 10, 10, C.sageMid);
  f.line(10, 23 + hover, 7, 29 + hover, C.sageDark, 2);
  f.line(14, 23 + hover, 14, 30 + hover, C.sageMid, 2);
  f.line(18, 23 + hover, 20, 28 + hover, C.sageDark, 2);
  // Hollow face
  f.rect(12, 11 + hover, 2, 2, C.inkDeep);
  f.rect(16, 11 + hover, 2, 2, C.inkDeep);
  // Floating cold ghost orb held in front
  f.ellipse(24, 17 + hover, 3.5 + orbPulse * 0.5, 3.5 + orbPulse * 0.5, C.sageLight);
  f.ellipse(24, 17 + hover, 2, 2, C.boneBright);
  f.outline();
}

// 7. Elite Ghost (红眼大幽魂) — 48x48 grid upscaled 2x -> 96x96
function drawEliteGhost(f, step) {
  const hover = step % 2 === 1 ? -3 : 0;
  const wave = step === 0 ? -2 : step === 2 ? 2 : 0;
  f.ellipse(24, 17 + hover, 11, 11, C.greyLight);
  f.ellipse(24, 16 + hover, 9, 9, C.bone);
  f.rect(14, 18 + hover, 20, 12, C.bone);
  // Flowing spectral tails
  f.line(15, 29 + hover, 10 + wave, 42 + hover, C.greyLight, 3);
  f.line(21, 29 + hover, 19 + wave, 44 + hover, C.boneDark, 3);
  f.line(27, 29 + hover, 29 + wave, 43 + hover, C.bone, 3);
  f.line(33, 29 + hover, 37 + wave, 40 + hover, C.greyLight, 3);
  // Glowing Vermilion Elite Eyes + Crimson Seal on chest
  f.rect(19, 14 + hover, 4, 3, C.vermilionBright);
  f.rect(26, 14 + hover, 4, 3, C.vermilionBright);
  f.ellipse(24, 24 + hover, 4.5, 4.5, C.vermilion);
  f.ellipse(24, 24 + hover, 2.2, 2.2, C.vermilionDark);
  f.px(24, 24 + hover, C.vermilionBright);
  f.outline();
}

// 8. Elite Jiangshi (红眼印章尸) — 48x48 -> 96x96
function drawEliteJiangshi(f, step) {
  const hop = step === 1 ? -4 : step === 2 ? -2 : 0;
  // Boots
  f.rect(17, 41 + hop, 5, 3, C.inkDeep);
  f.rect(26, 41 + hop, 5, 3, C.inkDeep);
  // Heavy tattered robe
  f.rect(14, 21 + hop, 20, 20, C.inkSlate);
  f.rect(16, 22 + hop, 16, 17, C.greyDark);
  // Crimson seal emblem on chest
  f.ellipse(24, 30 + hop, 5, 5, C.vermilion);
  f.rect(22, 28 + hop, 4, 4, C.vermilionDark);
  f.px(24, 30 + hop, C.vermilionBright);
  // Heavy outstretched arms
  f.rect(31, 24 + hop, 12, 4, C.inkSlate);
  f.rect(41, 24 + hop, 3, 4, C.greyLight);
  // Head & official hat
  f.ellipse(24, 15 + hop, 6.2, 5.8, C.greyMid);
  f.rect(15, 9 + hop, 18, 3, C.inkNight);
  f.rect(18, 4 + hop, 12, 5, C.inkSlate);
  // Glowing vermilion eyes
  f.rect(21, 14 + hop, 3, 2, C.vermilionBright);
  f.rect(26, 14 + hop, 3, 2, C.vermilionBright);
  f.outline();
}

// 9. Punisher / White Paper Bailiff (白纸差役) — 48x48 -> 96x96
function drawPunisher(f, step) {
  const stride = step === 0 ? -2 : step === 2 ? 2 : 0;
  // Rigid legs
  f.rect(19 + stride, 36, 4, 8, C.boneDark);
  f.rect(25 - stride, 36, 4, 8, C.boneDark);
  // Tall gaunt paper-effigy body
  f.rect(17, 19, 14, 17, C.bone);
  f.rect(19, 20, 10, 15, C.boneBright);
  // Vertical vermilion chest seal strip
  f.rect(22, 21, 4, 9, C.vermilion);
  f.px(24, 23, C.boneBright);
  f.px(24, 26, C.boneBright);
  // Reaching paper arms
  f.rect(30, 21, 11, 3, C.bone);
  // Paper face
  f.ellipse(24, 13, 5, 5, C.boneBright);
  f.rect(21, 12, 2, 2, C.inkDeep);
  f.rect(25, 12, 2, 2, C.inkDeep);
  // Pointed funerary paper cone hat with vermilion strip
  f.line(24, 2, 16, 10, C.bone, 2);
  f.line(24, 2, 32, 10, C.bone, 2);
  f.rect(18, 7, 12, 3, C.boneBright);
  f.rect(23, 4, 2, 6, C.vermilion);
  f.outline();
}

// 10. White Stranger (白衣人) — 32x32 -> 64x64
function drawWhiteStranger(f, step) {
  const hover = step % 2 === 1 ? -1 : 0;
  const sway = step === 0 ? -1 : step === 2 ? 1 : 0;
  // Long mourning robe
  f.rect(11, 12 + hover, 10, 15, C.bone);
  f.rect(12, 13 + hover, 8, 13, C.boneBright);
  f.line(11, 26 + hover, 10 + sway, 30 + hover, C.boneDark, 1);
  f.line(16, 26 + hover, 16 + sway, 30 + hover, C.bone, 1);
  f.line(20, 26 + hover, 21 + sway, 29 + hover, C.boneDark, 1);
  // Faceless pale head & long dark hair
  f.ellipse(16, 8 + hover, 4, 4, C.boneBright);
  f.rect(12, 4 + hover, 8, 3, C.inkNight);
  f.rect(11, 6 + hover, 2, 7, C.inkNight);
  f.rect(19, 6 + hover, 2, 7, C.inkNight);
  f.outline();
}

// 11. Boss Paper-Effigy Magistrate (纸扎判官) — 48x48 -> 96x96
function drawBossMagistrate(f, step) {
  const hover = step % 2 === 1 ? -2 : 0;
  const brushTilt = step === 1 ? -3 : step === 3 ? 3 : 0;
  // Layered dark judge robe with vermilion trim
  f.rect(14, 19 + hover, 20, 24, C.inkNight);
  f.rect(16, 20 + hover, 16, 21, C.inkSlate);
  f.rect(15, 20 + hover, 2, 21, C.vermilion);
  f.rect(31, 20 + hover, 2, 21, C.vermilion);
  f.rect(20, 25 + hover, 8, 6, C.boneDark); // rank square badge
  f.rect(22, 27 + hover, 4, 2, C.amber);
  // Paper judge face with vermilion brow mark
  f.ellipse(24, 13 + hover, 5.5, 5.5, C.boneBright);
  f.rect(23, 9 + hover, 2, 3, C.vermilionBright);
  f.rect(21, 13 + hover, 2, 2, C.inkDeep);
  f.rect(26, 13 + hover, 2, 2, C.inkDeep);
  // Official gauze hat with winged ear-tabs
  f.rect(17, 6 + hover, 14, 4, C.inkNight);
  f.rect(19, 3 + hover, 10, 4, C.inkSlate);
  f.rect(9, 7 + hover, 9, 2, C.inkNight);
  f.rect(30, 7 + hover, 9, 2, C.inkNight);
  // Giant calligraphy judgment brush dipped in vermilion
  f.line(10, 31 + hover, 39, 17 + hover + brushTilt, C.amberDark, 2);
  f.line(11, 30 + hover, 38, 16 + hover + brushTilt, C.amber, 1);
  f.ellipse(41, 15 + hover + brushTilt, 3.2, 3.2, C.vermilion);
  f.ellipse(42, 14 + hover + brushTilt, 1.8, 1.8, C.vermilionBright);
  f.outline();
}

const SPECS = [
  { id: 'player_mortal', label: '提灯少年（人间）', frameSize: 96, grid: 32, fps: 8, anchorY: 0.88, allowVermilion: false, draw: drawPlayerMortal, dissolveColor: C.greyLight },
  { id: 'player_sheng', label: '武生快剑（诡界·生）', frameSize: 96, grid: 32, fps: 10, anchorY: 0.88, allowVermilion: false, draw: drawPlayerSheng, dissolveColor: C.bone },
  { id: 'player_dan', label: '青衣水袖（诡界·旦）', frameSize: 96, grid: 32, fps: 9, anchorY: 0.88, allowVermilion: false, draw: drawPlayerDan, dissolveColor: C.bone },
  { id: 'boss_magistrate', label: '纸扎判官（Boss）', frameSize: 96, grid: 48, fps: 7, anchorY: 0.9, allowVermilion: true, draw: drawBossMagistrate, dissolveColor: C.vermilionBright },
  { id: 'ghost', label: '游魂', frameSize: 64, grid: 32, fps: 8, anchorY: 0.85, allowVermilion: false, draw: drawGhost, dissolveColor: C.boneDark },
  { id: 'jiangshi', label: '行尸', frameSize: 64, grid: 32, fps: 7, anchorY: 0.88, allowVermilion: false, draw: drawJiangshi, dissolveColor: C.greyMid },
  { id: 'wisp_caster', label: '鬼火灵', frameSize: 64, grid: 32, fps: 9, anchorY: 0.86, allowVermilion: false, draw: drawWispCaster, dissolveColor: C.sageLight },
  { id: 'elite_ghost', label: '红眼大幽魂（精英）', frameSize: 64, grid: 48, fps: 8, anchorY: 0.88, allowVermilion: true, draw: drawEliteGhost, dissolveColor: C.vermilion },
  { id: 'elite_jiangshi', label: '红眼印章尸（精英）', frameSize: 64, grid: 48, fps: 7, anchorY: 0.9, allowVermilion: true, draw: drawEliteJiangshi, dissolveColor: C.vermilion },
  { id: 'punisher', label: '白纸差役（破戒追猎）', frameSize: 64, grid: 48, fps: 9, anchorY: 0.9, allowVermilion: true, draw: drawPunisher, dissolveColor: C.bone },
  { id: 'white_stranger', label: '白衣问路人（禁忌七）', frameSize: 64, grid: 32, fps: 6, anchorY: 0.9, allowVermilion: false, draw: drawWhiteStranger, dissolveColor: C.boneDark },
];

const HFRAMES = 8; // 4 walk + 1 hit + 3 death
const report = {
  version: '1.0.0',
  protocol: 'horizontal_strip_v1',
  palette_gate: 'ink_night_18_colors',
  sprites: {},
};

let gateFailures = 0;

for (const spec of SPECS) {
  const sheetW = spec.frameSize * HFRAMES;
  const sheetH = spec.frameSize;
  const sheetRgba = Buffer.alloc(sheetW * sheetH * 4);
  const usedColors = new Set();

  for (let fi = 0; fi < HFRAMES; fi++) {
    const frame = new PixelFrame(spec.grid);
    const animStep = fi < 4 ? fi : 0;
    spec.draw(frame, animStep);
    if (fi === 4) {
      frame.applyHitFlash();
    } else if (fi >= 5) {
      frame.applyDissolve(fi - 4, spec.dissolveColor);
    }

    // Nearest-neighbor resample into exact upstream frameSize (64 or 96) + strict 18-color palette audit
    for (let py = 0; py < spec.frameSize; py++) {
      const gy = Math.floor((py * spec.grid) / spec.frameSize);
      for (let px = 0; px < spec.frameSize; px++) {
        const gx = Math.floor((px * spec.grid) / spec.frameSize);
        const sIdx = (gy * spec.grid + gx) * 4;
        const a = frame.data[sIdx + 3];
        if (a === 0) continue;
        const r = frame.data[sIdx];
        const g = frame.data[sIdx + 1];
        const b = frame.data[sIdx + 2];
        const key = `${r},${g},${b}`;
        usedColors.add(key);
        if (!ALLOWED_RGB_SET.has(key)) {
          console.error(`[PALETTE GATE FAIL] ${spec.id} frame ${fi}: out-of-palette RGB(${key})`);
          gateFailures++;
        }
        if (!spec.allowVermilion && VERMILION_RGB_SET.has(key)) {
          console.error(`[VERMILION GATE FAIL] ${spec.id} frame ${fi}: vermilion forbidden on this actor`);
          gateFailures++;
        }
        const dx = fi * spec.frameSize + px;
        const dIdx = (py * sheetW + dx) * 4;
        sheetRgba[dIdx] = r;
        sheetRgba[dIdx + 1] = g;
        sheetRgba[dIdx + 2] = b;
        sheetRgba[dIdx + 3] = 255;
      }
    }
  }

  const filename = `${spec.id}.png`;
  const pngBytes = encodePng(sheetW, sheetH, sheetRgba);
  fs.writeFileSync(path.join(OUT_DIR, filename), pngBytes);

  report.sprites[spec.id] = {
    path: `res://assets/sprites/${filename}`,
    file: filename,
    label: spec.label,
    frame_size: spec.frameSize,
    hframes: HFRAMES,
    fps: spec.fps,
    colors_used: usedColors.size,
    palette_gate_passed: true,
  };
  console.log(`Built ${filename} (${sheetW}x${sheetH}, ${usedColors.size} colors, ${pngBytes.length} bytes)`);
}

if (gateFailures > 0) {
  console.error(`Palette gate failed with ${gateFailures} violations!`);
  process.exit(1);
}

// Keep upstream flat assets/sprites/manifest.json untouched; write companion palette audit report
fs.writeFileSync(path.join(OUT_DIR, 'palette-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`ALL ${SPECS.length} SPRITE SHEETS BUILT & PASSED 18-COLOR PALETTE GATE -> ${OUT_DIR}`);
