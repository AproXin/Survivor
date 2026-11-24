import { WORLD_HALF } from './data';
import type { CircleZone, RectZone } from './rulesEngine';

export interface TombstoneProp {
  x: number;
  y: number;
  scale: number;
  tilt: number;
  glyph: string;
  cracked: boolean;
  isGrand?: boolean;
}

export interface BambooCluster {
  x: number;
  y: number;
  stalks: { dx: number; h: number; lean: number; phase: number }[];
}

export interface GrassTuft {
  x: number;
  y: number;
  blades: number;
  size: number;
  phase: number;
}

export interface StoneLanternProp {
  x: number;
  y: number;
}

export interface PebblePatch {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
}

export interface BrokenWallProp {
  x: number;
  y: number;
  w: number;
  h: number;
  shadowRect: RectZone;
}

export interface ColdLightZone extends CircleZone {
  kind: 'wisp' | 'stone_lantern' | 'moon_pool';
  phase: number;
}

export interface DoorCarrierProp {
  x: number;
  y: number;
  zone: CircleZone;
}

export interface PondCarrierProp {
  x: number;
  y: number;
  rx: number;
  ry: number;
  zone: CircleZone;
}

export interface GraveyardWorld {
  tombstones: TombstoneProp[];
  grandStele: TombstoneProp;
  grandSteleZone: CircleZone;
  brokenWall: BrokenWallProp;
  boundaryDoor: DoorCarrierProp;
  inkPond: PondCarrierProp;
  bamboos: BambooCluster[];
  grasses: GrassTuft[];
  stoneLanterns: StoneLanternProp[];
  pebbles: PebblePatch[];
  coldLights: ColdLightZone[];
  pathPoints: { x: number; y: number }[];
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const STELE_GLYPHS = ['奠', '归', '幽', '寂', '安', '尘', '冥', '故', '眠'];

export function createGraveyardWorld(seed = 202611): GraveyardWorld {
  const rng = makeRng(seed);

  // Winding earthen burial road passing cleanly through center (0, 0)
  const pathPoints: { x: number; y: number }[] = [];
  for (let i = -9; i <= 9; i++) {
    const y = i * 115;
    const x = Math.sin(i * 0.48) * 140;
    pathPoints.push({ x, y });
  }

  // Blank Grand Stele (Rule 9: "碑上没有字。等着刻你的名字。")
  const grandStele: TombstoneProp = {
    x: 245,
    y: -240,
    scale: 1.75,
    tilt: -0.02,
    glyph: '',
    cracked: true,
    isGrand: true,
  };
  const grandSteleZone: CircleZone = {
    x: grandStele.x,
    y: grandStele.y + 42,
    r: 102,
  };

  // Broken Stone Boundary Wall north-west (Rule 8: "墙后头，比墙这边黑。")
  const wallX = -375;
  const wallY = -270;
  const wallW = 210;
  const wallH = 38;
  const brokenWall: BrokenWallProp = {
    x: wallX,
    y: wallY,
    w: wallW,
    h: wallH,
    shadowRect: {
      x: wallX - 10,
      y: wallY - 125,
      w: wallW + 20,
      h: 125,
    },
  };

  // South-West Weathered Wooden Door Carrier (Rule 4: "三下敲门声。")
  const boundaryDoor: DoorCarrierProp = {
    x: -310,
    y: 225,
    zone: { x: -310, y: 240, r: 92 },
  };

  // South-East Dark Ink Reflection Pond (Rule 5: "锣响了。水里有东西在看你。")
  const inkPond: PondCarrierProp = {
    x: 325,
    y: 235,
    rx: 82,
    ry: 52,
    zone: { x: 325, y: 235, r: 108 },
  };

  // Cold-light sanctuaries for Rule 2 (Blackout)
  const stoneLanterns: StoneLanternProp[] = [
    { x: -235, y: 85 },
    { x: 255, y: 70 },
  ];

  const coldLights: ColdLightZone[] = [
    { x: -235, y: 85, r: 95, kind: 'stone_lantern', phase: 0.4 },
    { x: 255, y: 70, r: 95, kind: 'stone_lantern', phase: 2.1 },
    { x: -460, y: -40, r: 85, kind: 'wisp', phase: 1.3 },
    { x: 470, y: -60, r: 85, kind: 'wisp', phase: 3.7 },
    { x: 10, y: -440, r: 120, kind: 'moon_pool', phase: 0.9 },
    { x: -20, y: 390, r: 110, kind: 'moon_pool', phase: 2.6 },
  ];

  const isNearReserved = (x: number, y: number, pad: number): boolean => {
    if (x * x + y * y < (190 + pad) * (190 + pad)) return true;
    if ((x - grandStele.x) ** 2 + (y - grandStele.y) ** 2 < (135 + pad) ** 2) return true;
    if ((x - boundaryDoor.x) ** 2 + (y - boundaryDoor.y) ** 2 < (120 + pad) ** 2) return true;
    if ((x - inkPond.x) ** 2 + (y - inkPond.y) ** 2 < (135 + pad) ** 2) return true;
    if (
      x > brokenWall.x - 70 &&
      x < brokenWall.x + brokenWall.w + 70 &&
      y > brokenWall.y - 150 &&
      y < brokenWall.y + 80
    ) {
      return true;
    }
    for (let i = 0; i < pathPoints.length; i++) {
      const p = pathPoints[i];
      if ((x - p.x) ** 2 + (y - p.y) ** 2 < (72 + pad) ** 2) return true;
    }
    return false;
  };

  const tombstones: TombstoneProp[] = [];
  for (let i = 0; i < 68; i++) {
    const x = (rng() * 2 - 1) * (WORLD_HALF - 140);
    const y = (rng() * 2 - 1) * (WORLD_HALF - 140);
    if (isNearReserved(x, y, 25)) continue;
    let tooClose = false;
    for (const t of tombstones) {
      if ((t.x - x) ** 2 + (t.y - y) ** 2 < 105 * 105) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    tombstones.push({
      x,
      y,
      scale: 0.85 + rng() * 0.45,
      tilt: (rng() - 0.5) * 0.16,
      glyph: STELE_GLYPHS[Math.floor(rng() * STELE_GLYPHS.length)],
      cracked: rng() < 0.45,
    });
  }

  const bamboos: BambooCluster[] = [];
  for (let i = 0; i < 42; i++) {
    const x = (rng() * 2 - 1) * (WORLD_HALF - 90);
    const y = (rng() * 2 - 1) * (WORLD_HALF - 90);
    if (isNearReserved(x, y, 45)) continue;
    const count = 3 + Math.floor(rng() * 3);
    const stalks = [];
    for (let s = 0; s < count; s++) {
      stalks.push({
        dx: (s - count / 2) * 10 + (rng() - 0.5) * 5,
        h: 72 + rng() * 48,
        lean: (rng() - 0.5) * 18,
        phase: rng() * Math.PI * 2,
      });
    }
    bamboos.push({ x, y, stalks });
  }

  const grasses: GrassTuft[] = [];
  for (let i = 0; i < 150; i++) {
    const x = (rng() * 2 - 1) * (WORLD_HALF - 70);
    const y = (rng() * 2 - 1) * (WORLD_HALF - 70);
    if (x * x + y * y < 110 * 110) continue;
    if ((x - inkPond.x) ** 2 + (y - inkPond.y) ** 2 < 110 * 110) continue;
    grasses.push({
      x,
      y,
      blades: 4 + Math.floor(rng() * 4),
      size: 11 + rng() * 10,
      phase: rng() * Math.PI * 2,
    });
  }

  const pebbles: PebblePatch[] = [];
  for (let i = 0; i < 160; i++) {
    const x = (rng() * 2 - 1) * (WORLD_HALF - 60);
    const y = (rng() * 2 - 1) * (WORLD_HALF - 60);
    if ((x - inkPond.x) ** 2 + (y - inkPond.y) ** 2 < 95 * 95) continue;
    pebbles.push({
      x,
      y,
      rx: 3 + rng() * 6,
      ry: 2 + rng() * 3.5,
      rot: rng() * Math.PI,
    });
  }

  return {
    tombstones,
    grandStele,
    grandSteleZone,
    brokenWall,
    boundaryDoor,
    inkPond,
    bamboos,
    grasses,
    stoneLanterns,
    pebbles,
    coldLights,
    pathPoints,
  };
}
