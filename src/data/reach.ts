/**
 * Ce qui est à portée quand un chapitre d'objectifs s'ouvre — contenu pur.
 *
 * Un objectif ne doit jamais demander l'impossible : un bâtiment qu'aucune
 * recherche, aucun plan, aucune ère n'ouvre encore. `chapterReach(c)` lit
 * les données et dit ce que le joueur **peut obtenir** pendant que le
 * chapitre `c` est ouvert, les `c` premiers finis : l'ère qu'il peut
 * atteindre (`ERAS[].requires.chapters`), les recherches qu'il peut mener
 * (leur ère, leurs prérequis, leur coût), les bâtiments qu'il peut poser, les
 * objets qu'il peut se procurer. `validatePrototypes()` et
 * `objectives.test.ts` s'en servent, chapitre par chapitre.
 *
 * Un objet s'obtient en le récoltant, sur un ennemi ou une bête (butin), dans
 * le stock de départ de la mairie, ou en le produisant dans un bâtiment à
 * portée dont les entrées le sont aussi. On ne juge pas l'effort : on vérifie
 * qu'un chemin existe.
 */

import { BUILDINGS, START_BUILDINGS, type BuildingId, type BuildingProto } from './buildings.ts';
import { ENEMIES, WILDLIFE, type LootTable } from './enemies.ts';
import { ERAS, type EraProto } from './eras.ts';
import { EVE } from './eve.ts';
import { COLONY } from './inhabitants.ts';
import type { ItemId } from './items.ts';
import { CHAPTERS, type ChapterProto, type Goal } from './objectives.ts';
import { QUESTS, QUEST_IDS } from './quests.ts';
import { RECIPES, type RecipeProto } from './recipes.ts';
import { RESEARCH, type ResearchProto } from './research.ts';
import { CROPS, RESOURCES } from './resources.ts';

/** Ce que le joueur peut obtenir pendant un chapitre. */
export interface ChapterReach {
  /** La plus haute ère qu'il peut atteindre. */
  era: number;
  /** Les nuits que les chapitres finis ont fait tenir, au moins. */
  nights: number;
  /** Ève est là : ses quêtes et leurs plans sont à portée. */
  eve: boolean;
  research: Set<string>;
  buildings: Set<BuildingId>;
  items: Set<ItemId>;
}

/** Ce que les bâtiments sortent hors des recettes : les cultures, la viande de l'élevage. */
const YIELDS: Partial<Record<BuildingId, readonly ItemId[]>> = {
  farm: [CROPS.item],
  pigPen: ['meat'],
};

/** Ce qui tombe d'un ennemi ou d'une bête. */
function lootItems(): Set<ItemId> {
  const items = new Set<ItemId>();
  const tables = [...Object.values(ENEMIES), ...Object.values(WILDLIFE)] as { loot?: LootTable }[];

  for (const { loot } of tables) for (const entry of loot ?? []) items.add(entry.item);
  return items;
}

/** Les objets que sort un bâtiment, et ce qu'il lui faut pour les sortir. */
function outputsOf(building: BuildingId): { inputs: ItemId[]; outputs: ItemId[] }[] {
  const proto: BuildingProto = BUILDINGS[building];
  const recipes = (Object.values(RECIPES) as RecipeProto[]).filter((recipe) => recipe.building === building);
  const ways = recipes.map((recipe) => ({ inputs: Object.keys(recipe.inputs) as ItemId[], outputs: Object.keys(recipe.outputs) as ItemId[] }));

  if (proto.deposits) ways.push({ inputs: [], outputs: [...proto.deposits] });
  if (YIELDS[building]) ways.push({ inputs: [], outputs: [...YIELDS[building]] });
  return ways;
}

/** La plus haute ère qu'ouvrent `chapters` chapitres finis. */
export function reachableEra(chapters: number): number {
  let era = 0;

  (ERAS as readonly EraProto[]).forEach((proto, index) => {
    if (index === era + 1 && proto.requires && proto.requires.chapters <= chapters) era = index;
  });
  return era;
}

/** Les nuits qu'ont fait tenir les `chapters` premiers chapitres : la somme de leurs conditions « nuits ». */
function nightsHeld(chapters: number): number {
  let nights = 0;

  for (const chapter of (CHAPTERS as readonly ChapterProto[]).slice(0, chapters)) {
    for (const objective of chapter.objectives) {
      for (const goal of objective.goals) if (goal.type === 'nights') nights += goal.count;
    }
  }
  return nights;
}

/** Ce qui est à portée pendant le chapitre `chapter`, les précédents finis. */
export function chapterReach(chapter: number): ChapterReach {
  const era = reachableEra(chapter);
  const nights = nightsHeld(chapter);
  const eve = nights >= EVE.arrivalNight;
  const research = new Set<string>();
  const buildings = new Set<BuildingId>(START_BUILDINGS);
  const items = new Set<ItemId>([...Object.values(RESOURCES).map((resource) => resource.item), ...lootItems(), ...(Object.keys(COLONY.startingStock) as ItemId[])]);

  for (const [id, proto] of Object.entries(BUILDINGS) as [BuildingId, BuildingProto][]) {
    if (!proto.menu || proto.plan) continue;
    if (proto.unlockChapter !== undefined && proto.unlockChapter <= chapter) buildings.add(id);
    if (proto.unlockExplored !== undefined) buildings.add(id);
  }
  (ERAS as readonly EraProto[]).slice(0, era + 1).forEach((proto) => proto.opens.forEach((building) => buildings.add(building)));
  if (eve) for (const quest of QUEST_IDS) if (QUESTS[quest].reward.type === 'plan') buildings.add(QUESTS[quest].reward.building);

  // Point fixe : une recherche ouvre un bâtiment, qui produit un objet, qui paie une autre recherche.
  for (let changed = true; changed; ) {
    changed = false;
    for (const [id, proto] of Object.entries(RESEARCH) as [string, ResearchProto][]) {
      if (research.has(id) || proto.era > era || !buildings.has('lab')) continue;
      if (!proto.requires.every((required) => research.has(required))) continue;
      if (!(Object.keys(proto.cost) as ItemId[]).every((item) => items.has(item))) continue;
      research.add(id);
      for (const building of [...proto.opens, ...proto.unlocks]) buildings.add(building);
      changed = true;
    }
    for (const building of buildings) {
      for (const { inputs, outputs } of outputsOf(building)) {
        if (!inputs.every((item) => items.has(item))) continue;
        for (const item of outputs) {
          if (items.has(item)) continue;
          items.add(item);
          changed = true;
        }
      }
    }
  }
  return { era, nights, eve, research, buildings, items };
}

/**
 * Pourquoi une condition est hors de portée pendant ce chapitre, ou `null`
 * si elle est atteignable : le bâtiment qu'aucun chemin n'ouvre encore, ses
 * matériaux introuvables, l'objet que rien ne produit, l'ère trop loin.
 */
export function goalOutOfReach(goal: Goal, reach: ChapterReach): string | null {
  const affordable = (cost: Partial<Record<ItemId, number>>): boolean => (Object.keys(cost) as ItemId[]).every((item) => reach.items.has(item));

  switch (goal.type) {
    case 'build': {
      const proto: BuildingProto = BUILDINGS[goal.building];

      if (goal.building !== 'townHall' && !reach.buildings.has(goal.building)) return `« ${goal.building} » n'est pas encore au menu`;
      if (!affordable(proto.cost)) return `« ${goal.building} » coûte un objet hors de portée`;
      for (const upgrade of proto.upgrades.slice(0, (goal.level ?? 1) - 1)) {
        if (!affordable(upgrade.cost)) return `un étage de « ${goal.building} » coûte un objet hors de portée`;
      }
      return null;
    }
    case 'produce':
      return reach.items.has(goal.item) &&
        [...reach.buildings].some((building) => outputsOf(building).some(({ inputs, outputs }) => outputs.includes(goal.item) && inputs.every((item) => reach.items.has(item))))
        ? null
        : `rien ne produit « ${goal.item} »`;
    case 'births':
      return reach.buildings.has('nursery') ? null : 'pas de nurserie';
    case 'quests':
      return reach.eve ? null : 'Ève n’est pas encore là';
    case 'era':
      return goal.count <= reach.era ? null : `l'ère ${goal.count} est hors de portée`;
    case 'nights':
    case 'happiness':
    case 'mood':
      return null;
  }
}
