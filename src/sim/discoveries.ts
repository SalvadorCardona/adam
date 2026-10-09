/**
 * Les ruines et les secrets de la carte : où la seed les pose, et ce qu'ils donnent.
 *
 * Comme les coffres (`sim/chests.ts`), ils ne sont jamais stockés : chaque
 * chunk en tire une ruine et un secret au plus depuis la seed, sur une case
 * nue hors de la clairière du départ. Une ruine s'élève sur de l'herbe ou du
 * sable ; un secret est enterré au pied d'un arbre. Seuls ceux qu'Adam a
 * trouvés sont de l'état (`World.foundSpots`). Le butin se tire aussi de la
 * seed et de l'id du point (jamais du PRNG du monde) : le même point donne
 * toujours la même chose, et rouvrir une partie ne le change pas.
 */

import { CHUNK_TILES } from '../core/grid.ts';
import { hash3 } from '../core/rng.ts';
import { CHESTS } from '../data/chests.ts';
import { DISCOVERIES, RUIN_REWARDS, discoveryTier, type DiscoveryLoot, type LootEntry, type RuinReward } from '../data/discoveries.ts';
import type { ItemId } from '../data/items.ts';
import { findSpawn, oreAt, resourceAt, terrainAt } from './terrain.ts';

export type SpotKind = 'ruin' | 'secret';

export interface Spot {
  /** Id déterministe, calculé sur (seed, genre, chunk). */
  id: number;
  kind: SpotKind;
  tx: number;
  ty: number;
  /** Le palier de distance au départ (`DISCOVERY_TIERS`) : il règle le butin. */
  tier: number;
}

const SALT: Record<SpotKind, number> = { ruin: 0x3c6ef372, secret: 0x7f4a7c15 };
/** Tentatives pour trouver une case qui convienne dans le chunk. */
const TRIES = 8;

/** Le palier d'une tuile : sa distance au départ. */
export function tierAt(seed: number, tx: number, ty: number): number {
  const [sx, sy] = findSpawn(seed);

  return discoveryTier(Math.hypot(tx - sx, ty - sy));
}

function nearTree(seed: number, tx: number, ty: number): boolean {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => resourceAt(seed, tx + dx!, ty + dy!) === 'tree');
}

/** La ruine ou le secret d'un chunk, tel que la seed le pose, ou `null`. Pur : le monde le met en cache. */
export function spotOfChunk(seed: number, kind: SpotKind, cx: number, cy: number): Spot | null {
  const id = hash3(seed ^ SALT[kind], cx, cy);
  const [sx, sy] = findSpawn(seed);
  const chance = DISCOVERIES[kind].chance;
  const centerTier = discoveryTier(Math.hypot((cx + 0.5) * CHUNK_TILES - sx, (cy + 0.5) * CHUNK_TILES - sy));

  if (hash3(id, 1, 0) / 4294967296 >= chance[centerTier]!) return null;

  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    const roll = hash3(id, 2, attempt);
    const tx = cx * CHUNK_TILES + (roll % CHUNK_TILES);
    const ty = cy * CHUNK_TILES + ((roll >>> 8) % CHUNK_TILES);
    const terrain = terrainAt(seed, tx, ty);

    if (terrain !== 'grass' && (kind === 'secret' || terrain !== 'sand')) continue;
    if (resourceAt(seed, tx, ty) !== null || oreAt(seed, tx, ty) !== null) continue;
    if ((tx - sx) ** 2 + (ty - sy) ** 2 < CHESTS.minSpawnTiles ** 2) continue;
    if (kind === 'secret' && !nearTree(seed, tx, ty)) continue;
    return { id, kind, tx, ty, tier: tierAt(seed, tx, ty) };
  }
  return null;
}

function weighted(pool: readonly LootEntry[], pick: number): LootEntry {
  let left = pick * pool.reduce((sum, entry) => sum + entry.weight, 0);

  for (const entry of pool) {
    left -= entry.weight;
    if (left < 0) return entry;
  }
  return pool[pool.length - 1]!;
}

/** Le butin d'une table pour le point `id` : objet par objet, les doublons réunis. Même seed, même id, même butin. */
export function rollDiscoveryLoot(seed: number, id: number, table: DiscoveryLoot): [ItemId, number][] {
  let draw = 0;
  const roll = (): number => hash3(seed ^ 0x5bd1e995, id, draw++) / 4294967296;
  const found = new Map<ItemId, number>();
  const take = (entry: LootEntry): void => {
    found.set(entry.item, (found.get(entry.item) ?? 0) + entry.min + Math.floor(roll() * (entry.max - entry.min + 1)));
  };
  const [min, max] = table.rolls;
  const rolls = min + Math.floor(roll() * (max - min + 1));

  for (let index = 0; index < rolls; index += 1) take(weighted(table.pool, roll()));
  if (table.rare.pool.length > 0 && roll() < table.rare.chance) take(weighted(table.rare.pool, roll()));
  return [...found];
}

/** Ce que donne une ruine : tirée au poids du palier, parmi ce qui est encore possible (`plans` : les plans pas encore au menu). */
export function rollRuinReward(seed: number, id: number, tier: number, plans: number): RuinReward {
  const weights = DISCOVERIES.ruin.weights[tier]!;
  const options = RUIN_REWARDS.filter((reward) => weights[reward] > 0 && (reward !== 'plan' || plans > 0));
  let left = (hash3(seed ^ 0x2c1b3c6d, id, 0) / 4294967296) * options.reduce((sum, reward) => sum + weights[reward], 0);

  for (const reward of options) {
    left -= weights[reward];
    if (left < 0) return reward;
  }
  return options[options.length - 1]!;
}
