/**
 * Recettes — contenu pur.
 *
 * `building` désigne le bâtiment capable d'exécuter la recette ;
 * `validatePrototypes()` vérifie au démarrage qu'il existe.
 *
 * Une foreuse n'a pas d'entrée : elle extrait ce que le gisement sous elle
 * fournit. La recette ne décrit donc que la cadence et la sortie de référence.
 *
 * La carrière n'a pas d'entrée non plus : ses ouvriers taillent la pierre
 * dans les ruines du vieux monde, où qu'elle soit posée, et va d'autant
 * plus vite qu'elle a d'ouvriers. Le puits est une carrière sur sa propre
 * recette (`drawWater`) : posé au bord d'une rivière, il y puise son eau
 * au même rythme.
 *
 * La ferme n'a pas de recette : sa nourriture vient des cases de son champ
 * que ses fermiers récoltent (`CROPS`, `data/resources.ts`).
 *
 * La nurserie a une recette sans sortie : ce qu'elle produit est un enfant,
 * pas un objet. Sa recette dit ce que coûte une naissance, et tous les
 * combien.
 *
 * La forge et le four à charbon partagent un même `kind` : un bâtiment qui
 * consomme les entrées de sa recette et range ses sorties dans son coffre.
 * Chacun trouve sa recette par son id (`recipeOf`) : une seule par bâtiment.
 *
 * Tout objet doit entrer quelque part — un coût de bâtiment ou une entrée de
 * recette : `validatePrototypes()` refuse une ressource qu'on récolterait
 * pour rien.
 */

import type { BuildingId } from './buildings.ts';
import type { ItemId } from './items.ts';

export interface RecipeProto {
  label: string;
  /** Bâtiment capable d'exécuter la recette. */
  building: BuildingId;
  /** Durée d'un cycle, en ticks de simulation (20 ticks = 1 s). */
  duration: number;
  inputs: Partial<Record<ItemId, number>>;
  outputs: Partial<Record<ItemId, number>>;
}

export const RECIPES = {
  mineOre: {
    label: 'Extraction',
    building: 'drill',
    duration: 80,
    inputs: {},
    outputs: { ironOre: 1 },
  },
  cutStone: {
    label: 'Taille',
    building: 'quarry',
    duration: 20 * 15,
    inputs: {},
    outputs: { stone: 2 },
  },
  drawWater: {
    label: 'Puisage',
    building: 'well',
    duration: 20 * 10,
    inputs: {},
    outputs: { water: 2 },
  },
  raiseChild: {
    label: 'Naissance',
    building: 'nursery',
    duration: 20 * 60 * 3,
    inputs: { food: 6 },
    outputs: {},
  },
  smeltPlate: {
    label: 'Fonte',
    building: 'forge',
    duration: 20 * 6,
    inputs: { ironOre: 2, coal: 1 },
    outputs: { ironPlate: 1 },
  },
  burnCharcoal: {
    label: 'Cuisson',
    building: 'charcoalKiln',
    duration: 20 * 8,
    inputs: { wood: 3 },
    outputs: { coal: 1 },
  },
  fireBrick: {
    label: 'Cuisson',
    building: 'brickworks',
    duration: 20 * 8,
    inputs: { stone: 2, wood: 1 },
    outputs: { brick: 1 },
  },
  makeTools: {
    label: 'Façonnage',
    building: 'workshop',
    duration: 20 * 12,
    inputs: { ironPlate: 1, wood: 2 },
    outputs: { tools: 1 },
  },
  castSteel: {
    label: 'Coulée',
    building: 'steelworks',
    duration: 20 * 15,
    inputs: { ironPlate: 2, coal: 2 },
    outputs: { steel: 1 },
  },
} as const satisfies Record<string, RecipeProto>;

export type RecipeId = keyof typeof RECIPES;

export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

/** La recette qu'exécute un bâtiment, ou `null` s'il n'en a pas. */
export function recipeOf(building: BuildingId): RecipeProto | null {
  return (Object.values(RECIPES) as RecipeProto[]).find((recipe) => recipe.building === building) ?? null;
}
