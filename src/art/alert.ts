/**
 * Les bulles d'alerte : au-dessus d'un producteur arrêté par un problème
 * (`data/problems.ts`), pour qu'on voie de loin qu'il attend quelque chose.
 * Un morceau par problème.
 *
 * La bulle blanche des cartes de l'interface, sa pointe vers le toit, et en
 * haut à droite une pastille corail marquée d'un « ! » — ça presse. Dedans :
 * - `storeFull` : une caisse jaune de la colonie, pleine à ras bord — un bloc
 *   de fer, un épi, un galet dépassent du couvercle ;
 * - `noWorker` : un ouvrier, casquette orange des humains, dont le poste
 *   attend quelqu'un ;
 * - `noPig` : un groin de cochon, tout seul — l'enclos attend le sien ;
 * - `starved` : la même caisse, vide — on voit son fond —, et une flèche
 *   orange qui plonge dedans : elle attend qu'on la remplisse.
 *
 * Le rendu la fait battre doucement.
 */

import { PALETTE, circle, pill, polygon, rect, shadedBlock, shadedCircle, shadedPill, svg } from '../data/artDirection.ts';
import type { SpriteProto } from '../data/sprites.ts';

const W = 30;
const H = 31;
const { paper, yellow, orange, skin, ink, coral } = PALETTE;

/** La bulle, sa pointe au pied du cadre. */
const BUBBLE = [polygon([9, 23, 17, 23, 13, 30], paper.shade), shadedPill(1, 4, 24, 22, 3, 'paper')];

/** La pastille « ! », à cheval sur le coin haut droit de la bulle. */
const BADGE = [shadedCircle(24, 6, 5.5, 'coral'), pill(22.8, 2.6, 2.2, 4.6, paper.base), circle(23.9, 9, 1.15, paper.base)];

export const ALERT = {
  width: W,
  height: H,
  /** La pointe de la bulle tombe sur le point de position. */
  anchorX: 13 / W,
  anchorY: 1,
  parts: {
    storeFull: svg(
      W,
      H,
      ...BUBBLE,
      // Ce qui déborde : fer, épi, galet.
      shadedCircle(8, 12.5, 3.4, 'cyan'),
      pill(11, 8.5, 3.6, 8, yellow.shade),
      pill(10.8, 8.2, 3, 7, yellow.base),
      shadedCircle(16.5, 13, 3, 'coral'),
      // La caisse, par-dessus.
      shadedBlock(4, 14, 16, 8, 2.5, 'yellow', 2.5),
      pill(6, 17, 12, 1.6, orange.base),
      circle(7, 20.2, 0.9, orange.shade),
      circle(17, 20.2, 0.9, orange.shade),
      ...BADGE,
    ),
    noWorker: svg(
      W,
      H,
      ...BUBBLE,
      // Les épaules, le visage, la casquette et sa visière.
      shadedPill(5, 17.5, 15, 6.5, 2, 'orange'),
      circle(12.5, 13.2, 5.2, skin.shade),
      circle(12.2, 12.7, 4.8, skin.base),
      pill(9.2, 11.4, 2.6, 1.4, skin.light),
      shadedPill(7, 6.5, 11, 5, 1.5, 'orange'),
      pill(11, 10, 9, 2, orange.shade),
      circle(10.6, 13.8, 0.9, ink.base),
      circle(14, 13.8, 0.9, ink.base),
      ...BADGE,
    ),
    noPig: svg(
      W,
      H,
      ...BUBBLE,
      // Un groin rose : l'enclos attend son cochon.
      shadedPill(5.5, 5, 4.5, 7, 1.5, 'skin'),
      shadedPill(14.5, 5, 4.5, 7, 1.5, 'skin'),
      shadedCircle(12.5, 13, 7, 'skin'),
      circle(10, 11.2, 1, ink.base),
      circle(15, 11.2, 1, ink.base),
      shadedPill(8.5, 13.6, 8, 5, 1.5, 'coral'),
      circle(10.8, 16, 0.8, coral.shade),
      circle(14.2, 16, 0.8, coral.shade),
      ...BADGE,
    ),
    starved: svg(
      W,
      H,
      ...BUBBLE,
      // La caisse ouverte, vide : son fond, plus sombre, sous le rebord.
      shadedBlock(4, 13, 16, 9, 2.5, 'yellow', 2.5),
      rect(6, 14.5, 12, 3.5, yellow.shade, 1.5),
      circle(7, 20.2, 0.9, orange.shade),
      circle(17, 20.2, 0.9, orange.shade),
      // La flèche qui plonge dedans.
      shadedPill(10.5, 4.5, 4, 6.5, 1, 'orange'),
      polygon([7.5, 10, 17.5, 10, 12.5, 15], orange.shade),
      polygon([8.5, 9.5, 16.5, 9.5, 12.5, 13.5], orange.base),
      ...BADGE,
    ),
  },
} satisfies SpriteProto;
