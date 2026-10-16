/**
 * L'équipement d'Adam — contenu pur.
 *
 * Un niveau d'équipement, c'est un arc : Adam part avec l'arc de fortune
 * (niveau 0) et en forge de meilleurs à la **forge** (`GEAR_WORKSHOP`),
 * depuis sa fenêtre, contre des objets payés le sac d'abord, puis la ville
 * si la forge est dans son rayon (commande `craftGear`). L'arc ne tire ni
 * plus fort ni plus loin : son niveau dit quelles bases mutantes il entame
 * (`data/enemyBases.ts`) — une base de niveau N demande un arc de niveau N
 * au moins.
 *
 * Seul le niveau atteint est de l'état (`Player.gear`).
 */

import type { BuildingId } from './buildings.ts';
import type { ItemId } from './items.ts';

export interface GearProto {
  label: string;
  /** Ce qu'il coûte à forger depuis le niveau d'avant ; vide pour l'arc de départ. */
  cost: Partial<Record<ItemId, number>>;
}

/** Par niveau, de 0 (l'arc de départ) au dernier. */
export const GEAR = [
  { label: 'Arc de fortune', cost: {} },
  { label: 'Arc cerclé de fer', cost: { ironPlate: 4, wood: 15 } },
  { label: 'Arc composite', cost: { ironPlate: 12, mutantGoo: 6, wolfFang: 4 } },
  { label: 'Arc radioactif', cost: { ironPlate: 25, mutantGoo: 10, radCore: 1 } },
] as const satisfies readonly GearProto[];

/** Le bâtiment dont la fenêtre forge l'équipement. */
export const GEAR_WORKSHOP: BuildingId = 'forge';

/** Le niveau le plus haut. */
export const MAX_GEAR = GEAR.length - 1;

/** Le prototype d'un niveau, borné à la table. */
export function gearOf(level: number): GearProto {
  return GEAR[Math.max(0, Math.min(MAX_GEAR, level))]!;
}

/** Les outils d'Adam, forgés comme l'arc : la hache pour les arbres, la pioche pour les rochers. */
export type ToolSlot = 'axe' | 'pickaxe';

export const TOOL_SLOTS = ['axe', 'pickaxe'] as const satisfies readonly ToolSlot[];

/**
 * Par outil, les niveaux 1 à 3 (le niveau 0, les mains nues, n'a pas de
 * fiche). Chaque niveau forgé donne +1 unité par coup sur sa famille — les
 * arbres pour la hache, le fer, le charbon et la pierre pour la pioche —,
 * lue dans `World.bonus` (`woodYield`, `oreYield`).
 */
export const TOOL_GEAR = {
  axe: [
    { label: 'Hache de pierre', cost: { wood: 10, stone: 8 } },
    { label: 'Hache de fer', cost: { ironPlate: 4, wood: 10 } },
    { label: 'Hache d’acier', cost: { ironPlate: 10, coal: 10, wood: 15 } },
  ],
  pickaxe: [
    { label: 'Pioche de pierre', cost: { wood: 10, stone: 10 } },
    { label: 'Pioche de fer', cost: { ironPlate: 4, wood: 10 } },
    { label: 'Pioche d’acier', cost: { ironPlate: 10, coal: 10, wood: 15 } },
  ],
} as const satisfies Record<ToolSlot, readonly GearProto[]>;

/** Le niveau le plus haut d'un outil. */
export const MAX_TOOL = 3;

/** Ce que coûte le niveau `level` (1 à 3) d'un outil. */
export function toolOf(slot: ToolSlot, level: number): GearProto {
  return TOOL_GEAR[slot][Math.max(1, Math.min(MAX_TOOL, level)) - 1]!;
}

/** Les unités par coup que les outils ajoutent à cette statistique de récolte : un par niveau. */
export function toolBonus(axe: number, pickaxe: number, stat: string): number {
  if (stat === 'woodYield') return axe;
  if (stat === 'oreYield') return pickaxe;
  return 0;
}
