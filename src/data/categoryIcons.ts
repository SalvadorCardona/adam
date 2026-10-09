/**
 * Icônes des familles de bâtiments — contenu pur.
 *
 * Une puce de filtre du menu de construction = une icône : « Tous » et
 * chaque `BuildingCategory`. `CATEGORY_ICONS` est un `Record` sur ces clés :
 * ajouter une famille dans `buildings.ts` sans lui dessiner d'icône ici ne
 * compile pas. `validatePrototypes()` vérifie le cadre et la direction
 * artistique.
 *
 * Elles disent la famille, pas un bâtiment : sans médaillon (c'est celui
 * des métiers), sans fond, comme les pictogrammes de l'interface. Formes
 * pures, trois tons, aucun contour, lumière en haut à gauche, dans un carré
 * de `ICON_SIZE`.
 */

import { PALETTE, circle, group, line, pill, polygon, rect, shadedBlock, shadedCircle, svg } from './artDirection.ts';
import type { BuildingCategory } from './buildings.ts';
import { ICON_SIZE } from './icons.ts';

const S = ICON_SIZE;
const { ink, coral, orange, mint, cyan, yellow, paper } = PALETTE;

/** Une petite tuile du damier de « Tous » : la face avant dépasse en bas, le reflet en haut à gauche. */
function tile(x: number, y: number, tone: 'yellow' | 'coral' | 'mint' | 'cyan'): string {
  const { base, shade, light } = PALETTE[tone];

  return rect(x, y, 8.5, 8.5, shade, 2.5) + rect(x, y, 8.5, 7.3, base, 2.5) + pill(x + 1.5, y + 1.4, 3, 1.4, light);
}

export const CATEGORY_ICONS = {
  /** Tous : le damier des familles, une tuile par couleur. */
  all: svg(S, S, tile(2.5, 2.5, 'yellow'), tile(13, 2.5, 'coral'), tile(2.5, 13, 'mint'), tile(13, 13, 'cyan')),
  /** Minerai : un bloc de fer cyan clouté, et l'éclat de pierre corail tombé à côté. */
  ore: svg(
    S,
    S,
    polygon([3, 15, 7, 5, 16, 4, 19.5, 12, 14, 19, 5.5, 19.5], cyan.shade),
    polygon([4, 14, 7.5, 5.5, 15.5, 4.8, 18.5, 11.5, 13.5, 16.5, 5.5, 17], cyan.base),
    pill(7.5, 7, 4.5, 1.6, cyan.light),
    circle(13, 11, 1.4, ink.base),
    circle(9, 13.5, 1.1, ink.base),
    polygon([13.5, 21.5, 15.5, 15.5, 21, 15, 22, 20.5], coral.shade),
    polygon([14, 20, 15.8, 15.6, 20.6, 15.4, 21.4, 19], coral.base),
    pill(16.5, 16.4, 2.5, 1.2, coral.light),
  ),
  /** Production : la roue dentée orange des ateliers, une pousse menthe sur le moyeu. */
  production: svg(
    S,
    S,
    ...[0, 60, 120, 180, 240, 300].map((angle) => group(`rotate(${angle} 12 13)`, rect(9.75, 2.5, 4.5, 6, orange.shade, 1.6))),
    shadedCircle(12, 13, 7.6, 'orange'),
    circle(12, 13, 3.2, paper.base),
    line(12, 13, 12, 8.5, mint.shade),
    group('translate(12 9.5) rotate(-35)', pill(0, -1.5, 5, 3, mint.base)),
  ),
  /** Attaque : une flèche qui part vers le haut à droite, pointe cyan, empennage corail. */
  defense: svg(
    S,
    S,
    line(5, 19, 17, 7, ink.base),
    polygon([20.5, 3.5, 19, 11, 13, 5], cyan.shade),
    polygon([20.5, 3.5, 18.4, 9.6, 14.4, 5.6], cyan.base),
    group('translate(6.5 17.5) rotate(-45)', pill(-5, -3.4, 6.5, 3, coral.base), pill(-5, 0.4, 6.5, 3, coral.shade)),
  ),
  /** Logistique : la caisse du logisticien, sanglée d'indigo. */
  logistics: svg(
    S,
    S,
    shadedBlock(3, 6, 18, 15, 3.5, 'orange', 3),
    line(3.5, 11, 20.5, 11, orange.shade),
    line(12, 6.5, 12, 20, ink.base),
    rect(9.5, 12.5, 5, 3.5, yellow.base, 1.5),
  ),
  /** Habitat : une maison, murs jaunes de la colonie, toit corail, porte menthe. */
  housing: svg(
    S,
    S,
    shadedBlock(5, 10.5, 14, 11.5, 3, 'yellow', 3),
    polygon([2.5, 12, 12, 3.5, 21.5, 12], coral.shade),
    polygon([3.5, 11, 12, 3.6, 20.5, 11], coral.base),
    pill(7, 7.8, 4.5, 1.6, coral.light),
    rect(10, 15, 4.5, 7, mint.shade, 2.2),
  ),
  /** Recherche : une fiole ronde, liquide cyan, deux bulles qui montent. */
  research: svg(
    S,
    S,
    rect(9.5, 2.5, 5, 8, paper.shade, 2),
    rect(8.5, 1.5, 7, 2.5, ink.base, 1.25),
    circle(12, 15, 7.5, paper.shade),
    circle(12, 15.5, 6.2, cyan.base),
    rect(6, 10, 12, 4, paper.shade, 2),
    pill(8, 15, 3, 1.5, cyan.light),
    circle(14.5, 13.5, 1.2, cyan.light),
    circle(12.5, 9.5, 0.9, cyan.base),
  ),
  /** Décor : une fleur sur sa tige, corolle corail, cœur jaune, deux feuilles menthe. */
  decor: svg(
    S,
    S,
    line(12, 11, 12, 21, mint.shade),
    pill(5.5, 14.5, 6.5, 3, mint.base),
    pill(12, 16.5, 6.5, 3, mint.shade),
    circle(12, 6.5, 3.6, coral.base),
    circle(7.4, 10.2, 3.6, coral.base),
    circle(16.6, 10.2, 3.6, coral.base),
    circle(12, 11, 3.6, coral.shade),
    circle(12, 9.5, 3.2, yellow.base),
  ),
} as const satisfies Record<BuildingCategory | 'all', string>;

/** Une puce de filtre : « Tous », ou une famille. */
export type CategoryFilter = keyof typeof CATEGORY_ICONS;
