/**
 * Talents d'Adam — contenu pur.
 *
 * À chaque niveau passé, Adam choisit un **talent** parmi trois, tirés de la
 * seed et du niveau (`sim/talents.ts`, commande `chooseTalent`). Un talent
 * est un modificateur additif sur une statistique de la recherche, lu par
 * l'unique `World.bonus(stat)` : il se cumule avec le labo, les outils et les
 * faveurs sans autre logique. Les points de vie max par niveau, eux, restent
 * fixes (`LEVEL_GAINS.maxHp`).
 *
 * Un talent se reprend jusqu'à `max` fois : la somme des `max` dépasse les
 * niveaux à gagner, pour qu'il reste toujours trois cartes à proposer
 * (`validatePrototypes()`). Ajouter un talent = ajouter une entrée.
 */

import type { BoonIcon } from './boons.ts';
import type { ResearchStat } from './research.ts';

export interface TalentProto {
  label: string;
  /** Une ligne sur sa carte : ce qu'il fait, dit au joueur. */
  description: string;
  icon: BoonIcon;
  effect: { stat: ResearchStat; amount: number };
  /** Combien de fois on peut le prendre. */
  max: number;
}

export const TALENTS = {
  piercingArrows: {
    label: 'Flèches perçantes',
    description: 'Chaque flèche d’Adam fait 0,25 dégât de plus.',
    icon: { ui: 'recenter' },
    effect: { stat: 'bowDamage', amount: 0.25 },
    max: 4,
  },
  quickDraw: {
    label: 'Tir vif',
    description: 'Adam décoche 0,1 s plus tôt entre deux flèches.',
    icon: { ui: 'gauge' },
    effect: { stat: 'bowCooldown', amount: -2 },
    max: 3,
  },
  deepPockets: {
    label: 'Poches profondes',
    description: 'Le sac prend 15 objets de plus.',
    icon: { ui: 'bag' },
    effect: { stat: 'bagCapacity', amount: 15 },
    max: 3,
  },
  greenThumb: {
    label: 'Main verte',
    description: 'Une unité de bois de plus à chaque récolte sur un arbre.',
    icon: { ui: 'tree' },
    effect: { stat: 'woodYield', amount: 1 },
    max: 3,
  },
  stoneHand: {
    label: 'Poigne de carrier',
    description: 'Une unité de plus à chaque récolte sur un rocher.',
    icon: { item: 'stone' },
    effect: { stat: 'oreYield', amount: 1 },
    max: 3,
  },
  foreman: {
    label: 'Contremaître',
    description: 'Les bâtisseurs bâtissent les chantiers 20 % plus vite.',
    icon: { ui: 'toil' },
    effect: { stat: 'buildSpeed', amount: 0.2 },
    max: 4,
  },
  medic: {
    label: 'Infirmier',
    description: 'Au calme, Adam reprend ses PV 50 % plus vite.',
    icon: { ui: 'heart' },
    effect: { stat: 'hpRegen', amount: 0.5 },
    max: 4,
  },
  fleetFoot: {
    label: 'Pas léger',
    description: 'Adam marche 0,4 case par seconde plus vite.',
    icon: { ui: 'hasten' },
    effect: { stat: 'walkSpeed', amount: 0.4 },
    max: 3,
  },
  quartermaster: {
    label: 'Intendant',
    description: 'Les porteurs prennent un objet de plus par voyage.',
    icon: { ui: 'worker' },
    effect: { stat: 'porterCarry', amount: 1 },
    max: 2,
  },
} as const satisfies Record<string, TalentProto>;

export type TalentId = keyof typeof TALENTS;

export const TALENT_IDS = Object.keys(TALENTS) as TalentId[];

export const TALENT_OFFER = {
  /** Talents proposés à chaque niveau. */
  choices: 3,
  /**
   * Ce que reçoit, dans cet ordre et en boucle, une sauvegarde d'avant les
   * talents pour chaque niveau déjà passé : d'abord l'ancien gain (les dégâts
   * de l'arc), puis des talents de confort.
   */
  defaults: ['piercingArrows', 'deepPockets', 'medic', 'greenThumb'],
} as const satisfies { choices: number; defaults: readonly TalentId[] };
