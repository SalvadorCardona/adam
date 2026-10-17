/**
 * Le labo fini : sa fenêtre devient le panneau Recherche (`researchPanel.ts`),
 * qui a besoin de toute la place — ni (i), ni compte à rebours à lui (le
 * panneau a sa barre), ni coffre en objets (il se lit dans le relevé).
 */

import type { Lab } from '../../sim/types.ts';
import { buildingView, noChest } from './building.ts';

export const labView = buildingView<Lab>({
  timer: 'none',
  // Tout est dans le panneau Recherche, sous les points de vie.
  describe({ entity, host }) {
    host.hideInfo();
    host.research.root.hidden = false;
    host.research.update(entity);
  },
  chest: noChest,
});
