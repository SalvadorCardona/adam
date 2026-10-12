/**
 * Les coffres de la carte : où la seed les pose.
 *
 * Comme les tanières, ils ne sont jamais stockés : chaque chunk en tire un
 * au plus depuis la seed (`chestsOfChunk`), sur une case nue de la carte —
 * herbe ou sable, ni arbre, ni rocher, ni filon, ni l'eau — hors de la
 * clairière du départ. Seuls ceux qu'Adam a ouverts sont de l'état
 * (`World.openedChests`).
 */

import { CHUNK_TILES } from '../core/grid.ts';
import { hash3 } from '../core/rng.ts';
import { CHESTS } from '../data/chests.ts';
import { DISCOVERIES, discoveryTier } from '../data/discoveries.ts';
import { findSpawn, oreAt, resourceAt, terrainAt } from './terrain.ts';

export interface Chest {
  /** Id déterministe, calculé sur (seed, chunk). */
  id: number;
  tx: number;
  ty: number;
}

/** Le coffre d'un chunk, tel que la seed le pose, ou `null`. Pur : le monde le met en cache. */
export function chestOfChunk(seed: number, cx: number, cy: number): Chest | null {
  const id = hash3(seed ^ 0x2545f491, cx, cy);

  const [sx, sy] = findSpawn(seed);
  // Plus on s'éloigne du départ, plus ils sont nombreux (`DISCOVERIES.chest.chance`, par palier).
  const tier = discoveryTier(Math.hypot((cx + 0.5) * CHUNK_TILES - sx, (cy + 0.5) * CHUNK_TILES - sy));

  if (hash3(id, 1, 0) / 4294967296 >= DISCOVERIES.chest.chance[tier]!) return null;

  for (let attempt = 0; attempt < CHESTS.tries; attempt += 1) {
    const roll = hash3(id, 2, attempt);
    const tx = cx * CHUNK_TILES + (roll % CHUNK_TILES);
    const ty = cy * CHUNK_TILES + ((roll >>> 8) % CHUNK_TILES);
    const terrain = terrainAt(seed, tx, ty);

    if (terrain !== 'grass' && terrain !== 'sand') continue;
    if (resourceAt(seed, tx, ty) !== null || oreAt(seed, tx, ty) !== null) continue;
    if ((tx - sx) ** 2 + (ty - sy) ** 2 < CHESTS.minSpawnTiles ** 2) continue;
    return { id, tx, ty };
  }
  return null;
}
