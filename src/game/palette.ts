// Locked 18-color Ink-Night palette + 3 XP Jade greens, faithful to the style bible.
export const PALETTE = {
  // Ink family (~55%)
  inkDeep: '#06090B',
  inkNight: '#0E1418',
  inkSlate: '#1C2A30',

  // Grey-ink family (~20%)
  greyDark: '#3D4A48',
  greyMid: '#5C6B6B',
  greyLight: '#8A9A94',

  // Grey-green family (~10%)
  sageDark: '#49554F',
  sageMid: '#6E7F74',
  sageLight: '#93A894',

  // Bone-white family (~8%)
  boneDark: '#B9B09A',
  bone: '#EDE6D6',
  boneBright: '#FAF6EA',

  // Warm amber family (~5%) — exclusively lantern, flame, coins, talismans
  amberDark: '#B97F22',
  amber: '#E8B34A',
  amberBright: '#F5D98A',

  // Vermilion family (<=5% budget) — exclusively elites, boss seals, rule alerts
  vermilionDark: '#7C1E10',
  vermilion: '#C8402A',
  vermilionBright: '#E4654A',

  // Functional XP Jade green (<1%) — exclusively XP gems
  xpDark: '#3D8A4E',
  xpMid: '#57B96A',
  xpBright: '#8FD694',
} as const;

export const REALM_LIGHTING = {
  mortal: {
    darkAlpha: 0.62,
    fogDensity: 0.16,
    lanternRadius: 235,
    ambientTint: 'rgba(10, 16, 20, 0.62)',
  },
  spectral: {
    darkAlpha: 0.72,
    fogDensity: 0.36,
    lanternRadius: 185,
    ambientTint: 'rgba(6, 12, 16, 0.72)',
  },
} as const;
