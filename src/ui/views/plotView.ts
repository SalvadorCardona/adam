/**
 * Ceux qui travaillent un carré de terre autour d'eux : la ferme et ses
 * cultures, la maison du forestier et ses pousses. Leurs puces comptent les
 * cases, leur ligne dit ce que fait le premier d'entre eux.
 */

import { FARMERS, FORESTERS } from '../../data/workers.ts';
import { t } from '../../i18n/locale.ts';
import { countField, type FieldCount } from '../../sim/farmer.ts';
import { countPlot, type PlotCount } from '../../sim/forester.ts';
import type { Farm, Farmer, Forester, ForesterHouse } from '../../sim/types.ts';
import { buildingView } from './building.ts';

export const farmView = buildingView<Farm>({
  describe({ world, entity, text, stats, lines, full, stopped }) {
    const count = countField(world.farmField(entity));

    stats.push(
      { icon: 'seed', value: String(count.growing), label: text.farm.growing(count.growing) },
      { icon: 'wheat', value: String(count.ripe), label: text.farm.ripe(count.ripe) },
      { icon: 'plot', value: String(count.free), label: text.farm.free(count.free) },
    );
    lines.push(text.farm.field(FARMERS.plot));
    lines.push(
      entity.paused
        ? text.farm.paused
        : full
          ? text.storeFull
          : stopped
            ? text.farm.noOne
            : farmLine(world.farmerOf(entity), count),
    );
  },
});

export const foresterView = buildingView<ForesterHouse>({
  describe({ world, entity, text, stats, lines, stopped }) {
    const tiles = world.forestPlot(entity);
    const count = countPlot(tiles);

    stats.push(
      { icon: 'seed', value: String(count.saplings), label: text.foresterHouse.saplings(count.saplings) },
      { icon: 'tree', value: String(count.trees), label: text.foresterHouse.trees(count.trees) },
      { icon: 'plot', value: String(count.free), label: text.foresterHouse.free(count.free) },
    );
    lines.push(text.foresterHouse.plot(FORESTERS.plot));
    lines.push(entity.paused ? text.foresterHouse.paused : stopped ? text.foresterHouse.noOne : foresterLine(world.foresterOf(entity), count));
  },
});

/** Ce que font les fermiers — vu du premier : ils sèment, récoltent, dorment, ou attendent que le champ mûrisse. */
function farmLine(farmer: Farmer | undefined, count: FieldCount): string {
  const text = t().panel.farm;

  if (farmer?.state === 'toSow' || farmer?.state === 'sow') return text.sowing;
  if (farmer?.state === 'toHarvest' || farmer?.state === 'harvest' || farmer?.state === 'toFarm') return text.harvesting;
  if (count.free + count.growing + count.ripe === 0) return text.nowhere;
  return farmer?.inside ? text.asleep : text.growingLine;
}

/** Ce que fait le forestier : il marche vers sa case, il plante, il dort, ou il n'a plus rien à planter — et pourquoi. */
function foresterLine(forester: Forester | undefined, count: PlotCount): string {
  const text = t().panel.foresterHouse;

  if (forester?.state === 'toPlot') return text.toPlot;
  if (forester?.state === 'plant') return text.planting;
  if (count.free === 0) return count.saplings + count.trees === 0 ? text.nowhere : text.full;
  return forester?.inside ? text.asleep : text.seeking;
}
