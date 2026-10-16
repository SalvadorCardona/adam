/**
 * Faveurs de l'aube — contenu pur.
 *
 * Chaque nuit tenue, l'aube apporte un petit choix : trois **faveurs**
 * tirées de la seed et de la nuit (`sim/boons.ts`), le joueur en prend une
 * (commande `chooseBoon`). Une faveur est soit un **colis** — des objets
 * versés en ville —, soit un **coup de pouce** : un modificateur additif sur
 * une statistique de la recherche, lu par `World.bonus(stat)`, le temps
 * d'une journée (`BOON_OFFER.durationTicks`). Le choix attend jusqu'à l'aube
 * suivante, qui le remplace.
 *
 * Des faveurs de confort : elles donnent un rythme à la journée et une
 * petite décision à prendre, jamais une vague gagnée d'avance. Ajouter une
 * faveur = ajouter une entrée, tant qu'elle se dit avec les effets existants.
 */

import type { UiIcon } from '../art/ui.ts';
import { DAY_CYCLE } from './dayNight.ts';
import type { ItemId } from './items.ts';
import type { ResearchStat } from './research.ts';

/** Ce que fait une faveur : des objets en ville, ou un modificateur pour la journée. */
export type BoonEffect = { kind: 'items'; items: Partial<Record<ItemId, number>> } | { kind: 'stat'; stat: ResearchStat; amount: number };

/** L'icône d'une faveur : celle d'un objet, ou un pictogramme de `art/ui.ts`. */
export type BoonIcon = { item: ItemId } | { ui: UiIcon };

export interface BoonProto {
  label: string;
  /** Une ligne sur sa carte : ce qu'elle fait, dit au joueur. */
  description: string;
  icon: BoonIcon;
  effect: BoonEffect;
}

export const BOONS = {
  coffee: {
    label: 'Café d’Ève',
    description: 'Les habitants trottent : 30 % plus vite jusqu’à la nuit.',
    icon: { ui: 'move' },
    effect: { kind: 'stat', stat: 'workerSpeed', amount: 0.3 },
  },
  workSongs: {
    label: 'Chants de chantier',
    description: 'Tout le monde travaille 40 % plus vite jusqu’à la nuit.',
    icon: { ui: 'toil' },
    effect: { kind: 'stat', stat: 'workSpeed', amount: 0.4 },
  },
  sharpAxe: {
    label: 'Hache affûtée',
    description: 'Chaque coup de hache rapporte le double de bois jusqu’à la nuit.',
    icon: { ui: 'axe' },
    effect: { kind: 'stat', stat: 'woodYield', amount: 1 },
  },
  sneakers: {
    label: 'Baskets neuves',
    description: 'Adam court plus vite jusqu’à la nuit.',
    icon: { ui: 'direction' },
    effect: { kind: 'stat', stat: 'walkSpeed', amount: 1.2 },
  },
  goodBreakfast: {
    label: 'Bon petit-déjeuner',
    description: 'La faim creuse moitié moins vite jusqu’à la nuit.',
    icon: { item: 'food' },
    effect: { kind: 'stat', stat: 'hungerResist', amount: 0.5 },
  },
  scrapCrate: {
    label: 'Caisse de récup',
    description: 'Une caisse laissée devant la mairie : 25 bois et 15 pierres.',
    icon: { item: 'wood' },
    effect: { kind: 'items', items: { wood: 25, stone: 15 } },
  },
  picnic: {
    label: 'Pique-nique',
    description: 'Un panier oublié : 15 nourritures et 15 eaux en ville.',
    icon: { item: 'water' },
    effect: { kind: 'items', items: { food: 15, water: 15 } },
  },
  oreCart: {
    label: 'Wagonnet de minerai',
    description: 'Un wagonnet renversé : 10 minerais de fer et 8 charbons.',
    icon: { item: 'ironOre' },
    effect: { kind: 'items', items: { ironOre: 10, coal: 8 } },
  },
} as const satisfies Record<string, BoonProto>;

export type BoonId = keyof typeof BOONS;

export const BOON_IDS = Object.keys(BOONS) as BoonId[];

export const BOON_OFFER = {
  /** Faveurs proposées à chaque aube. */
  choices: 3,
  /** Un coup de pouce dure une journée : de l'aube au crépuscule. */
  durationTicks: DAY_CYCLE.day,
} as const;
