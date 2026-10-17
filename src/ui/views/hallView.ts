/**
 * La mairie : son coffre est le stock de la ville, ses puces la population,
 * les nuits tenues et le rayon de la ville ; son bouton « Ères » ouvre le
 * panneau des ères, une pastille quand tout est réuni.
 */

import { logisticRadiusOf } from '../../data/buildings.ts';
import { t } from '../../i18n/locale.ts';
import { eraReady } from '../../sim/eras.ts';
import type { TownHall } from '../../sim/types.ts';
import { buildingView } from './building.ts';

export const hallView = buildingView<TownHall>({
  town: true,
  describe({ world, entity, text, stats, host }) {
    const era = host.buttons.era;

    era.hidden = false;
    const eraLabel = t().eraPanel.open(t().eras[world.era]!.label);

    if (era.textContent !== eraLabel) era.textContent = eraLabel;
    // Tout est réuni : le bouton le dit, d'une pastille.
    era.dataset['ready'] = String(eraReady(world));

    const { adults, children, workers } = world.population();
    const radius = logisticRadiusOf(entity.proto, entity.level);

    const captions = text.townHall.captions;

    stats.push(
      { icon: 'people', value: String(adults), label: text.townHall.adults(adults), caption: captions.adults },
      { icon: 'child', value: String(children), label: text.townHall.children(children), caption: captions.children },
      { icon: 'worker', value: String(workers), label: text.townHall.workers(workers), caption: captions.workers },
      { icon: 'moon', value: String(world.night), label: text.townHall.nights(world.night), caption: captions.nights },
      { icon: 'range', value: String(radius), label: text.townHall.radius(radius), caption: captions.radius },
    );
  },
});
