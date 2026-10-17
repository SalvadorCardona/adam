/**
 * La nurserie : ce que coûte une naissance, ses enfants, le temps avant le
 * prochain ouvrier, et sa nourriture rapportée au stock visé. Elle consomme :
 * « Transférer » la remplit, et le bébé devant sa barre dit ce qu'elle compte.
 */

import { NURSERY_CARE } from '../../data/inhabitants.ts';
import type { ItemId } from '../../data/items.ts';
import { RECIPES } from '../../data/recipes.ts';
import { t } from '../../i18n/locale.ts';
import { consumerTarget } from '../../sim/consumers.ts';
import type { Nursery } from '../../sim/types.ts';
import { buildingView } from './building.ts';
import { clock, recipeLine, starvedLine } from './lines.ts';

export const nurseryView = buildingView<Nursery>({
  timer: 'birth',
  supplied: () => true,
  describe({ world, entity, text, stats, lines }) {
    const kids = world.nurseryKids(entity).length;
    const adult = world.nextAdultTicks(entity);

    lines.push(text.nursery.perBirth(recipeLine(RECIPES.raiseChild.inputs)));
    lines.push(
      entity.paused
        ? text.paused
        : kids >= NURSERY_CARE.capacity
          ? text.nursery.full
          : entity.hungry
            ? text.nursery.hungry(starvedLine(world, entity))
            : '',
    );
    lines.push(adult === null ? text.nursery.noKids : text.nursery.nextAdult(clock(adult)));
    stats.push(
      {
        icon: 'child',
        value: `${kids}/${NURSERY_CARE.capacity}`,
        label: text.nursery.kids(kids, NURSERY_CARE.capacity),
      },
      { icon: 'worker', value: String(entity.born), label: text.nursery.born(entity.born) },
    );
    // Son stock de nourriture, rapporté au stock visé, et ce qui est en route.
    for (const item of Object.keys(RECIPES.raiseChild.inputs) as ItemId[]) {
      const count = entity.store.count(item);
      const target = consumerTarget(entity, item);
      const coming = entity.store.expected(item);

      stats.push({
        icon: 'chest',
        item,
        value: `${count}/${target}${coming > 0 ? ` +${coming}` : ''}`,
        label: text.nursery.stock(t().items[item], count, target, coming),
      });
    }
  },
});
