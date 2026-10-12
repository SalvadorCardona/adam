/**
 * La briqueterie : un four long couché sous un toit de tuiles, et ses briques
 * qui refroidissent sur des claies.
 *
 * Un bloc bas aux murs jaunes de la colonie, un **toit en berceau de tuiles
 * corail** (rangs de capsules plus sombres), deux gueules de four en arche
 * indigo qui rougeoient côte à côte. À droite, la claie de bois où sèchent
 * les briques crues et cuites ; à gauche, le tas de pierre concassée qui
 * attend. Une cheminée trapue fume (`smoke`, montrée quand le four cuit).
 *
 * Son chantier : le socle et une gueule voûtée, les moules qui sèchent, une
 * brique sur le panneau.
 *
 * Cadre 64 × 96 ; l'emprise occupe les 64 px du bas.
 */

import { PALETTE, RADIUS, circle, line, pill, rect, shadedBlock, svg } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';
import { damageMarks, lifeAt, scaffold, siteClutter, siteGround, siteSign } from './building.ts';

const W = 64;
const H = 96;
const FOOTPRINT = 64;

const { ink, coral, orange, yellow, paper } = PALETTE;

/** Une brique posée à plat, en trois tons. */
function brick(x: number, y: number): string {
  return rect(x, y, 9, 5, coral.shade, 1.5) + rect(x, y, 9, 3.6, coral.base, 1.5) + pill(x + 1.2, y + 0.8, 3, 1.2, coral.light);
}

/** Le toit en berceau : un demi-cylindre de tuiles corail. */
function vault(): string {
  return (
    rect(2, 34, 56, 22, coral.shade, 11) +
    rect(2, 34, 56, 18, coral.base, 11) +
    pill(8, 37, 18, 3, coral.light) +
    [42, 47].map((row) => [6, 16, 26, 36, 46].map((x) => pill(x + (row === 47 ? 5 : 0), row, 7, 2.2, coral.shade)).join('')).join('')
  );
}

/** Une gueule de four en arche, et son feu. */
function mouth(x: number): string {
  return rect(x, 62, 14, 18, ink.base, 7) + circle(x + 7, 74, 4.6, orange.base) + circle(x + 7, 75, 2.6, yellow.base);
}

function chimney(): string {
  return rect(10, 18, 10, 22, ink.shade, RADIUS.small) + rect(10, 18, 7.5, 20, ink.base, RADIUS.small) + pill(8, 16, 14, 5, ink.light);
}

/** La claie de séchage : deux lisses au trait et les briques posées dessus. */
function rack(x: number, y: number): string {
  return (
    line(x, y, x, y + 16, ink.base) +
    line(x + 18, y, x + 18, y + 16, ink.base) +
    line(x, y + 7, x + 18, y + 7, orange.shade) +
    brick(x + 1, y + 1) +
    brick(x + 9, y + 1) +
    brick(x + 4, y + 9)
  );
}

function works(): string {
  return (
    chimney() +
    shadedBlock(3, 50, 52, 40, 8, 'yellow') +
    vault() +
    mouth(10) +
    mouth(32) +
    // La pierre concassée, à gauche ; les briques qui sèchent, à droite.
    circle(4, 88, 3, coral.shade) +
    circle(8, 89, 2.6, coral.base) +
    rack(44, 74) +
    lifeAt(26, 86, 14)
  );
}

/** Trois bouffées blanches au-dessus de la cheminée trapue. */
function smoke(): string {
  return (
    circle(15, 11, 4.6, paper.shade) +
    circle(14.4, 10.4, 3.8, paper.base) +
    circle(21, 6, 3.6, paper.shade) +
    circle(20.6, 5.6, 2.9, paper.base) +
    circle(26, 3, 2.4, paper.base)
  );
}

function site(): string {
  return (
    siteGround(W, H, FOOTPRINT) +
    shadedBlock(3, 66, 52, 24, 7, 'yellow') +
    rect(10, 68, 14, 14, ink.base, 7) +
    scaffold(30, 54, 24, 14) +
    // Les moules de planches, et les premières briques qui y sèchent.
    brick(30, 82) +
    brick(40, 82) +
    brick(35, 77) +
    siteClutter(W, H) +
    siteSign(4, 40, rect(7, 43, 8, 4.4, coral.base, 1.5))
  );
}

export const BRICKWORKS = {
  width: W,
  height: H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(W, H, site()),
    built: svg(W, H, works()),
    damaged: svg(W, H, works(), damageMarks(3, 50, 52, 40)),
    smoke: svg(W, H, smoke()),
  },
  pivots: { smoke: [15, 16] },
} satisfies SpriteProto;
