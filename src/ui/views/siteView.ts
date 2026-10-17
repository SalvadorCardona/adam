/**
 * Un chantier : sa barre d'avancement — ou, tout livré, celle du marteau des
 * bâtisseurs —, d'où viendra ce qui manque, le relevé objet par objet
 * (`siteNeedRow.ts`), « Transférer » et « Annuler le chantier ». Rien d'un
 * bâtiment debout : ni coffre, ni ouvriers, ni niveaux.
 */

import { BUILDINGS } from '../../data/buildings.ts';
import { t } from '../../i18n/locale.ts';
import type { Site } from '../../sim/types.ts';
import { siteMissing, type SiteCoverage } from '../../sim/world.ts';
import { siteNeedHeader, siteNeedRow } from '../siteNeedRow.ts';
import type { EntityView } from './types.ts';

export const siteView: EntityView<Site> = {
  timer: 'plain',
  render({ world, entity, inReach, text, stats, lines, host }) {
    const { buttons } = host;
    const proto = BUILDINGS[entity.proto];
    const total = Object.values(proto.cost).reduce((sum, amount) => sum + amount, 0);
    const missing = siteMissing(entity);
    const canGive = world.canTransfer(entity);
    const fromTown = world.inTownRange(entity);

    const building = world.awaitsBuilders(entity);

    let ratio = total === 0 ? 1 : 1 - missing / total;
    let barClass = 'progress';

    if (building) {
      // Tout est livré : la barre suit le marteau des bâtisseurs.
      const { done, total: work } = world.siteBuild(entity);
      const builders = world.siteBuilders(entity.id);

      ratio = work === 0 ? 1 : done / work;
      barClass = 'build';
      lines.push(
        builders === 0 ? text.site.allDelivered : text.site.building(builders, Math.floor(ratio * 100)),
      );
    } else {
      lines.push(
        world.builderYard(entity)
          ? text.site.byYard
          : !fromTown && entity.id !== world.townHallId
            ? text.site.outOfRange
            : !inReach
            ? text.site.comeCloser
            : !fromTown
              ? text.site.transferOrBump
              : siteCoverageText(world.siteCoverage(entity)),
      );
    }
    if (proto.workers > 0) stats.push({ icon: 'worker', value: String(proto.workers), label: text.site.workers(proto.workers) });

    // Objet par objet : livré / requis, puis ce qui est en route et ce que la ville en a.
    const ledger = world.siteLedger(entity);

    host.setItems([siteNeedHeader(), ...ledger.map(siteNeedRow)], `site:${entity.id}:${JSON.stringify(ledger)}`);
    host.items.dataset['layout'] = 'ledger';
    buttons.transfer.hidden = building;
    buttons.transfer.textContent = world.townStock() ? text.transferButton : text.transferBag;
    buttons.transfer.disabled = !inReach || !canGive;
    // Le chantier de la mairie ne s'annule pas.
    buttons.cancel.hidden = entity.id === world.townHallId;
    buttons.cancel.textContent = host.cancelArmed() ? text.cancelConfirm : text.cancelSite;
    host.exchange.show(null);
    host.setInventory(false);
    buttons.repair.hidden = true;
    buttons.pause.hidden = true;
    buttons.era.hidden = true;
    host.crew.hidden = true;
    host.upgrade.hidden = true;
    host.gear.hidden = true;
    host.tools.hide();
    host.stock.hidden = true;

    return { ratio, barClass, value: '', label: '' };
  },
};

/** Ce que « Transférer » ferait d'un chantier à portée de la ville, en disant d'où vient la matière. */
export function siteCoverageText(coverage: SiteCoverage): string {
  return t().panel.site.coverage[coverage];
}
