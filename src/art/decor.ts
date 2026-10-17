/**
 * Le décor de surface : ce qui dit où l'on est, et que la vie reprend.
 *
 * Rien ici ne se heurte ni ne se récolte (`data/decor.ts`). Chaque élément
 * tient dans sa tuile de 32 × 32 et se bake avec le sol. Le monde d'avant
 * est là — un pneu, un tonneau, un panneau, un coin de ruine violette — mais
 * il fleurit : une fleur dans le pneu, une autre sur le tonneau, une liane
 * sur la ruine. La flaque est de l'eau : le vert fluo reste aux mutants.
 */

import {
  PALETTE,
  circle,
  flag,
  flower,
  groundShadow,
  leaf,
  line,
  pill,
  polygon,
  polyline,
  rect,
  ring,
  shadedCircle,
  shadedBlock,
  svg,
  vine,
  windowPane,
} from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';

const T = 32;

const { ink, coral, paper, cyan, mint, orange } = PALETTE;

function tile(...body: string[]): string {
  return svg(T, T, ...body);
}

export const DECOR_ART = {
  width: T,
  height: T,
  anchorX: 0,
  anchorY: 0,
  parts: {
    flowers: tile(
      leaf(10, 22, 200),
      flower(9, 16, 'coral'),
      flower(17, 11, 'yellow'),
      flower(24, 19, 'violet'),
      leaf(22, 24, -30),
    ),
    tuft: tile(
      leaf(16, 24, -115, 1.4),
      leaf(16, 24, -90, 1.6),
      leaf(16, 24, -65, 1.4),
      leaf(10, 26, -100, 1.1),
      leaf(22, 26, -80, 1.1),
    ),
    deadBush: tile(
      polyline([16, 27, 16, 17, 11, 11], ink.base),
      polyline([16, 20, 22, 13], ink.base),
      polyline([16, 23, 9, 19], ink.base),
      flower(22, 12, 'yellow'),
      leaf(11, 11, -60, 0.9),
    ),
    bones: tile(
      pill(8, 17, 16, 5, paper.shade),
      pill(8, 16, 16, 4, paper.base),
      circle(8, 15.5, 2.6, paper.base),
      circle(8, 20, 2.6, paper.shade),
      circle(24, 15.5, 2.6, paper.base),
      circle(24, 20, 2.6, paper.shade),
      flower(17, 11, 'coral', 0.8),
    ),
    rubble: tile(
      shadedBlock(4, 17, 11, 9, 3, 'violet', 3),
      shadedBlock(15, 19, 13, 8, 3, 'violet', 3),
      shadedBlock(9, 10, 9, 8, 2.5, 'violet', 3),
      leaf(20, 18, -40),
    ),
    barrel: tile(
      shadedBlock(10, 9, 13, 18, 4, 'orange', 5),
      line(11, 15, 22, 15, orange.shade),
      line(11, 21, 22, 21, orange.shade),
      flower(16.5, 6, 'yellow'),
      leaf(16, 9, -150, 0.8),
    ),
    tire: tile(
      ring(16, 19, 11, 7, 4, ink.base),
      pill(8, 13.5, 8, 2, ink.light),
      flower(13, 16, 'coral'),
      flower(19, 17, 'yellow'),
    ),
    sign: tile(
      line(16, 12, 16, 28, ink.base),
      shadedBlock(5, 4, 22, 11, 3, 'yellow', 3),
      polygon([10, 7.5, 20, 7.5, 20, 5.5, 24, 9, 20, 12.5, 20, 10.5, 10, 10.5], coral.base),
      leaf(16, 26, 200),
    ),
    campfire: tile(
      groundShadow(16, 25, 26, 9),
      shadedCircle(6, 23, 3.4, 'coral'),
      shadedCircle(11, 26, 3.4, 'coral'),
      shadedCircle(21, 26, 3.4, 'coral'),
      shadedCircle(26, 23, 3.4, 'coral'),
      pill(7, 21.5, 18, 4, ink.shade),
      pill(7, 20.5, 18, 3.5, ink.base),
      polygon([16, 5, 22, 15, 21, 21, 11, 21, 10, 15], orange.shade),
      polygon([16, 8, 20.5, 16, 19.5, 20.5, 12.5, 20.5, 11.5, 16], orange.base),
      polygon([16, 13, 18.8, 18, 18, 20.5, 14, 20.5, 13.2, 18], PALETTE.yellow.base),
      pill(13.5, 15, 2.2, 3.4, PALETTE.yellow.light),
    ),
    puddle: tile(pill(4, 13, 24, 11, cyan.shade), pill(4, 13, 24, 9, cyan.base), pill(8, 15, 9, 2.4, cyan.light)),
    mushrooms: tile(
      rect(9.5, 17, 4, 9, paper.shade, 2),
      rect(18.5, 13, 5, 13, paper.shade, 2.5),
      pill(5, 13, 13, 7, coral.shade),
      pill(5, 12.5, 13, 5.5, coral.base),
      pill(14, 8, 14, 8, coral.shade),
      pill(14, 7.5, 14, 6.5, coral.base),
      circle(9, 14.5, 1.1, paper.base),
      circle(18.5, 9.8, 1.2, paper.base),
      circle(23.5, 10.8, 1, paper.base),
    ),
    ruin: tile(
      shadedBlock(3, 8, 22, 21, 6, 'violet', 6),
      windowPane(8, 12, 6, 7, 'violet'),
      flag(21, 1, 9, 'yellow'),
      vine([5, 10, 7, 16, 5, 22, 7, 28], 3),
      flower(27, 25, 'coral'),
      rect(14, 25, 8, 3, mint.shade, 1.5),
    ),
  },
} satisfies SpriteProto;
