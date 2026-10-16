/**
 * Défis du jour — contenu pur.
 *
 * Entre deux chapitres, un petit but qui change chaque jour : de l'aube à
 * l'aube suivante (la nuit comprise), un défi tiré de la seed et du jour
 * (`sim/challenges.ts`). Réussi, il paie aussitôt sa récompense — des objets
 * en ville et du Prestige — et laisse sa coche jusqu'au lendemain. Raté, il
 * s'efface à l'aube : rien n'est perdu, un autre arrive.
 *
 * Un défi compte une **statistique** de la journée :
 * - `harvest` : ce qu'Adam récolte de cet objet ;
 * - `deliver` : ce qu'Adam livre aux chantiers, du sac ou de la ville ;
 * - `build` : les bâtiments achevés ;
 * - `kills` : les ennemis abattus, mutants et bêtes ;
 * - `explore` : les cases du brouillard découvertes.
 */

import type { UiIcon } from '../art/ui.ts';
import type { ItemId } from './items.ts';

export type ChallengeGoal =
  | { stat: 'harvest'; item: ItemId; count: number }
  | { stat: 'deliver'; count: number }
  | { stat: 'build'; count: number }
  | { stat: 'kills'; count: number }
  | { stat: 'explore'; count: number };

export type ChallengeStat = ChallengeGoal['stat'];

/** L'icône d'un défi : celle d'un objet, ou un pictogramme de `art/ui.ts`. */
export type ChallengeIcon = { item: ItemId } | { ui: UiIcon };

export interface ChallengeProto {
  label: string;
  icon: ChallengeIcon;
  goal: ChallengeGoal;
  /** Versé en ville (ou dans le sac sans mairie) à la réussite. */
  reward: Partial<Record<ItemId, number>>;
  /** Le Prestige de la réussite. */
  prestige: number;
}

export const CHALLENGES = {
  woodcutter: {
    label: 'Récolter 40 bois',
    icon: { item: 'wood' },
    goal: { stat: 'harvest', item: 'wood', count: 40 },
    reward: { food: 6, water: 6 },
    prestige: 4,
  },
  stonecutter: {
    label: 'Récolter 30 pierres',
    icon: { item: 'stone' },
    goal: { stat: 'harvest', item: 'stone', count: 30 },
    reward: { wood: 15 },
    prestige: 4,
  },
  miner: {
    label: 'Récolter 12 minerais de fer',
    icon: { item: 'ironOre' },
    goal: { stat: 'harvest', item: 'ironOre', count: 12 },
    reward: { coal: 6, stone: 10 },
    prestige: 5,
  },
  courier: {
    label: 'Livrer 30 objets aux chantiers',
    icon: { ui: 'hammer' },
    goal: { stat: 'deliver', count: 30 },
    reward: { wood: 10, stone: 10 },
    prestige: 5,
  },
  builder: {
    label: 'Achever 2 bâtiments',
    icon: { ui: 'hammer' },
    goal: { stat: 'build', count: 2 },
    reward: { wood: 12, stone: 8 },
    prestige: 6,
  },
  hunter: {
    label: 'Abattre 4 ennemis',
    icon: { ui: 'mutant' },
    goal: { stat: 'kills', count: 4 },
    reward: { food: 8, wood: 8 },
    prestige: 6,
  },
  scout: {
    label: 'Découvrir 250 cases',
    icon: { ui: 'map' },
    goal: { stat: 'explore', count: 250 },
    reward: { food: 5, water: 5, stone: 5 },
    prestige: 5,
  },
} as const satisfies Record<string, ChallengeProto>;

export type ChallengeId = keyof typeof CHALLENGES;

export const CHALLENGE_IDS = Object.keys(CHALLENGES) as ChallengeId[];

/**
 * La série : chaque défi réussi au lendemain d'un autre rapporte
 * `prestigePerDay` de Prestige de plus par jour d'affilée, jusqu'à `max`
 * jours. Un jour raté la remet à zéro.
 */
export const CHALLENGE_STREAK = {
  prestigePerDay: 2,
  max: 5,
} as const;
