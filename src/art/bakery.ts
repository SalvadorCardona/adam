/**
 * La boulangerie : un four rond de briques, une cheminée et des pains qui refroidissent.
 *
 * Un socle de pierre **corail** porte un **dôme orange** aux joints en
 * capsules plus sombres ; sa bouche ronde, cerclée d'indigo, rougeoie
 * orange et jaune. Une cheminée indigo sort du dôme sur la droite. À gauche,
 * un sac de farine ficelé de jaune ; à droite, deux miches dorées sur une
 * planche.
 *
 * `smoke` : trois bouffées rondes indigo clair au-dessus de la cheminée,
 * dans le même cadre. Le rendu ne les affiche, et ne les fait monter, que
 * lorsque la boulangerie cuit.
 *
 * Son chantier : le socle posé, la moitié basse du dôme sous son
 * échafaudage, les briques qui attendent, un pain sur le panneau.
 *
 * Cadre 64 × 96 ; l'emprise occupe les 64 px du bas.
 */

import { PALETTE, RADIUS, circle, line, pill, rect, shadedBlock, shadedPill, svg } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';
import { damageMarks, lifeAt, scaffold, siteClutter, siteGround, siteSign } from './building.ts';

const W = 64;
const H = 96;
const FOOTPRINT = 64;

const { ink, paper, orange, yellow } = PALETTE;

/** La cheminée, de `top` jusqu'au dôme. */
function chimney(top: number): string {
  return (
    rect(42, top, 11, 46 - top, ink.shade, RADIUS.small) +
    rect(42, top, 8.5, 44 - top, ink.base, RADIUS.small) +
    pill(43.5, top + 4, 2.6, Math.max(4, (46 - top) * 0.4), ink.light) +
    pill(40, top - 2, 15, 6, ink.shade) +
    pill(40, top - 2, 15, 4, ink.light)
  );
}

/** Le dôme : trois tons, puis les joints de briques, rang par rang. */
function dome(x: number, y: number, w: number, h: number): string {
  const joints = [
    [y + 12, [x + 14, x + 26]],
    [y + 21, [x + 8, x + 20, x + 32]],
    [y + 30, [x + 5, x + 14, x + 38]],
  ] as const;

  return (
    rect(x, y, w, h, orange.shade, w / 2) +
    rect(x, y, w, h - 5, orange.base, w / 2) +
    pill(x + w * 0.18, y + 5, w * 0.3, 3.4, orange.light) +
    joints.map(([row, starts]) => starts.map((start) => pill(start, row, 8, 2.4, orange.shade)).join('')).join('')
  );
}

/** La bouche du four, cerclée d'indigo, où la braise rougeoie. */
function mouth(cx: number, cy: number): string {
  return (
    circle(cx, cy, 10, ink.base) +
    circle(cx, cy + 1, 8, orange.shade) +
    circle(cx - 0.5, cy + 1.5, 6.4, yellow.shade) +
    circle(cx - 0.5, cy + 2.5, 4, yellow.base) +
    pill(cx - 4, cy - 3.5, 4.5, 2.2, yellow.light)
  );
}

/** Un sac de farine ficelé, posé contre le socle. */
function flourSack(x: number, y: number): string {
  return (
    shadedPill(x, y, 13, 16, 5, 'paper') +
    pill(x + 3, y - 2, 7, 4, paper.shade) +
    pill(x + 1.5, y + 3, 10, 2, yellow.base) +
    pill(x + 2.5, y + 7, 4, 2.4, paper.light)
  );
}

/** Une miche dorée, entaillée en haut. */
function loaf(x: number, y: number): string {
  return (
    shadedPill(x, y, 12, 7, 3.5, 'orange') +
    pill(x + 2, y + 1.4, 4, 1.6, orange.light) +
    line(x + 6, y + 2, x + 7.5, y + 4.5, orange.shade)
  );
}

function oven(): string {
  return (
    chimney(14) +
    dome(6, 34, 48, 46) +
    // Le socle de pierre, sur lequel le dôme repose.
    shadedBlock(2, 72, 58, 20, 7, 'coral') +
    mouth(28, 72) +
    flourSack(1, 74) +
    pill(44, 88, 18, 3, ink.shade) +
    loaf(44, 82) +
    loaf(51, 78) +
    lifeAt(57, 78, 20)
  );
}

/** Trois bouffées rondes qui s'éloignent du haut de la cheminée. */
function smoke(): string {
  return (
    circle(47, 9, 4.6, ink.base) +
    circle(46.4, 8.4, 3.8, ink.light) +
    circle(53, 4.5, 3.6, ink.base) +
    circle(52.6, 4, 2.9, ink.light) +
    circle(58.5, 1.8, 2.4, ink.light)
  );
}

function site(): string {
  return (
    siteGround(W, H, FOOTPRINT) +
    shadedBlock(2, 72, 58, 20, 7, 'coral') +
    rect(8, 56, 44, 22, orange.shade, RADIUS.block) +
    rect(8, 56, 44, 18, orange.base, RADIUS.block) +
    circle(28, 72, 8, ink.base) +
    scaffold(6, 44, 48, 18) +
    // Les briques du dôme attendent.
    shadedBlock(40, 84, 10, 6, 2, 'orange', 2) +
    shadedBlock(44, 79, 10, 6, 2, 'orange', 2) +
    siteClutter(W, H) +
    siteSign(4, 40, shadedPill(6, 43, 10, 6, 3, 'orange'))
  );
}

export const BAKERY = {
  width: W,
  height: H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(W, H, site()),
    built: svg(W, H, oven()),
    damaged: svg(W, H, oven(), damageMarks(6, 40, 48, 46)),
    smoke: svg(W, H, smoke()),
  },
  pivots: { smoke: [46, 12] },
} satisfies SpriteProto;
