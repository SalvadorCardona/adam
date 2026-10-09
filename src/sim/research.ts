/**
 * La recherche : ce qui est fini, ce qui tourne, et les modificateurs.
 *
 * Tout ici est pur — des fonctions de l'état, sans rien modifier. `World`
 * garde l'état (`researchDone`, le labo et sa recherche en cours) et lit les
 * effets à un seul endroit, `World.bonus(stat)`, qui renvoie
 * `researchBonus()` : l'arc, le sac, la marche et les PV d'Adam, l'allure,
 * la cadence, la faim et la soif des habitants, les porteurs, la récolte, les
 * foreuses, la dépollution et les fermes le consultent au moment d'agir. Une
 * recherche qui débloque des bâtiments (`unlocks`) est lue par
 * `World.isUnlocked` ; celle qui en ouvre (`opens`) les range, finie, dans
 * `World.openBuildings`. Les données
 * (`WEAPONS`, `PORTERS`, `RECIPES`…) ne sont jamais réécrites : une
 * recherche finie ne change que ce qu'on ajoute à leur valeur.
 */

import type { BuildingId } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import { PURIFIER } from '../data/contamination.ts';
import { PRODUCTION } from '../data/production.ts';
import { RECIPES } from '../data/recipes.ts';
import { CROPS } from '../data/resources.ts';
import { RESEARCH, RESEARCH_IDS, type ResearchId, type ResearchStat } from '../data/research.ts';
import { WEAPONS } from '../data/weapons.ts';
import { PORTERS } from '../data/workers.ts';
import { INVENTORY_CAPACITY, PLAYER_MAX_HP, PLAYER_SPEED_TILES } from './player.ts';
import type { Lab } from './types.ts';

/** La valeur de chaque statistique sans aucune recherche : celle des données. */
export const STAT_BASE: Readonly<Record<ResearchStat, number>> = {
  bowDamage: WEAPONS.bow.damage,
  bowCooldown: WEAPONS.bow.cooldown,
  bagCapacity: INVENTORY_CAPACITY,
  walkSpeed: PLAYER_SPEED_TILES,
  maxHp: PLAYER_MAX_HP,
  porterCarry: PORTERS.carry,
  workerSpeed: 0,
  workSpeed: 0,
  hungerResist: 0,
  thirstResist: 0,
  woodYield: 0,
  drillTicks: RECIPES.mineOre.duration,
  purifyTicks: PURIFIER.intervalTicks,
  farmYield: CROPS.yield,
};

/** Ce que les recherches finies ajoutent à la statistique. */
export function researchBonus(done: readonly ResearchId[], stat: ResearchStat): number {
  let bonus = 0;

  for (const id of done) {
    const { effect } = RESEARCH[id];

    if (effect?.stat === stat) bonus += effect.amount;
  }
  return bonus;
}

/** La recherche qui débloque ce bâtiment, ou `null` s'il ne s'obtient pas au labo. */
export function unlockingResearch(building: BuildingId): ResearchId | null {
  return RESEARCH_IDS.find((id) => (RESEARCH[id].unlocks as readonly BuildingId[]).includes(building)) ?? null;
}

/** La recherche qui ouvre ce bâtiment de base dans une colonie neuve (`opens`), ou `null`. */
export function openingResearch(building: BuildingId): ResearchId | null {
  return RESEARCH_IDS.find((id) => (RESEARCH[id].opens as readonly BuildingId[]).includes(building)) ?? null;
}

/** Les bâtiments qu'une recherche fait entrer au menu : ceux qu'elle débloque, puis ceux qu'elle ouvre. */
export function researchBuildings(id: ResearchId): BuildingId[] {
  return [...(RESEARCH[id].unlocks as readonly BuildingId[]), ...(RESEARCH[id].opens as readonly BuildingId[])];
}

/** Le coût d'une recherche, objet par objet. */
export function researchCost(id: ResearchId): [ItemId, number][] {
  return Object.entries(RESEARCH[id].cost) as [ItemId, number][];
}

/** Les prérequis pas encore finis. Vide : la recherche peut être lancée. */
export function missingRequirements(id: ResearchId, done: readonly ResearchId[]): ResearchId[] {
  return (RESEARCH[id].requires as readonly ResearchId[]).filter((required) => !done.includes(required));
}

/**
 * Où en est une recherche, pour le panneau :
 * - `done` : finie, son effet vaut pour la partie ;
 * - `running` : son coût est payé, le compte à rebours tourne ;
 * - `collecting` : choisie, le labo attend son coût ;
 * - `available` : ses prérequis sont finis, on peut la lancer ;
 * - `queued` : en file dans ce labo, elle partira à son tour ;
 * - `taken` : un autre labo la mène ou l'a en file — pas deux fois la même ;
 * - `locked` : il manque un prérequis.
 */
export type ResearchStatus = 'done' | 'running' | 'collecting' | 'queued' | 'taken' | 'available' | 'locked';

/**
 * Le labo qui a cette recherche en cours ou en file, hors `except`. Une même
 * recherche ne tourne jamais dans deux labos.
 */
export function researchHolder(id: ResearchId, labs: readonly Lab[], except?: Lab): Lab | null {
  return labs.find((lab) => lab !== except && (lab.research === id || lab.queue.includes(id))) ?? null;
}

/** `labs` : tous les labos de la colonie, pour savoir si un autre tient déjà la recherche. */
export function researchStatus(id: ResearchId, done: readonly ResearchId[], lab: Lab | null, labs: readonly Lab[] = lab ? [lab] : []): ResearchStatus {
  if (done.includes(id)) return 'done';
  if (lab?.research === id) return lab.endTick > 0 ? 'running' : 'collecting';
  if (lab?.queue.includes(id)) return 'queued';
  if (researchHolder(id, labs, lab ?? undefined)) return 'taken';
  return missingRequirements(id, done).length === 0 ? 'available' : 'locked';
}

/** Les recherches en file derrière celle qui tourne, ou pleine : plus de place. */
export function queueFull(lab: Lab): boolean {
  return lab.queue.length >= PRODUCTION.queueSize;
}

/** Le labo attend-il son coût ? Une recherche choisie dont le compte à rebours n'a pas démarré. */
export function isCollecting(lab: Lab): boolean {
  return lab.research !== null && lab.endTick === 0;
}

/**
 * Ce qu'il faut encore de cet objet au labo, sans compter ce que les
 * porteurs apportent : ce qu'Adam peut y poser. Compté sur le disponible —
 * un reste qu'un porteur a déjà promis à la mairie n'est plus au labo.
 */
export function labNeeds(lab: Lab, item: ItemId): number {
  if (lab.research === null || lab.endTick > 0) return 0;

  const needed = (RESEARCH[lab.research].cost as Partial<Record<ItemId, number>>)[item] ?? 0;

  return Math.max(0, needed - lab.store.available(item));
}

/** Ce que le labo attend encore et que personne n'apporte : sa « place libre », pour la ville et les porteurs. */
export function labWants(lab: Lab, item: ItemId): number {
  return Math.max(0, labNeeds(lab, item) - lab.store.expected(item));
}

/** Ce qui manque encore au labo pour démarrer, tous objets confondus. */
export function labMissing(lab: Lab): number {
  if (lab.research === null) return 0;
  return researchCost(lab.research).reduce((sum, [item]) => sum + labNeeds(lab, item), 0);
}

/**
 * Ce que le coffre contient de cet objet au-delà de la recherche en cours —
 * le reste d'une recherche abandonnée — et qu'aucun porteur n'emporte déjà.
 * Une recherche qui tourne a consommé son coût : tout le coffre est en trop.
 */
export function labSurplus(lab: Lab, item: ItemId): number {
  const kept = isCollecting(lab) ? ((RESEARCH[lab.research!].cost as Partial<Record<ItemId, number>>)[item] ?? 0) : 0;

  return Math.max(0, lab.store.available(item) - kept);
}

/**
 * Une part d'unités en plus, répartie sur les passages : avec `rate` = 0,5,
 * un passage sur deux donne une unité de plus. Même règle que les bonus de
 * récolte du jardin — pas de hasard, le compte tombe juste sur la durée.
 */
export function extraUnits(units: number, rate: number, pass: number): number {
  const bonus = units * rate;

  return Math.floor((pass + 1) * bonus) - Math.floor(pass * bonus);
}
