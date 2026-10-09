/**
 * Les décorations : cinq petits riens qui rendent la colonie plus douce.
 *
 * Un parterre, un banc, un lampadaire, une fontaine, la statue d'Adam. Ni
 * ouvrier ni coffre : elles ne servent à rien d'autre qu'à lever le moral de
 * ceux qui passent. Elles gardent la grammaire des bâtiments — formes
 * arrondies, trois tons, pas de contour, lumière en haut à gauche — et
 * restent petites, pour ne jamais voler la vedette à l'usine. La pierre est
 * corail, l'eau cyan, le bois orange, comme partout ailleurs.
 *
 * Chacune a son chantier (quelques planches et son pictogramme sur le
 * panneau) et sa version endommagée (une fissure, une planche pendante).
 */

import {
  PALETTE,
  RADIUS,
  circle,
  flower,
  groundShadow,
  leaf,
  line,
  pill,
  rect,
  shadedBlock,
  shadedCircle,
  shadedPill,
  svg,
} from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';
import { crate, planks, siteGround, siteSign } from './building.ts';

const { ink, coral, orange, yellow, cyan, paper } = PALETTE;

/** Une fissure en zigzag dans la pierre, et deux éclats au pied. */
function crack(x: number, y: number, h: number): string {
  return line(x, y, x + 2.5, y + h * 0.35, ink.base) + line(x + 2.5, y + h * 0.35, x - 1, y + h * 0.7, ink.base) + line(x - 1, y + h * 0.7, x + 1.5, y + h, ink.base);
}

/** Le chantier d'une petite décoration : la terre retournée, des planches, une caisse, le panneau. */
function smallSite(width: number, height: number, glyph: string): string {
  return siteGround(width, height, 32) + planks(2, height - 9, 18) + crate(width - 14, height - 15, 9) + siteSign(width - 20, height - 32, glyph);
}

/* ------------------------------------------------------------------ parterre */

const BED_W = 32;
const BED_H = 32;

function flowerBed(): string {
  return (
    groundShadow(16, 27, 30, 6) +
    shadedBlock(2, 14, 28, 14, 4, 'orange', RADIUS.small) +
    rect(5, 16, 22, 6, ink.light, RADIUS.small) +
    leaf(9, 17, -30) +
    leaf(23, 17, 30) +
    flower(8, 15, 'coral') +
    flower(14, 12, 'yellow', 1.1) +
    flower(20, 15, 'violet') +
    flower(25, 13, 'cyan', 0.9) +
    flower(11, 18, 'violet', 0.8) +
    flower(18, 19, 'coral', 0.8)
  );
}

export const FLOWER_BED = {
  width: BED_W,
  height: BED_H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(BED_W, BED_H, smallSite(BED_W, BED_H, flower(7, 8, 'coral', 0.7))),
    built: svg(BED_W, BED_H, flowerBed()),
    damaged: svg(BED_W, BED_H, flowerBed(), pill(4, 20, 9, 2.5, orange.shade) + line(21, 14, 27, 22, ink.base)),
  },
} satisfies SpriteProto;

/* --------------------------------------------------------------------- banc */

const BENCH_W = 32;
const BENCH_H = 32;

function bench(): string {
  return (
    groundShadow(16, 28, 30, 6) +
    // Les pieds, puis le dossier derrière, l'assise devant.
    rect(5, 18, 3, 10, ink.base, 1.5) +
    rect(24, 18, 3, 10, ink.base, 1.5) +
    shadedPill(3, 10, 26, 6, 2, 'orange') +
    shadedPill(2, 17, 28, 7, 3, 'orange') +
    pill(5, 18, 9, 1.6, orange.light) +
    circle(6, 21, 0.9, ink.base) +
    circle(26, 21, 0.9, ink.base)
  );
}

export const BENCH = {
  width: BENCH_W,
  height: BENCH_H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(BENCH_W, BENCH_H, smallSite(BENCH_W, BENCH_H, pill(3, 5, 8, 2.4, orange.base) + pill(3, 8.5, 8, 2.4, orange.shade))),
    built: svg(BENCH_W, BENCH_H, bench()),
    damaged: svg(BENCH_W, BENCH_H, bench(), pill(17, 16, 11, 3, orange.shade) + line(18, 13, 25, 17, ink.base)),
  },
} satisfies SpriteProto;

/* --------------------------------------------------------------- lampadaire */

const LAMP_W = 32;
const LAMP_H = 64;

function streetLamp(): string {
  return (
    groundShadow(16, 59, 22, 5) +
    shadedBlock(10, 50, 12, 9, 3, 'ink', RADIUS.small) +
    rect(14, 14, 4, 40, ink.base, 2) +
    pill(14.8, 17, 1.4, 22, ink.light) +
    // La potence, puis la lanterne : une cage indigo autour d'un cœur jaune.
    line(16, 14, 16, 11, ink.base) +
    rect(9, 2, 14, 12, ink.base, 5) +
    rect(11, 4, 10, 8, yellow.shade, 4) +
    rect(11, 4, 10, 6.4, yellow.base, 4) +
    pill(12.4, 5.2, 4, 1.6, yellow.light) +
    pill(8, 0.5, 16, 3, ink.shade) +
    flower(9, 58, 'coral', 0.8) +
    flower(24, 59, 'yellow', 0.8)
  );
}

export const STREET_LAMP = {
  width: LAMP_W,
  height: LAMP_H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(LAMP_W, LAMP_H, smallSite(LAMP_W, LAMP_H, circle(7, 6, 3, yellow.base)) + rect(14, 30, 4, 28, ink.light, 2)),
    built: svg(LAMP_W, LAMP_H, streetLamp()),
    damaged: svg(LAMP_W, LAMP_H, streetLamp(), rect(10, 3, 12, 10, ink.shade, 4) + line(12, 5, 20, 11, ink.base)),
  },
} satisfies SpriteProto;

/* ---------------------------------------------------------------- fontaine */

const FOUNTAIN_W = 64;
const FOUNTAIN_H = 72;

function jet(): string {
  return (
    // Le jet : trois gouttes qui montent, une qui retombe, en blanc et cyan.
    pill(30, 14, 4, 18, cyan.base) +
    pill(30.6, 15, 1.4, 12, paper.base) +
    circle(32, 11, 3.6, cyan.base) +
    circle(31, 10, 1.4, paper.base) +
    circle(24, 20, 2, cyan.light) +
    circle(41, 21, 2, cyan.light) +
    circle(21, 27, 1.5, cyan.base) +
    circle(44, 27, 1.5, cyan.base)
  );
}

function fountain(): string {
  return (
    groundShadow(32, 64, 60, 9) +
    // La vasque : un grand bassin de pierre, l'eau dedans, le pied au centre.
    shadedBlock(3, 34, 58, 28, 9, 'coral', 12) +
    rect(8, 38, 48, 15, cyan.shade, 8) +
    rect(8, 38, 48, 13, cyan.base, 8) +
    pill(12, 40, 16, 2.4, cyan.light) +
    pill(36, 46, 10, 1.6, cyan.light) +
    shadedBlock(27, 22, 10, 22, 3, 'coral', 4) +
    shadedPill(22, 20, 20, 7, 3, 'coral') +
    jet() +
    flower(6, 64, 'yellow', 0.9) +
    flower(57, 65, 'coral', 0.9) +
    leaf(12, 64, -20) +
    leaf(51, 64, 20)
  );
}

export const FOUNTAIN = {
  width: FOUNTAIN_W,
  height: FOUNTAIN_H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(
      FOUNTAIN_W,
      FOUNTAIN_H,
      siteGround(FOUNTAIN_W, FOUNTAIN_H, 64) +
        shadedBlock(8, 38, 48, 22, 7, 'coral', 10) +
        crate(4, FOUNTAIN_H - 15, 10) +
        planks(FOUNTAIN_W - 24, FOUNTAIN_H - 9, 20) +
        siteSign(26, 18, circle(7, 6, 3, cyan.base)),
    ),
    built: svg(FOUNTAIN_W, FOUNTAIN_H, fountain()),
    damaged: svg(FOUNTAIN_W, FOUNTAIN_H, fountain(), crack(14, 42, 18) + crack(46, 48, 12)),
  },
} satisfies SpriteProto;

/* ------------------------------------------------------------ statue d'Adam */

const STATUE_W = 32;
const STATUE_H = 64;

/** Adam en pierre : l'écharpe au vent, le sac dans le dos, l'arc à la main. */
function statue(): string {
  return (
    groundShadow(16, 59, 28, 6) +
    shadedBlock(4, 44, 24, 15, 5, 'coral', RADIUS.small) +
    pill(8, 46, 10, 2, coral.light) +
    // Le sac, derrière ; le corps ; la tête ; l'écharpe qui flotte.
    shadedPill(19, 22, 8, 14, 2, 'coral') +
    shadedPill(10, 20, 12, 24, 3, 'coral') +
    shadedCircle(15, 13, 6.5, 'coral') +
    pill(9, 21, 15, 3.4, coral.shade) +
    pill(21, 22, 8, 2.6, coral.base) +
    pill(23.5, 24.5, 5, 2.4, coral.shade) +
    // L'arc, levé le long du bras gauche.
    line(8, 18, 6, 30, ink.base) +
    line(8, 18, 6, 41, ink.light) +
    flower(8, 58, 'yellow', 0.8) +
    flower(25, 59, 'violet', 0.8)
  );
}

export const ADAM_STATUE = {
  width: STATUE_W,
  height: STATUE_H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(STATUE_W, STATUE_H, smallSite(STATUE_W, STATUE_H, circle(7, 6, 3, coral.base)) + shadedBlock(8, 38, 16, 10, 4, 'coral', RADIUS.small)),
    built: svg(STATUE_W, STATUE_H, statue()),
    damaged: svg(STATUE_W, STATUE_H, statue(), crack(14, 24, 18) + crack(10, 46, 10)),
  },
} satisfies SpriteProto;

