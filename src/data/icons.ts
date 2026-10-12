/**
 * Icônes d'objets — contenu pur.
 *
 * Une ressource = une icône. `ITEM_ICONS` est un `Record<ItemId, string>` :
 * ajouter un objet dans `items.ts` sans lui donner d'icône ici ne compile pas.
 * C'est la seule garantie qui tienne ; un `icon?: string` optionnel finit en
 * carré vide dans le sac au bout de trois objets.
 *
 * Chaque icône est un SVG de `ICON_SIZE` px de côté, construit avec les
 * helpers de la direction artistique, et reprend la couleur de ce qu'elle
 * représente : la pierre est corail comme son rocher, le fer cyan, le
 * charbon indigo. Le HUD les affiche telles quelles (`ui/icons.ts`).
 */

import { PALETTE, RADIUS, circle, cushion, line, pill, polygon, rect, shadedBlock, shadedPill, svg } from './artDirection.ts';
import type { ItemId } from './items.ts';
import { PRESTIGE } from './prestige.ts';

/** Côté d'une icône, dans son propre repère. */
export const ICON_SIZE = 24;

const S = ICON_SIZE;
const { ink, orange, yellow, cyan, mint, toxic, paper, coral, violet } = PALETTE;

export const ITEM_ICONS: Record<ItemId, string> = {
  /** Une bûche orange, sa tranche jaune et ses cernes — comme sur la maquette. */
  wood: svg(
    S,
    S,
    shadedPill(3, 7, 18, 11, 3, 'orange'),
    circle(19, 12, 5, yellow.shade),
    circle(18.6, 11.6, 4.2, yellow.base),
    circle(18.6, 11.6, 1.6, orange.light),
    pill(5, 16.5, 6, 2, orange.shade),
  ),
  /** Un galet corail, la couleur des rochers de pierre. */
  stone: svg(S, S, shadedPill(3, 6, 18, 14, 4, 'coral'), pill(6, 16.5, 4, 1.6, PALETTE.coral.shade)),
  /** Un morceau de charbon indigo, facettes luisantes. */
  coal: svg(
    S,
    S,
    polygon([4, 14, 9, 5, 18, 6, 21, 15, 14, 20, 6, 19], ink.shade),
    polygon([5, 13, 9.5, 5.5, 17.5, 6.5, 19.5, 13.5, 13, 16.5], ink.base),
    polygon([8.5, 8.5, 11, 6.8, 13, 8.2, 10, 10.5], ink.light),
    circle(17, 9.5, 1, yellow.light),
  ),
  /** Un bloc de fer cyan, clouté de pépites claires, comme son rocher. */
  ironOre: svg(
    S,
    S,
    shadedPill(3, 6, 18, 14, 4, 'cyan'),
    circle(9.5, 12.5, 2.4, cyan.shade),
    circle(9, 12, 1.9, cyan.light),
    circle(15.5, 10.5, 1.8, cyan.shade),
    circle(15.1, 10.1, 1.4, cyan.light),
  ),
  /** Un épi de maïs jaune dans ses feuilles menthe. */
  food: svg(
    S,
    S,
    rect(9, 3, 7, 16, yellow.shade, 3.5),
    rect(9, 3, 6, 14, yellow.base, 3),
    pill(10.5, 5, 2.4, 6, yellow.light),
    cushion(8, 17, 8, 6),
    cushion(16.5, 17, 8, 6),
    line(12.5, 21, 12.5, 23, mint.shade),
  ),
  /** Un pilon de viande corail sur son os blanc : le butin d'une chasse. */
  meat: svg(
    S,
    S,
    pill(15, 13, 6, 5, paper.shade),
    pill(15, 12.5, 5, 3.6, paper.base),
    circle(19.5, 17, 2.2, paper.shade),
    circle(19.2, 16.5, 1.7, paper.base),
    shadedPill(3, 3, 14, 13, 6, 'coral'),
    pill(6, 5.5, 5, 2.4, coral.light),
  ),
  /**
   * Une goutte d'eau cyan, pointe en haut — la teinte de l'eau, mais pas la
   * forme du minerai de fer, un bloc trapu clouté : on ne les confond pas.
   */
  water: svg(
    S,
    S,
    polygon([12, 1.5, 18.6, 13, 5.4, 13], cyan.shade),
    circle(12, 15, 7.5, cyan.shade),
    polygon([11.4, 2.8, 17, 12.6, 5.8, 12.6], cyan.base),
    circle(11.4, 14.4, 6.6, cyan.base),
    pill(7.6, 11.5, 2.4, 6, cyan.light),
    circle(14.8, 18.2, 1.3, cyan.light),
  ),
  /** Une plaque de fer cyan, forgée, rivetée d'indigo aux quatre coins. */
  ironPlate: svg(
    S,
    S,
    shadedBlock(3, 5, 18, 15, 4, 'cyan', RADIUS.small),
    circle(6.5, 8.5, 1.3, ink.base),
    circle(17.5, 8.5, 1.3, ink.base),
    circle(6.5, 14, 1.3, ink.base),
    circle(17.5, 14, 1.3, ink.base),
  ),
  /** Une goutte de gelée fluo, tremblotante, qui louche d'un œil : un bout de mutant, drôle plus qu'effrayant. */
  mutantGoo: svg(
    S,
    S,
    pill(3, 11, 18, 11, toxic.shade),
    circle(12, 11, 7.5, toxic.shade),
    pill(3, 11, 18, 8.5, toxic.base),
    circle(11.4, 10.4, 6.8, toxic.base),
    pill(6.5, 5.5, 5, 2.4, toxic.light),
    circle(19.5, 19.5, 1.6, toxic.shade),
    circle(13.5, 12, 2.6, paper.base),
    circle(14.2, 12.5, 1.3, ink.base),
  ),
  /** Un croc blanc, pointe en bas, passé sur un lacet indigo : le trophée d'un loup. */
  wolfFang: svg(
    S,
    S,
    line(4, 4.5, 20, 4.5, ink.base),
    polygon([7, 6, 17, 6, 13.5, 20, 11.5, 21], paper.shade),
    polygon([7, 6, 15.5, 6, 12.5, 18.5, 11, 19], paper.base),
    rect(6, 3, 12, 6, paper.shade, RADIUS.small),
    rect(6, 3, 11, 4.5, paper.base, RADIUS.small),
    pill(9, 8.5, 2, 6, paper.shade),
  ),
  /** Une pince orange, ouverte, comme celles du crabe des ruines. */
  crabClaw: svg(
    S,
    S,
    shadedPill(3, 12, 11, 8, 2.5, 'orange'),
    polygon([10, 8, 21, 4, 19, 10, 12, 13], orange.shade),
    polygon([10, 8, 20, 4.5, 18, 8.5, 11.5, 11.5], orange.base),
    polygon([11, 14, 21, 15, 20, 19, 12, 18], orange.shade),
    polygon([11, 14, 20.5, 15, 19.5, 17.5, 12, 16.8], orange.base),
    pill(12.5, 6.8, 4, 1.6, orange.light),
    circle(6, 16, 1, orange.light),
  ),
  /**
   * Le cœur de la Reine : une bille fluo cerclée d'indigo — un disque plein
   * derrière elle, pas un trait —, reflet en haut à gauche, et le trèfle
   * radioactif en trois points indigo autour d'un quatrième.
   */
  radCore: svg(
    S,
    S,
    circle(12, 12.5, 10.5, ink.base),
    circle(12, 12.5, 8.5, toxic.shade),
    circle(11.4, 11.6, 7.8, toxic.base),
    pill(6.5, 6.5, 5.5, 2.6, toxic.light),
    circle(12, 12.5, 1.6, ink.base),
    circle(12, 8.4, 1.7, ink.base),
    circle(15.6, 14.6, 1.7, ink.base),
    circle(8.4, 14.6, 1.7, ink.base),
  ),
  /** Une goutte d'ambre de la forêt, une feuille menthe prise dedans. */
  amber: svg(
    S,
    S,
    circle(12, 14, 8.5, orange.base),
    circle(11.4, 13.2, 7.6, yellow.shade),
    polygon([12, 2.5, 18, 10, 6, 10], yellow.shade),
    pill(10.5, 10, 6, 3, mint.shade),
    pill(10.5, 10, 5, 2, mint.base),
    pill(7, 9.5, 2.4, 5, yellow.light),
  ),
  /** Un coquillage cyan de la côte, sa perle blanche au creux. */
  pearl: svg(
    S,
    S,
    polygon([12, 21, 3, 9, 21, 9], cyan.shade),
    circle(12, 9, 9, cyan.shade),
    circle(11.4, 8.4, 8.2, cyan.base),
    pill(6, 4.5, 6, 2.4, cyan.light),
    circle(12.5, 13.5, 3.6, paper.shade),
    circle(12, 13, 3, paper.base),
  ),
  /** Trois prismes de quartz violet, sortis de la montagne. */
  quartz: svg(
    S,
    S,
    rect(3, 9, 6, 12, violet.shade, RADIUS.small),
    rect(15, 7, 6, 14, violet.shade, RADIUS.small),
    rect(9, 3, 7, 18, violet.shade, RADIUS.small),
    rect(9, 3, 6, 16, violet.base, RADIUS.small),
    rect(3, 9, 5, 10, violet.base, RADIUS.small),
    rect(15, 7, 5, 12, violet.base, RADIUS.small),
    pill(10.5, 5, 2, 8, violet.light),
  ),
  /** Un champignon des terres polluées : chapeau violet tacheté de jaune, pied blanc. */
  spore: svg(
    S,
    S,
    rect(9, 11, 6, 10, paper.shade, RADIUS.small),
    rect(9, 11, 5, 9, paper.base, RADIUS.small),
    pill(2, 5, 20, 9, violet.shade),
    pill(2, 4, 19, 8, violet.base),
    pill(5, 5, 5, 2, violet.light),
    circle(14, 7, 1.6, yellow.base),
    circle(9, 9, 1.3, yellow.base),
    circle(18, 9.5, 1.1, yellow.base),
  ),
};

/** Les sommets d'une étoile à cinq branches, pointe en haut. */
function star(cx: number, cy: number, outer: number, inner: number): number[] {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;

    return [Math.round((cx + r * Math.cos(angle)) * 10) / 10, Math.round((cy + r * Math.sin(angle)) * 10) / 10];
  }).flat();
}

/**
 * Le Prestige (`data/prestige.ts`) : une médaille jaune de la colonie à son
 * ruban corail, une étoile claire gravée au milieu. Pas un objet du sac,
 * donc hors de `ITEM_ICONS`.
 */
export const PRESTIGE_ICON = svg(
  S,
  S,
  polygon([6, 1.5, 10.5, 1.5, 13, 10, 8.5, 10], PALETTE.coral.shade),
  polygon([13.5, 1.5, 18, 1.5, 15.5, 10, 11, 10], PALETTE.coral.base),
  circle(12, 15.5, 7.5, PALETTE[PRESTIGE.tone].shade),
  circle(11.5, 15, 6.8, PALETTE[PRESTIGE.tone].base),
  polygon(star(11.5, 15.3, 4.6, 2), PALETTE[PRESTIGE.tone].light),
  pill(6.2, 10.6, 3.6, 1.8, PALETTE[PRESTIGE.tone].light),
);
