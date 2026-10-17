/**
 * Les recettes vues d'un bâtiment : laquelle il suit, ce qu'elle prend et
 * rend, et si son coffre a de quoi. De quoi les lire pareil en jeu
 * (`World`) et hors ligne (`sim/offline.ts`).
 */

import type { ItemId } from '../data/items.ts';
import { RECIPES, recipeOf, type RecipeId, type RecipeProto } from '../data/recipes.ts';
import type { Store } from './store.ts';
import type { Quarry } from './types.ts';

/** Recette utilisée par une foreuse. Une seule pour l'instant, cf. `data/recipes.ts`. */
export const DRILL_RECIPE: RecipeId = 'mineOre';

/** Ce que coûte une naissance à la nurserie, et tous les combien. */
export const NURSERY_RECIPE: RecipeId = 'raiseChild';

/** La recette d'une carrière ou d'un puits, trouvée par son id : la taille, le puisage. */
export function quarryRecipe(producer: Quarry): RecipeProto {
  return recipeOf(producer.proto) ?? RECIPES.cutStone;
}

export function amountsOf(amounts: RecipeProto['inputs']): [ItemId, number][] {
  return Object.entries(amounts) as [ItemId, number][];
}

export function inputItems(recipe: RecipeProto): ItemId[] {
  return amountsOf(recipe.inputs).map(([item]) => item);
}

export function totalOf(amounts: RecipeProto['inputs']): number {
  return amountsOf(amounts).reduce((total, [, amount]) => total + amount, 0);
}

/** Le coffre contient-il toutes les entrées de la recette ? */
export function hasInputs(store: Store, recipe: RecipeProto): boolean {
  return amountsOf(recipe.inputs).every(([item, amount]) => store.count(item) >= amount);
}

/** Toutes les entrées, et la place pour les sorties une fois les entrées consommées. */
export function canCraft(store: Store, recipe: RecipeProto): boolean {
  return hasInputs(store, recipe) && store.freeSpace() + totalOf(recipe.inputs) >= totalOf(recipe.outputs);
}
