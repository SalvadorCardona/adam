/**
 * L'atelier : un bloc de briques sous un auvent rayé, où l'on façonne les outils.
 *
 * Murs jaunes de la colonie, un **auvent rayé cyan et blanc** — l'accent du
 * fer travaillé — tendu sur deux poteaux, et dessous l'établi indigo avec
 * son étau. Au mur, un panneau où pendent une clé et un marteau ; au pied,
 * une caisse d'outils finis et une meule ronde. Une lucarne ronde au
 * pignon, un fanion jaune sur le faîte.
 *
 * Son chantier : les murs à mi-hauteur, l'établi déjà posé, une clé sur le
 * panneau.
 *
 * Cadre 64 × 96 ; l'emprise occupe les 64 px du bas.
 */

import { PALETTE, RADIUS, circle, flag, line, pill, rect, shadedBlock, shadedCircle, svg, windowPane } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';
import { crate, damageMarks, gableRoof, lifeAt, scaffold, siteClutter, siteGround, siteSign } from './building.ts';

const W = 64;
const H = 96;
const FOOTPRINT = 64;

const { ink, cyan, paper, orange } = PALETTE;

/** L'auvent : des bandes cyan et blanches, et leurs festons arrondis. */
function awning(x: number, y: number, w: number): string {
  const stripes = 5;
  const band = w / stripes;
  let body = '';

  for (let i = 0; i < stripes; i += 1) {
    const tone = i % 2 === 0 ? cyan : paper;

    body += rect(x + i * band, y, band, 8, tone.base, 1) + circle(x + i * band + band / 2, y + 8, band / 2, i % 2 === 0 ? cyan.shade : paper.shade);
  }
  return body;
}

/** Une clé plate, au trait : la tête ronde et le manche. */
function wrench(x: number, y: number): string {
  return line(x, y, x, y + 10, ink.base) + circle(x, y, 2.6, ink.base) + circle(x, y - 1, 1.1, paper.base);
}

function shop(): string {
  return (
    shadedBlock(3, 46, 52, 44, 8, 'yellow') +
    gableRoof(0, 58, 50, 26, 'coral') +
    windowPane(23, 33, 10, 10, 'coral') +
    flag(29, 8, 18, 'yellow') +
    // Le panneau aux outils, au mur.
    rect(8, 52, 18, 12, ink.light, RADIUS.small) +
    wrench(12, 55) +
    line(20, 54, 20, 62, orange.shade) +
    rect(17, 53, 6, 3, ink.base, 1) +
    // L'auvent et ses poteaux, l'établi et son étau dessous.
    line(34, 58, 34, 86, ink.base) +
    line(58, 58, 58, 86, ink.base) +
    awning(32, 52, 28) +
    shadedBlock(36, 74, 20, 8, 3, 'ink', RADIUS.small) +
    rect(42, 68, 6, 7, cyan.shade, 1.5) +
    rect(42, 68, 6, 5, cyan.base, 1.5) +
    // La meule et la caisse d'outils finis.
    shadedCircle(10, 84, 5, 'violet') +
    circle(10, 84, 1.4, ink.base) +
    crate(18, 80, 10, 'orange') +
    lifeAt(54, 88, 12)
  );
}

function site(): string {
  return (
    siteGround(W, H, FOOTPRINT) +
    shadedBlock(3, 64, 52, 26, 7, 'yellow') +
    scaffold(6, 52, 46, 12) +
    shadedBlock(36, 78, 20, 8, 3, 'ink', RADIUS.small) +
    siteClutter(W, H) +
    siteSign(4, 38, wrench(11, 41) + pill(9, 46, 4, 1, ink.base))
  );
}

export const WORKSHOP = {
  width: W,
  height: H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(W, H, site()),
    built: svg(W, H, shop()),
    damaged: svg(W, H, shop(), damageMarks(3, 46, 52, 44)),
  },
} satisfies SpriteProto;
