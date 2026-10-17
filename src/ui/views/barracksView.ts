/** La caserne : sous les points de vie, son panneau (`barracksPanel.ts`) — recruter, former, l'armée. */

import type { Barracks } from '../../sim/types.ts';
import { buildingView } from './building.ts';

export const barracksView = buildingView<Barracks>({
  describe({ world, entity, host }) {
    host.barracks.root.hidden = false;
    host.barracks.update(entity, world.inReach(entity));
  },
});
