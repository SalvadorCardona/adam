/**
 * Les traits des habitants — contenu pur.
 *
 * Chaque ouvrier a un trait, un seul, tiré de la seed et de son id à sa venue
 * (`traitOf`, `sim/inhabitants.ts`) et gardé en changeant de métier. Un enfant
 * né à la nurserie hérite parfois de celui d'un adulte de la colonie
 * (`TRAIT_INHERIT`). Un trait pèse peu : un petit effet de jeu, lu en un seul
 * point chacun (l'allure, la vitesse des jauges, le poids de la peur).
 *
 * L'humeur, elle, est le bonheur (`data/housing.ts`) : ce qui la fait bouger
 * (nourriture, eau, lit, danger) est dans `MOOD`.
 */

import type { NeedId } from './needs.ts';

export interface TraitProto {
  /** Allure de travail, en part de la normale (1 : rien). */
  pace: number;
  /** Vitesse à laquelle chaque jauge baisse, en part de la normale ; absente : 1. */
  drain?: Partial<Record<NeedId, number>>;
  /** Poids de la peur : multiplie ce que le danger coûte au moral. */
  fear: number;
}

export const TRAITS = {
  /** Travailleur : plus vif à la tâche. */
  hardworking: { pace: 1.1, fear: 1 },
  /** Gourmand : la faim vient plus vite, mais le ventre plein, il a du cœur à l'ouvrage. */
  glutton: { pace: 1.05, drain: { hunger: 1.4 }, fear: 1 },
  /** Peureux : le danger lui pèse deux fois plus. */
  fearful: { pace: 1, fear: 2 },
  /** Costaud : tient plus longtemps sans manger ni boire, et le danger l'ébranle peu. */
  sturdy: { pace: 1, drain: { hunger: 0.75, thirst: 0.75 }, fear: 0.5 },
  /** Rêveur : un peu lent, la tête ailleurs — le danger l'effleure à peine. */
  dreamer: { pace: 0.92, fear: 0.5 },
} as const satisfies Record<string, TraitProto>;

export type TraitId = keyof typeof TRAITS;

export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

/** L'hérédité : un enfant né à la nurserie a cette chance de prendre le trait d'un adulte de la colonie. */
export const TRAIT_INHERIT = 0.4;

/** Combien de petites biographies chaque trait compte dans le dictionnaire (`t().panel.creature.bios`). */
export const BIO_COUNT = 3;

/**
 * Les bulles de réaction : rares, pour ne pas encombrer la carte. La faim et
 * la soif ont les leurs (`data/needs.ts`) ; ces trois-là sont brèves.
 */
export const REACTIONS = {
  /** Un ennemi à moins de tant de tuiles fait peur. */
  fearTiles: 6,
  /** La peur dure au moins tant de ticks après avoir vu l'ennemi. */
  fearTicks: 60,
  /** Après une naissance, la joie dure tant de ticks... */
  joyTicks: 80,
  /** ... et ne gagne qu'un ouvrier sur tant : une fête, pas une foule. */
  joyOneIn: 3,
  /** La nuit, un ouvrier au travail bâille tant de ticks... */
  sleepyTicks: 80,
  /** ... une fois toutes les tant de ticks, à son tour (décalé par son id). */
  sleepyEvery: 600,
} as const;

export type ReactionId = 'scared' | 'joyful' | 'sleepy';
