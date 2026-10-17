/**
 * L'antenne : ses étages se livrent comme un chantier — « Transférer » la
 * remplit tant qu'il en reste un, et son coffre se lit en jauges de l'étage
 * suivant. Ses lignes disent l'étage, le Signal et la nuit où elle attire les
 * vagues.
 */

import { maxLevel, nextUpgrade } from '../../data/buildings.ts';
import { floorCost } from '../../sim/antenna.ts';
import type { Antenna } from '../../sim/types.ts';
import { itemAmount } from '../icons.ts';
import { siteNeedHeader } from '../siteNeedRow.ts';
import { buildingView } from './building.ts';

/** Un étage reste à livrer. */
function nextFloor(entity: Antenna): boolean {
  return nextUpgrade(entity.proto, entity.level) !== null;
}

export const antennaView = buildingView<Antenna>({
  supplied: nextFloor,
  describe({ world, entity, text, lines }) {
    const max = maxLevel(entity.proto);
    const lure = world.lureNight;
    const clock = world.clock();

    lines.push(text.antenna.floor(entity.level, max));
    lines.push(nextFloor(entity) ? text.antenna.nextFloor : text.antenna.signalSent);
    if (lure > world.night) lines.push(text.antenna.lureNight(lure));
    else if (lure === world.night && clock?.phase === 'night') lines.push(text.antenna.lureTonight);
  },
  chest({ entity, host }) {
    const cost = floorCost(entity);

    host.stock.hidden = true;
    host.items.dataset['layout'] = 'ledger';
    host.setItems(
      [siteNeedHeader(false), ...cost.map(([item, needed]) => itemAmount(item, needed, entity.store.count(item)))],
      `floor:${entity.id}:${entity.level}:${cost.map(([item]) => `${item}=${entity.store.count(item)}`).join(',')}`,
    );
  },
});
