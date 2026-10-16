/**
 * Les nuits d'étoiles filantes — contenu pur.
 *
 * Certaines nuits (tirées de la seed et du numéro de la nuit, `sim/starfall.ts`),
 * des étoiles tombent autour de la mairie : chacune laisse au sol un éclat —
 * du minerai, du charbon, parfois une plaque de fer — qu'Adam ramasse en
 * marchant dessus, comme un butin. La vague reste la même : c'est une raison
 * de sortir une fois les mutants abattus, plutôt que d'attendre l'aube.
 * Ève l'annonce au crépuscule.
 */

import type { ItemId } from './items.ts';

export interface StarLoot {
  item: ItemId;
  amount: number;
  /** Poids du tirage. */
  weight: number;
}

export const STARFALL = {
  /** Pas de pluie d'étoiles avant cette nuit : les premières sont pour apprendre. */
  fromNight: 2,
  /** Part des nuits qui en ont une. */
  chance: 0.35,
  /** Une étoile toutes les `everyTicks` de la nuit, après `delayTicks`. */
  everyTicks: 20 * 7,
  delayTicks: 20 * 10,
  /** Elles tombent dans cet anneau autour de la mairie, en tuiles, sur une case explorée où l'on marche. */
  minTiles: 5,
  maxTiles: 15,
  loot: [
    { item: 'ironOre', amount: 3, weight: 5 },
    { item: 'coal', amount: 3, weight: 4 },
    { item: 'stone', amount: 4, weight: 3 },
    { item: 'ironPlate', amount: 1, weight: 1 },
  ],
} as const satisfies {
  fromNight: number;
  chance: number;
  everyTicks: number;
  delayTicks: number;
  minTiles: number;
  maxTiles: number;
  loot: readonly StarLoot[];
};
