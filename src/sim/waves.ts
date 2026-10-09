/**
 * La planification des vagues : ce qu'une nuit enverra, et quand on le dit.
 *
 * Fonctions pures. Le monde (`World.waveForecast`) les assemble : l'effectif
 * que les bases auront à la tombée de la nuit (`projectedRaiders` — leur
 * production est déterministe, on peut la dérouler d'avance), les chefs de la
 * nuit (`nightBosses`) et les renforts que valent l'ère et la taille de la
 * ville (`reinforcements`, `WAVE_STRENGTH`). La prime d'une vague repoussée
 * (`waveBounty`) se lit dans la nuit, sans état.
 */

import { WAVE_BOUNTY, WAVE_STRENGTH, isBossNight } from '../data/enemies.ts';
import { raidCapacity, raidTicks, isStanding } from './enemyBases.ts';
import type { ItemId } from '../data/items.ts';
import { OBJECTIVES } from '../data/objectives.ts';
import type { EnemyBase } from './types.ts';

/** L'objectif qui clôt l'acte I : celui qui porte un bandeau. Le franchir ouvre la deuxième ère. */
const ACT_ONE = OBJECTIVES.findIndex((objective) => 'banner' in objective);

/**
 * L'ère de la colonie : 0 pendant l'acte I, 1 une fois l'acte I terminé, 2
 * après le Signal. `objective` est le nombre d'objectifs réussis.
 */
export function eraOf(objective: number, signalSent: boolean): number {
  return (ACT_ONE >= 0 && objective > ACT_ONE ? 1 : 0) + (signalSent ? 1 : 0);
}

/**
 * Les renforts d'une vague : `perEra` par ère, un tous les
 * `buildingsPerRaider` bâtiments au-delà de `freeBuildings`, au plus
 * `maxReinforcements`.
 */
export function reinforcements(era: number, buildings: number): number {
  const { perEra, freeBuildings, buildingsPerRaider, maxReinforcements } = WAVE_STRENGTH;
  const town = Math.floor(Math.max(0, buildings - freeBuildings) / buildingsPerRaider);

  return Math.min(maxReinforcements, Math.max(0, era) * perEra + town);
}

/**
 * Les assaillants qu'aura une base à la tombée de la nuit `night`, s'il lui
 * reste `dayTicks` ticks de jour pour produire : le déroulé exact de `breed`,
 * qui avance son compte d'un tick par tick tant qu'elle n'est pas pleine.
 */
export function projectedRaiders(base: EnemyBase, night: number, dayTicks: number): number {
  if (!isStanding(base)) return 0;

  const capacity = raidCapacity(base.level, night);

  if (base.raiders >= capacity) return base.raiders;
  return Math.min(capacity, base.raiders + Math.floor((base.brood + Math.max(0, dayTicks)) / raidTicks(base.level, night)));
}

/** La prime de la vague repoussée la nuit `night` : `WAVE_BOUNTY.items` qui grandit avec les nuits, et `boss` une nuit de chef. */
export function waveBounty(night: number): [ItemId, number][] {
  const scale = 1 + WAVE_BOUNTY.perNight * Math.max(0, night - 1);
  const bounty = new Map<ItemId, number>();

  for (const [item, amount] of Object.entries(WAVE_BOUNTY.items) as [ItemId, number][]) bounty.set(item, Math.round(amount * scale));
  if (isBossNight(night)) {
    for (const [item, amount] of Object.entries(WAVE_BOUNTY.boss) as [ItemId, number][]) bounty.set(item, (bounty.get(item) ?? 0) + amount);
  }
  return [...bounty];
}
