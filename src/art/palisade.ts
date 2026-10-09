/**
 * La palissade : trois pieux taillés en pointe, liés de deux cordes, sur une
 * seule case (cadre 32 × 56). Les pieux couvrent presque toute la largeur :
 * côte à côte, les palissades font une clôture continue. Une fleur pousse au
 * pied — la vie reprend même là.
 *
 * Son chantier : deux pieux couchés, le premier planté, la corde enroulée.
 * Abîmée : un pieu cassé à mi-hauteur, une corde tombée.
 */

import { PALETTE, flower, line, pill, polygon, rect, ring, svg } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';

const W = 32;
const H = 56;

const { ink, yellow } = PALETTE;

/** Un pieu de `x` à `x + 8`, sa pointe en `top`, son pied au bas du cadre. */
function stake(x: number, top: number): string {
  return (
    polygon([x, top + 6, x + 4, top, x + 8, top + 6], yellow.shade) +
    rect(x, top + 5, 8, H - 4 - (top + 5), yellow.shade, 3) +
    polygon([x, top + 6, x + 4, top, x + 6.5, top + 6], yellow.base) +
    rect(x, top + 5, 6.5, H - 6 - (top + 5), yellow.base, 3) +
    pill(x + 1.4, top + 8, 2, 8, yellow.light)
  );
}

/** Un pieu cassé : le moignon et son éclat. */
function brokenStake(x: number): string {
  return (
    rect(x, 34, 8, H - 4 - 34, yellow.shade, 3) +
    rect(x, 34, 6.5, H - 6 - 34, yellow.base, 3) +
    polygon([x, 35, x + 3, 30, x + 5, 34, x + 8, 31, x + 8, 36], yellow.shade)
  );
}

function fence(broken: boolean): string {
  return (
    stake(2, 8) +
    (broken ? brokenStake(12) : stake(12, 5)) +
    stake(22, 9) +
    line(1, 26, 31, 26, ink.base) +
    (broken ? line(20, 42, 31, 45, ink.base) : line(1, 42, 31, 42, ink.base)) +
    flower(10, 53, 'coral', 0.8)
  );
}

function site(): string {
  return (
    pill(2, 46, 26, 5, yellow.shade) +
    pill(3, 45, 24, 4, yellow.base) +
    pill(5, 40, 24, 5, yellow.shade) +
    pill(6, 39, 22, 4, yellow.base) +
    stake(12, 18) +
    ring(26, 50, 4, 2.4, 2, ink.base)
  );
}

export const PALISADE = {
  width: W,
  height: H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(W, H, site()),
    built: svg(W, H, fence(false)),
    damaged: svg(W, H, fence(true)),
  },
} satisfies SpriteProto;
