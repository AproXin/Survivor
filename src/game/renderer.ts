import { WORLD_HALF } from './data';
import { PALETTE, REALM_LIGHTING } from './palette';
import type {
  EnemyActor,
  FloatingNumber,
  ParticleSlot,
  PickupGem,
  PlayerActor,
  ProjectileActor,
  RenderFrameState,
  SlashEffect,
} from './renderState';
import type {
  BambooCluster,
  BrokenWallProp,
  GraveyardWorld,
  StoneLanternProp,
  TombstoneProp,
} from './worldGen';

export class InkNightRenderer {
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private mistSprite: HTMLCanvasElement;
  private lastLightW = 0;
  private lastLightH = 0;

  constructor() {
    this.lightCanvas = document.createElement('canvas');
    const lctx = this.lightCanvas.getContext('2d');
    if (!lctx) {
      throw new Error('Failed to create offscreen lighting 2D context');
    }
    this.lightCtx = lctx;
    this.mistSprite = this.buildMistSprite();
  }

  /** Pre-bake a soft painterly ink-mist puff once so mist renders via fast blits instead of per-frame gradients. */
  private buildMistSprite(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const mctx = c.getContext('2d');
    if (mctx) {
      const g = mctx.createRadialGradient(128, 48, 8, 128, 48, 124);
      g.addColorStop(0, 'rgba(138, 154, 148, 0.24)');
      g.addColorStop(0.55, 'rgba(92, 107, 107, 0.1)');
      g.addColorStop(1, 'rgba(14, 20, 24, 0)');
      mctx.fillStyle = g;
      mctx.fillRect(0, 0, 256, 96);
    }
    return c;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    world: GraveyardWorld,
    state: RenderFrameState
  ): void {
    const halfW = width * 0.5;
    const halfH = height * 0.5;
    const camX = state.cameraX + state.shakeX;
    const camY = state.cameraY + state.shakeY;

    // 1. Deep ink-wash moonlit backdrop
    const bgGrad = ctx.createRadialGradient(
      halfW,
      halfH * 0.32,
      width * 0.07,
      halfW,
      halfH * 0.55,
      Math.max(width, height) * 0.88
    );
    if (state.realm === 'mortal') {
      bgGrad.addColorStop(0, '#24343B');
      bgGrad.addColorStop(0.5, '#162228');
      bgGrad.addColorStop(1, '#090F13');
    } else {
      bgGrad.addColorStop(0, '#1B2E31');
      bgGrad.addColorStop(0.5, '#0F1B20');
      bgGrad.addColorStop(1, '#060A0D');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Luminous Full Moon & distant mountain ink silhouettes
    this.drawMoonAndSkyMist(ctx, width, height, camX, camY, state.visualTime, state.realm);

    // 3. World space rendering
    ctx.save();
    ctx.translate(Math.round(halfW - camX), Math.round(halfH - camY));

    const viewMinX = camX - halfW - 160;
    const viewMaxX = camX + halfW + 160;
    const viewMinY = camY - halfH - 160;
    const viewMaxY = camY + halfH + 160;

    this.drawDirtRoadAndGround(ctx, world, viewMinX, viewMaxX, viewMinY, viewMaxY, state.visualTime);
    this.drawGroundRuleZones(ctx, world, state);

    for (let i = 0; i < state.gems.length; i++) {
      const g = state.gems[i];
      if (g.x < viewMinX || g.x > viewMaxX || g.y < viewMinY || g.y > viewMaxY) continue;
      this.drawPickupGem(ctx, g, state.visualTime);
    }

    for (let i = 0; i < world.grasses.length; i++) {
      const gr = world.grasses[i];
      if (gr.x < viewMinX || gr.x > viewMaxX || gr.y < viewMinY || gr.y > viewMaxY) continue;
      this.drawGrassTuft(ctx, gr.x, gr.y, gr.blades, gr.size, gr.phase, state.visualTime);
    }

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (!e.dying && e.telegraphTimer > 0) {
        this.drawEnemyTelegraph(ctx, e);
      }
    }

    // Y-Sorted depth actors & props
    const drawList: { y: number; draw: () => void }[] = [];

    if (
      world.brokenWall.x + world.brokenWall.w >= viewMinX &&
      world.brokenWall.x <= viewMaxX &&
      world.brokenWall.y >= viewMinY - 120 &&
      world.brokenWall.y <= viewMaxY + 120
    ) {
      drawList.push({
        y: world.brokenWall.y + world.brokenWall.h * 0.5,
        draw: () => this.drawBrokenWall(ctx, world.brokenWall),
      });
    }

    if (
      world.grandStele.x >= viewMinX &&
      world.grandStele.x <= viewMaxX &&
      world.grandStele.y >= viewMinY &&
      world.grandStele.y <= viewMaxY
    ) {
      drawList.push({
        y: world.grandStele.y,
        draw: () => this.drawTombstone(ctx, world.grandStele, state.hazards.steleProgress),
      });
    }

    for (let i = 0; i < world.tombstones.length; i++) {
      const t = world.tombstones[i];
      if (t.x < viewMinX || t.x > viewMaxX || t.y < viewMinY || t.y > viewMaxY) continue;
      drawList.push({ y: t.y, draw: () => this.drawTombstone(ctx, t, 0) });
    }

    for (let i = 0; i < world.stoneLanterns.length; i++) {
      const sl = world.stoneLanterns[i];
      if (sl.x < viewMinX || sl.x > viewMaxX || sl.y < viewMinY || sl.y > viewMaxY) continue;
      drawList.push({
        y: sl.y,
        draw: () => this.drawStoneLantern(ctx, sl, state.visualTime, state.hazards.blackoutActive),
      });
    }

    for (let i = 0; i < world.bamboos.length; i++) {
      const b = world.bamboos[i];
      if (b.x < viewMinX || b.x > viewMaxX || b.y < viewMinY || b.y > viewMaxY) continue;
      drawList.push({ y: b.y, draw: () => this.drawBamboo(ctx, b, state.visualTime) });
    }

    if (state.hazards.whiteStranger && state.hazards.whiteStranger.active) {
      const ws = state.hazards.whiteStranger;
      drawList.push({
        y: ws.y,
        draw: () => this.drawWhiteStranger(ctx, ws.x, ws.y, ws.r, state.visualTime),
      });
    }

    drawList.push({
      y: state.player.y,
      draw: () => this.drawPlayer(ctx, state),
    });

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.x < viewMinX || e.x > viewMaxX || e.y < viewMinY || e.y > viewMaxY) continue;
      drawList.push({
        y: e.y,
        draw: () => this.drawEnemy(ctx, e, state.visualTime),
      });
    }

    drawList.sort((a, b) => a.y - b.y);
    for (let i = 0; i < drawList.length; i++) {
      drawList[i].draw();
    }

    for (let i = 0; i < state.slashes.length; i++) {
      this.drawSlashEffect(ctx, state.slashes[i]);
    }

    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i];
      if (!p.active) continue;
      this.drawProjectile(ctx, p, state.visualTime);
    }

    this.drawParticles(ctx, state.particles);
    this.drawArenaBoundary(ctx, state.visualTime);

    ctx.restore();

    // 4. Full-Scene Readable Atmospheric Ink Lighting + Single Warm Lantern Pool
    this.drawAtmosphericLighting(ctx, width, height, camX, camY, world, state);

    // 5. Foreground ink mist
    this.drawForegroundMist(ctx, width, height, state.visualTime, state.realm);

    // 6. Floating Damage Numbers
    ctx.save();
    ctx.translate(Math.round(halfW - camX), Math.round(halfH - camY));
    this.drawFloatingNumbers(ctx, state.floatingNumbers);
    ctx.restore();

    // 7. Realm transition & low-HP peripheral vignette
    if (state.realmTransitionFlash > 0.01) {
      const a = state.realmTransitionFlash * 0.42;
      ctx.fillStyle =
        state.realm === 'spectral'
          ? `rgba(237, 230, 214, ${a.toFixed(3)})`
          : `rgba(232, 179, 74, ${a.toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }

    if (state.lowHpVignette > 0.01 && !state.isTitle) {
      const vig = ctx.createRadialGradient(
        halfW,
        halfH,
        Math.min(width, height) * 0.34,
        halfW,
        halfH,
        Math.max(width, height) * 0.68
      );
      vig.addColorStop(0, 'rgba(124, 30, 16, 0)');
      vig.addColorStop(1, `rgba(124, 30, 16, ${(state.lowHpVignette * 0.48).toFixed(3)})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, width, height);
    }
  }

  private drawMoonAndSkyMist(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    camX: number,
    camY: number,
    t: number,
    realm: 'mortal' | 'spectral'
  ): void {
    const moonX = width * 0.56 - camX * 0.03;
    const moonY = Math.max(58, height * 0.11 - camY * 0.02);
    const moonR = Math.min(width, height) * 0.052;

    const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.4, moonX, moonY, moonR * 4.4);
    if (realm === 'mortal') {
      halo.addColorStop(0, 'rgba(237, 230, 214, 0.24)');
      halo.addColorStop(0.45, 'rgba(138, 154, 148, 0.1)');
      halo.addColorStop(1, 'rgba(14, 20, 24, 0)');
    } else {
      halo.addColorStop(0, 'rgba(147, 168, 148, 0.26)');
      halo.addColorStop(0.45, 'rgba(73, 85, 79, 0.12)');
      halo.addColorStop(1, 'rgba(6, 9, 11, 0)');
    }
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 4.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fillStyle = realm === 'mortal' ? PALETTE.bone : '#D3DBCE';
    ctx.fill();
    ctx.clip();

    ctx.fillStyle = 'rgba(92, 107, 107, 0.28)';
    ctx.beginPath();
    ctx.arc(moonX - moonR * 0.25, moonY - moonR * 0.12, moonR * 0.34, 0, Math.PI * 2);
    ctx.arc(moonX + moonR * 0.32, moonY + moonR * 0.22, moonR * 0.28, 0, Math.PI * 2);
    ctx.arc(moonX + moonR * 0.06, moonY - moonR * 0.38, moonR * 0.18, 0, Math.PI * 2);
    ctx.fill();

    const cloudOffset = ((t * 9) % (moonR * 4.5)) - moonR * 2.2;
    ctx.fillStyle = 'rgba(14, 20, 24, 0.22)';
    ctx.beginPath();
    ctx.ellipse(moonX + cloudOffset, moonY + moonR * 0.36, moonR * 0.9, moonR * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawDirtRoadAndGround(
    ctx: CanvasRenderingContext2D,
    world: GraveyardWorld,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    t: number
  ): void {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < world.pathPoints.length; i++) {
      const p = world.pathPoints[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = 'rgba(54, 60, 56, 0.44)';
    ctx.lineWidth = 114;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(72, 74, 65, 0.34)';
    ctx.lineWidth = 68;
    ctx.stroke();

    ctx.fillStyle = 'rgba(66, 72, 65, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 144, 98, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < world.pebbles.length; i++) {
      const pb = world.pebbles[i];
      if (pb.x < minX || pb.x > maxX || pb.y < minY || pb.y > maxY) continue;
      ctx.save();
      ctx.translate(pb.x, pb.y);
      ctx.rotate(pb.rot);
      ctx.fillStyle = 'rgba(92, 107, 107, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 0, pb.rx, pb.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(14, 20, 24, 0.44)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < world.coldLights.length; i++) {
      const cl = world.coldLights[i];
      if (cl.x < minX - 100 || cl.x > maxX + 100 || cl.y < minY - 100 || cl.y > maxY + 100) continue;
      if (cl.kind === 'wisp') {
        const bob = Math.sin(t * 2.4 + cl.phase) * 5;
        const g = ctx.createRadialGradient(cl.x, cl.y - 14 + bob, 2, cl.x, cl.y - 14 + bob, 24);
        g.addColorStop(0, 'rgba(237, 230, 214, 0.85)');
        g.addColorStop(0.4, 'rgba(147, 168, 148, 0.42)');
        g.addColorStop(1, 'rgba(73, 85, 79, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cl.x, cl.y - 14 + bob, 24, 0, Math.PI * 2);
        ctx.fill();
      } else if (cl.kind === 'moon_pool') {
        const g = ctx.createRadialGradient(cl.x, cl.y, 8, cl.x, cl.y, cl.r);
        g.addColorStop(0, 'rgba(237, 230, 214, 0.14)');
        g.addColorStop(0.65, 'rgba(138, 154, 148, 0.06)');
        g.addColorStop(1, 'rgba(14, 20, 24, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawGroundRuleZones(
    ctx: CanvasRenderingContext2D,
    world: GraveyardWorld,
    state: RenderFrameState
  ): void {
    const h = state.hazards;
    const t = state.visualTime;

    const gz = world.grandSteleZone;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(gz.x, gz.y, gz.r, gz.r * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle =
      h.steleProgress > 0.05
        ? `rgba(200, 64, 42, ${(0.08 + h.steleProgress * 0.24).toFixed(3)})`
        : 'rgba(61, 74, 72, 0.2)';
    ctx.fill();
    ctx.setLineDash([7, 7]);
    ctx.lineWidth = h.steleRuleActive ? 1.8 : 1;
    ctx.strokeStyle =
      h.steleProgress > 0.05
        ? PALETTE.vermilionBright
        : h.steleRuleActive
          ? 'rgba(185, 176, 154, 0.35)'
          : 'rgba(92, 107, 107, 0.18)';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (h.wallShadowActive) {
      const r = world.brokenWall.shadowRect;
      ctx.save();
      const wg = ctx.createLinearGradient(r.x, r.y + r.h, r.x, r.y);
      wg.addColorStop(0, 'rgba(6, 9, 11, 0.62)');
      wg.addColorStop(1, 'rgba(6, 9, 11, 0.22)');
      ctx.fillStyle = wg;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(138, 154, 148, 0.28)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([]);
      ctx.restore();
    }

    for (let i = 0; i < h.inkShadows.length; i++) {
      const sh = h.inkShadows[i];
      ctx.save();
      const pulse = 1 + Math.sin(t * 3 + sh.phase) * 0.05;
      const rr = sh.r * pulse;
      const sg = ctx.createRadialGradient(sh.x, sh.y, rr * 0.2, sh.x, sh.y, rr);
      sg.addColorStop(0, 'rgba(6, 9, 11, 0.88)');
      sg.addColorStop(0.72, 'rgba(14, 20, 24, 0.68)');
      sg.addColorStop(1, 'rgba(14, 20, 24, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(185, 176, 154, 0.42)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.r * 0.88, t * 0.6 + sh.phase, t * 0.6 + sh.phase + Math.PI * 1.6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (h.nameCall && h.nameCall.active) {
      const nc = h.nameCall;
      ctx.save();
      const fade = Math.min(1, nc.timer / 1.5);
      ctx.strokeStyle = `rgba(237, 230, 214, ${(0.58 * fade).toFixed(3)})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(nc.x, nc.y, nc.r, 0, Math.PI * 2);
      ctx.stroke();

      const innerR = (t * 55) % nc.r;
      ctx.strokeStyle = `rgba(200, 64, 42, ${(0.42 * (1 - innerR / nc.r) * fade).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(nc.x, nc.y, innerR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = `rgba(237, 230, 214, ${(0.72 * fade).toFixed(3)})`;
      ctx.font = '600 14px "Noto Serif SC", serif';
      ctx.textAlign = 'center';
      ctx.fillText('“归来……”', nc.x, nc.y + 4);
      ctx.restore();
    }

    if (h.blackoutActive) {
      ctx.save();
      const drawSafeRing = (x: number, y: number, r: number, warm: boolean) => {
        ctx.strokeStyle = warm ? 'rgba(245, 217, 138, 0.85)' : 'rgba(237, 230, 214, 0.65)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      if (h.blackoutFrozenLight) {
        drawSafeRing(
          h.blackoutFrozenLight.x,
          h.blackoutFrozenLight.y,
          h.blackoutFrozenLight.r,
          true
        );
      }
      for (let i = 0; i < world.coldLights.length; i++) {
        const cl = world.coldLights[i];
        drawSafeRing(cl.x, cl.y, cl.r, false);
      }
      ctx.restore();
    }
  }

  private drawTombstone(
    ctx: CanvasRenderingContext2D,
    t: TombstoneProp,
    warnProgress: number
  ): void {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.tilt);
    const s = t.scale;

    ctx.fillStyle = 'rgba(6, 9, 11, 0.56)';
    ctx.beginPath();
    ctx.ellipse(0, 4 * s, 23 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.greyDark;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-20 * s, -8 * s, 40 * s, 11 * s, 2);
    ctx.fill();
    ctx.stroke();

    const h = 48 * s;
    const w = 30 * s;
    ctx.fillStyle = t.isGrand ? '#505E5C' : '#435150';
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -7 * s);
    ctx.lineTo(-w * 0.46, -h + 10 * s);
    ctx.quadraticCurveTo(0, -h - 7 * s, w * 0.46, -h + 10 * s);
    ctx.lineTo(w * 0.5, -7 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(185, 176, 154, 0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, -10 * s);
    ctx.lineTo(-w * 0.4, -h + 11 * s);
    ctx.quadraticCurveTo(0, -h - 4 * s, w * 0.38, -h + 11 * s);
    ctx.stroke();

    if (t.cracked) {
      ctx.strokeStyle = PALETTE.inkNight;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(w * 0.22, -h + 13 * s);
      ctx.lineTo(w * 0.05, -h * 0.65);
      ctx.lineTo(w * 0.14, -h * 0.5);
      ctx.stroke();
    }

    ctx.fillStyle =
      warnProgress > 0.05
        ? PALETTE.vermilionBright
        : t.isGrand
          ? PALETTE.bone
          : 'rgba(185, 176, 154, 0.72)';
    ctx.font = `700 ${Math.round(14 * s)}px "Noto Serif SC", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.glyph, 0, -h * 0.54);

    ctx.fillStyle = 'rgba(73, 85, 79, 0.72)';
    ctx.beginPath();
    ctx.ellipse(-10 * s, -6 * s, 7 * s, 3 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(9 * s, -5 * s, 5 * s, 2.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawBrokenWall(ctx: CanvasRenderingContext2D, wall: BrokenWallProp): void {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 9, 11, 0.52)';
    ctx.fillRect(wall.x - 6, wall.y + wall.h - 4, wall.w + 12, 14);

    ctx.fillStyle = '#3B4847';
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wall.x, wall.y + wall.h);
    ctx.lineTo(wall.x, wall.y - 16);
    ctx.lineTo(wall.x + wall.w * 0.22, wall.y - 22);
    ctx.lineTo(wall.x + wall.w * 0.35, wall.y - 8);
    ctx.lineTo(wall.x + wall.w * 0.52, wall.y - 14);
    ctx.lineTo(wall.x + wall.w * 0.65, wall.y - 28);
    ctx.lineTo(wall.x + wall.w * 0.85, wall.y - 24);
    ctx.lineTo(wall.x + wall.w, wall.y - 10);
    ctx.lineTo(wall.x + wall.w, wall.y + wall.h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(14, 20, 24, 0.65)';
    ctx.lineWidth = 1.4;
    for (let bx = wall.x + 28; bx < wall.x + wall.w - 15; bx += 32) {
      ctx.beginPath();
      ctx.moveTo(bx, wall.y + 4);
      ctx.lineTo(bx, wall.y + wall.h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(wall.x + 2, wall.y + 14);
    ctx.lineTo(wall.x + wall.w - 2, wall.y + 14);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(185, 176, 154, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wall.x + 3, wall.y - 14);
    ctx.lineTo(wall.x + wall.w * 0.22, wall.y - 20);
    ctx.moveTo(wall.x + wall.w * 0.65, wall.y - 26);
    ctx.lineTo(wall.x + wall.w * 0.85, wall.y - 22);
    ctx.stroke();

    ctx.restore();
  }

  private drawStoneLantern(
    ctx: CanvasRenderingContext2D,
    sl: StoneLanternProp,
    t: number,
    highlight: boolean
  ): void {
    ctx.save();
    ctx.translate(sl.x, sl.y);

    ctx.fillStyle = 'rgba(6, 9, 11, 0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.greyDark;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 1.8;
    ctx.fillRect(-10, -4, 20, 7);
    ctx.strokeRect(-10, -4, 20, 7);
    ctx.fillRect(-5, -26, 10, 22);
    ctx.strokeRect(-5, -26, 10, 22);

    ctx.fillStyle = '#2B3638';
    ctx.fillRect(-9, -40, 18, 14);
    ctx.strokeRect(-9, -40, 18, 14);

    const pulse = 0.72 + Math.sin(t * 4.5 + sl.x) * 0.22;
    ctx.fillStyle = highlight
      ? `rgba(250, 246, 234, ${(0.9 * pulse).toFixed(2)})`
      : `rgba(147, 168, 148, ${(0.78 * pulse).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(0, -33, 4.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.greyMid;
    ctx.beginPath();
    ctx.moveTo(-15, -39);
    ctx.lineTo(0, -50);
    ctx.lineTo(15, -39);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawBamboo(ctx: CanvasRenderingContext2D, b: BambooCluster, t: number): void {
    ctx.save();
    ctx.translate(b.x, b.y);
    for (let i = 0; i < b.stalks.length; i++) {
      const st = b.stalks[i];
      const sway = Math.sin(t * 1.45 + st.phase) * 5.5;
      const topX = st.dx + st.lean + sway;
      const topY = -st.h;

      ctx.strokeStyle = PALETTE.inkDeep;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(st.dx, 0);
      ctx.quadraticCurveTo(st.dx + st.lean * 0.45 + sway * 0.4, -st.h * 0.5, topX, topY);
      ctx.stroke();

      ctx.strokeStyle = PALETTE.sageDark;
      ctx.lineWidth = 2.6;
      ctx.stroke();

      ctx.fillStyle = '#2B3A37';
      const drawLeaf = (lx: number, ly: number, ang: number, len: number) => {
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(len * 0.45, -3.5, len, 0);
        ctx.quadraticCurveTo(len * 0.45, 3.5, 0, 0);
        ctx.fill();
        ctx.restore();
      };
      drawLeaf(topX, topY, -0.5 + sway * 0.02, 22);
      drawLeaf(topX, topY + 2, -2.5 + sway * 0.02, 20);
      drawLeaf(topX - 2, topY + 14, -0.2 + sway * 0.02, 18);
      drawLeaf(topX + 1, topY + 22, -2.8 + sway * 0.02, 17);
    }
    ctx.restore();
  }

  private drawGrassTuft(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    blades: number,
    size: number,
    phase: number,
    t: number
  ): void {
    const sway = Math.sin(t * 2.1 + phase) * 2.5;
    ctx.strokeStyle = '#364441';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < blades; i++) {
      const spread = (i - (blades - 1) * 0.5) * 4.5;
      const h = size * (0.75 + ((i * 37) % 10) * 0.04);
      ctx.moveTo(x + spread * 0.4, y);
      ctx.quadraticCurveTo(x + spread * 0.7 + sway * 0.5, y - h * 0.55, x + spread + sway, y - h);
    }
    ctx.stroke();
  }

  private drawPickupGem(ctx: CanvasRenderingContext2D, g: PickupGem, t: number): void {
    const bob = Math.sin(t * 4 + g.bobPhase) * 2.8;
    const x = g.x;
    const y = g.y + bob;
    ctx.save();
    if (g.kind === 'xp') {
      const halo = ctx.createRadialGradient(x, y, 1, x, y, 13);
      halo.addColorStop(0, 'rgba(143, 214, 148, 0.55)');
      halo.addColorStop(1, 'rgba(87, 185, 106, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();

      const s = g.value >= 10 ? 7.5 : g.value >= 4 ? 6 : 5;
      ctx.fillStyle = PALETTE.xpMid;
      ctx.strokeStyle = PALETTE.inkDeep;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.2);
      ctx.lineTo(x + s * 0.9, y);
      ctx.lineTo(x, y + s * 1.1);
      ctx.lineTo(x - s * 0.9, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = PALETTE.xpBright;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.0);
      ctx.lineTo(x + s * 0.45, y - s * 0.1);
      ctx.lineTo(x, y + s * 0.15);
      ctx.lineTo(x - s * 0.65, y - s * 0.05);
      ctx.closePath();
      ctx.fill();
    } else if (g.kind === 'coin') {
      ctx.fillStyle = PALETTE.amber;
      ctx.strokeStyle = PALETTE.inkDeep;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.inkNight;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    } else {
      // Lantern oil droplet pickup (amber teardrop)
      const halo = ctx.createRadialGradient(x, y, 1, x, y, 15);
      halo.addColorStop(0, 'rgba(245, 217, 138, 0.72)');
      halo.addColorStop(1, 'rgba(232, 179, 74, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = PALETTE.amberBright;
      ctx.strokeStyle = PALETTE.inkDeep;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.quadraticCurveTo(x + 6, y, x, y + 6);
      ctx.quadraticCurveTo(x - 6, y, x, y - 8);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWhiteStranger(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    t: number
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(237, 230, 214, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const hover = Math.sin(t * 2.5) * 3;
    ctx.translate(x, y + hover);
    ctx.fillStyle = PALETTE.bone;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, 6);
    ctx.lineTo(-9, -36);
    ctx.quadraticCurveTo(0, -42, 9, -36);
    ctx.lineTo(13, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.boneBright;
    ctx.beginPath();
    ctx.arc(0, -45, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.inkNight;
    ctx.beginPath();
    ctx.arc(0, -48, 9, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, state: RenderFrameState): void {
    const p = state.player;
    const t = state.visualTime;
    const bob = Math.sin(p.walkDist * 0.14) * 2.6;
    const stride = Math.sin(p.walkDist * 0.14);
    const isHitFlash = p.hitFlashTimer > 0;
    const invulnBlink = p.invulnTimer > 0 && Math.floor(t * 22) % 2 === 0;

    ctx.save();
    ctx.translate(p.x, p.y);

    if (!state.isTitle && state.flipCooldown > 0 && state.flipCooldownMax > 0) {
      const ratio = 1 - state.flipCooldown / state.flipCooldownMax;
      ctx.strokeStyle = 'rgba(232, 179, 74, 0.45)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 6, 28, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * ratio);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(6, 9, 11, 0.58)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 17, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    if (invulnBlink) {
      ctx.globalAlpha = 0.62;
    }

    ctx.scale(p.facing * p.scaleX, p.scaleY);

    if (state.realm === 'mortal') {
      this.drawLanternYouthBody(ctx, bob, stride, t, isHitFlash, state.hazards.blackoutActive);
    } else if (state.face === 'sheng') {
      this.drawShengOperaBody(ctx, bob, stride, t, isHitFlash, state.hazards.blackoutActive, p);
    } else {
      this.drawDanOperaBody(ctx, bob, stride, t, isHitFlash, state.hazards.blackoutActive, p);
    }

    ctx.restore();
  }

  private drawLanternYouthBody(
    ctx: CanvasRenderingContext2D,
    bob: number,
    stride: number,
    t: number,
    hitFlash: boolean,
    blackout: boolean
  ): void {
    ctx.fillStyle = PALETTE.inkDeep;
    ctx.beginPath();
    ctx.ellipse(-5 + stride * 3, 4, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(5 - stride * 3, 4, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hitFlash ? PALETTE.boneBright : '#4C6066';
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-13, 2 + bob * 0.4);
    ctx.lineTo(-10, -21 + bob);
    ctx.lineTo(10, -21 + bob);
    ctx.lineTo(14, 2 + bob * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = PALETTE.inkNight;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-4, -20 + bob);
    ctx.lineTo(4, -10 + bob);
    ctx.moveTo(-10, -9 + bob * 0.7);
    ctx.lineTo(11, -9 + bob * 0.7);
    ctx.stroke();

    ctx.fillStyle = hitFlash ? PALETTE.boneBright : PALETTE.bone;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -29 + bob, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.inkDeep;
    ctx.beginPath();
    ctx.arc(2.5, -28 + bob, 1.5, 0, Math.PI * 2);
    ctx.arc(6.5, -28 + bob, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1B252B';
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -35 + bob, 14, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-9, -35 + bob);
    ctx.quadraticCurveTo(0, -47 + bob, 9, -35 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.greyLight;
    ctx.beginPath();
    ctx.arc(2, -39 + bob, 2, 0, Math.PI * 2);
    ctx.fill();

    const sway = Math.sin(t * 3.5) * 1.6;
    const lx = 18;
    const ly = -33 + bob + sway;

    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8, -17 + bob);
    ctx.lineTo(16, -24 + bob);
    ctx.stroke();
    ctx.strokeStyle = '#5B7076';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(15, -18 + bob);
    ctx.lineTo(lx, ly - 9);
    ctx.stroke();

    this.drawPaperLantern(ctx, lx, ly, t, blackout, false);
  }

  private drawShengOperaBody(
    ctx: CanvasRenderingContext2D,
    bob: number,
    stride: number,
    t: number,
    hitFlash: boolean,
    blackout: boolean,
    p: PlayerActor
  ): void {
    ctx.fillStyle = PALETTE.inkDeep;
    ctx.beginPath();
    ctx.ellipse(-5 + stride * 3.5, 4, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(5 - stride * 3.5, 4, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hitFlash ? PALETTE.boneBright : PALETTE.bone;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-13, 2 + bob * 0.4);
    ctx.lineTo(-10, -23 + bob);
    ctx.lineTo(10, -23 + bob);
    ctx.lineTo(14, 2 + bob * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#182227';
    ctx.beginPath();
    ctx.moveTo(-8, -22 + bob);
    ctx.lineTo(8, -22 + bob);
    ctx.lineTo(10, -7 + bob);
    ctx.lineTo(-10, -7 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.boneBright;
    ctx.beginPath();
    ctx.arc(0, -31 + bob, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(0, -33 + bob);
    ctx.lineTo(4, -34 + bob);
    ctx.moveTo(5, -34 + bob);
    ctx.lineTo(8.5, -33 + bob);
    ctx.stroke();
    ctx.fillStyle = PALETTE.inkDeep;
    ctx.fillRect(1.5, -31 + bob, 2.2, 1.8);
    ctx.fillRect(5.5, -31 + bob, 2.2, 1.8);

    ctx.fillStyle = PALETTE.inkNight;
    ctx.beginPath();
    ctx.moveTo(-10, -37 + bob);
    ctx.lineTo(-7, -48 + bob);
    ctx.lineTo(7, -48 + bob);
    ctx.lineTo(10, -37 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    this.drawPaperLantern(ctx, -16, -24 + bob + Math.sin(t * 3.5) * 1.5, t, blackout, true);

    const swingOffset = p.attackSwingTimer > 0 ? Math.sin(p.attackSwingTimer * 28) * 1.1 : 0;
    ctx.save();
    ctx.translate(11, -16 + bob);
    ctx.rotate(-0.55 + swingOffset);
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(24, -14);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.boneBright;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.strokeStyle = PALETTE.amber;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-2, -3);
    ctx.lineTo(4, 3);
    ctx.stroke();
    ctx.restore();
  }

  private drawDanOperaBody(
    ctx: CanvasRenderingContext2D,
    bob: number,
    stride: number,
    t: number,
    hitFlash: boolean,
    blackout: boolean,
    p: PlayerActor
  ): void {
    ctx.save();
    for (let s = -1; s <= 1; s += 2) {
      ctx.strokeStyle = 'rgba(250, 246, 234, 0.88)';
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const startX = s * 9;
      const startY = -18 + bob;
      const wave1 = Math.sin(t * 6.5 + s + p.sleeveAngle) * 12;
      const wave2 = Math.cos(t * 5.2 + s * 2) * 14;
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(
        startX + s * 18,
        startY - 8 + wave1,
        startX + s * 32,
        startY + 6 + wave2,
        startX + s * 42,
        startY - 4 - wave1 * 0.6
      );
      ctx.stroke();
      ctx.strokeStyle = 'rgba(92, 107, 107, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = hitFlash ? PALETTE.boneBright : PALETTE.bone;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(-15 + stride * 1.5, 5 + bob * 0.3);
    ctx.lineTo(-9, -23 + bob);
    ctx.lineTo(9, -23 + bob);
    ctx.lineTo(15 - stride * 1.5, 5 + bob * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = PALETTE.greyDark;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-8, -11 + bob);
    ctx.lineTo(8, -11 + bob);
    ctx.stroke();

    ctx.fillStyle = PALETTE.boneBright;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -31 + bob, 9.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.inkNight;
    ctx.beginPath();
    ctx.arc(0, -35 + bob, 9.5, Math.PI * 0.92, Math.PI * 2.08);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-6, -42 + bob, 4.2, 0, Math.PI * 2);
    ctx.arc(6, -42 + bob, 4.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = PALETTE.bone;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, -41 + bob);
    ctx.lineTo(13, -41 + bob);
    ctx.stroke();

    ctx.fillStyle = PALETTE.inkDeep;
    ctx.fillRect(1.5, -31 + bob, 2.2, 1.5);
    ctx.fillRect(5.2, -31 + bob, 2.2, 1.5);

    this.drawPaperLantern(ctx, -16, -24 + bob + Math.sin(t * 3.8) * 1.5, t, blackout, true);
  }

  private drawPaperLantern(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    t: number,
    blackout: boolean,
    round: boolean
  ): void {
    const flick = 0.9 + Math.sin(t * 14) * 0.1;
    if (!blackout) {
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 26 * flick);
      glow.addColorStop(0, 'rgba(245, 217, 138, 0.85)');
      glow.addColorStop(0.5, 'rgba(232, 179, 74, 0.34)');
      glow.addColorStop(1, 'rgba(232, 179, 74, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 26 * flick, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = blackout ? PALETTE.greyDark : PALETTE.amber;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (round) {
      ctx.ellipse(x, y, 6.8, 7.6, 0, 0, Math.PI * 2);
    } else {
      ctx.roundRect(x - 6, y - 8, 12, 15, 3);
    }
    ctx.fill();
    ctx.stroke();

    if (!blackout) {
      ctx.fillStyle = PALETTE.amberBright;
      ctx.beginPath();
      ctx.ellipse(x, y, 3.2, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.inkDeep;
    ctx.fillRect(x - 4.5, y - 9.5, 9, 2.5);
    ctx.fillRect(x - 4, y + 6.5, 8, 2.2);
  }

  private drawEnemyTelegraph(ctx: CanvasRenderingContext2D, e: EnemyActor): void {
    const pct = 1 - Math.max(0, e.telegraphTimer / Math.max(0.01, e.telegraphMax));
    ctx.save();
    if (e.kind === 'elite_ghost' || e.kind === 'boss_magistrate') {
      ctx.strokeStyle = `rgba(228, 101, 74, ${(0.35 + pct * 0.55).toFixed(2)})`;
      ctx.lineWidth = 3 + pct * 4;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.telegraphX, e.telegraphY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const ringR = e.kind === 'wisp_caster' ? 24 : e.radius * 2.2;
    ctx.strokeStyle =
      e.kind === 'wisp_caster'
        ? `rgba(147, 168, 148, ${(0.45 + pct * 0.45).toFixed(2)})`
        : `rgba(200, 64, 42, ${(0.4 + pct * 0.55).toFixed(2)})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, ringR * (0.4 + pct * 0.6), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: EnemyActor, t: number): void {
    ctx.save();
    const dissolve = e.dying ? Math.max(0, e.deathTimer / Math.max(0.01, e.deathMax)) : 1;
    ctx.translate(e.x, e.y - e.hopHeight);
    ctx.globalAlpha = dissolve;
    if (e.dying) {
      const stretch = 1 + (1 - dissolve) * 0.35;
      ctx.scale(e.facing * (1 - (1 - dissolve) * 0.3), stretch);
    } else {
      ctx.scale(e.facing, 1);
    }

    const flash = e.hitFlash > 0;
    switch (e.kind) {
      case 'ghost':
        this.drawGhostSprite(ctx, t, e.phase, flash, false);
        break;
      case 'jiangshi':
        this.drawJiangshiSprite(ctx, t, e.phase, flash, false);
        break;
      case 'wisp_caster':
        this.drawWispCasterSprite(ctx, t, e.phase, flash);
        break;
      case 'elite_ghost':
        this.drawGhostSprite(ctx, t, e.phase, flash, true);
        break;
      case 'elite_jiangshi':
        this.drawJiangshiSprite(ctx, t, e.phase, flash, true);
        break;
      case 'punisher':
        this.drawPunisherSprite(ctx, t, e.phase, flash);
        break;
      case 'boss_magistrate':
        this.drawBossMagistrateSprite(ctx, t, e.phase, flash, Boolean(e.phase2Triggered));
        break;
    }
    ctx.restore();

    if (!e.dying && !e.kind.startsWith('boss') && e.hp < e.maxHp && e.maxHp >= 45) {
      const bw = e.radius * 1.9;
      const bh = 4;
      const bx = e.x - bw * 0.5;
      const by = e.y - e.radius * 2.1 - e.hopHeight;
      ctx.fillStyle = PALETTE.inkDeep;
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle =
        e.kind === 'elite_ghost' || e.kind === 'elite_jiangshi' || e.kind === 'punisher'
          ? PALETTE.vermilion
          : PALETTE.greyLight;
      ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
    }
  }

  private drawGhostSprite(
    ctx: CanvasRenderingContext2D,
    t: number,
    phase: number,
    flash: boolean,
    isElite: boolean
  ): void {
    const scale = isElite ? 1.65 : 1.0;
    const hover = Math.sin(t * 3.4 + phase) * 4;
    const wave = Math.sin(t * 4.8 + phase) * 5;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(0, hover);

    const aura = ctx.createRadialGradient(0, -14, 4, 0, -14, 28);
    aura.addColorStop(0, isElite ? 'rgba(138, 154, 148, 0.34)' : 'rgba(237, 230, 214, 0.22)');
    aura.addColorStop(1, 'rgba(14, 20, 24, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -14, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = flash ? PALETTE.boneBright : isElite ? '#B7C1B9' : '#D9D8CC';
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-13, -16);
    ctx.quadraticCurveTo(-13, -32, 0, -32);
    ctx.quadraticCurveTo(13, -32, 13, -16);
    ctx.quadraticCurveTo(14, -4, 17 + wave * 0.5, 4);
    ctx.quadraticCurveTo(9, 1, 6 + wave * 0.4, 9);
    ctx.quadraticCurveTo(1, 2, -2 + wave * 0.5, 11);
    ctx.quadraticCurveTo(-8, 2, -16 + wave * 0.4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (isElite) {
      ctx.fillStyle = PALETTE.vermilionBright;
      ctx.beginPath();
      ctx.ellipse(-4, -21, 3.2, 2.2, -0.2, 0, Math.PI * 2);
      ctx.ellipse(5, -21, 3.2, 2.2, 0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = PALETTE.vermilion;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -5, 6.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.vermilionBright;
      ctx.font = '700 8px "Noto Serif SC", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('祟', 0, -4.5);
    } else {
      ctx.fillStyle = PALETTE.inkDeep;
      ctx.beginPath();
      ctx.ellipse(-4, -21, 2.3, 3.2, 0, 0, Math.PI * 2);
      ctx.ellipse(4.5, -21, 2.3, 3.2, 0, 0, Math.PI * 2);
      ctx.ellipse(0.5, -13.5, 2.2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawJiangshiSprite(
    ctx: CanvasRenderingContext2D,
    t: number,
    phase: number,
    flash: boolean,
    isElite: boolean
  ): void {
    const s = isElite ? 1.55 : 1.0;
    ctx.save();
    ctx.scale(s, s);

    ctx.fillStyle = 'rgba(6, 9, 11, 0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = flash ? PALETTE.boneBright : isElite ? '#2A3437' : '#3A4647';
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, 4);
    ctx.lineTo(-10, -23);
    ctx.lineTo(10, -23);
    ctx.lineTo(13, 4);
    if (isElite) {
      ctx.lineTo(7, 0);
      ctx.lineTo(2, 5);
      ctx.lineTo(-4, 1);
      ctx.lineTo(-9, 5);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(6, -18);
    ctx.lineTo(21, -17);
    ctx.stroke();
    ctx.strokeStyle = flash ? PALETTE.boneBright : '#4B5957';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = PALETTE.sageLight;
    ctx.beginPath();
    ctx.arc(22, -17, 3, 0, Math.PI * 2);
    ctx.fill();

    if (isElite) {
      ctx.strokeStyle = PALETTE.vermilionBright;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(1, -11, 6.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.vermilionBright;
      ctx.font = '700 8px "Noto Serif SC", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('敕', 1, -10.5);
    }

    ctx.fillStyle = flash ? PALETTE.boneBright : PALETTE.sageMid;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(0, -30, 8.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isElite ? PALETTE.vermilionBright : PALETTE.inkDeep;
    ctx.fillRect(1.5, -30, 2.5, 2);
    ctx.fillRect(5.2, -30, 2.5, 2);

    ctx.fillStyle = '#182024';
    ctx.beginPath();
    ctx.ellipse(0, -36, 13.5, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -37, 8, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const flutter = Math.sin(t * 7 + phase) * 2.2;
    ctx.fillStyle = PALETTE.amberBright;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(4, -36);
    ctx.lineTo(10, -36);
    ctx.lineTo(11 + flutter, -21);
    ctx.lineTo(5 + flutter, -21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = PALETTE.inkNight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(7, -33);
    ctx.lineTo(8 + flutter * 0.5, -24);
    ctx.stroke();

    ctx.restore();
  }

  private drawWispCasterSprite(
    ctx: CanvasRenderingContext2D,
    t: number,
    phase: number,
    flash: boolean
  ): void {
    const hover = Math.sin(t * 5 + phase) * 5;
    ctx.save();
    ctx.translate(0, -18 + hover);

    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
    glow.addColorStop(0, 'rgba(250, 246, 234, 0.9)');
    glow.addColorStop(0.5, 'rgba(147, 168, 148, 0.5)');
    glow.addColorStop(1, 'rgba(73, 85, 79, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = flash ? PALETTE.boneBright : PALETTE.sageLight;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.quadraticCurveTo(11, -3, 8, 9);
    ctx.quadraticCurveTo(0, 14, -8, 9);
    ctx.quadraticCurveTo(-11, -3, 0, -16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.boneBright;
    ctx.beginPath();
    ctx.arc(0, 1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.inkDeep;
    ctx.beginPath();
    ctx.ellipse(0, 1, 1.8, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawPunisherSprite(
    ctx: CanvasRenderingContext2D,
    t: number,
    phase: number,
    flash: boolean
  ): void {
    const hover = Math.sin(t * 6 + phase) * 3;
    ctx.save();
    ctx.translate(0, hover);

    ctx.fillStyle = flash ? PALETTE.boneBright : '#131A1F';
    ctx.strokeStyle = PALETTE.vermilion;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-16, 6);
    ctx.lineTo(-11, -40);
    ctx.lineTo(11, -40);
    ctx.lineTo(16, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.bone;
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-9, -46);
    ctx.lineTo(-6, -68);
    ctx.lineTo(6, -68);
    ctx.lineTo(9, -46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.vermilion;
    ctx.font = '700 10px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('罚', 0, -54);

    ctx.fillStyle = PALETTE.bone;
    ctx.beginPath();
    ctx.arc(0, -40, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.vermilionBright;
    ctx.beginPath();
    ctx.arc(-3, -40, 2.3, 0, Math.PI * 2);
    ctx.arc(4, -40, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBossMagistrateSprite(
    ctx: CanvasRenderingContext2D,
    t: number,
    phase: number,
    flash: boolean,
    phase2: boolean
  ): void {
    const hover = Math.sin(t * 3 + phase) * 4;
    ctx.save();
    ctx.translate(0, hover);

    const aura = ctx.createRadialGradient(0, -28, 12, 0, -28, phase2 ? 70 : 54);
    aura.addColorStop(0, phase2 ? 'rgba(200, 64, 42, 0.36)' : 'rgba(138, 154, 148, 0.25)');
    aura.addColorStop(1, 'rgba(6, 9, 11, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -28, phase2 ? 70 : 54, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = flash ? PALETTE.boneBright : '#2B1A19';
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-28, 10);
    ctx.lineTo(-20, -42);
    ctx.lineTo(20, -42);
    ctx.lineTo(28, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.vermilion;
    ctx.fillRect(-10, -34, 20, 22);
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.strokeRect(-10, -34, 20, 22);
    ctx.fillStyle = PALETTE.boneBright;
    ctx.font = '700 13px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('判', 0, -23);

    ctx.fillStyle = PALETTE.bone;
    ctx.beginPath();
    ctx.arc(0, -52, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.vermilionBright;
    ctx.beginPath();
    ctx.ellipse(-4.5, -52, 3.2, 2.2, -0.25, 0, Math.PI * 2);
    ctx.ellipse(5.5, -52, 3.2, 2.2, 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.inkNight;
    ctx.beginPath();
    ctx.roundRect(-14, -74, 28, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-29, -68, 16, 4.5);
    ctx.fillRect(13, -68, 16, 4.5);

    ctx.save();
    ctx.translate(22, -26);
    ctx.rotate(Math.sin(t * 2.5) * 0.14 - 0.35);
    ctx.strokeStyle = PALETTE.inkDeep;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.lineTo(0, -36);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.boneDark;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = phase2 ? PALETTE.vermilionBright : PALETTE.inkDeep;
    ctx.beginPath();
    ctx.moveTo(-4, -36);
    ctx.lineTo(0, -49);
    ctx.lineTo(4, -36);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  private drawSlashEffect(ctx: CanvasRenderingContext2D, s: SlashEffect): void {
    const pct = 1 - Math.max(0, s.life / Math.max(0.01, s.maxLife));
    const alpha = Math.max(0, 1 - pct);
    ctx.save();
    ctx.translate(s.x, s.y);

    if (s.kind === 'sheng_sword') {
      ctx.rotate(s.angle);
      ctx.strokeStyle = `rgba(250, 246, 234, ${(alpha * 0.95).toFixed(2)})`;
      ctx.lineWidth = 7 * (1 - pct * 0.5);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, s.radius * (0.75 + pct * 0.3), -0.85, 0.85);
      ctx.stroke();

      ctx.strokeStyle = `rgba(14, 20, 24, ${(alpha * 0.75).toFixed(2)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, s.radius * (0.68 + pct * 0.25), -0.7, 0.7);
      ctx.stroke();
    } else if (s.kind === 'dan_sleeve') {
      const r = s.radius * (0.6 + pct * 0.45);
      ctx.strokeStyle = `rgba(250, 246, 234, ${(alpha * 0.88).toFixed(2)})`;
      ctx.lineWidth = 10 * (1 - pct * 0.55);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r, s.angle + pct * 2.4, s.angle + pct * 2.4 + Math.PI * 1.45);
      ctx.stroke();

      ctx.strokeStyle = `rgba(185, 176, 154, ${(alpha * 0.65).toFixed(2)})`;
      ctx.lineWidth = 5 * (1 - pct * 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.84, s.angle + Math.PI + pct * 2.4, s.angle + Math.PI * 2.3 + pct * 2.4);
      ctx.stroke();
    } else {
      const r = s.radius * (0.2 + pct * 0.85);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = alpha * 0.9;
      ctx.lineWidth = (s.kind === 'flip_wave' ? 9 : 6) * (1 - pct * 0.6);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      if (s.kind === 'flip_wave' || s.kind === 'yinyang_wave') {
        ctx.strokeStyle = PALETTE.inkDeep;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: ProjectileActor, t: number): void {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.kind === 'lantern_ember') {
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 16);
      g.addColorStop(0, 'rgba(245, 217, 138, 0.95)');
      g.addColorStop(0.5, 'rgba(232, 179, 74, 0.55)');
      g.addColorStop(1, 'rgba(185, 127, 34, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = PALETTE.boneBright;
      ctx.beginPath();
      ctx.arc(0, 0, 4.5 + Math.sin(t * 20) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'enemy_orb') {
      ctx.fillStyle = PALETTE.sageLight;
      ctx.strokeStyle = PALETTE.inkDeep;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.boneBright;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = PALETTE.vermilionBright;
      ctx.strokeStyle = PALETTE.inkDeep;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, particles: ParticleSlot[]): void {
    for (let i = 0; i < particles.length; i++) {
      const pt = particles[i];
      if (!pt.active) continue;
      const ratio = Math.max(0, pt.life / Math.max(0.01, pt.maxLife));
      ctx.globalAlpha = pt.alpha * ratio;
      ctx.fillStyle = pt.color;
      if (pt.kind === 'spark' || pt.kind === 'ember') {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (0.45 + ratio * 0.55), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const s = pt.size * (0.5 + ratio * 0.5);
        ctx.fillRect(pt.x - s * 0.5, pt.y - s * 0.5, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawArenaBoundary(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(138, 154, 148, 0.25)';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -t * 14;
    ctx.strokeRect(-WORLD_HALF + 28, -WORLD_HALF + 28, WORLD_HALF * 2 - 56, WORLD_HALF * 2 - 56);
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawAtmosphericLighting(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    camX: number,
    camY: number,
    world: GraveyardWorld,
    state: RenderFrameState
  ): void {
    // Quarter-res lighting buffer: velvety painterly falloff at 4x lower CPU cost
    const lw = Math.max(1, Math.floor(width * 0.25));
    const lh = Math.max(1, Math.floor(height * 0.25));
    if (lw !== this.lastLightW || lh !== this.lastLightH) {
      this.lightCanvas.width = lw;
      this.lightCanvas.height = lh;
      this.lastLightW = lw;
      this.lastLightH = lh;
    }

    const lctx = this.lightCtx;
    const scaleX = lw / width;
    const scaleY = lh / height;
    const halfW = width * 0.5;
    const halfH = height * 0.5;

    const cfg = state.realm === 'mortal' ? REALM_LIGHTING.mortal : REALM_LIGHTING.spectral;
    const baseDark = state.hazards.blackoutActive ? Math.min(0.82, cfg.darkAlpha + 0.14) : cfg.darkAlpha;

    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, lw, lh);
    lctx.fillStyle =
      state.realm === 'mortal'
        ? `rgba(8, 14, 19, ${baseDark.toFixed(3)})`
        : `rgba(5, 11, 14, ${baseDark.toFixed(3)})`;
    lctx.fillRect(0, 0, lw, lh);

    lctx.globalCompositeOperation = 'destination-out';

    const punchLight = (worldX: number, worldY: number, radius: number, strength: number) => {
      const sx = (worldX - camX + halfW) * scaleX;
      const sy = (worldY - camY + halfH) * scaleY;
      const sr = radius * scaleX;
      if (sx + sr < 0 || sx - sr > lw || sy + sr < 0 || sy - sr > lh) return;
      const g = lctx.createRadialGradient(sx, sy, sr * 0.08, sx, sy, sr);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(0.55, `rgba(0,0,0,${(strength * 0.55).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g;
      lctx.beginPath();
      lctx.arc(sx, sy, sr, 0, Math.PI * 2);
      lctx.fill();
    };

    const coldStrength = state.hazards.blackoutActive ? 0.65 : 0.34;
    for (let i = 0; i < world.coldLights.length; i++) {
      const cl = world.coldLights[i];
      punchLight(cl.x, cl.y, cl.r * 1.15, coldStrength);
    }

    const fuelRatio =
      state.player.maxLanternFuel > 0
        ? Math.max(0, Math.min(1, state.player.lanternFuel / state.player.maxLanternFuel))
        : 1;
    const fuelRadiusMult = 0.58 + fuelRatio * 0.42;

    const flick = 1 + Math.sin(state.visualTime * 10.5) * 0.025 + Math.cos(state.visualTime * 17) * 0.015;
    const blackoutWarningFlicker =
      state.hazards.blackoutWarningTimer > 0
        ? 0.55 + Math.abs(Math.sin(state.visualTime * 28)) * 0.45
        : 1.0;

    let warmLightX = state.player.x + state.player.facing * 12;
    let warmLightY = state.player.y - 24;
    let warmLightR = state.lanternRadius * fuelRadiusMult * flick * blackoutWarningFlicker;

    if (state.hazards.blackoutActive && state.hazards.blackoutFrozenLight) {
      warmLightX = state.hazards.blackoutFrozenLight.x;
      warmLightY = state.hazards.blackoutFrozenLight.y;
      warmLightR = state.hazards.blackoutFrozenLight.r * 1.05;
      punchLight(state.player.x, state.player.y - 16, 62, 0.35);
    }

    punchLight(warmLightX, warmLightY, warmLightR, 0.96);

    ctx.drawImage(this.lightCanvas, 0, 0, width, height);

    // Bounded warm amber lantern radiance (fast source-over over lantern radius only)
    const screenLX = warmLightX - camX + halfW;
    const screenLY = warmLightY - camY + halfH;
    const glowR = warmLightR * 0.95;
    const warmIntensity = state.hazards.blackoutActive
      ? 0.2
      : (0.19 + fuelRatio * 0.13) * blackoutWarningFlicker;
    const warmGrad = ctx.createRadialGradient(screenLX, screenLY, 8, screenLX, screenLY, glowR);
    warmGrad.addColorStop(0, `rgba(245, 217, 138, ${warmIntensity.toFixed(3)})`);
    warmGrad.addColorStop(0.45, `rgba(232, 179, 74, ${(warmIntensity * 0.48).toFixed(3)})`);
    warmGrad.addColorStop(1, 'rgba(185, 127, 34, 0)');
    ctx.fillStyle = warmGrad;
    ctx.beginPath();
    ctx.arc(screenLX, screenLY, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawForegroundMist(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    t: number,
    realm: 'mortal' | 'spectral'
  ): void {
    ctx.save();
    ctx.globalAlpha = realm === 'mortal' ? 0.52 : 0.85;
    for (let i = 0; i < 3; i++) {
      const speed = 15 + i * 7;
      const w = 440 + i * 90;
      const h = 150 + i * 30;
      const mx = ((t * speed + i * 440) % (width + w)) - w;
      const my = height * (0.22 + i * 0.28) + Math.sin(t * 0.6 + i) * 20;
      ctx.drawImage(this.mistSprite, mx, my, w, h);
    }
    ctx.restore();
  }

  private drawFloatingNumbers(ctx: CanvasRenderingContext2D, nums: FloatingNumber[]): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < nums.length; i++) {
      const fn = nums[i];
      if (!fn.active) continue;
      const ratio = Math.max(0, fn.life / Math.max(0.01, fn.maxLife));
      ctx.globalAlpha = Math.min(1, ratio * 1.8);
      ctx.font = `700 ${Math.round(14 * fn.scale)}px "JetBrains Mono", monospace`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = PALETTE.inkDeep;
      ctx.strokeText(fn.text, fn.x, fn.y);
      ctx.fillStyle = fn.color;
      ctx.fillText(fn.text, fn.x, fn.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
