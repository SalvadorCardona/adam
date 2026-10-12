/**
 * Les décorations et le moral (`data/buildings.ts`, `mood` ; `data/housing.ts`, `DECOR`).
 *
 * Une décoration ne fait rien : à chaque aube, elle ajoute son `amount` au
 * bonheur de chaque ouvrier à moins de son `radius` tuiles. Les bonus de
 * plusieurs décorations s'additionnent, dans la limite de `DECOR.maxPerDawn` :
 * un champ de parterres ne suffit pas à rendre heureux, il faut varier.
 */

import { TILE_SIZE, distanceSq } from '../core/grid.ts';
import type { DecorMood } from '../data/buildings.ts';
import { DECOR } from '../data/housing.ts';

/** Une décoration debout : son centre en pixels monde, et ce qu'elle donne. */
export interface DecorSpot extends DecorMood {
  x: number;
  y: number;
}

/** Les points de bonheur qu'une nuit au point (x, y) doit aux décorations alentour. */
export function decorMoodAt(x: number, y: number, spots: readonly DecorSpot[]): number {
  let total = 0;

  for (const spot of spots) {
    const reach = spot.radius * TILE_SIZE;

    if (distanceSq(x, y, spot.x, spot.y) <= reach * reach) total += spot.amount;
  }
  return Math.min(DECOR.maxPerDawn, total);
}
