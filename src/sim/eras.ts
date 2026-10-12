/**
 * Les ères : où en est la colonie de chaque condition de l'ère suivante.
 *
 * Fonctions pures qui lisent le monde sans le toucher, comme les objectifs
 * (`sim/objectives.ts`) : `World` s'en sert pour accepter ou refuser
 * `advanceEra`, le panneau des ères (`ui/eraPanel.ts`) pour dessiner une
 * ligne par condition. Un seul juge : la ligne cochée et le passage permis ne
 * divergent jamais.
 */

import type { BuildingId } from '../data/buildings.ts';
import { ERAS, LAST_ERA, type EraProto } from '../data/eras.ts';
import type { WaveSpec } from '../data/enemies.ts';
import type { ItemId } from '../data/items.ts';
import { RESEARCH, RESEARCH_IDS, type ResearchId } from '../data/research.ts';
import type { World } from './world.ts';

/**
 * Une condition de passage, et où elle en est. `have` n'est pas plafonné :
 * le panneau affiche « 14/13 » si la ville a de l'avance.
 */
export type EraCheck =
  | { type: 'objectives'; have: number; need: number }
  | { type: 'population'; have: number; need: number }
  | { type: 'building'; building: BuildingId; have: number; need: number }
  | { type: 'research'; research: ResearchId; have: number; need: 1 }
  | { type: 'invest'; item: ItemId; have: number; need: number };

export function checkMet(check: EraCheck): boolean {
  return check.have >= check.need;
}

/** L'ère qui suit `era`, ou `null` à la dernière. */
export function nextEra(era: number): number | null {
  return era < LAST_ERA ? era + 1 : null;
}

/** Bâtiments finis et debout de ce type. */
function builtCount(world: World, building: BuildingId): number {
  let count = 0;

  for (const entity of world.entities.values()) {
    if (entity.kind !== 'site' && entity.proto === building) count += 1;
  }
  return count;
}

/** Ce que la colonie peut investir d'un objet : le sac, puis le stock de la ville. */
export function eraOwned(world: World, item: ItemId): number {
  return world.player.inventory.available(item) + (world.townStock()?.available(item) ?? 0);
}

/** Les conditions de l'ère `era`, dans l'ordre du panneau. Vide pour la première. */
export function eraChecks(world: World, era: number): EraCheck[] {
  const requires = (ERAS[era] as EraProto | undefined)?.requires;

  if (!requires) return [];

  const { adults, children, workers } = world.population();
  const checks: EraCheck[] = [
    { type: 'objectives', have: world.objective, need: requires.objectives },
    { type: 'population', have: adults + children + workers, need: requires.population },
  ];

  for (const [building, need] of Object.entries(requires.buildings) as [BuildingId, number][]) {
    checks.push({ type: 'building', building, have: builtCount(world, building), need });
  }
  for (const research of requires.research) {
    checks.push({ type: 'research', research, have: world.researchDone.includes(research) ? 1 : 0, need: 1 });
  }
  for (const [item, need] of Object.entries(requires.invest) as [ItemId, number][]) {
    checks.push({ type: 'invest', item, have: eraOwned(world, item), need });
  }
  return checks;
}

/** Tout tient-il pour passer à l'ère suivante ? Toujours faux à la dernière, et mairie à terre. */
export function eraReady(world: World): boolean {
  const next = nextEra(world.era);

  if (next === null || world.townStock() === null) return false;
  return eraChecks(world, next).every(checkMet);
}

/** Les recherches de l'onglet d'une ère : celles dont `era` vaut son index. */
export function eraResearch(era: number): ResearchId[] {
  return RESEARCH_IDS.filter((id) => researchEra(id) === era);
}

/** L'ère qui ouvre une recherche : son onglet au labo. */
export function researchEra(id: ResearchId): number {
  return RESEARCH[id].era;
}

/** Ce que l'ère fait entrer au menu par son onglet de recherches : son ou ses nouveaux bâtiments. */
export function eraNewBuildings(era: number): BuildingId[] {
  return eraResearch(era).flatMap((id): BuildingId[] => [...RESEARCH[id].unlocks]);
}

/**
 * Les ennemis d'une nuit : les chefs de la nuit (`nightBosses`) plus la
 * menace de l'ère (`ERAS[era].threat`), espèce par espèce.
 */
export function withEraThreat(bosses: WaveSpec, era: number): WaveSpec {
  const merged: WaveSpec = { ...bosses };

  for (const [proto, count] of Object.entries((ERAS[era] as EraProto | undefined)?.threat ?? {}) as [keyof WaveSpec, number][]) {
    merged[proto] = (merged[proto] ?? 0) + count;
  }
  return merged;
}

