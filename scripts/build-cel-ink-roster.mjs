#!/usr/bin/env node
/**
 * Ink Night: Full Cel-Ink 45° Oblique Top-Down Roster Synthesizer
 * Generates 4x supersampled multi-action Cel-Ink spritesheets + Aseprite json-array metadata:
 *   - player_sheng_cel (96x96, 29f): 武生（阳面）— twin pheasant plumes, ink-indigo/bone martial robe, straight piercing sword
 *   - player_dan_cel   (96x96, 29f): 青衣旦（阴面）— celadon-sage & moon-white silk robe, flowing water sleeves (水袖), jade hairpin
 *   - enemy_wolf_cel   (64x64, 19f): 山狼 — agile slate-ink mountain wolf with glowing amber eyes & lunge frames
 *   - enemy_boar_cel   (64x64, 19f): 野猪 — dark-bristle forest boar with curved ivory tusks & amber-rimmed charge frames
 *   - enemy_treant_cel (64x64, 19f): 树妖 — gnarled bark & moss-sage canopy treant with root-slam frames
 *   - enemy_shanxiao_cel (96x96, 19f): 山魈 — daytime elite lanky mountain demon with bone mask & crimson-vermilion elite eyes
 * Also writes godot-prototype/assets/sprites/cel_manifest.json indexing all 7 Cel-Ink actors (including player_mortal_cel).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const GODOT_SPRITES = path.join(ROOT, 'godot-prototype', 'assets', 'sprites');
const ART_PIPELINE = path.join(ROOT, 'godot-prototype', 'art_pipeline');
fs.mkdirSync(GODOT_SPRITES, { recursive: true });
fs.mkdirSync(ART_PIPELINE, { recursive: true });

// --- Minimal RGBA PNG Encoder ---
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const off = y * (width * 4 + 1);
    rows[off] = 0;
    rgba.copy(rows, off + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(rows, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- 4x Supersampled Cel-Ink Rasterizer ---
class SupersampledCanvas {
  constructor(targetSize) {
    this.targetSize = targetSize;
    this.scale = 4;
    this.size = targetSize * 4;
    this.buf = Buffer.alloc(this.size * this.size * 4);
  }
  blendPixel(x, y, r, g, b, a) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.size || iy < 0 || iy >= this.size || a <= 0) return;
    const off = (iy * this.size + ix) * 4;
    const sa = a / 255;
    const da = this.buf[off + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    this.buf[off] = Math.round((r * sa + this.buf[off] * da * (1 - sa)) / oa);
    this.buf[off + 1] = Math.round((g * sa + this.buf[off + 1] * da * (1 - sa)) / oa);
    this.buf[off + 2] = Math.round((b * sa + this.buf[off + 2] * da * (1 - sa)) / oa);
    this.buf[off + 3] = Math.round(oa * 255);
  }
  fillEllipse(cx, cy, rx, ry, [r, g, b, a = 255]) {
    const x0 = Math.max(0, Math.floor(cx - rx - 1));
    const x1 = Math.min(this.size - 1, Math.ceil(cx + rx + 1));
    const y0 = Math.max(0, Math.floor(cy - ry - 1));
    const y1 = Math.min(this.size - 1, Math.ceil(cy + ry + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / Math.max(0.5, rx);
        const dy = (y - cy) / Math.max(0.5, ry);
        if (dx * dx + dy * dy <= 1.0) this.blendPixel(x, y, r, g, b, a);
      }
    }
  }
  fillSoftGlow(cx, cy, radius, [r, g, b], peakAlpha) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.size - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.size - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / Math.max(1, radius);
        if (d < 1.0) {
          const f = (1 - d) * (1 - d);
          this.blendPixel(x, y, r, g, b, Math.round(peakAlpha * f));
        }
      }
    }
  }
  fillPoly(pts, [r, g, b, a = 255], outline = null, outlineW = 4) {
    let minY = this.size;
    let maxY = 0;
    for (const [, py] of pts) {
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.size - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      const xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [x1, y1p] = pts[i];
        const [x2, y2p] = pts[j];
        if ((y1p > y) !== (y2p > y)) {
          xs.push(x1 + ((y - y1p) * (x2 - x1)) / (y2p - y1p));
        }
      }
      xs.sort((u, v) => u - v);
      for (let k = 0; k < xs.length; k += 2) {
        const sx = Math.max(0, Math.floor(xs[k]));
        const ex = Math.min(this.size - 1, Math.ceil(xs[k + 1] ?? xs[k]));
        for (let x = sx; x <= ex; x++) this.blendPixel(x, y, r, g, b, a);
      }
    }
    if (outline) {
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        this.strokeLine(p1[0], p1[1], p2[0], p2[1], outlineW, outline);
      }
    }
  }
  strokeLine(x1, y1, x2, y2, thickness, [r, g, b, a = 255]) {
    const dist = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
    const rad = Math.max(1, thickness * 0.5);
    for (let i = 0; i <= dist; i++) {
      const t = i / dist;
      this.fillEllipse(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, rad, rad, [r, g, b, a]);
    }
  }
  downsample() {
    const t = this.targetSize;
    const out = Buffer.alloc(t * t * 4);
    for (let y = 0; y < t; y++) {
      for (let x = 0; x < t; x++) {
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 4; dx++) {
            const off = ((y * 4 + dy) * this.size + (x * 4 + dx)) * 4;
            const a = this.buf[off + 3];
            sr += this.buf[off] * a;
            sg += this.buf[off + 1] * a;
            sb += this.buf[off + 2] * a;
            sa += a;
          }
        }
        const outOff = (y * t + x) * 4;
        const avgA = Math.round(sa / 16);
        if (avgA > 6) {
          out[outOff] = Math.min(255, Math.round(sr / sa));
          out[outOff + 1] = Math.min(255, Math.round(sg / sa));
          out[outOff + 2] = Math.min(255, Math.round(sb / sa));
          out[outOff + 3] = avgA;
        }
      }
    }
    return out;
  }
}

const PAL = {
  ink: [13, 18, 24, 255],
  slateDark: [26, 36, 46, 255],
  slateMid: [54, 72, 90, 255],
  slateLight: [104, 128, 148, 255],
  bone: [232, 226, 212, 255],
  boneBright: [248, 244, 234, 255],
  boneShade: [164, 162, 154, 255],
  sageDark: [54, 72, 66, 255],
  sageMid: [96, 128, 114, 255],
  sageLight: [152, 194, 174, 255],
  jadeGlow: [176, 224, 202, 255],
  amberDark: [178, 122, 34, 255],
  amber: [232, 179, 74, 255],
  amberBright: [252, 232, 162, 255],
  barkDark: [44, 42, 38, 255],
  barkMid: [78, 72, 62, 255],
  wolfDark: [42, 50, 58, 255],
  wolfMid: [86, 98, 108, 255],
  wolfLight: [148, 160, 168, 255],
  boarDark: [32, 34, 36, 255],
  boarMid: [66, 64, 62, 255],
  vermilion: [200, 64, 42, 255],
  vermilionBright: [236, 96, 72, 255],
  shadow: [10, 14, 18, 130],
};

// Keep ground contact anchor strictly locked on every frame
function drawGroundedShadow(c, cx, footY, rx, ry) {
  c.fillEllipse(cx, footY + 4, rx, ry, PAL.shadow);
}

// ============================================================================
// 1. 武生（阳面）player_sheng_cel — 96x96, 29 frames, ZERO vermilion!
// ============================================================================
function drawShengFrame(tag, idx, total) {
  const c = new SupersampledCanvas(96);
  const u = total > 1 ? idx / total : 0;
  const phase = u * Math.PI * 2;
  const cx = 192;
  const footY = 358;

  let bodyDy = 0;
  let lean = 0;
  let stride = 0;
  let thrust = 0;
  let flipSpin = 0;
  let hitFlash = false;
  let dissolve = 0;

  if (tag === 'idle') {
    bodyDy = Math.sin(phase) * 4.5;
  } else if (tag === 'move') {
    stride = Math.sin(phase);
    bodyDy = -Math.abs(Math.cos(phase)) * 12 + 3;
    lean = 20 + Math.cos(phase * 2) * 3;
  } else if (tag === 'attack') {
    const p = idx / Math.max(1, total - 1);
    thrust = Math.sin(p * Math.PI);
    lean = -10 + thrust * 38;
    bodyDy = -thrust * 8;
    stride = thrust * 0.9;
  } else if (tag === 'flip') {
    const p = idx / Math.max(1, total - 1);
    flipSpin = Math.sin(p * Math.PI);
    bodyDy = -flipSpin * 16;
    lean = Math.cos(p * Math.PI * 2) * 14;
  } else if (tag === 'hit') {
    hitFlash = idx === 0;
    lean = idx === 0 ? -24 : -12;
    bodyDy = idx === 0 ? -8 : 2;
  } else if (tag === 'death') {
    dissolve = (idx + 1) / total;
    bodyDy = dissolve * 44;
    lean = dissolve * 28;
  }

  drawGroundedShadow(c, cx, footY, 54 - dissolve * 12, 13);

  // Flip spectral ink-ring
  if (flipSpin > 0.1) {
    c.fillSoftGlow(cx, footY - 120, 128 * flipSpin, [152, 194, 174], Math.round(95 * flipSpin));
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2 + idx * 0.45;
      c.fillEllipse(cx + Math.cos(a) * (88 + flipSpin * 26), footY - 110 + Math.sin(a) * 36, 7, 7, PAL.amberBright);
    }
  }

  const hipX = cx + lean * 0.35;
  const hipY = footY - 114 + bodyDy;
  const shoulderX = cx + lean * 0.85;
  const shoulderY = hipY - 72;
  const headX = shoulderX + lean * 0.12;
  const headY = shoulderY - 46;

  // Martial boots anchored on footY
  const lfX = cx - 26 - stride * 34;
  const rfX = cx + 26 + stride * 34;
  const lfLift = tag === 'move' ? Math.max(0, -Math.cos(phase)) * 18 : 0;
  const rfLift = tag === 'move' ? Math.max(0, Math.cos(phase)) * 18 : 0;

  c.strokeLine(hipX - 14, hipY + 12, lfX, footY - lfLift - 8, 20, PAL.slateDark);
  c.strokeLine(hipX + 14, hipY + 12, rfX, footY - rfLift - 8, 20, PAL.slateDark);
  c.fillEllipse(lfX + 4, footY - lfLift - 4, 19, 10, PAL.ink);
  c.fillEllipse(rfX + 4, footY - rfLift - 4, 19, 10, PAL.ink);
  // Crisp white sole trim (classic Peking Opera thick-soled martial boot 厚底靴)
  c.strokeLine(lfX - 11, footY - lfLift + 1, lfX + 16, footY - lfLift + 1, 5, PAL.boneBright);
  c.strokeLine(rfX - 11, footY - rfLift + 1, rfX + 16, footY - rfLift + 1, 5, PAL.boneBright);

  // Flowing back battle pennant/cape (靠旗 trim in bone-white & slate-indigo)
  const capeWave = Math.sin(phase + 0.6) * 14 + thrust * 18;
  c.fillPoly(
    [
      [shoulderX - 24, shoulderY + 6],
      [shoulderX + 20, shoulderY + 6],
      [hipX + 34 - capeWave * 0.4, footY - 38 + bodyDy * 0.3],
      [hipX - 54 - capeWave, footY - 32 + bodyDy * 0.3],
    ],
    hitFlash ? PAL.boneBright : PAL.slateDark,
    PAL.ink,
    4,
  );

  // Martial tunic (箭衣 / 武生戏服: bone-white front panel + deep ink-indigo armor panels + gold trim)
  const robeCol = hitFlash ? PAL.boneBright : PAL.slateMid;
  c.fillPoly(
    [
      [shoulderX - 36, shoulderY - 4],
      [shoulderX + 36, shoulderY - 4],
      [hipX + 44, hipY + 56],
      [hipX - 44, hipY + 56],
    ],
    robeCol,
    PAL.ink,
    5,
  );
  // Bone-white opera chest plastron
  c.fillPoly(
    [
      [shoulderX - 22, shoulderY + 2],
      [shoulderX + 22, shoulderY + 2],
      [hipX + 18, hipY + 44],
      [hipX - 18, hipY + 44],
    ],
    PAL.bone,
    PAL.ink,
    3,
  );
  // Amber-gold martial waist belt & cloud pauldrons
  c.fillPoly(
    [
      [hipX - 36, hipY - 6],
      [hipX + 36, hipY - 6],
      [hipX + 38, hipY + 12],
      [hipX - 38, hipY + 12],
    ],
    PAL.amber,
    PAL.ink,
    4,
  );
  c.fillEllipse(shoulderX - 34, shoulderY + 4, 18, 12, PAL.bone);
  c.fillEllipse(shoulderX + 34, shoulderY + 4, 18, 12, PAL.bone);
  c.fillEllipse(shoulderX - 34, shoulderY + 4, 10, 6, PAL.amber);
  c.fillEllipse(shoulderX + 34, shoulderY + 4, 10, 6, PAL.amber);

  // Head + Peking Opera Sheng Mask (stark ink & moon-white, ZERO vermilion!)
  c.fillEllipse(headX, headY, 32, 34, hitFlash ? PAL.boneBright : PAL.boneBright);
  c.strokeLine(headX - 30, headY, headX + 30, headY, 2, [0, 0, 0, 0]);
  // Crisp outer head ink rim
  for (let k = 0; k < 24; k++) {
    const a1 = (k / 24) * Math.PI * 2;
    const a2 = ((k + 1) / 24) * Math.PI * 2;
    c.strokeLine(headX + Math.cos(a1) * 32, headY + Math.sin(a1) * 34, headX + Math.cos(a2) * 32, headY + Math.sin(a2) * 34, 4.5, PAL.ink);
  }
  // Sharp martial ink brows & eyes
  c.strokeLine(headX - 18, headY - 8, headX - 4, headY - 3, 5, PAL.ink);
  c.strokeLine(headX + 18, headY - 8, headX + 4, headY - 3, 5, PAL.ink);
  c.fillEllipse(headX - 10, headY + 2, 4.5, 3.5, PAL.ink);
  c.fillEllipse(headX + 12, headY + 2, 4.5, 3.5, PAL.ink);

  // Martial crown (武生额子 / 盔帽) + twin sweeping pheasant feathers (双翎子)
  c.fillPoly(
    [
      [headX - 34, headY - 18],
      [headX + 34, headY - 18],
      [headX + 24, headY - 46],
      [headX - 24, headY - 46],
    ],
    PAL.slateDark,
    PAL.ink,
    4,
  );
  c.fillEllipse(headX, headY - 26, 12, 8, PAL.amber);
  // Twin pheasant plumes curving gracefully (kept inside top margin y>=24)
  const plumeSway = Math.sin(phase) * 14 + thrust * 16;
  c.strokeLine(headX - 14, headY - 42, headX - 52 - plumeSway * 0.5, headY - 76, 6, PAL.amber);
  c.strokeLine(headX - 52 - plumeSway * 0.5, headY - 76, headX - 88 - plumeSway, headY - 58, 4.5, PAL.boneBright);
  c.strokeLine(headX + 14, headY - 42, headX + 44 - plumeSway * 0.3, headY - 78, 6, PAL.amber);
  c.strokeLine(headX + 44 - plumeSway * 0.3, headY - 78, headX + 78 - plumeSway * 0.6, headY - 62, 4.5, PAL.boneBright);

  // Straight Piercing Sword (青霜长剑)
  const swordArmX = shoulderX + 24 + thrust * 38;
  const swordArmY = shoulderY + 26 - thrust * 14;
  c.strokeLine(shoulderX + 20, shoulderY + 12, swordArmX, swordArmY, 16, PAL.slateDark);
  const tipX = swordArmX + (tag === 'attack' ? 112 + thrust * 30 : 76 - stride * 12);
  const tipY = swordArmY + (tag === 'attack' ? -8 : -54 + Math.sin(phase) * 8);
  // Hilt & gold guard
  c.strokeLine(swordArmX - 10, swordArmY + 6, swordArmX + 8, swordArmY - 6, 8, PAL.amber);
  c.strokeLine(swordArmX - 6, swordArmY - 12, swordArmX + 10, swordArmY + 12, 7, PAL.amber);
  // Crisp piercing blade
  c.strokeLine(swordArmX + 4, swordArmY - 2, tipX, tipY, 11, PAL.ink);
  c.strokeLine(swordArmX + 4, swordArmY - 2, tipX, tipY, 6, PAL.boneBright);
  if (tag === 'attack' && thrust > 0.25) {
    // Piercing straight sword-beam flash!
    c.fillSoftGlow(tipX - 16, tipY, 54 * thrust, [232, 244, 248], Math.round(160 * thrust));
    c.strokeLine(swordArmX + 10, swordArmY - 2, Math.min(372, tipX + 36 * thrust), tipY, 14 * thrust, [248, 244, 234, Math.round(210 * thrust)]);
    c.strokeLine(swordArmX + 10, swordArmY - 2, Math.min(372, tipX + 36 * thrust), tipY, 6 * thrust, PAL.amberBright);
  }

  return c.downsample();
}

// ============================================================================
// 2. 青衣旦（阴面）player_dan_cel — 96x96, 29 frames, ZERO vermilion!
// ============================================================================
function drawDanFrame(tag, idx, total) {
  const c = new SupersampledCanvas(96);
  const u = total > 1 ? idx / total : 0;
  const phase = u * Math.PI * 2;
  const cx = 192;
  const footY = 358;

  let bodyDy = 0;
  let lean = 0;
  let glide = 0;
  let sweep = 0;
  let flipSpin = 0;
  let hitFlash = false;
  let dissolve = 0;

  if (tag === 'idle') {
    bodyDy = Math.sin(phase) * 4.0;
  } else if (tag === 'move') {
    glide = Math.sin(phase);
    bodyDy = Math.sin(phase * 2) * 5.0 - 4.0;
    lean = 12 + Math.cos(phase) * 4;
  } else if (tag === 'attack') {
    const p = idx / Math.max(1, total - 1);
    sweep = Math.sin(p * Math.PI);
    lean = -14 + p * 34;
    bodyDy = -sweep * 10;
  } else if (tag === 'flip') {
    const p = idx / Math.max(1, total - 1);
    flipSpin = Math.sin(p * Math.PI);
    bodyDy = -flipSpin * 16;
  } else if (tag === 'hit') {
    hitFlash = idx === 0;
    lean = idx === 0 ? -22 : -10;
    bodyDy = idx === 0 ? -6 : 2;
  } else if (tag === 'death') {
    dissolve = (idx + 1) / total;
    bodyDy = dissolve * 44;
    lean = -dissolve * 24;
  }

  drawGroundedShadow(c, cx, footY, 56 - dissolve * 12, 13);

  if (flipSpin > 0.1) {
    c.fillSoftGlow(cx, footY - 120, 128 * flipSpin, [176, 224, 202], Math.round(105 * flipSpin));
  }

  const hipX = cx + lean * 0.3;
  const hipY = footY - 118 + bodyDy;
  const shoulderX = cx + lean * 0.7;
  const shoulderY = hipY - 68;
  const headX = shoulderX + lean * 0.1;
  const headY = shoulderY - 46;

  // Grounded opera slippers peaking cleanly at footY
  const lfX = cx - 16 - glide * 20;
  const rfX = cx + 16 + glide * 20;
  c.fillEllipse(lfX, footY - 4, 15, 8, PAL.ink);
  c.fillEllipse(rfX, footY - 4, 15, 8, PAL.ink);
  c.fillEllipse(lfX, footY - 6, 10, 4, PAL.sageLight);
  c.fillEllipse(rfX, footY - 6, 10, 4, PAL.sageLight);

  // Flowing pleated celadon-sage & bone opera skirt (青衣长裙)
  const hemSway = Math.sin(phase) * 14 + sweep * 18;
  c.fillPoly(
    [
      [shoulderX - 28, shoulderY + 6],
      [shoulderX + 28, shoulderY + 6],
      [cx + 58 + hemSway * 0.4, footY - 8],
      [cx - 58 + hemSway * 0.6, footY - 8],
    ],
    hitFlash ? PAL.boneBright : PAL.sageDark,
    PAL.ink,
    5,
  );
  // Inner moon-white pleated panel + jade sash
  c.fillPoly(
    [
      [shoulderX - 18, shoulderY + 12],
      [shoulderX + 18, shoulderY + 12],
      [cx + 28 + hemSway * 0.4, footY - 10],
      [cx - 28 + hemSway * 0.4, footY - 10],
    ],
    PAL.sageMid,
    PAL.ink,
    3,
  );
  c.fillPoly(
    [
      [hipX - 26, hipY - 4],
      [hipX + 26, hipY - 4],
      [hipX + 28, hipY + 10],
      [hipX - 28, hipY + 10],
    ],
    PAL.bone,
    PAL.ink,
    3,
  );
  // Hanging silk jade tassel
  c.strokeLine(hipX, hipY + 10, hipX + hemSway * 0.5, hipY + 78, 7, PAL.jadeGlow);
  c.fillEllipse(hipX + hemSway * 0.5, hipY + 80, 9, 9, PAL.amber);

  // Flowing Water Sleeves (水袖 — 220° sweeping silk arcs!)
  const sleeveL_endX = shoulderX - 78 - Math.cos(phase) * 18 - sweep * 42;
  const sleeveL_endY = shoulderY + 56 + Math.sin(phase) * 20 - sweep * 26;
  const sleeveR_endX = shoulderX + 78 + Math.sin(phase) * 18 + sweep * 52;
  const sleeveR_endY = shoulderY + 48 - Math.cos(phase) * 18 - sweep * 38;

  // Left water sleeve
  c.fillPoly(
    [
      [shoulderX - 24, shoulderY + 4],
      [shoulderX - 14, shoulderY + 32],
      [Math.max(18, sleeveL_endX), sleeveL_endY + 18],
      [Math.max(18, sleeveL_endX - 10), sleeveL_endY - 12],
    ],
    PAL.boneBright,
    PAL.ink,
    4,
  );
  // Right water sleeve
  c.fillPoly(
    [
      [shoulderX + 24, shoulderY + 4],
      [shoulderX + 14, shoulderY + 32],
      [Math.min(366, sleeveR_endX), sleeveR_endY + 18],
      [Math.min(366, sleeveR_endX + 10), sleeveR_endY - 12],
    ],
    PAL.boneBright,
    PAL.ink,
    4,
  );

  // 220° sweeping silk vortex during attack tag
  if (tag === 'attack' && sweep > 0.2) {
    c.fillSoftGlow(cx + 12, shoulderY + 24, 118 * sweep, [176, 224, 202], Math.round(135 * sweep));
    const arcSteps = 18;
    const startA = -Math.PI * 0.72;
    const endA = Math.PI * 0.52;
    for (let k = 0; k < arcSteps; k++) {
      const a1 = startA + ((endA - startA) * k) / arcSteps;
      const a2 = startA + ((endA - startA) * (k + 1)) / arcSteps;
      const rad = 112 + sweep * 24;
      c.strokeLine(
        cx + Math.cos(a1) * rad,
        shoulderY + 28 + Math.sin(a1) * rad * 0.72,
        cx + Math.cos(a2) * rad,
        shoulderY + 28 + Math.sin(a2) * rad * 0.72,
        14 * sweep,
        [248, 244, 234, Math.round(215 * sweep)],
      );
    }
  }

  // Head + Elegant Opera Dan Chignon & Jade Hairpins (青衣头面, ZERO vermilion!)
  c.fillEllipse(headX, headY - 8, 36, 36, PAL.ink); // Rich ink-black hair halo
  c.fillEllipse(headX, headY + 2, 28, 30, PAL.boneBright);
  // Hairpin ornaments (jade-silver + pale amber pearls)
  c.fillEllipse(headX - 24, headY - 24, 10, 10, PAL.sageLight);
  c.fillEllipse(headX + 24, headY - 24, 10, 10, PAL.sageLight);
  c.fillEllipse(headX, headY - 34, 13, 9, PAL.amber);
  c.strokeLine(headX - 44, headY - 26, headX + 44, headY - 26, 4.5, PAL.jadeGlow);
  // Phoenix eyes (丹凤眼 in crisp ink only)
  c.strokeLine(headX - 16, headY - 2, headX - 5, headY + 2, 4, PAL.ink);
  c.strokeLine(headX + 16, headY - 2, headX + 5, headY + 2, 4, PAL.ink);

  return c.downsample();
}

// ============================================================================
// 3. 白昼山狼 enemy_wolf_cel — 64x64 (256x256 supersampled), 19 frames
// ============================================================================
function drawWolfFrame(tag, idx, total) {
  const c = new SupersampledCanvas(64);
  const u = total > 1 ? idx / total : 0;
  const phase = u * Math.PI * 2;
  const cx = 128;
  const footY = 236;

  let stride = 0;
  let bodyDy = 0;
  let lunge = 0;
  let hitFlash = false;
  let dissolve = 0;

  if (tag === 'idle') {
    bodyDy = Math.sin(phase) * 4;
  } else if (tag === 'move') {
    stride = Math.sin(phase);
    bodyDy = -Math.abs(Math.cos(phase)) * 12;
  } else if (tag === 'attack') {
    lunge = Math.sin((idx / Math.max(1, total - 1)) * Math.PI);
    stride = lunge * 1.1;
    bodyDy = -lunge * 14;
  } else if (tag === 'hit') {
    hitFlash = idx === 0;
    bodyDy = idx === 0 ? -8 : 2;
  } else if (tag === 'death') {
    dissolve = (idx + 1) / total;
    bodyDy = dissolve * 30;
  }

  drawGroundedShadow(c, cx, footY, 56 - dissolve * 12, 11);

  const bx = cx + lunge * 22;
  const by = footY - 68 + bodyDy;

  // Bushy tail
  const tailWag = Math.sin(phase * 1.5) * 12;
  c.fillPoly(
    [
      [bx - 42, by - 4],
      [bx - 88, by - 26 + tailWag],
      [bx - 76, by + 4 + tailWag],
      [bx - 38, by + 12],
    ],
    hitFlash ? PAL.boneBright : PAL.wolfDark,
    PAL.ink,
    4,
  );

  // Four agile legs anchored cleanly on footY
  const flX = bx + 28 + stride * 24;
  const frX = bx + 14 - stride * 18;
  const blX = bx - 32 - stride * 22;
  const brX = bx - 18 + stride * 18;
  c.strokeLine(bx - 26, by + 16, blX, footY - 4, 12, PAL.wolfDark);
  c.strokeLine(bx - 16, by + 16, brX, footY - 4, 12, PAL.wolfMid);
  c.strokeLine(bx + 20, by + 16, frX, footY - 4, 12, PAL.wolfDark);
  c.strokeLine(bx + 28, by + 16, flX, footY - 4, 12, PAL.wolfMid);

  // Sleek wolf torso
  c.fillPoly(
    [
      [bx - 48, by - 16],
      [bx + 36, by - 22],
      [bx + 44, by + 16],
      [bx - 38, by + 20],
    ],
    hitFlash ? PAL.boneBright : PAL.wolfMid,
    PAL.ink,
    4.5,
  );
  // Shaggy neck ruff
  c.fillPoly(
    [
      [bx + 12, by - 28],
      [bx + 46, by - 26],
      [bx + 42, by + 14],
      [bx + 10, by + 8],
    ],
    hitFlash ? PAL.boneBright : PAL.wolfLight,
    PAL.ink,
    3.5,
  );

  // Snarling wolf head + pointed ears + amber eye
  const hx = bx + 54;
  const hy = by - 26;
  c.fillPoly(
    [
      [hx - 20, hy - 14],
      [hx + 28, hy - 2],
      [hx + 22, hy + 14],
      [hx - 16, hy + 16],
    ],
    hitFlash ? PAL.boneBright : PAL.wolfMid,
    PAL.ink,
    4,
  );
  // Ears
  c.fillPoly([[hx - 14, hy - 12], [hx - 22, hy - 36], [hx - 2, hy - 16]], PAL.wolfDark, PAL.ink, 3.5);
  c.fillPoly([[hx - 2, hy - 12], [hx - 4, hy - 34], [hx + 10, hy - 12]], PAL.wolfDark, PAL.ink, 3.5);
  // Amber predatory eye & ivory fangs
  c.fillEllipse(hx + 2, hy - 3, 5, 4, PAL.amberBright);
  if (tag === 'attack') {
    c.fillPoly([[hx + 12, hy + 6], [hx + 26, hy + 16], [hx + 8, hy + 14]], PAL.boneBright);
    c.fillSoftGlow(hx + 28, hy + 6, 36 * lunge, [248, 244, 234], Math.round(145 * lunge));
  }

  return c.downsample();
}

// ============================================================================
// 4. 白昼野猪 enemy_boar_cel — 64x64 (256x256 supersampled), 19 frames
// ============================================================================
function drawBoarFrame(tag, idx, total) {
  const c = new SupersampledCanvas(64);
  const u = total > 1 ? idx / total : 0;
  const phase = u * Math.PI * 2;
  const cx = 128;
  const footY = 236;

  let stride = 0;
  let bodyDy = 0;
  let bodyDx = 0;
  let charge = 0;
  let hitFlash = false;
  let dissolve = 0;

  if (tag === 'idle') {
    bodyDy = Math.sin(phase) * 4.0;
    bodyDx = Math.cos(phase) * 3.0;
  } else if (tag === 'move') {
    stride = Math.sin(phase);
    bodyDy = -Math.abs(Math.cos(phase)) * 10 + Math.sin(phase + 0.7) * 3;
    bodyDx = Math.cos(phase) * 8.0;
  } else if (tag === 'attack') {
    const p = idx / Math.max(1, total - 1);
    charge = Math.sin(p * Math.PI);
    stride = Math.cos(phase) * 1.1;
    bodyDy = -charge * 7 + (p - 0.5) * 6;
    bodyDx = p * 22;
  } else if (tag === 'hit') {
    hitFlash = idx === 0;
    bodyDy = idx === 0 ? -7 : 2;
    bodyDx = idx === 0 ? -12 : -4;
  } else if (tag === 'death') {
    dissolve = (idx + 1) / total;
    bodyDy = dissolve * 28;
    bodyDx = -dissolve * 10;
  }

  drawGroundedShadow(c, cx, footY, 64 - dissolve * 12, 13);

  const bx = cx + bodyDx + charge * 10;
  const by = footY - 64 + bodyDy;

  if (tag === 'attack' && charge > 0.2) {
    c.fillSoftGlow(bx + 42, by, 54 * charge, [232, 179, 74], Math.round(135 * charge));
  }

  // Sturdy hooves locked on footY
  const l1 = bx - 34 - stride * 16;
  const l2 = bx - 16 + stride * 16;
  const l3 = bx + 16 - stride * 16;
  const l4 = bx + 34 + stride * 16;
  for (const lx of [l1, l2, l3, l4]) {
    c.strokeLine(lx, by + 20, lx, footY - 4, 15, PAL.boarDark);
    c.fillEllipse(lx + 2, footY - 3, 10, 6, PAL.ink);
  }

  // Heavy bristled boar body + dorsal ridge
  c.fillEllipse(bx - 4, by - 4, 58, 38, hitFlash ? PAL.boneBright : PAL.boarMid);
  for (let k = 0; k < 24; k++) {
    const a1 = (k / 24) * Math.PI * 2;
    const a2 = ((k + 1) / 24) * Math.PI * 2;
    c.strokeLine(bx - 4 + Math.cos(a1) * 58, by - 4 + Math.sin(a1) * 38, bx - 4 + Math.cos(a2) * 58, by - 4 + Math.sin(a2) * 38, 4.5, PAL.ink);
  }
  // Spiky dorsal bristles
  c.fillPoly(
    [
      [bx - 46, by - 28],
      [bx - 16, by - 50],
      [bx + 18, by - 48],
      [bx + 42, by - 26],
      [bx - 36, by - 16],
    ],
    PAL.boarDark,
    PAL.ink,
    3.5,
  );
  // Snout + gleaming curved ivory tusks
  const sx = bx + 54;
  const sy = by + 4;
  c.fillEllipse(sx, sy, 22, 18, hitFlash ? PAL.boneBright : PAL.boarDark);
  c.strokeLine(sx + 4, sy + 8, sx + 30, sy - 16, 8, PAL.boneBright);
  c.strokeLine(sx - 4, sy + 10, sx + 22, sy - 12, 6, PAL.bone);
  c.fillEllipse(bx + 36, by - 12, 5, 4, PAL.amberBright);

  return c.downsample();
}

// ============================================================================
// 5. 白昼树妖 enemy_treant_cel — 64x64 (256x256 supersampled), 19 frames
// ============================================================================
function drawTreantFrame(tag, idx, total) {
  const c = new SupersampledCanvas(64);
  const u = total > 1 ? idx / total : 0;
  const phase = u * Math.PI * 2;
  const cx = 128;
  const footY = 236;

  let sway = 0;
  let stride = 0;
  let slam = 0;
  let hitFlash = false;
  let dissolve = 0;

  if (tag === 'idle') {
    sway = Math.sin(phase) * 7 + Math.cos(phase) * 2;
  } else if (tag === 'move') {
    stride = Math.sin(phase);
    sway = Math.cos(phase) * 9 + Math.sin(phase + 0.5) * 3;
  } else if (tag === 'attack') {
    const keys = [-0.28, 0.45, 1.05, 0.2];
    slam = keys[idx % keys.length];
    sway = slam * 18 + (idx - 1.5) * 4;
  } else if (tag === 'hit') {
    hitFlash = idx === 0;
    sway = idx === 0 ? -14 : -6;
  } else if (tag === 'death') {
    dissolve = (idx + 1) / total;
    sway = dissolve * 26;
  }

  drawGroundedShadow(c, cx, footY, 58 - dissolve * 10, 13);

  // Gnarled walking roots anchored at footY
  c.strokeLine(cx - 18, footY - 48, cx - 40 - stride * 12, footY - 4, 16, PAL.barkDark);
  c.strokeLine(cx + 18, footY - 48, cx + 40 + stride * 12, footY - 4, 16, PAL.barkDark);
  c.strokeLine(cx, footY - 44, cx + stride * 8, footY - 3, 14, PAL.barkMid);

  // Heavy knotted trunk
  const tx = cx + sway * 0.4;
  const ty = footY - 94 + dissolve * 24;
  c.fillPoly(
    [
      [tx - 32, ty - 50],
      [tx + 32, ty - 50],
      [cx + 38, footY - 26],
      [cx - 38, footY - 26],
    ],
    hitFlash ? PAL.boneBright : PAL.barkMid,
    PAL.ink,
    5,
  );
  // Bark cracks
  c.strokeLine(tx - 12, ty - 34, cx - 10, footY - 34, 4, PAL.barkDark);
  c.strokeLine(tx + 14, ty - 28, cx + 12, footY - 38, 4, PAL.barkDark);

  // Branching arms (slamming forward during attack!)
  const armDrop = slam * 56;
  c.strokeLine(tx - 28, ty - 24, tx - 68, ty + 14 + armDrop * 0.5, 14, PAL.barkDark);
  c.strokeLine(tx + 28, ty - 24, tx + 72 + slam * 16, ty + 8 + armDrop, 15, PAL.barkDark);
  if (tag === 'attack' && slam > 0.25) {
    c.fillSoftGlow(tx + 72, footY - 12, 46 * slam, [152, 194, 174], Math.round(145 * slam));
  }

  // Moss-sage ink canopy crown
  c.fillEllipse(tx - 26, ty - 62, 34, 28, hitFlash ? PAL.boneBright : PAL.sageDark);
  c.fillEllipse(tx + 26, ty - 60, 34, 28, hitFlash ? PAL.boneBright : PAL.sageDark);
  c.fillEllipse(tx, ty - 78, 42, 32, hitFlash ? PAL.boneBright : PAL.sageMid);
  c.fillEllipse(tx - 6, ty - 84, 26, 16, PAL.sageLight);

  // Glowing amber hollow eyes in trunk
  c.fillEllipse(tx - 12, ty - 20, 7, 6, PAL.ink);
  c.fillEllipse(tx + 12, ty - 20, 7, 6, PAL.ink);
  c.fillEllipse(tx - 12, ty - 20, 4, 3.5, PAL.amberBright);
  c.fillEllipse(tx + 12, ty - 20, 4, 3.5, PAL.amberBright);

  return c.downsample();
}

// ============================================================================
// 6. 白昼精英山魈 enemy_shanxiao_cel — 96x96 (384x384), 19 frames (crimson elite eyes)
// ============================================================================
function drawShanxiaoFrame(tag, idx, total) {
  const c = new SupersampledCanvas(96);
  const u = total > 1 ? idx / total : 0;
  const phase = u * Math.PI * 2;
  const cx = 192;
  const footY = 358;

  let stride = 0;
  let bodyDy = 0;
  let bodyDx = 0;
  let pounce = 0;
  let hitFlash = false;
  let dissolve = 0;

  if (tag === 'idle') {
    bodyDy = Math.sin(phase) * 6;
    bodyDx = Math.cos(phase) * 4;
  } else if (tag === 'move') {
    stride = Math.sin(phase);
    bodyDy = -Math.abs(Math.cos(phase)) * 16 + Math.sin(phase + 0.6) * 4;
    bodyDx = Math.cos(phase) * 10;
  } else if (tag === 'attack') {
    const keys = [-0.25, 0.55, 1.05, 0.22];
    pounce = keys[idx % keys.length];
    stride = pounce * 1.1;
    bodyDy = -Math.max(0, pounce) * 28 + (idx === 0 ? 10 : 0);
    bodyDx = (idx - 1.0) * 10;
  } else if (tag === 'hit') {
    hitFlash = idx === 0;
    bodyDy = idx === 0 ? -10 : 4;
    bodyDx = idx === 0 ? -14 : -4;
  } else if (tag === 'death') {
    dissolve = (idx + 1) / total;
    bodyDy = dissolve * 54;
    bodyDx = -dissolve * 14;
  }

  drawGroundedShadow(c, cx, footY, 74 - dissolve * 14, 16);
  // Subtle elite crimson ground aura
  c.fillSoftGlow(cx, footY - 12, 82, [200, 64, 42], 62);

  const hipX = cx + bodyDx + pounce * 22;
  const hipY = footY - 126 + bodyDy;
  const torsoX = hipX + 12 + pounce * 20;
  const torsoY = hipY - 78;

  // Powerful feral legs locked on footY
  const lfX = cx - 34 - stride * 34;
  const rfX = cx + 34 + stride * 34;
  c.strokeLine(hipX - 18, hipY + 12, lfX, footY - 8, 22, PAL.slateDark);
  c.strokeLine(hipX + 18, hipY + 12, rfX, footY - 8, 22, PAL.slateDark);
  c.fillEllipse(lfX + 4, footY - 5, 22, 11, PAL.ink);
  c.fillEllipse(rfX + 4, footY - 5, 22, 11, PAL.ink);

  // Hulking shaggy mountain-demon torso + tattered moss-fur mane
  c.fillPoly(
    [
      [torsoX - 54, torsoY - 26],
      [torsoX + 54, torsoY - 22],
      [hipX + 36, hipY + 26],
      [hipX - 42, hipY + 26],
    ],
    hitFlash ? PAL.boneBright : PAL.slateDark,
    PAL.ink,
    5,
  );
  // Shaggy sage-grey shoulder fur
  c.fillPoly(
    [
      [torsoX - 66, torsoY - 18],
      [torsoX - 24, torsoY - 52],
      [torsoX + 28, torsoY - 48],
      [torsoX + 62, torsoY - 14],
      [torsoX + 44, torsoY + 18],
      [torsoX - 48, torsoY + 18],
    ],
    hitFlash ? PAL.boneBright : PAL.sageDark,
    PAL.ink,
    4.5,
  );

  // Long clawed arms (sweeping crimson-rimmed slash on pounce!)
  const clawL_X = torsoX - 68 - stride * 18;
  const clawL_Y = torsoY + 78 - pounce * 22;
  const clawR_X = torsoX + 76 + pounce * 44;
  const clawR_Y = torsoY + 66 - pounce * 42;
  c.strokeLine(torsoX - 44, torsoY - 6, clawL_X, clawL_Y, 20, PAL.slateDark);
  c.strokeLine(torsoX + 44, torsoY - 6, clawR_X, clawR_Y, 22, PAL.slateDark);
  // Ivory claws
  for (let k = -1; k <= 1; k++) {
    c.strokeLine(clawR_X, clawR_Y + k * 7, clawR_X + 22, clawR_Y + k * 10 + 10, 5, PAL.boneBright);
  }
  if (tag === 'attack' && pounce > 0.25) {
    c.fillSoftGlow(clawR_X + 12, clawR_Y, 64 * pounce, [236, 96, 72], Math.round(150 * pounce));
    c.strokeLine(clawR_X - 18, clawR_Y - 38, clawR_X + 34, clawR_Y + 34, 12 * pounce, PAL.vermilionBright);
  }

  // Bone skull-like mountain mask + blazing crimson elite eyes + horns
  const hx = torsoX + 10;
  const hy = torsoY - 42;
  c.fillEllipse(hx, hy, 34, 32, hitFlash ? PAL.boneBright : PAL.bone);
  for (let k = 0; k < 20; k++) {
    const a1 = (k / 20) * Math.PI * 2;
    const a2 = ((k + 1) / 20) * Math.PI * 2;
    c.strokeLine(hx + Math.cos(a1) * 34, hy + Math.sin(a1) * 32, hx + Math.cos(a2) * 34, hy + Math.sin(a2) * 32, 4.5, PAL.ink);
  }
  // Curved dark horns
  c.strokeLine(hx - 22, hy - 22, hx - 48, hy - 58, 10, PAL.ink);
  c.strokeLine(hx + 22, hy - 22, hx + 48, hy - 58, 10, PAL.ink);
  // Blazing crimson elite eyes (canonical red-eye elite marker!)
  c.fillSoftGlow(hx - 11, hy - 2, 16, [236, 96, 72], 140);
  c.fillSoftGlow(hx + 14, hy - 2, 16, [236, 96, 72], 140);
  c.fillEllipse(hx - 11, hy - 2, 6, 4.5, PAL.vermilionBright);
  c.fillEllipse(hx + 14, hy - 2, 6, 4.5, PAL.vermilionBright);
  // Jagged grin
  c.strokeLine(hx - 14, hy + 14, hx + 16, hy + 14, 5, PAL.ink);

  return c.downsample();
}

// ============================================================================
// Assemble Horizontal Sheet + Aseprite json-array Metadata + Individual Frames
// ============================================================================
const HERO_TAGS = [
  { name: 'idle', count: 4, duration: 160 },
  { name: 'move', count: 8, duration: 90 },
  { name: 'attack', count: 6, duration: 80 },
  { name: 'flip', count: 6, duration: 100 },
  { name: 'hit', count: 2, duration: 100 },
  { name: 'death', count: 3, duration: 140 },
];

const ENEMY_TAGS = [
  { name: 'idle', count: 4, duration: 160 },
  { name: 'move', count: 6, duration: 100 },
  { name: 'attack', count: 4, duration: 90 },
  { name: 'hit', count: 2, duration: 100 },
  { name: 'death', count: 3, duration: 140 },
];

function buildActor({ key, outBase, size, tags, drawFn }) {
  const totalFrames = tags.reduce((acc, t) => acc + t.count, 0);
  const sheetW = totalFrames * size;
  const sheetRGBA = Buffer.alloc(sheetW * size * 4);
  const framesDir = path.join(ART_PIPELINE, `frames_${outBase}`);
  fs.mkdirSync(framesDir, { recursive: true });

  const jsonFrames = [];
  const frameTags = [];
  let cursor = 0;

  for (const tag of tags) {
    const from = cursor;
    for (let i = 0; i < tag.count; i++) {
      const frameRGBA = drawFn(tag.name, i, tag.count);
      const fname = `${tag.name}_${String(i).padStart(2, '0')}.png`;
      fs.writeFileSync(path.join(framesDir, fname), encodePNG(size, size, frameRGBA));

      for (let y = 0; y < size; y++) {
        frameRGBA.copy(
          sheetRGBA,
          (y * sheetW + cursor * size) * 4,
          y * size * 4,
          (y + 1) * size * 4,
        );
      }

      jsonFrames.push({
        filename: fname,
        frame: { x: cursor * size, y: 0, w: size, h: size },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: size, h: size },
        sourceSize: { w: size, h: size },
        duration: tag.duration,
      });
      cursor += 1;
    }
    frameTags.push({
      name: tag.name,
      from,
      to: cursor - 1,
      direction: 'forward',
    });
  }

  const pngPath = path.join(GODOT_SPRITES, `${outBase}.png`);
  const jsonPath = path.join(GODOT_SPRITES, `${outBase}.json`);
  fs.writeFileSync(pngPath, encodePNG(sheetW, size, sheetRGBA));

  const anchor = { x: Math.floor(size / 2), y: size === 96 ? 90 : 60 };
  const aseDoc = {
    frames: jsonFrames,
    meta: {
      app: 'Ink Night Cel-Ink Pipeline (Aseprite Compatible)',
      version: '1.3',
      image: `${outBase}.png`,
      format: 'RGBA8888',
      size: { w: sheetW, h: size },
      scale: '1',
      anchor,
      frameTags,
    },
  };
  fs.writeFileSync(jsonPath, JSON.stringify(aseDoc, null, 2) + '\n', 'utf8');
  console.log(`Generated ${outBase}.png (${sheetW}x${size}, ${totalFrames} frames) + ${outBase}.json`);
  return { key, outBase, size, totalFrames };
}

buildActor({ key: 'player_sheng', outBase: 'player_sheng_cel', size: 96, tags: HERO_TAGS, drawFn: drawShengFrame });
buildActor({ key: 'player_dan', outBase: 'player_dan_cel', size: 96, tags: HERO_TAGS, drawFn: drawDanFrame });
buildActor({ key: 'wolf', outBase: 'enemy_wolf_cel', size: 64, tags: ENEMY_TAGS, drawFn: drawWolfFrame });
buildActor({ key: 'boar', outBase: 'enemy_boar_cel', size: 64, tags: ENEMY_TAGS, drawFn: drawBoarFrame });
buildActor({ key: 'treant', outBase: 'enemy_treant_cel', size: 64, tags: ENEMY_TAGS, drawFn: drawTreantFrame });
buildActor({ key: 'shanxiao', outBase: 'enemy_shanxiao_cel', size: 96, tags: ENEMY_TAGS, drawFn: drawShanxiaoFrame });

// Write unified cel_manifest.json indexing all 7 Cel-Ink multi-action spritesheets
const celManifest = {
  version: '2.0',
  actors: [
    {
      key: 'player_mortal',
      name: '提灯少年',
      role: '凡界主角 · 120° 减速灯火锥',
      category: 'hero',
      size: 96,
      scale: 1.0,
      offset_y: -18.0,
      fps: 10.0,
      cel_path: 'res://assets/sprites/player_mortal_cel.png',
      aseprite_json: 'res://assets/sprites/player_mortal_cel.json',
      qa_json: 'player_mortal_cel.qa.json',
      file: 'player_mortal_cel.png',
      json_file: 'player_mortal_cel.json',
      allow_vermilion: false,
    },
    {
      key: 'player_sheng',
      name: '武生（阳面）',
      role: '诡界主角 · 直线 3 穿透剑气',
      category: 'hero',
      size: 96,
      scale: 1.0,
      offset_y: -18.0,
      fps: 10.0,
      cel_path: 'res://assets/sprites/player_sheng_cel.png',
      aseprite_json: 'res://assets/sprites/player_sheng_cel.json',
      qa_json: 'player_sheng_cel.qa.json',
      file: 'player_sheng_cel.png',
      json_file: 'player_sheng_cel.json',
      allow_vermilion: false,
    },
    {
      key: 'player_dan',
      name: '青衣旦（阴面）',
      role: '诡界主角 · 220° 24px 击退水袖',
      category: 'hero',
      size: 96,
      scale: 1.0,
      offset_y: -18.0,
      fps: 9.0,
      cel_path: 'res://assets/sprites/player_dan_cel.png',
      aseprite_json: 'res://assets/sprites/player_dan_cel.json',
      qa_json: 'player_dan_cel.qa.json',
      file: 'player_dan_cel.png',
      json_file: 'player_dan_cel.json',
      allow_vermilion: false,
    },
    {
      key: 'wolf',
      name: '山狼',
      role: '白昼山林 · 高速绕袭轻怪',
      category: 'day_enemy',
      size: 64,
      scale: 1.0,
      offset_y: -12.0,
      fps: 10.0,
      cel_path: 'res://assets/sprites/enemy_wolf_cel.png',
      aseprite_json: 'res://assets/sprites/enemy_wolf_cel.json',
      qa_json: 'enemy_wolf_cel.qa.json',
      file: 'enemy_wolf_cel.png',
      json_file: 'enemy_wolf_cel.json',
      allow_vermilion: false,
    },
    {
      key: 'boar',
      name: '野猪',
      role: '白昼山林 · 蓄力直线冲锋怪',
      category: 'day_enemy',
      size: 64,
      scale: 1.05,
      offset_y: -12.0,
      fps: 9.0,
      cel_path: 'res://assets/sprites/enemy_boar_cel.png',
      aseprite_json: 'res://assets/sprites/enemy_boar_cel.json',
      qa_json: 'enemy_boar_cel.qa.json',
      file: 'enemy_boar_cel.png',
      json_file: 'enemy_boar_cel.json',
      allow_vermilion: false,
    },
    {
      key: 'treant',
      name: '树妖',
      role: '白昼山林 · 高血量慢速重怪',
      category: 'day_enemy',
      size: 64,
      scale: 1.15,
      offset_y: -16.0,
      fps: 7.0,
      cel_path: 'res://assets/sprites/enemy_treant_cel.png',
      aseprite_json: 'res://assets/sprites/enemy_treant_cel.json',
      qa_json: 'enemy_treant_cel.qa.json',
      file: 'enemy_treant_cel.png',
      json_file: 'enemy_treant_cel.json',
      allow_vermilion: false,
    },
    {
      key: 'shanxiao',
      name: '山魈（白昼精英）',
      role: '白昼精英 · 扑袭红眼山精',
      category: 'day_elite',
      size: 96,
      scale: 1.2,
      offset_y: -22.0,
      fps: 9.0,
      cel_path: 'res://assets/sprites/enemy_shanxiao_cel.png',
      aseprite_json: 'res://assets/sprites/enemy_shanxiao_cel.json',
      qa_json: 'enemy_shanxiao_cel.qa.json',
      file: 'enemy_shanxiao_cel.png',
      json_file: 'enemy_shanxiao_cel.json',
      allow_vermilion: true,
    },
  ],
};

fs.writeFileSync(
  path.join(GODOT_SPRITES, 'cel_manifest.json'),
  JSON.stringify(celManifest, null, 2) + '\n',
  'utf8',
);
console.log('Wrote cel_manifest.json with 7 Cel-Ink multi-action actors.');
