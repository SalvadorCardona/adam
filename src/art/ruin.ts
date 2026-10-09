/**
 * La ruine de la carte : un pan de mur d'avant la fin du monde, violet
 * comme toutes les ruines (`FAMILY_TONES.ruins`), debout dans l'herbe avec
 * sa liane et sa fleur. Elle cache un petit trésor à fouiller.
 *
 * Morceaux, tous du même cadre :
 * - `full` : la ruine à fouiller — un scintillement jaune sur l'arche,
 *   pour qu'on la repère de loin ;
 * - `searched` : la ruine fouillée, le scintillement éteint.
 */

import { PALETTE, circle, flower, groundShadow, pill, shadedBlock, svg, vine } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';

const W = 40;
const H = 40;

const { violet, yellow, paper } = PALETTE;

/** Le mur : deux piliers et le linteau cassé qui les relie, des gravats au pied. */
const WALL =
  groundShadow(20, 35, 34, 8) +
  shadedBlock(4, 12, 10, 24, 4, 'violet', 5) +
  shadedBlock(26, 19, 10, 17, 4, 'violet', 5) +
  shadedBlock(9, 8, 20, 8, 3, 'violet', 4) +
  pill(11, 9.2, 8, 2.2, violet.light) +
  shadedBlock(15, 29, 7, 6, 2, 'violet', 3) +
  shadedBlock(22, 31, 5, 4, 1.5, 'violet', 2);

/** La vie qui reprend : une liane sur le grand pilier, une fleur sur le petit. */
const LIFE = vine([6, 34, 7.4, 28, 6, 22, 7.6, 17], 3) + flower(31, 18, 'coral', 0.8);

/** Le scintillement : une étoile à quatre branches, jaune, dans un coin de l'arche. */
const GLINT =
  pill(24.6, 1, 2.8, 11, yellow.base) +
  pill(20.5, 5.1, 11, 2.8, yellow.base) +
  circle(26, 6.5, 2.2, paper.base) +
  pill(25.4, 2.4, 1.2, 3.4, yellow.light);

export const RUIN_SPRITE = {
  width: W,
  height: H,
  anchorX: 0.5,
  anchorY: 35 / H,
  parts: {
    full: svg(W, H, WALL, LIFE, GLINT),
    searched: svg(W, H, WALL, LIFE),
  },
  pivots: { full: [26, 6.5] },
} satisfies SpriteProto;
