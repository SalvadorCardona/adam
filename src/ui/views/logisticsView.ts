/**
 * Les postes qui servent leur rayon : le poste de logistique (les producteurs
 * qu'il vide) et le poste de construction (les chantiers qu'il bâtit).
 */

import { BUILDERS, LOGISTICIANS } from '../../data/workers.ts';
import type { Depot, Yard } from '../../sim/types.ts';
import { buildingView } from './building.ts';

export const depotView = buildingView<Depot>({
  describe({ world, entity, text, stats, lines }) {
    const served = world.depotProducers(entity);

    stats.push({
      icon: 'range',
      value: String(LOGISTICIANS.radius),
      label: text.depot.radius(LOGISTICIANS.radius),
    });
    lines.push(served === 0 ? text.depot.none : text.depot.served(served));
  },
});

export const yardView = buildingView<Yard>({
  describe({ world, entity, text, stats, lines, stopped }) {
    const served = world.yardSites(entity);

    stats.push({
      icon: 'range',
      value: String(BUILDERS.radius),
      label: text.yard.radius(BUILDERS.radius),
    });
    lines.push(
      entity.paused
        ? text.yard.paused
        : stopped
          ? text.yard.noOne
          : served === 0
            ? text.yard.none
            : text.yard.served(served),
    );
  },
});
