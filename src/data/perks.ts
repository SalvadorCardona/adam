/**
 * Bonus du jardin des souvenirs — contenu pur.
 *
 * Chaque colonie tombée laisse des **graines** ; sur l'écran titre, on les
 * plante pour débloquer des bonus **permanents et modestes**, appliqués au
 * début de chaque nouvelle partie. Des bonus de confort : ils font gagner
 * les premières minutes, jamais une vague. Si la difficulté s'effondre au
 * bout de cinq parties, c'est ici qu'il faut baisser les chiffres.
 *
 * Un bonus n'a aucune mécanique propre : son effet est de la donnée, que la
 * simulation lit (`sim/world.ts`). Ajouter un bonus = ajouter une entrée,
 * tant qu'il se dit avec les effets existants.
 */

import type { UiIcon } from '../art/ui.ts';
import type { BuildingId } from './buildings.ts';
import type { ItemId } from './items.ts';
import type { ResourceId } from './resources.ts';

/** Ce que fait un bonus. Tous les champs sont facultatifs et se cumulent entre bonus. */
export interface PerkEffect {
  /** Places en plus dans le sac d'Adam. */
  bag?: number;
  /** Ce qu'Adam a dans le sac en partant. */
  start?: Partial<Record<ItemId, number>>;
  /** Le premier chantier de ce bâtiment arrive livré : il ne reste qu'à appuyer sur « Construire ». */
  freeSite?: BuildingId;
  /** Récolte plus rapide : 0.1 = 10 % plus vite sur cette ressource. */
  harvestSpeed?: Partial<Record<ResourceId, number>>;
}

/** L'icône d'un bonus : celle d'un objet, d'un bâtiment, ou un pictogramme de `art/ui.ts`. */
export type PerkIcon = { item: ItemId } | { building: BuildingId } | { ui: UiIcon };

export interface PerkProto {
  label: string;
  /** Une ligne, affichée dans le jardin. */
  description: string;
  /** Graines à planter pour le débloquer. */
  cost: number;
  icon: PerkIcon;
  effect: PerkEffect;
}

export const PERKS = {
  woodStart: {
    label: 'Fagot de départ',
    description: 'Adam part avec 10 bois dans le sac.',
    cost: 4,
    icon: { item: 'wood' },
    effect: { start: { wood: 10 } },
  },
  stoneStart: {
    label: 'Pierres de départ',
    description: 'Adam part avec 6 pierres dans le sac.',
    cost: 5,
    icon: { item: 'stone' },
    effect: { start: { stone: 6 } },
  },
  bigBag: {
    label: 'Grand sac',
    description: 'Le sac d’Adam contient 10 objets de plus.',
    cost: 8,
    icon: { ui: 'bag' },
    effect: { bag: 10 },
  },
  sharpAxe: {
    label: 'Hache affûtée',
    description: 'Les arbres se coupent 10 % plus vite.',
    cost: 10,
    icon: { ui: 'axe' },
    effect: { harvestSpeed: { tree: 0.1 } },
  },
  freeTower: {
    label: 'Tour offerte',
    description: 'Le premier chantier de tour de guet arrive livré.',
    cost: 14,
    icon: { building: 'watchtower' },
    effect: { freeSite: 'watchtower' },
  },
} as const satisfies Record<string, PerkProto>;

export type PerkId = keyof typeof PERKS;

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

export function isPerkId(value: string): value is PerkId {
  return Object.hasOwn(PERKS, value);
}

/**
 * Le barème des graines laissées par une colonie. Une défaite en rapporte
 * toujours au moins `base` : même la pire partie fait un pas en avant.
 */
export const SEED_REWARDS = {
  base: 1,
  /** Par vague repoussée. */
  perWave: 2,
  /** Par enfant né à la nurserie et encore là. */
  perChild: 3,
  /** Par bâtiment fini, mairie comprise. */
  perBuilding: 1,
  /** Par base mutante abattue : une région conquise. */
  perBase: 4,
  /** Par tranche de `populationStep` habitants. */
  perPopulationStep: 1,
  populationStep: 3,
  /** Par tranche de `minutesStep` minutes de jeu, jusqu'à `maxTimeSeeds`. */
  perMinutesStep: 1,
  minutesStep: 10,
  maxTimeSeeds: 6,
  /** Fonder une nouvelle colonie après le Signal : l'ère atteinte, une fois. */
  victory: 10,
} as const;

/** Le bilan d'une colonie, tel que le barème le lit. */
export interface ColonyScore {
  waves: number;
  children: number;
  buildings: number;
  /** Bases mutantes abattues. */
  bases: number;
  /** Habitants : ouvriers, enfants, porteurs. */
  population: number;
  /** Minutes de jeu écoulées. */
  minutes: number;
  /** Le Signal a été envoyé : l'ère finale est atteinte. */
  victory: boolean;
}

export function seedsFor(score: ColonyScore): number {
  const { waves, children, buildings, bases, population, minutes, victory } = score;
  const time = Math.min(SEED_REWARDS.maxTimeSeeds, Math.floor(minutes / SEED_REWARDS.minutesStep) * SEED_REWARDS.perMinutesStep);

  return (
    SEED_REWARDS.base +
    SEED_REWARDS.perWave * waves +
    SEED_REWARDS.perChild * children +
    SEED_REWARDS.perBuilding * buildings +
    SEED_REWARDS.perBase * bases +
    SEED_REWARDS.perPopulationStep * Math.floor(population / SEED_REWARDS.populationStep) +
    time +
    (victory ? SEED_REWARDS.victory : 0)
  );
}

/* --------------------------------------------------- effets cumulés, purs */

/** Places en plus dans le sac. */
export function bagBonus(perks: readonly PerkId[]): number {
  return perks.reduce((sum, id) => sum + (effectOf(id).bag ?? 0), 0);
}

/** Ce qu'Adam a dans le sac en partant, tous bonus confondus. */
export function startingItems(perks: readonly PerkId[]): Partial<Record<ItemId, number>> {
  const items: Partial<Record<ItemId, number>> = {};

  for (const id of perks) {
    for (const [item, amount] of Object.entries(effectOf(id).start ?? {}) as [ItemId, number][]) {
      items[item] = (items[item] ?? 0) + amount;
    }
  }
  return items;
}

/** Les chantiers offerts, un par bonus. */
export function freeSites(perks: readonly PerkId[]): BuildingId[] {
  return perks.flatMap((id) => effectOf(id).freeSite ?? []);
}

/**
 * Unités qu'un nœud donne au passage de récolte n° `pass`, bonus compris.
 * Le surplus fractionnaire tombe en unités entières, réparties sur les
 * passages : à 10 % plus vite, un passage sur dix donne une unité de plus.
 * Sans état, tiré du seul numéro de passage : la partie reste rejouable.
 */
export function harvestYieldWith(perks: readonly PerkId[], resource: ResourceId, units: number, pass: number): number {
  const speed = perks.reduce((sum, id) => sum + (effectOf(id).harvestSpeed?.[resource] ?? 0), 0);
  const bonus = units * speed;

  return units + Math.floor((pass + 1) * bonus) - Math.floor(pass * bonus);
}

function effectOf(id: PerkId): PerkEffect {
  return PERKS[id].effect;
}
