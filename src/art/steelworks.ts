/**
 * L'aciérie : un haut fourneau de briques cerclé de fer, et deux cheminées.
 *
 * Le plus haut des bâtiments de production : un socle jaune de la colonie
 * porte un **haut fourneau** arrondi en briques corail, cerclé de bandes de
 * fer cyan rivetées ; deux cheminées indigo — le charbon — dépassent
 * derrière. Une passerelle au trait et son échelle montent au gueulard. Au
 * pied, la poche de coulée orange où l'acier rougeoie, et une pile de
 * poutrelles d'acier. Fumée (`smoke`) quand il coule.
 *
 * Son chantier : le socle, le pied du fourneau sous l'échafaudage, des
 * poutrelles qui attendent, une poutrelle sur le panneau.
 *
 * Cadre 64 × 112 ; l'emprise occupe les 64 px du bas.
 */

import { PALETTE, RADIUS, circle, ladder, line, pill, railing, rect, shadedBlock, svg } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';
import { damageMarks, lifeAt, scaffold, siteClutter, siteGround, siteSign } from './building.ts';

const W = 64;
const H = 112;
const FOOTPRINT = 64;

const { ink, coral, cyan, orange, yellow, paper } = PALETTE;

function stack(x: number, top: number, bottom: number): string {
  return (
    rect(x, top, 9, bottom - top, ink.shade, RADIUS.small) +
    rect(x, top, 7, bottom - top - 2, ink.base, RADIUS.small) +
    pill(x + 1.4, top + 4, 2.2, 8, ink.light) +
    pill(x - 2, top - 2, 13, 5, ink.light)
  );
}

/** Une bande de fer rivetée autour du fourneau. */
function band(x: number, y: number, w: number): string {
  return rect(x, y, w, 5, cyan.shade, 2.5) + rect(x, y, w, 3.6, cyan.base, 2.5) + circle(x + 4, y + 2, 0.9, ink.base) + circle(x + w - 4, y + 2, 0.9, ink.base);
}

/** Une poutrelle d'acier vue en bout : un I indigo, son dessus éclairé. */
function beam(x: number, y: number, w: number): string {
  return rect(x, y, w, 4, ink.shade, 1.2) + rect(x, y, w, 2.6, ink.base, 1.2) + pill(x + 1, y + 0.4, w * 0.4, 1, cyan.light);
}

function furnace(): string {
  return (
    rect(14, 34, 30, 56, coral.shade, 14) +
    rect(14, 34, 30, 52, coral.base, 14) +
    pill(18, 40, 5, 18, coral.light) +
    band(14, 46, 30) +
    band(14, 64, 30) +
    // Le trou de coulée, qui rougeoie.
    rect(22, 72, 14, 12, ink.base, 6) +
    circle(29, 79, 4, orange.base) +
    circle(29, 80, 2.2, yellow.base)
  );
}

function works(): string {
  return (
    stack(6, 16, 64) +
    stack(46, 8, 62) +
    shadedBlock(2, 78, 58, 14, 6, 'yellow') +
    furnace() +
    // La passerelle du gueulard et son échelle.
    railing(10, 26, 38, 8, 4) +
    ladder(46, 34, 44) +
    // La poche de coulée et les poutrelles.
    rect(4, 92, 14, 10, orange.shade, 5) +
    rect(4, 92, 14, 8, orange.base, 5) +
    pill(6, 93, 10, 3, yellow.base) +
    beam(40, 100, 18) +
    beam(42, 95, 16) +
    lifeAt(54, 104, 16)
  );
}

function smoke(): string {
  return (
    circle(50, 3.5, 3.4, paper.shade) +
    circle(49.6, 3.1, 2.7, paper.base) +
    circle(10, 11, 4.2, paper.shade) +
    circle(9.6, 10.5, 3.4, paper.base) +
    circle(16, 6, 3, paper.base)
  );
}

function site(): string {
  return (
    siteGround(W, H, FOOTPRINT) +
    shadedBlock(2, 84, 58, 14, 6, 'yellow') +
    rect(14, 62, 30, 26, coral.shade, 12) +
    rect(14, 62, 30, 22, coral.base, 12) +
    band(14, 70, 30) +
    scaffold(10, 50, 38, 14) +
    beam(40, 100, 18) +
    beam(42, 95, 16) +
    siteClutter(W, H) +
    siteSign(4, 50, beam(6, 53, 10) + line(11, 54, 11, 58, ink.base))
  );
}

export const STEELWORKS = {
  width: W,
  height: H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(W, H, site()),
    built: svg(W, H, works()),
    damaged: svg(W, H, works(), damageMarks(14, 34, 30, 52)),
    smoke: svg(W, H, smoke()),
  },
  pivots: { smoke: [12, 14] },
} satisfies SpriteProto;
