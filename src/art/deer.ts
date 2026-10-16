/**
 * La biche dorée : fine, légère, et qui ne reste jamais là où on la regarde.
 *
 * Un corps **jaune** en capsule allongée, un cou et une tête menue, deux
 * grandes oreilles, un museau corail, des taches crème sur le dos — la vie
 * reprend ses droits jusque dans la dorure d'une biche de ruine. Quatre
 * fines pattes indigo.
 *
 * Morceaux : un corps par direction (face, dos, profil droit — le gauche est
 * le miroir) et une paire de pattes que le rendu fait alterner.
 */

import { PALETTE, circle, pill, shadedCircle, shadedPill, svg } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';

const W = 32;
const H = 32;
/** Sol dans le cadre : l'ancre (0.5, 0.8125). */
const GROUND = 26;

const { ink, coral, yellow, paper } = PALETTE;

function eye(x: number, y: number): string {
  return circle(x, y, 1.3, ink.base);
}

function side(): string {
  return svg(
    W,
    H,
    // Le corps, le cou levé, la tête et son museau, l'oreille et l'œil.
    shadedPill(5, 11, 17, 11, 4, 'yellow'),
    pill(18, 5, 5, 11, yellow.base),
    shadedCircle(23, 7, 4.6, 'yellow'),
    pill(25.5, 7, 4.5, 3.6, coral.light),
    pill(19, 1.5, 3, 6.5, yellow.shade),
    eye(24.6, 6.2),
    // Les taches crème et la queue.
    circle(10, 14.5, 1.3, paper.base),
    circle(14.5, 16, 1.1, paper.base),
    pill(2.5, 12, 4, 3, paper.base),
  );
}

function down(): string {
  return svg(
    W,
    H,
    shadedPill(8, 11, 16, 14, 5, 'yellow'),
    pill(7.5, 3, 4, 8, yellow.shade),
    pill(20.5, 3, 4, 8, yellow.shade),
    shadedCircle(16, 9, 5.6, 'yellow'),
    pill(13, 10.5, 6, 5, coral.light),
    eye(13.4, 7.6),
    eye(18.6, 7.6),
    circle(12, 18, 1.2, paper.base),
    circle(19.5, 20, 1.2, paper.base),
  );
}

function up(): string {
  return svg(
    W,
    H,
    shadedPill(8, 7, 16, 18, 5, 'yellow'),
    pill(7.5, 3, 4, 7, yellow.shade),
    pill(20.5, 3, 4, 7, yellow.shade),
    pill(11, 14, 10, 4, yellow.light),
    // La queue crème, qui remue vers nous.
    pill(14, 22, 4, 3.4, paper.base),
    circle(12.5, 12, 1.2, paper.base),
    circle(19.5, 15, 1.2, paper.base),
  );
}

export const DEER = {
  width: W,
  height: H,
  anchorX: 0.5,
  anchorY: GROUND / H,
  parts: {
    down: down(),
    up: up(),
    side: side(),
    /** Deux paires de pattes : deux exemplaires alternés font le trot. */
    foot: svg(W, H, pill(10, GROUND - 5, 2.6, 5, ink.base), pill(19.5, GROUND - 5, 2.6, 5, ink.base)),
  },
} satisfies SpriteProto;
