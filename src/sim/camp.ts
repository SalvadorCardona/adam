/**
 * Le campement du départ : tant que la mairie n'est qu'un chantier, les
 * survivants campent devant lui, autour d'un feu. Rien n'en est de l'état :
 * le feu est un décor (`campfire` de `data/decor.ts`) que le sol pose quand
 * la mairie n'est pas bâtie, et les places des colons se tirent de la seed
 * (`hash3`, jamais le PRNG du monde) — dispersées en couronne, jamais en
 * grille.
 */

import { TILE_SIZE, type TileCoord } from '../core/grid.ts';
import { hash3 } from '../core/rng.ts';
import { isWalkable, terrainAt } from './terrain.ts';

type Footprint = { tx: number; ty: number; width: number; height: number };

/** Le feu : sur l'axe du chantier, à deux cases de sa façade. */
export const CAMP = {
  fireAhead: 2,
  /** Couronne des colons autour du feu, en tuiles. */
  innerRadius: 1.4,
  outerRadius: 2.8,
  /** Les cercles sont aplatis vers le bas : vue 3/4. */
  squash: 0.75,
} as const;

/** La tuile du feu de camp d'un chantier de mairie. */
export function campfireTile(hall: Footprint): TileCoord {
  return { tx: hall.tx + Math.floor(hall.width / 2), ty: hall.ty + hall.height + CAMP.fireAhead };
}

/**
 * La place du `i`-ième colon (sur dix) autour du feu : un secteur de la
 * couronne chacun, un angle et un rayon hachés dans le secteur. Une place
 * sur l'eau se rabat sur un rayon plus court, puis sur le feu lui-même.
 */
export function campSpot(seed: number, hall: Footprint, i: number): { x: number; y: number } {
  const fire = campfireTile(hall);
  const cx = (fire.tx + 0.5) * TILE_SIZE;
  const cy = (fire.ty + 0.5) * TILE_SIZE;
  const slot = i % 10;
  const roll = (salt: number): number => hash3(seed ^ 0x5bd1e995, slot * 31 + salt, hall.tx * 7 + hall.ty) / 4294967296;
  const angle = ((slot + 0.15 + roll(1) * 0.7) / 10) * Math.PI * 2;
  let radius = CAMP.innerRadius + roll(2) * (CAMP.outerRadius - CAMP.innerRadius);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const x = cx + Math.cos(angle) * radius * TILE_SIZE;
    const y = cy + Math.sin(angle) * radius * CAMP.squash * TILE_SIZE;

    if (isWalkable(terrainAt(seed, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)))) return { x, y };
    radius *= 0.7;
  }
  return { x: cx + (roll(3) - 0.5) * TILE_SIZE, y: cy + TILE_SIZE * (0.5 + roll(4) * 0.5) };
}
