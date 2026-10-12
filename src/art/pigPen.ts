/**
 * L'élevage de cochons : un enclos de récup, une soue, une auge.
 *
 * Un enclos de terre ambrée (la teinte foncée du sable) clos d'une barrière
 * indigo, avec dans le coin du fond une petite soue jaune au toit corail
 * et, à droite, une auge cyan pleine d'eau. Le cochon est un morceau à
 * part : `pigs1`, `pigs2`, `pigs3` en posent un, deux, trois dans l'enclos,
 * et le rendu montre celui qui correspond aux cochons logés.
 *
 * Son chantier : l'enclos piqueté, la barrière à moitié posée, un panneau
 * qui porte un groin.
 *
 * Cadre 64 × 80 ; l'emprise occupe les 64 px du bas.
 */

import {
  GROUND,
  PALETTE,
  circle,
  flower,
  pill,
  railing,
  rect,
  shadedBlock,
  shadedCircle,
  shadedPill,
  svg,
} from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';
import { damageMarks, door, gableRoof, scaffold, siteClutter, siteGround, siteSign } from './building.ts';

const W = 64;
const H = 80;
const FOOTPRINT = 64;

const { ink, coral, cyan, yellow, skin } = PALETTE;

function pen(): string {
  return (
    rect(4, 30, 56, 46, GROUND.sand.shade, 8) +
    rect(4, 30, 56, 42, GROUND.sand.base, 8) +
    // La terre foulée au milieu.
    pill(14, 52, 36, 8, GROUND.sand.shade) +
    // La soue, dans le coin du fond : murs jaunes, toit corail, porte.
    shadedBlock(7, 20, 24, 20, 6, 'yellow', 4) +
    gableRoof(4, 34, 24, 10, 'coral') +
    door(14, 28, 9, 12) +
    // L'auge, à droite : de l'eau dedans.
    shadedPill(42, 36, 16, 8, 3, 'cyan') +
    pill(44, 38, 12, 2.4, cyan.light) +
    flower(53, 33, 'yellow', 0.7) +
    // La barrière de devant.
    railing(4, 70, 56, 6, 8)
  );
}

/** Un cochon vu de profil, vers la droite, d'un peu moins de 18 px de long : `x, y` est son coin haut gauche. */
function pig(x: number, y: number): string {
  return (
    shadedPill(x, y + 3, 15, 9, 4, 'skin') +
    shadedCircle(x + 14.5, y + 6.5, 4.4, 'skin') +
    pill(x + 16.5, y + 6, 3.4, 3.6, coral.light) +
    pill(x + 11, y + 1.6, 3.6, 4.6, skin.shade) +
    circle(x + 16, y + 5.2, 1, ink.base) +
    pill(x + 3, y + 10.2, 3, 3, ink.base) +
    pill(x + 10, y + 10.2, 3, 3, ink.base)
  );
}

/** Les cochons logés : le premier au milieu, le deuxième à gauche devant la soue, le troisième près de l'auge. */
const SPOTS = [
  [24, 44],
  [10, 56],
  [36, 58],
] as const;

function pigs(count: number): string {
  return SPOTS.slice(0, count)
    .map(([x, y]) => pig(x, y))
    .join('');
}

/** Le pictogramme du panneau : un groin, autour de `x, y`. */
function snoutGlyph(x: number, y: number): string {
  return circle(x, y, 4, coral.light) + circle(x - 1.4, y, 0.9, coral.shade) + circle(x + 1.4, y, 0.9, coral.shade);
}

function site(): string {
  return (
    siteGround(W, H, FOOTPRINT) +
    // Les piquets de l'enclos, la barrière à moitié posée.
    scaffold(4, 66, 28, 6) +
    shadedBlock(7, 26, 14, 12, 4, 'yellow', 4) +
    siteClutter(W, H) +
    siteSign(44, 20, snoutGlyph(51, 26)) +
    pill(40, 54, 12, 3, yellow.shade)
  );
}

export const PIG_PEN = {
  width: W,
  height: H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(W, H, site()),
    built: svg(W, H, pen()),
    damaged: svg(W, H, pen(), damageMarks(4, 30, 56, 42)),
    pigs1: svg(W, H, pigs(1)),
    pigs2: svg(W, H, pigs(2)),
    pigs3: svg(W, H, pigs(3)),
  },
  pivots: { pigs1: [32, 72] },
} satisfies SpriteProto;
