/**
 * L'indice d'un secret : une touffe de hautes herbes au pied d'un arbre,
 * et, entre deux brins, un éclat jaune à peine plus gros qu'une graine.
 * Discret — il faut avoir l'œil, ou passer à côté.
 *
 * Un seul morceau : `hint`. Une fois la cache trouvée, la touffe disparaît.
 */

import { PALETTE, circle, groundShadow, pill, svg } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';

const S = 32;

const { mint, yellow, paper } = PALETTE;

/** Des brins en capsules inclinées, du plus sombre au plus clair, lumière en haut à gauche. */
const BLADES = [
  [7, 11, 4.2, 19, mint.shade],
  [20, 12, 4.2, 18, mint.shade],
  [11, 8, 4.4, 22, mint.base],
  [16, 5, 4.4, 24, mint.base],
  [14, 7, 1.6, 12, mint.light],
].map(([x, y, w, h, color]) => pill(x as number, y as number, w as number, h as number, color as typeof mint.base));

const GLINT = circle(22.5, 14, 2.1, yellow.base) + circle(21.8, 13.3, 0.9, paper.base);

export const SECRET_SPRITE = {
  width: S,
  height: S,
  anchorX: 0.5,
  anchorY: 27 / S,
  parts: {
    hint: svg(S, S, groundShadow(16, 27, 20, 6), ...BLADES, GLINT),
  },
  pivots: { hint: [22.5, 14] },
} satisfies SpriteProto;
