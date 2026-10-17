/**
 * Une forge — et ses cousines sur leur propre recette : four à charbon, grill,
 * briqueterie, atelier, aciérie. Elle consomme : « Transférer » la remplit ;
 * sa ligne dit sa recette, puis si elle chauffe ou ce qui lui manque.
 */

import type { Forge } from '../../sim/types.ts';
import { forgeRecipe } from '../../sim/consumers.ts';
import { buildingView } from './building.ts';
import { recipeLine, starvedLine } from './lines.ts';

export const forgeView = buildingView<Forge>({
  supplied: () => true,
  describe({ world, entity, text, lines, stopped }) {
    // La forge fond des plaques, le four à charbon cuit le bois : chacun sa recette.
    const recipe = forgeRecipe(entity);

    lines.push(`${recipeLine(recipe.inputs)} → ${recipeLine(recipe.outputs)}`);
    lines.push(
      entity.paused
        ? text.paused
        : stopped
          ? text.forge.noOne
          : entity.blocked
          ? world.supplyStatus(entity)
            ? text.forge.starved(starvedLine(world, entity))
            : text.blocked
          : text.forge.heating,
    );
  },
});
