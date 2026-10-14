/**
 * Objectifs : où en est chaque condition de `data/objectives.ts`.
 *
 * Fonctions pures qui lisent le monde sans le toucher. `World` s'en sert au
 * tick pour savoir quels objectifs du chapitre en cours sont réussis ; le
 * HUD, pour dessiner une jauge par condition. Un seul juge, donc : la jauge
 * pleine et l'objectif réussi ne peuvent pas diverger.
 */

import type { ItemId } from '../data/items.ts';
import { CHAPTERS, OBJECTIVES, type ChapterProto, type Goal, type ObjectiveId, type ObjectiveProto } from '../data/objectives.ts';
import { RECIPES } from '../data/recipes.ts';
import { CYCLE_TICKS, ticksToDawn } from './dayNight.ts';
import type { Nursery, WorldStats } from './types.ts';
import type { World } from './world.ts';

export interface GoalProgress {
  have: number;
  need: number;
}

/**
 * Où en est une condition. `have` est plafonné à `need` : une jauge ne déborde pas.
 * Un bâtiment à étages (`level`) se compte en étages : « 2/3 » pour l'antenne.
 */
export function goalProgress(world: World, goal: Goal): GoalProgress {
  if (goal.type === 'build' && goal.level !== undefined) {
    if (count(world, goal) >= goal.count) return { have: goal.level, need: goal.level };

    let floors = 0;

    for (const entity of world.entities.values()) {
      if (entity.kind !== 'site' && entity.proto === goal.building) floors = Math.max(floors, entity.level);
    }
    return { have: Math.min(goal.level, floors), need: goal.level };
  }
  return { have: Math.min(goal.count, count(world, goal)), need: goal.count };
}

function count(world: World, goal: Goal): number {
  switch (goal.type) {
    case 'build': {
      let built = 0;

      for (const entity of world.entities.values()) {
        if (entity.kind !== 'site' && entity.proto === goal.building && entity.level >= (goal.level ?? 1)) built += 1;
      }
      return built;
    }

    case 'nights':
      return world.stats.nightsSurvived - world.chapterBase.nightsSurvived;

    case 'produce':
      return world.stats.produced[goal.item] ?? 0;

    case 'births':
      return world.stats.births;

    case 'quests':
      return world.questsDone;

    case 'happiness':
      return world.happiness().total;

    case 'mood':
      return world.happiness().average;

    case 'era':
      return world.era;
  }
}

/**
 * Une condition qui avance toute seule — une naissance, une nuit à tenir —
 * et où elle en est. Sans elle, une attente normale ressemble à un bug.
 * - `remainingTicks` : avant que le compteur bouge de lui-même ;
 * - `durationTicks` : l'attente entière, lue dans les données ;
 * - `blockedBy` : ce qui la retient — l'entrée de recette qui manque, ou la
 *   pause — et `null` si elle court ;
 * - `missing` : combien il manque de cette entrée.
 */
export interface GoalWait {
  remainingTicks: number;
  durationTicks: number;
  blockedBy: ItemId | 'paused' | null;
  missing: number;
}

/** L'attente d'une condition pas encore remplie, ou `null` si c'est une action qu'elle demande. */
export function goalWait(world: World, goal: Goal): GoalWait | null {
  if (count(world, goal) >= goal.count) return null;

  switch (goal.type) {
    case 'nights': {
      const clock = world.clock();

      // Une nuit compte à l'aube : on attend la prochaine.
      return clock ? { remainingTicks: ticksToDawn(clock), durationTicks: CYCLE_TICKS, blockedBy: null, missing: 0 } : null;
    }

    case 'births': {
      let best: GoalWait | null = null;

      // La nurserie la plus proche de faire naître : une qui court passe avant une qui attend.
      for (const entity of world.entities.values()) {
        if (entity.kind !== 'nursery') continue;

        const wait = nurseryWait(world, entity);

        if (!best || rank(wait) < rank(best)) best = wait;
      }
      return best;
    }

    default:
      return null;
  }
}

function nurseryWait(world: World, nursery: Nursery): GoalWait {
  const recipe = RECIPES.raiseChild;
  const wait = {
    remainingTicks: Math.max(0, nursery.nextBirthTick - world.tickCount),
    durationTicks: recipe.duration,
  };

  if (nursery.paused) return { ...wait, blockedBy: 'paused', missing: 0 };

  for (const [item, amount] of Object.entries(recipe.inputs) as [ItemId, number][]) {
    const missing = amount - nursery.store.count(item);

    if (missing > 0) return { ...wait, blockedBy: item, missing };
  }
  return { ...wait, blockedBy: null, missing: 0 };
}

/** Plus petit = plus près d'aboutir : d'abord ce qui court, puis ce à quoi il manque le moins. */
function rank(wait: GoalWait): number {
  return wait.blockedBy === null ? wait.remainingTicks : wait.blockedBy === 'paused' ? Infinity : 1e9 + wait.missing;
}

/**
 * L'attente de la condition qui retient l'objectif `id` — la première pas
 * remplie —, s'il en est une. Sans `id`, celle du premier objectif du
 * chapitre qui attend une horloge.
 */
export function objectiveWait(world: World, id?: ObjectiveId | null): (GoalWait & { goal: Goal }) | null {
  const objectives = id ? OBJECTIVES.filter((objective) => objective.id === id) : chapterObjectives(world);

  for (const objective of objectives) {
    if (world.objectivesDone.has(objective.id)) continue;

    const goal = objective.goals.find((condition) => count(world, condition) < condition.count);
    const wait = goal ? goalWait(world, goal) : null;

    if (goal && wait) return { ...wait, goal };
  }
  return null;
}

/** Toutes les conditions tiennent-elles en même temps ? */
export function objectiveDone(world: World, objective: ObjectiveProto): boolean {
  return objective.goals.every((goal) => count(world, goal) >= goal.count);
}

/** Le chapitre en cours, ou `null` une fois la partie bouclée — la partie sans fin, après le Signal. */
export function currentChapter(world: World): ChapterProto | null {
  return (CHAPTERS as readonly ChapterProto[])[world.chapter] ?? null;
}

/** Les objectifs du chapitre en cours, dans l'ordre du panneau — vide après le Signal. */
export function chapterObjectives(world: World): (ObjectiveProto & { id: ObjectiveId })[] {
  return OBJECTIVES.filter((objective) => objective.chapter === world.chapter);
}

/** Les objectifs du chapitre en cours qui restent à réussir. */
export function openObjectives(world: World): (ObjectiveProto & { id: ObjectiveId })[] {
  return chapterObjectives(world).filter((objective) => !world.objectivesDone.has(objective.id));
}

/** Le premier objectif ouvert du chapitre, celui que le panneau choisit d'office ; `null` après le Signal. */
export function firstOpenObjective(world: World): ObjectiveId | null {
  return openObjectives(world)[0]?.id ?? null;
}

/** Une copie des compteurs : le point de départ d'un objectif. */
export function copyStats(stats: WorldStats): WorldStats {
  return { ...stats, produced: { ...stats.produced } };
}

export function emptyStats(): WorldStats {
  return { nightsSurvived: 0, births: 0, produced: {} };
}
