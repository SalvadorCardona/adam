/**
 * Les nuits d'étoiles filantes (`data/starfall.ts`) : quelle nuit en a une,
 * et où tombe la `index`-ième étoile. Tout est haché de la seed — jamais le
 * PRNG du monde, que la pluie ne doit pas décaler.
 */

import { hash3 } from '../core/rng.ts';
import { STARFALL, type StarLoot } from '../data/starfall.ts';

const STAR_SALT = 0x57a2;

/** Un nombre dans [0, 1) haché de la seed, de la nuit et d'un indice. */
function unit(seed: number, night: number, index: number): number {
  return hash3(seed ^ STAR_SALT, night, index) / 0x1_0000_0000;
}

/** La nuit `night` est-elle une nuit d'étoiles filantes ? */
export function isStarNight(seed: number, night: number): boolean {
  return night >= STARFALL.fromNight && unit(seed, night, -1) < STARFALL.chance;
}

/** Le point de chute de l'étoile `index` (essai `attempt`), en tuiles autour de la mairie, et son éclat. */
export function starDrop(seed: number, night: number, index: number, attempt: number): { dx: number; dy: number; loot: StarLoot } {
  const key = index * 8 + attempt;
  const angle = unit(seed, night, key * 3) * Math.PI * 2;
  const distance = STARFALL.minTiles + unit(seed, night, key * 3 + 1) * (STARFALL.maxTiles - STARFALL.minTiles);
  const total = STARFALL.loot.reduce((sum, loot) => sum + loot.weight, 0);
  let pick = unit(seed, night, key * 3 + 2) * total;
  let loot: StarLoot = STARFALL.loot[0];

  for (const candidate of STARFALL.loot) {
    pick -= candidate.weight;
    if (pick < 0) {
      loot = candidate;
      break;
    }
  }
  return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance, loot };
}
