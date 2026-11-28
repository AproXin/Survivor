#!/usr/bin/env node
/**
 * Ink Night: 45° Oblique Top-Down Cel-Ink Multi-Action Sprite Synthesizer
 * Renders the Lamp Bearer (提灯少年) at 384x384 supersampled resolution across 29 distinct frames:
 *   - idle   (4f, 160ms): alert standing pose, gentle breathing & lantern warm glow pulse
 *   - move   (8f,  90ms): continuous 8-frame running stride, forward torso lean, robe hem trail & lantern swing
 *   - attack (6f,  80ms): hexagonal lantern raised forward releasing 120° warm amber soul-flame wave
 *   - flip   (6f, 100ms): non-blocking 0.6s ink-whirl realm-flip spin & bone-gold spirit ripple
 *   - hit    (2f, 100ms): recoil lean with cold ink flash (zero vermilion on hero!)
 *   - death  (3f, 140ms): kneeling lantern-drop ink-wash dissolution
 *
 * Downscales 384x384 -> 96x96 with crisp 4x4 supersampling, locking footline at y=90 and center x=48.
 * Outputs:
 *   - godot-prototype/assets/sprites/player_mortal_cel.png (2784x96, 29 frames)
 *   - godot-prototype/assets/sprites/player_mortal_cel.json (Aseprite --format json-array)
 *   - godot-prototype/art_pipeline/frames_96/<tag>_<nn>.png (all 29 individual frames ready for Aseprite Lua!)
 *   - Plus 4 daytime forest ecology enemy spritesheets (wolf, boar, treant, shanxiao)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const GODOT_SPRITES = path.join(ROOT, 'godot-prototype', 'assets', 'sprites');
const ART_FRAMES_96 = path.join(ROOT, 'godot-prototype', 'art_pipeline', 'frames_96');
fs.mkdirSync(GODOT_SPRITES, { recursive: true });
fs.mkdirSync(ART_FRAMES_96, { recursive: true });

// --- Minimal PNG Encoder ---
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

// --- 384x384 Supersampled Cel-Ink Rasterizer ---
class Canvas384 {
  constructor(size = 384) {
    this.size = size;
    this.buf = Buffer.alloc(size * size * 4);
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
        const d2 = dx * dx + dy * dy;
        if (d2 <= 1.0) {
          this.blendPixel(x, y, r, g, b, a);
        }
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
          const falloff = (1 - d) * (1 - d);
          this.blendPixel(x, y, r, g, b, Math.round(peakAlpha * falloff));
        }
      }
    }
  }
  fillPoly(pts, [r, g, b, a = 255], outline = null, outlineW = 4) {
    let minY = this.size, maxY = 0;
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
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      this.fillEllipse(x, y, rad, rad, [r, g, b, a]);
    }
  }
  downsampleTo96() {
    const out = Buffer.alloc(96 * 96 * 4);
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++) {
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 4; dx++) {
            const off = ((y * 4 + dy) * 384 + (x * 4 + dx)) * 4;
            const a = this.buf[off + 3];
            sr += this.buf[off] * a;
            sg += this.buf[off + 1] * a;
            sb += this.buf[off + 2] * a;
            sa += a;
          }
        }
        const outOff = (y * 96 + x) * 4;
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

// Cel-Ink 45° Oblique Top-Down Palette (Cold Slate-Blue ~213° + Warm Amber Lantern ONLY, ZERO Vermilion!)
const COL = {
  inkOutline: [13, 18, 24, 255],
  hairBase: [20, 26, 34, 255],
  hairHighlight: [52, 68, 86, 255],
  hairpinGold: [232, 179, 74, 255],
  skinCool: [209, 203, 192, 255],
  skinWarm: [242, 224, 186, 255],
  skinShade: [148, 152, 160, 255],
  robeBase: [68, 88, 108, 255],
  robeShade: [40, 54, 70, 255],
  robeLight: [108, 134, 154, 255],
  robeWarmRim: [198, 164, 102, 255],
  sashDark: [27, 36, 46, 255],
  pouchCloth: [92, 98, 92, 255],
  pouchShade: [54, 62, 60, 255],
  bootDark: [18, 24, 30, 255],
  bootTop: [46, 56, 68, 255],
  lanternCore: [252, 236, 172, 255],
  lanternMid: [238, 186, 78, 255],
  lanternDark: [182, 126, 36, 255],
  lanternFrame: [26, 32, 38, 255],
  mistBone: [232, 226, 212, 215],
  hitFlash: [245, 246, 250, 255],
};

function drawLampBearerFrame(tag, idx, total) {
  const c = new Canvas384(384);
  const u = total > 1 ? idx / total : 0;
  const phase = u * Math.PI * 2;

  // Footline locked at y=90*4 = 360 (leaving 24px = 6px@96 bottom margin, center x=192 = 48*4)
  const cx = 192;
  const footY = 358;

  // Compute animation pose parameters
  let bodyDx = 0;
  let bodyDy = 0;
  let lean = 0;
  let leftFoot = { x: cx - 22, y: footY, lift: 0 };
  let rightFoot = { x: cx + 22, y: footY, lift: 0 };
  let hemFlare = 0;
  let lanternDx = 0;
  let lanternDy = 0;
  let lanternSway = 0;
  let leftArmSwing = 0;
  let flameRadius = 0;
  let flipRing = 0;
  let hitTint = false;
  let dissolve = 0;

  if (tag === 'idle') {
    const breath = Math.sin(phase);
    bodyDy = breath * 5.0;
    lanternDy = Math.sin(phase - 0.6) * 4.5;
    lanternSway = Math.cos(phase) * 3.0;
    hemFlare = breath * 2.5;
    leftFoot.x = cx - 20;
    rightFoot.x = cx + 20;
  } else if (tag === 'move') {
    // 8-frame running stride with distinct contact/down/passing/high-point silhouettes
    const stride = Math.sin(phase);
    const bounce = -Math.abs(Math.cos(phase)) * 12.0;
    bodyDy = bounce + 4.0;
    bodyDx = Math.sin(phase) * 4.0;
    lean = 18.0 + Math.cos(phase * 2) * 3.0;
    leftFoot.x = cx - 10 + stride * 34;
    leftFoot.lift = Math.max(0, -Math.cos(phase)) * 22;
    rightFoot.x = cx + 10 - stride * 34;
    rightFoot.lift = Math.max(0, Math.cos(phase)) * 22;
    hemFlare = -16.0 - Math.sin(phase * 2) * 10.0;
    lanternDx = 12.0 + Math.cos(phase) * 8.0;
    lanternDy = bounce * 0.7 + Math.sin(phase - 0.7) * 8.0;
    lanternSway = -12.0 - Math.sin(phase) * 7.0;
    leftArmSwing = -stride * 22;
  } else if (tag === 'attack') {
    // 6-frame lantern raise + 120° fan soul-flame release
    const thrust = Math.sin((idx / (total - 1)) * Math.PI);
    lean = 14.0 * thrust;
    bodyDy = -6.0 * thrust;
    lanternDx = 42.0 * thrust;
    lanternDy = -26.0 * thrust;
    lanternSway = -8.0 * thrust;
    leftArmSwing = -18.0 * thrust;
    flameRadius = idx >= 2 && idx <= 5 ? (idx - 1) * 24 : 0;
    leftFoot.x = cx - 26;
    rightFoot.x = cx + 28 + thrust * 6;
  } else if (tag === 'flip') {
    // 6-frame non-blocking 0.6s ink-whirl realm flip
    const spin = Math.sin((idx / (total - 1)) * Math.PI);
    bodyDy = -18.0 * spin;
    lean = (idx - 2.5) * 6.0;
    hemFlare = -24.0 * spin;
    lanternDx = Math.cos(phase) * 18.0;
    lanternDy = -20.0 * spin;
    flipRing = (idx + 1) / total;
  } else if (tag === 'hit') {
    hitTint = idx === 0;
    lean = idx === 0 ? -24 : -12;
    bodyDx = idx === 0 ? -10 : -4;
    bodyDy = idx === 0 ? -6 : 2;
    lanternDx = -14;
    lanternDy = -12;
    lanternSway = 18;
  } else if (tag === 'death') {
    dissolve = (idx + 1) / total;
    bodyDy = 26 * dissolve;
    lean = 22 * dissolve;
    lanternDx = 24 * dissolve;
    lanternDy = 46 * dissolve;
  }

  // Always ground contact shadow at footY so anchor stays locked around y=90
  c.fillEllipse(cx, footY, 54 - dissolve * 10, 14, [10, 14, 18, Math.round(135 * (1 - dissolve * 0.4))]);

  // Realm flip ink-gold expanding aura behind body
  if (flipRing > 0) {
    const rOuter = 44 + flipRing * 108;
    c.fillSoftGlow(cx, footY - 120, rOuter, [232, 198, 128], Math.round(130 * (1 - flipRing * 0.55)));
    for (let k = 0; k < 10; k++) {
      const a = flipRing * Math.PI * 2 + (k / 10) * Math.PI * 2;
      const sx = cx + Math.cos(a) * rOuter * 0.72;
      const sy = footY - 120 + Math.sin(a) * rOuter * 0.42;
      c.fillEllipse(sx, sy, 9 * (1 - flipRing * 0.4), 5, COL.mistBone);
    }
  }

  // 1. Boots (visible top surface from 45° oblique top-down!)
  const drawBoot = (ft) => {
    const by = ft.y - ft.lift;
    c.fillEllipse(ft.x, by - 4, 17, 10, COL.inkOutline);
    c.fillEllipse(ft.x, by - 5, 14, 7.5, COL.bootDark);
    c.fillEllipse(ft.x + 2, by - 7, 9, 4.5, COL.bootTop);
  };
  drawBoot(leftFoot);
  drawBoot(rightFoot);

  const bx = cx + bodyDx;
  const hipY = footY - 96 + bodyDy;
  const shoulderY = hipY - 94;
  const headY = shoulderY - 56;

  // 2. Back Robe Hem & Flowing Pleats (Cel-Shaded 3-tone cold blue-grey)
  const robeAlpha = Math.round(255 * (1 - dissolve * 0.55));
  const robeBase = hitTint ? COL.hitFlash : [COL.robeBase[0], COL.robeBase[1], COL.robeBase[2], robeAlpha];
  const robeShade = hitTint ? COL.hitFlash : [COL.robeShade[0], COL.robeShade[1], COL.robeShade[2], robeAlpha];
  const robeLight = hitTint ? COL.hitFlash : [COL.robeLight[0], COL.robeLight[1], COL.robeLight[2], robeAlpha];

  // Lower skirt with dynamic running flare
  c.fillPoly(
    [
      [bx - 42 + lean * 0.4, hipY - 6],
      [bx + 44 + lean * 0.4, hipY - 6],
      [bx + 58 + hemFlare * 0.35, footY - 22 + bodyDy * 0.4],
      [bx + 12 + hemFlare * 0.5, footY - 12 + bodyDy * 0.4],
      [bx - 56 + hemFlare, footY - 22 + bodyDy * 0.4],
    ],
    robeShade,
    COL.inkOutline,
    5,
  );
  // Front skirt panel (lighter mid-tone)
  c.fillPoly(
    [
      [bx - 30 + lean * 0.4, hipY - 4],
      [bx + 36 + lean * 0.4, hipY - 4],
      [bx + 44 + hemFlare * 0.25, footY - 26 + bodyDy * 0.4],
      [bx - 22 + hemFlare * 0.65, footY - 24 + bodyDy * 0.4],
    ],
    robeBase,
  );
  // Warm lantern bounce light rim on right skirt edge
  if (!hitTint && dissolve < 0.7) {
    c.fillPoly(
      [
        [bx + 26 + lean * 0.4, hipY],
        [bx + 42 + lean * 0.4, hipY],
        [bx + 50 + hemFlare * 0.3, footY - 30 + bodyDy * 0.4],
        [bx + 32 + hemFlare * 0.3, footY - 28 + bodyDy * 0.4],
      ],
      [COL.robeWarmRim[0], COL.robeWarmRim[1], COL.robeWarmRim[2], 150],
    );
  }

  // 3. Left Hanging Arm (anatomical left, natural swing)
  const laX = bx - 46 + lean * 0.65 + leftArmSwing * 0.45;
  const laY = shoulderY + 62 + Math.abs(leftArmSwing) * 0.2;
  c.fillPoly(
    [
      [bx - 42 + lean * 0.75, shoulderY + 6],
      [bx - 24 + lean * 0.75, shoulderY + 18],
      [laX + 12, laY],
      [laX - 14, laY - 4],
    ],
    robeShade,
    COL.inkOutline,
    4,
  );
  c.fillEllipse(laX, laY + 6, 10, 9, hitTint ? COL.hitFlash : COL.skinShade);

  // 4. Upper Torso & Broad 45° Top-Down Shoulders + Cross-Collar Lapel (交领道袍)
  c.fillPoly(
    [
      [bx - 48 + lean * 0.85, shoulderY + 6],
      [bx - 16 + lean * 0.9, shoulderY - 12],
      [bx + 18 + lean * 0.9, shoulderY - 12],
      [bx + 50 + lean * 0.85, shoulderY + 6],
      [bx + 42 + lean * 0.45, hipY + 4],
      [bx - 42 + lean * 0.45, hipY + 4],
    ],
    robeBase,
    COL.inkOutline,
    5,
  );
  // Top-down shoulder highlight plane (clearly visible from 45° camera)
  c.fillPoly(
    [
      [bx - 40 + lean * 0.85, shoulderY + 6],
      [bx - 14 + lean * 0.9, shoulderY - 9],
      [bx + 16 + lean * 0.9, shoulderY - 9],
      [bx + 42 + lean * 0.85, shoulderY + 6],
      [bx + 26 + lean * 0.75, shoulderY + 24],
      [bx - 26 + lean * 0.75, shoulderY + 24],
    ],
    robeLight,
  );
  // Cross-collar dark lapel trim
  c.strokeLine(bx - 18 + lean * 0.85, shoulderY - 2, bx + 20 + lean * 0.55, hipY - 10, 9, COL.sashDark);
  c.strokeLine(bx + 18 + lean * 0.85, shoulderY - 2, bx - 4 + lean * 0.65, shoulderY + 34, 7, COL.sashDark);

  // 5. Waist Sash & Hanging Cloth Pouch (布袋)
  c.fillPoly(
    [
      [bx - 43 + lean * 0.45, hipY - 14],
      [bx + 44 + lean * 0.45, hipY - 14],
      [bx + 45 + lean * 0.4, hipY + 8],
      [bx - 44 + lean * 0.4, hipY + 8],
    ],
    COL.sashDark,
    COL.inkOutline,
    4,
  );
  const pouchX = bx - 30 + lean * 0.4 + hemFlare * 0.25;
  const pouchY = hipY + 18;
  c.fillEllipse(pouchX, pouchY, 18, 20, COL.inkOutline);
  c.fillEllipse(pouchX, pouchY, 14, 16, COL.pouchCloth);
  c.fillEllipse(pouchX - 4, pouchY + 4, 8, 10, COL.pouchShade);
  c.strokeLine(pouchX - 10, pouchY - 12, pouchX + 10, pouchY - 12, 5, COL.sashDark);

  // 6. Head, 45° Oblique Face & High Top-Knot Hair Bun with Single Gold Hairpin (NO HAT!)
  const hx = bx + lean;
  const hy = headY;
  // Hair back silhouette
  c.fillEllipse(hx, hy - 8, 42, 40, COL.inkOutline);
  c.fillEllipse(hx, hy - 10, 38, 36, COL.hairBase);
  // Face (lower 2/3 of head visible at 45° oblique pitch)
  c.fillEllipse(hx + 2, hy + 8, 31, 28, hitTint ? COL.hitFlash : COL.skinCool);
  // Warm lantern cheek highlight on anatomical right (viewer right)
  if (!hitTint) {
    c.fillEllipse(hx + 16, hy + 10, 16, 18, COL.skinWarm);
    c.fillEllipse(hx - 14, hy + 12, 13, 16, COL.skinShade);
  }
  // Sharp forehead bangs framing face from 45° top-down
  c.fillPoly(
    [
      [hx - 35, hy - 6],
      [hx - 16, hy - 26],
      [hx + 18, hy - 26],
      [hx + 36, hy - 4],
      [hx + 20, hy - 10],
      [hx + 4, hy - 2],
      [hx - 12, hy - 10],
      [hx - 24, hy + 2],
    ],
    COL.hairBase,
  );
  // Top-down visible crown hair sheen
  c.fillEllipse(hx - 4, hy - 24, 24, 12, COL.hairHighlight);
  // High top-knot bun (高束发髻) + single golden hairpin (单根金色发簪)
  c.fillEllipse(hx - 2, hy - 50, 19, 17, COL.inkOutline);
  c.fillEllipse(hx - 2, hy - 50, 15, 13, COL.hairBase);
  c.fillEllipse(hx - 5, hy - 54, 8, 5, COL.hairHighlight);
  c.strokeLine(hx - 28, hy - 48, hx + 26, hy - 54, 6, COL.inkOutline);
  c.strokeLine(hx - 26, hy - 48, hx + 24, hy - 54, 3.5, COL.hairpinGold);
  c.fillEllipse(hx + 24, hy - 54, 5, 5, COL.lanternCore);

  // Expressive determined boy eyes (no cute oversized anime eyes, clean Cel-Ink)
  c.strokeLine(hx - 14, hy + 6, hx - 4, hy + 8, 4, COL.inkOutline);
  c.strokeLine(hx + 8, hy + 8, hx + 18, hy + 6, 4, COL.inkOutline);
  c.fillEllipse(hx - 9, hy + 12, 3.5, 4, COL.inkOutline);
  c.fillEllipse(hx + 13, hy + 12, 3.5, 4, COL.inkOutline);
  c.strokeLine(hx - 2, hy + 24, hx + 8, hy + 24, 3, COL.inkOutline);

  // 7. Anatomical Right Arm holding Hexagonal Paper Lantern (Warm Unique Light Source!)
  const handX = bx + 64 + lean * 0.8 + lanternDx;
  const handY = shoulderY + 38 + lanternDy;
  c.fillPoly(
    [
      [bx + 36 + lean * 0.8, shoulderY + 6],
      [bx + 48 + lean * 0.8, shoulderY + 24],
      [handX + 4, handY + 10],
      [handX - 10, handY - 8],
    ],
    robeBase,
    COL.inkOutline,
    4,
  );
  // Warm sleeve cuff highlight
  if (!hitTint) {
    c.fillPoly(
      [
        [handX - 12, handY - 6],
        [handX + 2, handY - 2],
        [handX + 2, handY + 10],
        [handX - 12, handY + 8],
      ],
      COL.robeWarmRim,
    );
  }
  c.fillEllipse(handX + 4, handY + 2, 10, 9, hitTint ? COL.hitFlash : COL.skinWarm);

  // Hexagonal Paper Lantern hanging from hand
  const lx = handX + 12 + lanternSway;
  const ly = handY + 54;
  // Soft warm glow halo (strictly amber gold, unique warm source)
  if (dissolve < 0.8) {
    const glowR = 88 + (flameRadius > 0 ? 34 : 0) + Math.sin(phase) * 6;
    c.fillSoftGlow(lx, ly, glowR, [245, 198, 92], Math.round(135 * (1 - dissolve * 0.6)));
    c.fillSoftGlow(lx, ly, 42, [255, 238, 168], Math.round(165 * (1 - dissolve * 0.6)));
  }
  // Lantern handle wire
  c.strokeLine(handX + 4, handY + 4, lx, ly - 32, 4, COL.lanternFrame);
  // Lantern top/bottom wooden caps
  c.fillPoly(
    [
      [lx - 20, ly - 32],
      [lx + 20, ly - 32],
      [lx + 26, ly - 24],
      [lx - 26, ly - 24],
    ],
    COL.lanternFrame,
  );
  // Hexagonal lantern glowing paper body
  c.fillPoly(
    [
      [lx - 22, ly - 24],
      [lx + 22, ly - 24],
      [lx + 28, ly],
      [lx + 20, ly + 26],
      [lx - 20, ly + 26],
      [lx - 28, ly],
    ],
    COL.lanternMid,
    COL.lanternFrame,
    4,
  );
  c.fillEllipse(lx, ly, 16, 19, COL.lanternCore);
  c.strokeLine(lx - 9, ly - 23, lx - 9, ly + 25, 2.5, COL.lanternDark);
  c.strokeLine(lx + 9, ly - 23, lx + 9, ly + 25, 2.5, COL.lanternDark);
  c.fillPoly(
    [
      [lx - 22, ly + 26],
      [lx + 22, ly + 26],
      [lx + 18, ly + 33],
      [lx - 18, ly + 33],
    ],
    COL.lanternFrame,
  );

  // Attack 120° fan soul-flame arc
  if (flameRadius > 0) {
    for (let k = -3; k <= 3; k++) {
      const ang = (k / 3) * 0.72;
      const fx = lx + Math.cos(ang) * (28 + flameRadius * 0.62);
      const fy = ly + Math.sin(ang) * (24 + flameRadius * 0.52);
      c.fillSoftGlow(fx, fy, 22, [245, 206, 108], 185);
      c.fillEllipse(fx, fy, 9, 7, COL.lanternCore);
    }
  }

  // Death ink droplets dispersing upward
  if (dissolve > 0) {
    for (let k = 0; k < 14; k++) {
      const a = k * 2.1;
      const dx = cx + Math.cos(a) * (25 + dissolve * 85);
      const dy = footY - 80 - dissolve * 95 + Math.sin(a * 1.7) * 38;
      c.fillEllipse(dx, dy, 6 * (1 - dissolve * 0.4), 6 * (1 - dissolve * 0.4), COL.inkOutline);
    }
  }

  return c.downsampleTo96();
}

const TAG_SPECS = [
  { name: 'idle', count: 4, durationMs: 160 },
  { name: 'move', count: 8, durationMs: 90 },
  { name: 'attack', count: 6, durationMs: 80 },
  { name: 'flip', count: 6, durationMs: 100 },
  { name: 'hit', count: 2, durationMs: 100 },
  { name: 'death', count: 3, durationMs: 140 },
];

const totalFrames = TAG_SPECS.reduce((s, t) => s + t.count, 0);
const sheetW = totalFrames * 96;
const sheetH = 96;
const sheetBuf = Buffer.alloc(sheetW * sheetH * 4);
const jsonFrames = [];
const jsonTags = [];

let cursor = 0;
for (const spec of TAG_SPECS) {
  const from = cursor;
  for (let i = 0; i < spec.count; i++) {
    const frame96 = drawLampBearerFrame(spec.name, i, spec.count);
    const fname = `${spec.name}_${String(i + 1).padStart(2, '0')}.png`;
    fs.writeFileSync(path.join(ART_FRAMES_96, fname), encodePNG(96, 96, frame96));
    // Blit into horizontal sheet
    for (let y = 0; y < 96; y++) {
      frame96.copy(sheetBuf, (y * sheetW + cursor * 96) * 4, y * 96 * 4, (y + 1) * 96 * 4);
    }
    jsonFrames.push({
      filename: fname,
      frame: { x: cursor * 96, y: 0, w: 96, h: 96 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 96, h: 96 },
      sourceSize: { w: 96, h: 96 },
      duration: spec.durationMs,
    });
    cursor++;
  }
  jsonTags.push({
    name: spec.name,
    from,
    to: cursor - 1,
    direction: 'forward',
  });
}

const aseJson = {
  frames: jsonFrames,
  meta: {
    app: 'https://www.aseprite.org/',
    version: '1.3-ink-pipeline',
    image: 'player_mortal_cel.png',
    format: 'RGBA8888',
    size: { w: sheetW, h: sheetH },
    scale: '1',
    anchor: { x: 48, y: 90 },
    frameTags: jsonTags,
  },
};

fs.writeFileSync(path.join(GODOT_SPRITES, 'player_mortal_cel.png'), encodePNG(sheetW, sheetH, sheetBuf));
fs.writeFileSync(path.join(GODOT_SPRITES, 'player_mortal_cel.json'), JSON.stringify(aseJson, null, 2) + '\n', 'utf8');

console.log(`Built 45° Cel-Ink Lamp Bearer: ${totalFrames} frames (${sheetW}x${sheetH}) + Aseprite JSON + 29 individual 96x96 PNGs.`);
