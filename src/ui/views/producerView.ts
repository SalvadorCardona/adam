/**
 * Les producteurs qui remplissent leur coffre seuls : foreuse, carrière (et le
 * puits, une carrière sur sa propre recette), élevage de cochons, cabane de
 * bûcheron. Une ligne dit s'ils tournent, et sinon pourquoi.
 */

import { PIG_FARM } from '../../data/pigs.ts';
import { LUMBERJACKS } from '../../data/workers.ts';
import { t } from '../../i18n/locale.ts';
import type { Drill, LumberCamp, PigPen, Quarry } from '../../sim/types.ts';
import { TICKS_PER_SECOND } from '../../sim/world.ts';
import { buildingView } from './building.ts';

export const drillView = buildingView<Drill>({
  describe({ entity, text, lines, full }) {
    lines.push(entity.output ? text.drill.extracts(t().items[entity.output]) : text.drill.dry);
    lines.push(entity.paused ? text.paused : full ? text.storeFull : entity.output ? text.drill.running : '');
  },
});

export const quarryView = buildingView<Quarry>({
  describe({ entity, text, lines, full, stopped }) {
    // Le puits est une carrière sur sa propre recette : ses mots à lui.
    const words = entity.proto === 'well' ? text.well : text.quarry;

    lines.push(entity.paused ? text.paused : full ? text.storeFull : stopped ? words.noOne : words.working);
  },
});

export const pigPenView = buildingView<PigPen>({
  describe({ entity, text, stats, lines, full }) {
    const words = text.pigPen;
    const seconds = Math.round(PIG_FARM.cycleTicks / TICKS_PER_SECOND);

    stats.push(
      { icon: 'pig', value: `${entity.pigs}/${PIG_FARM.capacity}`, label: words.pigs(entity.pigs, PIG_FARM.capacity) },
      { icon: 'chest', item: 'meat', value: String(PIG_FARM.meatPerPig * entity.pigs), label: words.meat(PIG_FARM.meatPerPig * entity.pigs, seconds) },
    );
    lines.push(entity.paused ? words.paused : entity.pigs === 0 ? words.noPig : full ? text.storeFull : words.working);
  },
});

export const lumberCampView = buildingView<LumberCamp>({
  describe({ world, entity, text, stats, lines, full, stopped }) {
    stats.push({
      icon: 'range',
      value: String(LUMBERJACKS.radius),
      label: text.lumberCamp.radius(LUMBERJACKS.radius),
    });
    lines.push(
      entity.paused
        ? text.lumberCamp.paused
        : full
          ? text.storeFull
          : stopped
            ? text.lumberCamp.noOne
            : world.treesLeft(entity) === 0
              ? text.lumberCamp.noTrees
              : text.lumberCamp.working,
    );
  },
});
