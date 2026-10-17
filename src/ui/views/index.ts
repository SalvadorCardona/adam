/**
 * La table des vues : une par sorte d'entité (`entity.kind`). La fenêtre d'un
 * bâtiment (`buildingPanel.ts`) n'a qu'à y lire celle de ce qu'elle montre.
 * Une sorte nouvelle ne compile pas tant qu'elle n'a pas sa ligne ; une sorte
 * qui n'a rien à dire d'elle prend le tronc commun seul (`buildingView()`).
 */

import type { Entity } from '../../sim/types.ts';
import { antennaView } from './antennaView.ts';
import { barracksView } from './barracksView.ts';
import { buildingView } from './building.ts';
import { forgeView } from './forgeView.ts';
import { hallView } from './hallView.ts';
import { clinicView, decorView, houseView } from './homeView.ts';
import { labView } from './labView.ts';
import { depotView, yardView } from './logisticsView.ts';
import { nurseryView } from './nurseryView.ts';
import { farmView, foresterView } from './plotView.ts';
import { drillView, lumberCampView, pigPenView, quarryView } from './producerView.ts';
import { siteView } from './siteView.ts';
import { towerView } from './towerView.ts';
import type { EntityOf, EntityView } from './types.ts';

export const VIEWS: { readonly [K in Entity['kind']]: EntityView<EntityOf<K>> } = {
  site: siteView,
  townHall: hallView,
  lab: labView,
  barracks: barracksView,
  nursery: nurseryView,
  forge: forgeView,
  drill: drillView,
  quarry: quarryView,
  pigPen: pigPenView,
  lumberCamp: lumberCampView,
  farm: farmView,
  foresterHouse: foresterView,
  depot: depotView,
  yard: yardView,
  tower: towerView,
  house: houseView,
  clinic: clinicView,
  decor: decorView,
  antenna: antennaView,
  // Le tronc commun leur suffit : points de vie, réparation, niveaux.
  wall: buildingView(),
  purifier: buildingView(),
};

/** La vue de ce qu'on montre. */
export function viewOf<E extends Entity>(entity: E): EntityView<E> {
  // La table est indexée par sorte : la vue de `entity.kind` est bien celle de `E`.
  return VIEWS[entity.kind] as unknown as EntityView<E>;
}
