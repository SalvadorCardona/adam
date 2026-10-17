/**
 * Les phrases que partagent plusieurs vues : une recette en mots, une durée,
 * la cause d'une famine.
 */

import type { ItemId } from '../../data/items.ts';
import type { RecipeProto } from '../../data/recipes.ts';
import { t } from '../../i18n/locale.ts';
import type { Forge, Nursery } from '../../sim/types.ts';
import { TICKS_PER_SECOND, type World } from '../../sim/world.ts';

/**
 * D'où vient la famine d'une forge ou d'une nurserie : ce qui manque est-il
 * en route, en ville, dans le sac — ou nulle part ?
 */
export function starvedLine(world: World, consumer: Nursery | Forge): string {
  const status = world.supplyStatus(consumer);

  if (!status) return '';

  const label = t().items[status.item];
  const text = t().panel.starved;

  if (status.coming) return text.coming(label);
  if (status.inTown > 0) {
    return status.porters
      ? text.inTown(label, status.inTown)
      : text.noPorter(label, status.inTown, world.inTownRange(consumer));
  }
  if (world.player.inventory.count(status.item) > 0) return text.inBag(label);
  return text.nowhere(label);
}

/** « 2 minerai de fer + 1 charbon » à partir des quantités d'une recette. */
export function recipeLine(amounts: RecipeProto['inputs']): string {
  return (Object.entries(amounts) as [ItemId, number][])
    .map(([item, amount]) => t().panel.recipeAmount(amount, t().items[item]))
    .join(' + ');
}

/** « 9 min 32 s » à partir d'un nombre de ticks. */
export function clock(ticks: number): string {
  const seconds = Math.ceil(ticks / TICKS_PER_SECOND);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return t().panel.duration(minutes, rest);
}
