/**
 * Les besoins des habitants — contenu pur : la faim et la soif.
 *
 * Chaque ouvrier, bûcheron et enfant porte une jauge par besoin, de 1
 * (comblé) à 0 (à bout). Elle baisse avec le temps de jeu, plus vite au
 * travail qu'au repos. Sous `seekBelow`, il interrompt sa tâche et va
 * consommer `item` au stock de la ville — à la mairie —, puis la reprend.
 * Sans rien à consommer, il passe sous `weakBelow` et travaille au ralenti ;
 * à zéro, il s'arrête (`stopsWork`) et le compte à rebours de la mort
 * démarre (`deathTicks`) : un ouvrier qui reste à zéro ce délai meurt, la
 * ville en moins d'un ouvrier. Le moindre repas le remet à zéro. Un enfant
 * qui manque ne grandit pas (`blocksGrowth`) et ne meurt pas.
 *
 * La soif est la faim en plus pressé : l'eau du puits, une jauge qui baisse
 * deux fois plus vite. Un besoin de plus est une entrée de plus dans
 * `NEEDS` : la jauge, le trajet, l'allure, la bulle et l'infobulle suivent.
 */

import type { ItemId } from './items.ts';

export interface NeedProto {
  /** Ce qui le comble, pris au stock de la ville. */
  item: ItemId;
  /** Unités consommées à chaque passage à la mairie : la jauge remonte à 1. */
  meal: number;
  /** Ticks pour vider une jauge pleine, au repos — un enfant, un ouvrier qui flâne ou dort. */
  restTicks: number;
  /** Ticks pour vider une jauge pleine, au travail. */
  workTicks: number;
  /** Sous ce niveau, il « a faim » : il va consommer s'il y a de quoi. */
  seekBelow: number;
  /** Sous ce niveau, il est « affamé » : il travaille au ralenti. */
  weakBelow: number;
  /** Allure d'un affamé, en part de son allure normale — et celle qui le traîne jusqu'à la mairie. */
  weakPace: number;
  /** Vrai : à zéro, il s'arrête — ni travail ni flânerie, jusqu'à ce qu'il ait de quoi. */
  stopsWork: boolean;
  /** Vrai : un enfant qui manque ne prend pas d'année à l'aube. */
  blocksGrowth: boolean;
  /** Ticks passés à zéro avant que l'ouvrier en meure ; la jauge remontée, le compte repart de rien. */
  deathTicks: number;
}

export const NEEDS = {
  hunger: {
    item: 'food',
    meal: 1,
    // Dix minutes au repos, cinq au travail : un repas toutes les trois minutes pour un porteur.
    restTicks: 20 * 60 * 10,
    workTicks: 20 * 60 * 5,
    seekBelow: 0.4,
    weakBelow: 0.15,
    weakPace: 0.5,
    stopsWork: true,
    blocksGrowth: true,
    // Trois minutes à jeun après la dernière miette : le temps de semer, de chasser ou de faire venir un convoi.
    deathTicks: 20 * 60 * 3,
  },
  thirst: {
    item: 'water',
    meal: 1,
    // Cinq minutes au repos, deux et demie au travail : un porteur boit toutes les minutes et demie.
    restTicks: 20 * 60 * 5,
    workTicks: 20 * 60 * 2.5,
    seekBelow: 0.4,
    weakBelow: 0.15,
    weakPace: 0.5,
    stopsWork: true,
    blocksGrowth: true,
    // Une minute et demie sans une goutte : la soif tue plus vite que la faim.
    deathTicks: 20 * 90,
  },
} as const satisfies Record<string, NeedProto>;

export type NeedId = keyof typeof NEEDS;

/**
 * La chasse : la nourriture se chasse, ou se cultive à la ferme (`farm`,
 * qui rapporte la sienne à son coffre). Les bêtes
 * sauvages (`WILDLIFE`) lâchent de la viande ; déposée à la mairie, elle y
 * devient de la nourriture, `foodPerMeat` pour une, à la cadence de
 * `convertTicks`. Les bêtes reviennent avec leur tanière (`respawnTicks`) :
 * la viande ne s'épuise pas pour de bon.
 */
export const HUNTING = {
  meat: 'meat',
  food: 'food',
  foodPerMeat: 2,
  /** Ticks entre deux conversions : une seconde. */
  convertTicks: 20,
} as const satisfies { meat: ItemId; food: ItemId; foodPerMeat: number; convertTicks: number };

export const NEED_IDS = Object.keys(NEEDS) as NeedId[];

/**
 * L'alerte du HUD : la ville « va manquer » d'un objet qu'un besoin
 * consomme quand, au rythme des habitants, son stock ne tient pas
 * `runwayTicks` — ou dès que quelqu'un a faim (ou soif) sans rien en ville.
 */
export const NEED_ALERT = {
  runwayTicks: 20 * 60 * 2,
} as const;
