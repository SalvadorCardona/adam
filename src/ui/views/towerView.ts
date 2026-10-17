/** Une tour — de guet ou d'archers : la portée de son arme, et si elle veille ou tire. */

import { WEAPONS } from '../../data/weapons.ts';
import { t } from '../../i18n/locale.ts';
import type { Tower } from '../../sim/types.ts';
import { buildingView } from './building.ts';

export const towerView = buildingView<Tower>({
  describe({ entity, text, stats, lines, level }) {
    const weapon = level.weapon ? WEAPONS[level.weapon] : null;

    if (level.weapon && weapon) {
      stats.push({ icon: 'range', value: String(weapon.range), label: text.tower.range(t().weapons[level.weapon], weapon.range) });
    }
    lines.push(entity.armed ? text.tower.alert : text.tower.idle);
  },
});
