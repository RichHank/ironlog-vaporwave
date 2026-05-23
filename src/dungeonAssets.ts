export type DungeonAssetKind = 'monsters' | 'bosses' | 'relics' | 'rooms' | 'fx';

const base = `${import.meta.env.BASE_URL}dungeon/`;

export function dungeonAsset(kind: DungeonAssetKind, id: string): string {
  return `${base}${kind}/${id}.svg`;
}

export const DUNGEON_TRACK_LABELS = {
  crawl: 'Locker Room Catacombs',
  battle: 'Haunted Dumbbell Breaks',
  boss: 'One More Rep At The End Of The World',
  victory: 'Protein Moon Parade',
  shop: 'Macro Rat Midnight Market',
} as const;

export const DUNGEON_FX = {
  hit: dungeonAsset('fx', 'barbell-slash'),
  crit: dungeonAsset('fx', 'crit-star'),
  block: dungeonAsset('fx', 'block-flash'),
  loot: dungeonAsset('fx', 'loot-glow'),
  curse: dungeonAsset('fx', 'curse-smoke'),
  heal: dungeonAsset('fx', 'heal-rune'),
  boss: dungeonAsset('fx', 'boss-roar'),
  coin: dungeonAsset('fx', 'coin-pop'),
  level: dungeonAsset('fx', 'level-spark'),
  death: dungeonAsset('fx', 'death-static'),
} as const;
