/**
 * La tour d'archers : un donjon trapu de planches sur un socle de pierre.
 *
 * Plus large et plus basse que la tour de guet (cadre 64 × 112 pour une
 * emprise 2 × 2) : un socle de pierre corail aux joints marqués, le donjon
 * jaune de la colonie, quatre créneaux, et entre eux ses deux archers — un
 * capuchon orange, un arc indigo. Des meurtrières, une porte, un fanion
 * orange, une cible criblée et un carquois au pied, une liane qui grimpe.
 *
 * Son chantier : le socle de pierre posé, les créneaux en planches au pied.
 */

import { PALETTE, RADIUS, circle, curve, flag, flower, line, pill, rect, shadedBlock, shadedCircle, svg, vine } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';
import { damageMarks, door, planks, siteClutter, siteGround, siteSign } from './building.ts';

const W = 64;
const H = 112;
const FOOTPRINT = 64;

const { ink, coral, orange, skin, paper } = PALETTE;

/** Le socle : une assise de pierre corail, ses joints en capsules sombres. */
function plinth(): string {
  return (
    shadedBlock(3, 80, 58, 30, 8, 'coral', RADIUS.large) +
    pill(10, 88, 12, 2.4, coral.shade) +
    pill(28, 86, 14, 2.4, coral.shade) +
    pill(46, 90, 9, 2.4, coral.shade)
  );
}

/** Un archer à son créneau : la tête, le capuchon orange, et son arc tendu à côté. */
function archer(x: number, y: number, bowRight: boolean): string {
  const bx = bowRight ? x + 5 : x - 5;

  return (
    circle(x, y + 1, 3.6, skin.base) +
    pill(x - 4, y - 3.6, 8, 4.4, orange.base) +
    pill(x - 2.6, y - 3, 3, 1.4, orange.light) +
    circle(x - 1.2, y + 1.2, 0.7, ink.base) +
    circle(x + 1.4, y + 1.2, 0.7, ink.base) +
    curve(`M${bx} ${y - 5} Q${bx + (bowRight ? 4 : -4)} ${y + 1} ${bx} ${y + 7}`, ink.base) +
    line(bx, y - 5, bx, y + 7, paper.shade)
  );
}

/** Le donjon de planches, ses créneaux et ses archers. */
function keep(): string {
  // Trois créneaux, deux larges embrasures où se tiennent les archers, devant leurs merlons.
  const merlons = [6, 27, 48].map((x) => shadedBlock(x, 24, 10, 16, 4, 'yellow', RADIUS.small)).join('');

  return (
    shadedBlock(6, 36, 52, 48, 8, 'yellow') +
    merlons +
    archer(21.5, 30, false) +
    archer(42.5, 30, true) +
    // Les meurtrières, et les planches marquées d'un trait.
    rect(16, 48, 4, 12, ink.base, 2) +
    rect(44, 48, 4, 12, ink.base, 2) +
    line(9, 66, 55, 66, PALETTE.yellow.shade) +
    door(26, 64, 12, 16)
  );
}

/** La cible criblée et le carquois, au pied de la tour. */
function practice(): string {
  return (
    line(56, 102, 56, 109, ink.base) +
    shadedCircle(56, 98, 5.5, 'coral') +
    circle(55.6, 97.6, 3.4, paper.base) +
    circle(55.6, 97.6, 1.6, coral.base) +
    line(55.6, 97.6, 61, 93, ink.base) +
    rect(2, 96, 6, 12, orange.shade, 3) +
    rect(2, 96, 5, 11, orange.base, 2.5) +
    line(4, 96, 3, 91, ink.base) +
    line(6, 96, 7.5, 91.5, ink.base)
  );
}

function tower(): string {
  return (
    plinth() +
    keep() +
    flag(32, 4, 16, 'orange') +
    vine([12, 108, 10, 96, 12, 84, 9, 72], 3) +
    practice() +
    flower(20, 108, 'mint') +
    flower(44, 109, 'yellow')
  );
}

function site(): string {
  return (
    siteGround(W, H, FOOTPRINT) +
    // Le socle est posé ; le donjon attend ses planches.
    shadedBlock(6, 80, 52, 24, 8, 'coral', RADIUS.large) +
    pill(14, 88, 12, 2.4, coral.shade) +
    pill(34, 86, 14, 2.4, coral.shade) +
    planks(18, 104, 28) +
    siteClutter(W, H) +
    siteSign(24, 58, shadedCircle(31, 63, 4, 'coral') + circle(31, 63, 1.6, paper.base))
  );
}

export const ARCHER_TOWER = {
  width: W,
  height: H,
  anchorX: 0,
  anchorY: 1,
  parts: {
    site: svg(W, H, site()),
    built: svg(W, H, tower()),
    damaged: svg(W, H, tower(), damageMarks(6, 36, 52, 48)),
  },
} satisfies SpriteProto;
