/**
 * Le grill : un barbecue de récup, un demi-bidon sur quatre pieds de ferraille.
 *
 * Un demi-fût **cyan** (le fer de la colonie) repose sur deux pieds indigo,
 * sa gueule ouverte sur un lit de braises orange. Dessus, une grille indigo
 * où rôtissent trois morceaux de viande corail, et un couvercle de tôle
 * relevé derrière. Une cheminée de tuyau indigo, coiffée d'un chapeau,
 * s'élève sur la droite ; à gauche, une caisse de bois et sa fourchette.
 *
 * `smoke` : les flammes qui lèchent la grille et trois bouffées rondes au-dessus
 * de la cheminée, dans le même cadre. Le rendu ne les affiche, et ne les
 * fait danser, que lorsque le grill cuit.
 *
 * Son chantier : les pieds plantés, le fût posé sans sa grille, les morceaux
 * de tôle qui attendent, un morceau de viande sur le panneau.
 *
 * Cadre 64 × 80 ; l'emprise occupe les 64 px du bas.
 */

import { PALETTE, RADIUS, circle, line, pill, rect, shadedBlock, shadedPill, svg } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';
import { crate, damageMarks, lifeAt, scaffold, siteClutter, siteGround, siteSign } from './building.ts';

const W = 64;
const H = 80;
const FOOTPRINT = 64;

const { ink, coral, orange, yellow, cyan } = PALETTE;

/** Le tuyau de cheminée, de `top` jusqu'au fût, et son chapeau. */
function pipe(top: number): string {
  return (
    rect(49, top, 8, 46 - top, ink.shade, RADIUS.small) +
    rect(49, top, 6, 44 - top, ink.base, RADIUS.small) +
    pill(50.4, top + 4, 1.8, Math.max(4, (46 - top) * 0.4), ink.light) +
    pill(46, top - 3, 15, 5, ink.shade) +
    pill(46, top - 3, 15, 3.4, ink.light)
  );
}

/** Le fût : un demi-bidon cyan, sa gueule ouverte sur les braises. */
function drum(): string {
  return (
    shadedBlock(5, 36, 46, 28, 9, 'cyan') +
    // Les cerclages du bidon.
    pill(5, 44, 46, 2.4, cyan.shade) +
    pill(5, 55, 46, 2.4, cyan.shade) +
    pill(9, 38, 18, 2.6, cyan.light) +
    // La gueule : le noir du fût, et les braises.
    rect(11, 47, 34, 9, ink.base, 4.5) +
    pill(14, 51, 28, 4.5, orange.shade) +
    pill(16, 52.4, 11, 2.6, orange.base) +
    pill(30, 52.4, 9, 2.6, yellow.base)
  );
}

/** La grille indigo et les morceaux de viande qui y rôtissent. */
function grate(): string {
  return (
    pill(6, 33, 44, 4, ink.shade) +
    pill(6, 32, 44, 3.4, ink.base) +
    shadedPill(10, 25, 12, 8, 3, 'coral') +
    shadedPill(24, 24, 12, 8, 3, 'coral') +
    shadedPill(38, 25, 10, 8, 3, 'coral') +
    pill(12, 26.4, 5, 1.8, coral.light) +
    pill(26, 25.4, 5, 1.8, coral.light) +
    pill(40, 26.4, 4, 1.8, coral.light)
  );
}

/** Le couvercle de tôle, relevé derrière la grille. */
function lid(): string {
  return rect(6, 12, 40, 12, cyan.shade, RADIUS.block) + rect(6, 12, 40, 9, cyan.base, RADIUS.block) + pill(10, 14.4, 14, 2.4, cyan.light);
}

/** Deux pieds de ferraille, sous le fût. */
function legs(): string {
  return (
    line(12, 62, 9, 76, ink.base) +
    line(44, 62, 47, 76, ink.base) +
    pill(5, 74, 9, 3.4, ink.shade) +
    pill(42, 74, 9, 3.4, ink.shade)
  );
}

function barbecue(): string {
  return (
    pipe(14) +
    lid() +
    drum() +
    grate() +
    legs() +
    // La caisse de bois, à gauche, et la fourchette plantée dedans.
    crate(2, 66, 11) +
    line(10, 56, 8, 68, ink.base) +
    circle(10.4, 55.4, 1.6, ink.light) +
    lifeAt(57, 76, 20)
  );
}

/** Les flammes qui lèchent la grille, puis trois bouffées de fumée au-dessus du tuyau. */
function smoke(): string {
  return (
    circle(18, 38, 4.4, orange.shade) +
    circle(18, 37, 3.4, orange.base) +
    circle(18, 38, 1.8, yellow.base) +
    circle(30, 36, 5.2, orange.shade) +
    circle(30, 35, 4, orange.base) +
    circle(30, 36, 2.2, yellow.light) +
    circle(41, 38, 4, orange.shade) +
    circle(41, 37, 3, orange.base) +
    circle(41, 38, 1.6, yellow.base) +
    circle(53, 6, 4.4, ink.base) +
    circle(52.4, 5.4, 3.6, ink.light) +
    circle(58, 2, 3.2, ink.base) +
    circle(57.6, 1.6, 2.6, ink.light) +
    circle(61, 1.8, 1.4, ink.light)
  );
}

function site(): string {
  return (
    siteGround(W, H, FOOTPRINT) +
    // Le fût posé sur ses pieds, sans grille ni couvercle.
    shadedBlock(8, 50, 40, 22, 8, 'cyan') +
    pill(8, 58, 40, 2.4, cyan.shade) +
    rect(14, 54, 28, 6, ink.base, 3) +
    scaffold(6, 38, 44, 14) +
    // Les tôles qui attendent d'être clouées.
    rect(46, 62, 12, 5, cyan.shade, 2) +
    rect(46, 60, 12, 4, cyan.base, 2) +
    crate(2, 60, 10) +
    siteClutter(W, H) +
    siteSign(4, 26, shadedPill(5.5, 29, 7, 5, 2, 'coral'))
  );
}

export const GRILL = {
  width: W,
  height: H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(W, H, site()),
    built: svg(W, H, barbecue()),
    damaged: svg(W, H, barbecue(), damageMarks(5, 36, 46, 28)),
    smoke: svg(W, H, smoke()),
  },
  pivots: { smoke: [30, 40] },
} satisfies SpriteProto;
