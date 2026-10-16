/**
 * Les modificateurs de la carte du jour — contenu pur.
 *
 * Chaque jour (UTC) a une graine et un modificateur tiré de cette graine
 * (`sim/daily.ts`) : tout le monde joue la même carte avec la même règle.
 * Un modificateur est une donnée lue en un seul point de la simulation :
 *
 * - `bonuses` : des statistiques de la recherche, versées dans `World.bonus` ;
 * - `slowCycle` : le facteur de durée du cycle d'un producteur, lu par
 *   `World.dailyCycle` ;
 * - `foeSpeed` : le facteur de vitesse des mutants, lu par le pas des mutants ;
 * - `startingWorkers` : les ouvriers de départ de la colonie.
 *
 * Les libellés sont dans `i18n/*` (`dailyMods`), sous le même id.
 */

import type { BuildingId } from './buildings.ts';
import type { ResearchStat } from './research.ts';

export interface DailyModProto {
  readonly bonuses?: Readonly<Partial<Record<ResearchStat, number>>>;
  readonly slowCycle?: Readonly<Partial<Record<BuildingId, number>>>;
  readonly foeSpeed?: number;
  readonly startingWorkers?: number;
}

export const DAILY_MODS = {
  /** Les puits rendent deux fois moins d'eau. */
  drought: { slowCycle: { well: 2 } },
  /** Les arbres donnent moitié moins de bois. */
  scarceWood: { bonuses: { woodYield: -0.5 } },
  /** Les mutants marchent un tiers plus vite. */
  fastMutants: { foeSpeed: 4 / 3 },
  /** La colonie ne compte que six ouvriers au départ. */
  smallColony: { startingWorkers: 6 },
  /** Les foreuses mettent une moitié de temps de plus par minerai (80 ticks de base). */
  slowDrills: { bonuses: { drillTicks: 40 } },
} as const satisfies Record<string, DailyModProto>;

export type DailyModId = keyof typeof DAILY_MODS;

/** Dans l'ordre où la graine les tire : n'en retirer aucun, un jour passé changerait de règle. */
export const DAILY_MOD_IDS = Object.keys(DAILY_MODS) as DailyModId[];

/** Le jour de la partie : sa date UTC (`AAAA-MM-JJ`) et le modificateur de ce jour. */
export interface DailyGame {
  readonly date: string;
  readonly mod: DailyModId;
}
