/**
 * Le cochon : rond, rose, paisible, et content de l'être.
 *
 * Un corps **chair** en capsule large (le ton de peau de la palette, un rose
 * pâle), un groin **corail** clair à deux narines, deux oreilles tombantes,
 * une queue en tire-bouchon. Une fleur sur l'oreille : la vie reprend ses
 * droits jusque sur un cochon de ruine.
 *
 * Morceaux : un corps par direction (face, dos, profil droit — le gauche est
 * le miroir) et une paire de sabots indigo que le rendu fait alterner.
 */

import { PALETTE, circle, curve, flower, pill, shadedCircle, shadedPill, svg } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';

const W = 32;
const H = 32;
/** Sol dans le cadre : l'ancre (0.5, 0.8125). */
const GROUND = 26;

const { ink, coral, skin } = PALETTE;

function eye(x: number, y: number): string {
  return circle(x, y, 1.5, ink.base);
}

function side(): string {
  return svg(
    W,
    H,
    // La queue en tire-bouchon, derrière.
    curve('M3 13 Q0.5 11 2.6 9.4 Q5 8.4 4.2 11', ink.light),
    // Le corps, la tête, le groin, l'oreille et son œil.
    shadedPill(4, 10, 20, 14, 5, 'skin'),
    shadedCircle(23, 15, 6.4, 'skin'),
    pill(26.5, 15, 5, 5.4, coral.light),
    circle(29.8, 17.2, 0.7, coral.shade),
    pill(19.5, 8.5, 5.5, 6.5, skin.shade),
    flower(22, 8.6, 'yellow', 0.55),
    eye(25, 13.5),
    pill(9, 20.5, 9, 2.2, skin.light),
  );
}

function down(): string {
  return svg(
    W,
    H,
    shadedPill(6, 11, 20, 14, 5, 'skin'),
    // Les oreilles tombantes, la tête ronde, le groin à deux narines.
    pill(7.5, 5.5, 6, 8, skin.shade),
    pill(18.5, 5.5, 6, 8, skin.shade),
    shadedCircle(16, 12, 7.4, 'skin'),
    flower(22.6, 7.2, 'yellow', 0.55),
    eye(12.8, 10.4),
    eye(19.2, 10.4),
    pill(11.5, 13.2, 9, 6, coral.light),
    circle(14.2, 16.2, 0.9, coral.shade),
    circle(17.8, 16.2, 0.9, coral.shade),
  );
}

function up(): string {
  return svg(
    W,
    H,
    shadedPill(6, 7, 20, 18, 5, 'skin'),
    pill(7.5, 4.5, 6, 7, skin.shade),
    pill(18.5, 4.5, 6, 7, skin.shade),
    pill(10, 15, 12, 4, skin.light),
    // La queue en tire-bouchon, qui remue vers nous.
    curve('M16 22 Q13 24 16 25 Q19 25.6 17.2 22.4', ink.light),
  );
}

export const PIG = {
  width: W,
  height: H,
  anchorX: 0.5,
  anchorY: GROUND / H,
  parts: {
    down: down(),
    up: up(),
    side: side(),
    /** Deux sabots : deux exemplaires alternés font le trottinement. */
    foot: svg(W, H, pill(9, GROUND - 4, 4.5, 4.5, ink.base), pill(18.5, GROUND - 4, 4.5, 4.5, ink.base)),
  },
} satisfies SpriteProto;
